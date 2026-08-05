/**
 * WhatsApp Broadcast Service — bulk template sending with queue-based processing.
 *
 * Firestore collections:
 *   - broadcasts/{broadcastId}           — campaign metadata + analytics
 *   - broadcasts/{broadcastId}/recipients/{leadId} — per-lead delivery status
 *
 * Flow:
 *   1. Admin creates a broadcast (template + lead filters/IDs)
 *   2. Backend resolves leads, creates recipient docs, sets status="queued"
 *   3. processBroadcast() sends in batches respecting Meta rate limits (~60/sec)
 *   4. Each send updates the recipient doc + broadcast counters atomically
 *   5. On completion, broadcast status → "completed" or "completed_with_errors"
 */

import crypto from "crypto";
import { db } from "../bootstrap/firebase.js";
import { metaConfig } from "../config/env.js";
import { logger } from "../middleware/logger.js";
import { decryptWhatsAppToken, metaGraphRequest, isWhatsAppCredentialExpired, normalizeWhatsAppRecipient } from "./meta.js";
import { nowIso, orgCollection } from "./helpers.js";

const BATCH_SIZE = 50;           // messages per batch
const BATCH_DELAY_MS = 1200;     // delay between batches (~40 msgs/sec safe)
const MAX_RECIPIENTS = 10000;    // max leads per broadcast

