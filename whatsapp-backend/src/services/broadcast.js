/**
 * WhatsApp Broadcast Service — bulk template sending with delivery tracking,
 * scheduling, analytics, and retry.
 *
 * Firestore collections:
 *   - broadcasts/{broadcastId}                      — campaign metadata + counters
 *   - broadcasts/{broadcastId}/recipients/{leadId}  — per-lead delivery status
 *   - broadcastDispatches/{clientMessageId}         — reverse lookup for status receipts
 *
 * Delivery pipeline:
 *   1. Admin creates broadcast (immediate or scheduled) → recipients seeded
 *   2. processBroadcast() sends template messages in rate-limited batches,
 *      attaching a per-recipient biz_opaque_callback_data (clientMessageId).
 *   3. Meta status webhooks (delivered/read/failed) round-trip that ID and
 *      handleBroadcastStatusReceipt() advances recipient state + counters.
 *
 * Recipient lifecycle: pending → sent → delivered → read  (or → failed)
 */

import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../bootstrap/firebase.js";
import { logger } from "../middleware/logger.js";
import { decryptWhatsAppToken, metaGraphRequest, isWhatsAppCredentialExpired, normalizeWhatsAppRecipient } from "./meta.js";
import { nowIso, orgCollection } from "./helpers.js";

const BATCH_SIZE = 50;           // messages per batch
const BATCH_DELAY_MS = 1200;     // delay between batches (~40 msgs/sec safe)
const MAX_RECIPIENTS = 10000;    // max leads per broadcast

// Recipient delivery stages — only ever advance forward.
const STAGE = { pending: 0, sent: 1, delivered: 2, read: 3, failed: -1 };