// ─────────────────────────────────────────────────────────────────────────────
// CREATE BROADCAST
// ─────────────────────────────────────────────────────────────────────────────
export async function createBroadcast({ orgId, uid, templateId, parameters, filters, leadIds, name }) {
  // 1. Validate WhatsApp connection
  const credSnap = await db.collection("whatsappCredentials").doc(orgId).get();
  if (!credSnap.exists || credSnap.data().connectionState !== "connected") {
    throw Object.assign(new Error("Connect WhatsApp Business before sending broadcasts"), { status: 409 });
  }
  if (isWhatsAppCredentialExpired(credSnap.data())) {
    throw Object.assign(new Error("WhatsApp authorization has expired. Reconnect before broadcasting."), { status: 409 });
  }

  // 2. Load template
  const templateRef = orgCollection(db, orgId, "whatsappTemplates").doc(templateId);
  const templateSnap = await templateRef.get();
  if (!templateSnap.exists) throw Object.assign(new Error("Template not found"), { status: 404 });
  const template = templateSnap.data();
  if (!template.available || template.status !== "APPROVED") {
    throw Object.assign(new Error("Template is not approved or available"), { status: 400 });
  }
  if ((parameters || []).length !== (template.parameterCount || 0)) {
    throw Object.assign(new Error(`Template requires ${template.parameterCount} parameter(s)`), { status: 400 });
  }

  // 3. Resolve leads
  let leads = [];
  if (leadIds && leadIds.length > 0) {
    // Direct lead selection
    const leadsCol = orgCollection(db, orgId, "leads");
    const chunks = [];
    for (let i = 0; i < leadIds.length; i += 30) {
      chunks.push(leadIds.slice(i, i + 30));
    }
    for (const chunk of chunks) {
      const snap = await leadsCol.where("__name__", "in", chunk).get();
      snap.docs.forEach((d) => leads.push({ id: d.id, ...d.data() }));
    }
  } else if (filters) {
    // Filter-based selection
    let query = orgCollection(db, orgId, "leads").limit(MAX_RECIPIENTS);
    if (filters.status) query = query.where("status", "==", filters.status);
    if (filters.source) query = query.where("source", "==", filters.source);
    if (filters.assignedTo) query = query.where("assignedTo", "==", filters.assignedTo);
    const snap = await query.get();
    leads = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  // Filter to leads with valid WhatsApp numbers
  leads = leads.filter((l) => normalizeWhatsAppRecipient(l.phone));
  if (leads.length === 0) {
    throw Object.assign(new Error("No leads with valid WhatsApp numbers found"), { status: 400 });
  }
  if (leads.length > MAX_RECIPIENTS) {
    leads = leads.slice(0, MAX_RECIPIENTS);
  }

  // 4. Create broadcast document
  const broadcastId = crypto.randomUUID();
  const broadcastRef = db.collection("broadcasts").doc(broadcastId);
  const broadcastData = {
    id: broadcastId,
    orgId,
    createdBy: uid,
    name: name || `Broadcast — ${template.name}`,
    templateId,
    templateName: template.name,
    templateLanguage: template.language,
    parameters: parameters || [],
    filters: filters || null,
    status: "queued",
    totalRecipients: leads.length,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    createdAt: nowIso(),
    createdAtMs: Date.now(),
    startedAt: null,
    completedAt: null,
  };
  await broadcastRef.set(broadcastData);

  // 5. Create recipient docs in batches
  for (let i = 0; i < leads.length; i += 450) {
    const batch = db.batch();
    leads.slice(i, i + 450).forEach((lead) => {
      const recipientRef = broadcastRef.collection("recipients").doc(lead.id);
      batch.set(recipientRef, {
        leadId: lead.id,
        phone: normalizeWhatsAppRecipient(lead.phone),
        name: lead.name || lead.phone || "",
        status: "pending",
        providerMessageId: null,
        error: null,
        sentAt: null,
      });
    });
    await batch.commit();
  }

  // 6. Start processing async (fire-and-forget)
  processBroadcast(broadcastId).catch((e) => {
    logger.error({ broadcastId, err: e.message }, "Broadcast processing failed");
  });

  return { broadcastId, totalRecipients: leads.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCESS BROADCAST (queue-based batch sender)
// ─────────────────────────────────────────────────────────────────────────────
export async function processBroadcast(broadcastId) {
  const broadcastRef = db.collection("broadcasts").doc(broadcastId);
  const broadcastSnap = await broadcastRef.get();
  if (!broadcastSnap.exists) return;

  const broadcast = broadcastSnap.data();
  if (broadcast.status === "cancelled" || broadcast.status === "completed") return;

  // Mark as processing
  await broadcastRef.update({ status: "processing", startedAt: nowIso() });

  // Load WhatsApp credentials
  const credSnap = await db.collection("whatsappCredentials").doc(broadcast.orgId).get();
  if (!credSnap.exists || credSnap.data().connectionState !== "connected") {
    await broadcastRef.update({ status: "failed", error: "WhatsApp not connected" });
    return;
  }
  const credential = credSnap.data();
  const token = decryptWhatsAppToken(credential.tokenCiphertext);
  const phoneNumberId = credential.phoneNumberId;

  // Build template body
  const templateBody = {
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

  // Process recipients in batches
  let sentCount = 0;
  let failedCount = 0;
  let offset = null;

  while (true) {
    // Check if cancelled
    const currentSnap = await broadcastRef.get();
    if (currentSnap.data().status === "cancelled") {
      logger.info({ broadcastId }, "Broadcast cancelled mid-processing");
      return;
    }

    // Fetch next batch of pending recipients
    let recipientQuery = broadcastRef.collection("recipients")
      .where("status", "==", "pending")
      .limit(BATCH_SIZE);
    if (offset) recipientQuery = recipientQuery.startAfter(offset);

    const recipientSnap = await recipientQuery.get();
    if (recipientSnap.empty) break;

    // Send batch
    const sendPromises = recipientSnap.docs.map(async (doc) => {
      const recipient = doc.data();
      try {
        const result = await metaGraphRequest(`${phoneNumberId}/messages`, {
          method: "POST",
          token,
          body: { ...templateBody, to: recipient.phone },
        });
        const providerMessageId = result.messages?.[0]?.id || null;
        await doc.ref.update({
          status: "sent",
          providerMessageId,
          sentAt: nowIso(),
        });
        sentCount++;
      } catch (e) {
        await doc.ref.update({
          status: "failed",
          error: e.message || "Send failed",
          sentAt: nowIso(),
        });
        failedCount++;
        logger.warn({ broadcastId, leadId: recipient.leadId, err: e.message }, "Broadcast message failed");
      }
    });

    await Promise.all(sendPromises);

    // Update broadcast counters
    await broadcastRef.update({ sent: sentCount, failed: failedCount });

    offset = recipientSnap.docs[recipientSnap.docs.length - 1];

    // Rate limit pause between batches
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }

  // Final status
  const finalStatus = failedCount > 0 && sentCount > 0 ? "completed_with_errors"
    : failedCount > 0 && sentCount === 0 ? "failed"
    : "completed";

  await broadcastRef.update({
    status: finalStatus,
    sent: sentCount,
    failed: failedCount,
    completedAt: nowIso(),
  });

  // Activity log
  await orgCollection(db, broadcast.orgId, "activity").add({
    text: `📣 Broadcast "${broadcast.name}" ${finalStatus}: ${sentCount} sent, ${failedCount} failed out of ${broadcast.totalRecipients}`,
    at: nowIso(),
    orgId: broadcast.orgId,
  }).catch(() => {});

  logger.info({ broadcastId, sentCount, failedCount, total: broadcast.totalRecipients }, "Broadcast completed");
}

// ─────────────────────────────────────────────────────────────────────────────
// GET BROADCASTS (list for org)
// ─────────────────────────────────────────────────────────────────────────────
export async function getBroadcasts(orgId, limit = 20) {
  const snap = await db.collection("broadcasts")
    .where("orgId", "==", orgId)
    .orderBy("createdAtMs", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─────────────────────────────────────────────────────────────────────────────
// GET BROADCAST STATUS (single broadcast with recipient summary)
// ─────────────────────────────────────────────────────────────────────────────
export async function getBroadcastStatus(broadcastId) {
  const snap = await db.collection("broadcasts").doc(broadcastId).get();
  if (!snap.exists) throw Object.assign(new Error("Broadcast not found"), { status: 404 });
  return { id: snap.id, ...snap.data() };
}

// ─────────────────────────────────────────────────────────────────────────────
// CANCEL BROADCAST
// ─────────────────────────────────────────────────────────────────────────────
export async function cancelBroadcast(broadcastId, orgId) {
  const ref = db.collection("broadcasts").doc(broadcastId);
  const snap = await ref.get();
  if (!snap.exists) throw Object.assign(new Error("Broadcast not found"), { status: 404 });
  if (snap.data().orgId !== orgId) throw Object.assign(new Error("Access denied"), { status: 403 });
  if (snap.data().status === "completed" || snap.data().status === "completed_with_errors") {
    throw Object.assign(new Error("Broadcast already completed"), { status: 400 });
  }
  await ref.update({ status: "cancelled", cancelledAt: nowIso() });
  return { ok: true };
}