// ─────────────────────────────────────────────────────────────────────────────
// LEAD RESOLUTION (shared by create + preview)
// ─────────────────────────────────────────────────────────────────────────────
async function resolveLeads(orgId, { leadIds, filters }) {
  let leads = [];
  if (leadIds && leadIds.length > 0) {
    const leadsCol = orgCollection(db, orgId, "leads");
    for (let i = 0; i < leadIds.length; i += 30) {
      const chunk = leadIds.slice(i, i + 30);
      const snap = await leadsCol.where("__name__", "in", chunk).get();
      snap.docs.forEach((d) => leads.push({ id: d.id, ...d.data() }));
    }
  } else if (filters) {
    let query = orgCollection(db, orgId, "leads").limit(MAX_RECIPIENTS);
    if (filters.status) query = query.where("status", "==", filters.status);
    if (filters.source) query = query.where("source", "==", filters.source);
    if (filters.assignedTo) query = query.where("assignedTo", "==", filters.assignedTo);
    const snap = await query.get();
    leads = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } else {
    // No filter and no explicit IDs → all leads (capped)
    const snap = await orgCollection(db, orgId, "leads").limit(MAX_RECIPIENTS).get();
    leads = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  // Only leads with a valid WhatsApp number
  return leads.filter((l) => normalizeWhatsAppRecipient(l.phone));
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIENCE PREVIEW (count without creating)
// ─────────────────────────────────────────────────────────────────────────────
export async function previewAudience({ orgId, leadIds, filters }) {
  const leads = await resolveLeads(orgId, { leadIds, filters });
  return { count: Math.min(leads.length, MAX_RECIPIENTS), capped: leads.length > MAX_RECIPIENTS };
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE VALIDATION HELPER
// ─────────────────────────────────────────────────────────────────────────────
async function loadValidTemplate(orgId, templateId, parameters) {
  const templateSnap = await orgCollection(db, orgId, "whatsappTemplates").doc(templateId).get();
  if (!templateSnap.exists) throw Object.assign(new Error("Template not found"), { status: 404 });
  const template = templateSnap.data();
  if (!template.available || template.status !== "APPROVED") {
    throw Object.assign(new Error("Template is not approved or available"), { status: 400 });
  }
  if ((parameters || []).length !== (template.parameterCount || 0)) {
    throw Object.assign(new Error(`Template requires ${template.parameterCount} parameter(s)`), { status: 400 });
  }
  return template;
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE BROADCAST (immediate or scheduled)
// ─────────────────────────────────────────────────────────────────────────────
export async function createBroadcast({ orgId, uid, templateId, parameters, filters, leadIds, name, scheduledAtMs }) {
  // 1. Validate WhatsApp connection
  const credSnap = await db.collection("whatsappCredentials").doc(orgId).get();
  if (!credSnap.exists || credSnap.data().connectionState !== "connected") {
    throw Object.assign(new Error("Connect WhatsApp Business before sending broadcasts"), { status: 409 });
  }
  if (isWhatsAppCredentialExpired(credSnap.data())) {
    throw Object.assign(new Error("WhatsApp authorization has expired. Reconnect before broadcasting."), { status: 409 });
  }

  // 2. Validate template
  const template = await loadValidTemplate(orgId, templateId, parameters);

  // 3. Resolve leads
  let leads = await resolveLeads(orgId, { leadIds, filters });
  if (leads.length === 0) {
    throw Object.assign(new Error("No leads with valid WhatsApp numbers found"), { status: 400 });
  }
  if (leads.length > MAX_RECIPIENTS) leads = leads.slice(0, MAX_RECIPIENTS);

  // 4. Determine scheduling
  const now = Date.now();
  const isScheduled = Number(scheduledAtMs) > now + 30_000; // at least 30s in future
  const initialStatus = isScheduled ? "scheduled" : "queued";

  // 5. Create broadcast document
  const broadcastId = crypto.randomUUID();
  const broadcastRef = db.collection("broadcasts").doc(broadcastId);
  await broadcastRef.set({
    id: broadcastId,
    orgId,
    createdBy: uid,
    name: name || `Broadcast — ${template.name}`,
    templateId,
    templateName: template.name,
    templateLanguage: template.language,
    templateCategory: template.category || "MARKETING",
    parameters: parameters || [],
    filters: filters || null,
    status: initialStatus,
    scheduledAtMs: isScheduled ? Number(scheduledAtMs) : null,
    scheduledAt: isScheduled ? new Date(Number(scheduledAtMs)).toISOString() : null,
    totalRecipients: leads.length,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    createdAt: nowIso(),
    createdAtMs: now,
    startedAt: null,
    completedAt: null,
  });

  // 6. Seed recipient docs in batches
  for (let i = 0; i < leads.length; i += 450) {
    const batch = db.batch();
    leads.slice(i, i + 450).forEach((lead) => {
      const recipientRef = broadcastRef.collection("recipients").doc(lead.id);
      batch.set(recipientRef, {
        leadId: lead.id,
        phone: normalizeWhatsAppRecipient(lead.phone),
        name: lead.name || lead.phone || "",
        status: "pending",
        stage: STAGE.pending,
        clientMessageId: null,
        providerMessageId: null,
        error: null,
        sentAt: null,
        updatedAt: nowIso(),
      });
    });
    await batch.commit();
  }

  // 7. Start immediately, or leave for the scheduler
  if (!isScheduled) {
    processBroadcast(broadcastId).catch((e) => {
      logger.error({ broadcastId, err: e.message }, "Broadcast processing failed");
    });
  }

  return { broadcastId, totalRecipients: leads.length, scheduled: isScheduled, scheduledAtMs: isScheduled ? Number(scheduledAtMs) : null };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCESS BROADCAST (queue-based, rate-limited, retry-safe counters)
// ─────────────────────────────────────────────────────────────────────────────
export async function processBroadcast(broadcastId) {
  const broadcastRef = db.collection("broadcasts").doc(broadcastId);
  const broadcastSnap = await broadcastRef.get();
  if (!broadcastSnap.exists) return;

  const broadcast = broadcastSnap.data();
  if (["cancelled", "completed", "completed_with_errors", "processing"].includes(broadcast.status)) {
    // Guard against double-processing (idempotent scheduler / retries handle their own state)
    if (broadcast.status === "processing" && broadcast.startedAtMs && Date.now() - broadcast.startedAtMs < 10 * 60 * 1000) {
      return; // another worker is actively processing
    }
    if (["cancelled", "completed", "completed_with_errors"].includes(broadcast.status)) return;
  }

  await broadcastRef.update({ status: "processing", startedAt: nowIso(), startedAtMs: Date.now() });

  // Load WhatsApp credentials
  const credSnap = await db.collection("whatsappCredentials").doc(broadcast.orgId).get();
  if (!credSnap.exists || credSnap.data().connectionState !== "connected") {
    await broadcastRef.update({ status: "failed", error: "WhatsApp not connected" });
    return;
  }
  const credential = credSnap.data();
  const token = decryptWhatsAppToken(credential.tokenCiphertext);
  const phoneNumberId = credential.phoneNumberId;

  const templateBase = {
    messaging_product: "whatsapp",
    type: "template",
    template: {
      name: broadcast.templateName,
      language: { code: broadcast.templateLanguage },
      ...(broadcast.parameters.length ? {
        components: [{ type: "body", parameters: broadcast.parameters.map((text) => ({ type: "text", text })) }],
      } : {}),
    },
  };

  let offset = null;
  let runSent = 0;
  let runFailed = 0;

  while (true) {
    // Honor mid-run cancellation
    const currentSnap = await broadcastRef.get();
    if (currentSnap.data().status === "cancelled") {
      logger.info({ broadcastId }, "Broadcast cancelled mid-processing");
      return;
    }

    let recipientQuery = broadcastRef.collection("recipients")
      .where("status", "==", "pending")
      .limit(BATCH_SIZE);
    if (offset) recipientQuery = recipientQuery.startAfter(offset);

    const recipientSnap = await recipientQuery.get();
    if (recipientSnap.empty) break;

    let batchSent = 0;
    let batchFailed = 0;

    await Promise.all(recipientSnap.docs.map(async (doc) => {
      const recipient = doc.data();
      const clientMessageId = crypto.randomUUID();
      try {
        const result = await metaGraphRequest(`${phoneNumberId}/messages`, {
          method: "POST",
          token,
          body: { ...templateBase, to: recipient.phone, biz_opaque_callback_data: clientMessageId },
        });
        const providerMessageId = result.messages?.[0]?.id || null;
        // Reverse-lookup doc so status webhooks can find this broadcast recipient
        await db.collection("broadcastDispatches").doc(clientMessageId).set({
          orgId: broadcast.orgId,
          broadcastId,
          leadId: recipient.leadId,
          createdAtMs: Date.now(),
        });
        await doc.ref.update({
          status: "sent",
          stage: STAGE.sent,
          clientMessageId,
          providerMessageId,
          sentAt: nowIso(),
          updatedAt: nowIso(),
        });
        batchSent++;
      } catch (e) {
        await doc.ref.update({
          status: "failed",
          stage: STAGE.failed,
          error: e.message || "Send failed",
          sentAt: nowIso(),
          updatedAt: nowIso(),
        });
        batchFailed++;
        logger.warn({ broadcastId, leadId: recipient.leadId, err: e.message }, "Broadcast message failed");
      }
    }));

    runSent += batchSent;
    runFailed += batchFailed;

    // Atomic increments — retry-safe (never overwrites prior totals)
    await broadcastRef.update({
      sent: FieldValue.increment(batchSent),
      failed: FieldValue.increment(batchFailed),
    });

    offset = recipientSnap.docs[recipientSnap.docs.length - 1];
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }

  // Final status from authoritative counters
  const finalSnap = await broadcastRef.get();
  const { sent = 0, failed = 0 } = finalSnap.data();
  const finalStatus = failed > 0 && sent > 0 ? "completed_with_errors"
    : failed > 0 && sent === 0 ? "failed"
    : "completed";

  await broadcastRef.update({ status: finalStatus, completedAt: nowIso(), completedAtMs: Date.now() });

  await orgCollection(db, broadcast.orgId, "activity").add({
    text: `📣 Broadcast "${broadcast.name}" ${finalStatus.replace(/_/g, " ")}: ${sent} sent, ${failed} failed of ${broadcast.totalRecipients}`,
    at: nowIso(),
    orgId: broadcast.orgId,
  }).catch(() => {});

  logger.info({ broadcastId, runSent, runFailed, sent, failed, total: broadcast.totalRecipients }, "Broadcast completed");
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULED BROADCASTS (cron-driven)
// ─────────────────────────────────────────────────────────────────────────────
export async function runScheduledBroadcasts() {
  const now = Date.now();
  const dueSnap = await db.collection("broadcasts")
    .where("status", "==", "scheduled")
    .where("scheduledAtMs", "<=", now)
    .limit(20)
    .get();

  if (dueSnap.empty) return 0;

  let processed = 0;
  for (const doc of dueSnap.docs) {
    // Claim atomically so only one worker fires each due broadcast
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(doc.ref);
      if (!snap.exists || snap.data().status !== "scheduled") return false;
      tx.update(doc.ref, { status: "queued", scheduledFiredAt: nowIso() });
      return true;
    });
    if (claimed) {
      processBroadcast(doc.id).catch((e) => logger.error({ broadcastId: doc.id, err: e.message }, "Scheduled broadcast failed"));
      processed++;
    }
  }
  return processed;
}

// ─────────────────────────────────────────────────────────────────────────────
// DELIVERY RECEIPT (called from WhatsApp status webhook)
// Returns true if the callback belonged to a broadcast recipient.
// ─────────────────────────────────────────────────────────────────────────────
export async function handleBroadcastStatusReceipt(orgId, clientMessageId, providerStatus, providerMessageId) {
  const dispatchRef = db.collection("broadcastDispatches").doc(clientMessageId);
  const dispatchSnap = await dispatchRef.get();
  if (!dispatchSnap.exists) return false;
  const dispatch = dispatchSnap.data();
  if (dispatch.orgId !== orgId) return false;

  const broadcastRef = db.collection("broadcasts").doc(dispatch.broadcastId);
  const recipientRef = broadcastRef.collection("recipients").doc(dispatch.leadId);

  await db.runTransaction(async (tx) => {
    const rSnap = await tx.get(recipientRef);
    if (!rSnap.exists) return;
    const recipient = rSnap.data();
    const currentStage = recipient.stage ?? STAGE[recipient.status] ?? 0;

    if (providerStatus === "failed") {
      if (recipient.status === "failed") return;
      tx.update(recipientRef, {
        status: "failed", stage: STAGE.failed,
        providerStatus, providerMessageId: providerMessageId || recipient.providerMessageId || null,
        error: "Provider rejected delivery", updatedAt: nowIso(),
      });
      // A previously-counted send that later fails: adjust counters
      const inc = { failed: FieldValue.increment(1) };
      if (currentStage >= STAGE.sent) inc.sent = FieldValue.increment(-1);
      tx.update(broadcastRef, inc);
      return;
    }

    const targetStage = STAGE[providerStatus];
    if (targetStage === undefined || targetStage <= currentStage) return; // no forward progress

    const inc = {};
    if (currentStage < STAGE.delivered && targetStage >= STAGE.delivered) inc.delivered = FieldValue.increment(1);
    if (currentStage < STAGE.read && targetStage >= STAGE.read) inc.read = FieldValue.increment(1);

    tx.update(recipientRef, {
      status: providerStatus, stage: targetStage,
      providerStatus, providerMessageId: providerMessageId || recipient.providerMessageId || null,
      updatedAt: nowIso(),
    });
    if (Object.keys(inc).length) tx.update(broadcastRef, inc);
  });

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// RETRY FAILED RECIPIENTS
// ─────────────────────────────────────────────────────────────────────────────
export async function retryFailedRecipients(broadcastId, orgId) {
  const broadcastRef = db.collection("broadcasts").doc(broadcastId);
  const snap = await broadcastRef.get();
  if (!snap.exists) throw Object.assign(new Error("Broadcast not found"), { status: 404 });
  if (snap.data().orgId !== orgId) throw Object.assign(new Error("Access denied"), { status: 403 });

  const failedSnap = await broadcastRef.collection("recipients").where("status", "==", "failed").get();
  if (failedSnap.empty) throw Object.assign(new Error("No failed recipients to retry"), { status: 400 });

  // Reset failed → pending in batches, decrement failed counter
  let resetCount = 0;
  for (let i = 0; i < failedSnap.docs.length; i += 450) {
    const batch = db.batch();
    failedSnap.docs.slice(i, i + 450).forEach((d) => {
      batch.update(d.ref, { status: "pending", stage: STAGE.pending, error: null, updatedAt: nowIso() });
      resetCount++;
    });
    await batch.commit();
  }
  await broadcastRef.update({ failed: FieldValue.increment(-resetCount), status: "queued" });

  processBroadcast(broadcastId).catch((e) => logger.error({ broadcastId, err: e.message }, "Retry processing failed"));
  return { ok: true, retrying: resetCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// READ QUERIES
// ─────────────────────────────────────────────────────────────────────────────
export async function getBroadcasts(orgId, limit = 20) {
  const snap = await db.collection("broadcasts")
    .where("orgId", "==", orgId)
    .orderBy("createdAtMs", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getBroadcastStatus(broadcastId) {
  const snap = await db.collection("broadcasts").doc(broadcastId).get();
  if (!snap.exists) throw Object.assign(new Error("Broadcast not found"), { status: 404 });
  return { id: snap.id, ...snap.data() };
}

export async function getBroadcastRecipients(broadcastId, { status = null, limit = 200 } = {}) {
  let query = db.collection("broadcasts").doc(broadcastId).collection("recipients");
  if (status) query = query.where("status", "==", status);
  const snap = await query.limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─────────────────────────────────────────────────────────────────────────────
// AGGREGATE ANALYTICS (dashboard)
// ─────────────────────────────────────────────────────────────────────────────
export async function getBroadcastAnalytics(orgId) {
  const snap = await db.collection("broadcasts")
    .where("orgId", "==", orgId)
    .orderBy("createdAtMs", "desc")
    .limit(100)
    .get();

  const broadcasts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const totals = { broadcasts: broadcasts.length, recipients: 0, sent: 0, delivered: 0, read: 0, failed: 0 };
  const templateMap = {};
  const dayMap = {};
  const DAY_MS = 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - 30 * DAY_MS;

  for (const b of broadcasts) {
    totals.recipients += b.totalRecipients || 0;
    totals.sent += b.sent || 0;
    totals.delivered += b.delivered || 0;
    totals.read += b.read || 0;
    totals.failed += b.failed || 0;

    // Top templates by sent volume
    const tName = b.templateName || "Unknown";
    if (!templateMap[tName]) templateMap[tName] = { name: tName, sent: 0, count: 0 };
    templateMap[tName].sent += b.sent || 0;
    templateMap[tName].count += 1;

    // Time series (last 30 days)
    if ((b.createdAtMs || 0) >= cutoff) {
      const day = new Date(b.createdAtMs).toISOString().slice(0, 10);
      if (!dayMap[day]) dayMap[day] = { date: day, sent: 0, delivered: 0, read: 0 };
      dayMap[day].sent += b.sent || 0;
      dayMap[day].delivered += b.delivered || 0;
      dayMap[day].read += b.read || 0;
    }
  }

  const deliveryRate = totals.sent > 0 ? Math.round((totals.delivered / totals.sent) * 100) : 0;
  const readRate = totals.delivered > 0 ? Math.round((totals.read / totals.delivered) * 100) : 0;
  const failureRate = (totals.sent + totals.failed) > 0 ? Math.round((totals.failed / (totals.sent + totals.failed)) * 100) : 0;

  const topTemplates = Object.values(templateMap).sort((a, b) => b.sent - a.sent).slice(0, 5);
  const timeSeries = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));

  return {
    totals,
    rates: { deliveryRate, readRate, failureRate },
    funnel: { sent: totals.sent, delivered: totals.delivered, read: totals.read, failed: totals.failed },
    topTemplates,
    timeSeries,
    recent: broadcasts.slice(0, 5),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CANCEL
// ─────────────────────────────────────────────────────────────────────────────
export async function cancelBroadcast(broadcastId, orgId) {
  const ref = db.collection("broadcasts").doc(broadcastId);
  const snap = await ref.get();
  if (!snap.exists) throw Object.assign(new Error("Broadcast not found"), { status: 404 });
  if (snap.data().orgId !== orgId) throw Object.assign(new Error("Access denied"), { status: 403 });
  if (["completed", "completed_with_errors"].includes(snap.data().status)) {
    throw Object.assign(new Error("Broadcast already completed"), { status: 400 });
  }
  await ref.update({ status: "cancelled", cancelledAt: nowIso() });
  return { ok: true };
}
