/**
 * WhatsApp lead import & message processing service.
 *
 * ARCHITECTURAL DECISION: The WhatsApp inbound processing pipeline (claim →
 * deduplicate → assign → create lead → persist messages) was the largest
 * inline block in server.js (~200 lines). Extracting it:
 * 1. Separates "how a WhatsApp message becomes a CRM lead" from HTTP transport.
 * 2. Enables the same logic to be called from webhook handlers AND queue workers.
 * 3. Makes the exactly-once delivery guarantees (claim/lease/dedup) auditable.
 * 4. Allows independent scaling of message processing if moved to a worker.
 */

import crypto from "crypto";
import { db } from "../bootstrap/firebase.js";
import { getNextEmployeeRoundRobin, getNextEmployeeByWorkload } from "../../utils/assignLead.js";
import { nowIso, safeDocId, orgCollection } from "./helpers.js";
import { reserveLeadCapacity, releaseLeadCapacity } from "./org.js";
import { withLease } from "./lease.js";
import { logger } from "../middleware/logger.js";
import { emitWorkflowTrigger } from "./workflow/workflowEngine.js";
import { triggerAIResponse } from "./ai/aiWhatsAppBridge.js";

// ─── Pending Queue ──────────────────────────────────────────────────

async function queuePendingWhatsAppMessage({ orgId, phone, name, requirement, providerMessageId, messageType, messageTimestampMs }) {
  await db.collection("whatsappPendingMessages").doc(safeDocId(providerMessageId)).set({
    orgId,
    phone,
    name,
    requirement,
    providerMessageId,
    messageType,
    messageTimestampMs,
    queuedAt: nowIso(),
  }, { merge: true });
}

// ─── Lead Import ────────────────────────────────────────────────────

async function importWhatsAppLeadUnlocked({ phone, name, requirement, orgId, messageId = null, messageType = "text", messageTimestampMs = Date.now() }) {
  if (!orgId) return { status: "error", reason: "org_not_resolved" };
  const leadsRef = orgCollection(db, orgId, "leads");
  const inboundAtMs = Number(messageTimestampMs);
  if (!Number.isFinite(inboundAtMs) || inboundAtMs <= 0) throw new Error("Invalid WhatsApp provider timestamp");
  const inboundAt = new Date(inboundAtMs).toISOString();
  const receivedAt = nowIso();
  const providerMessageId = messageId || crypto.randomUUID();
  const inboundMessage = {
    direction: "inbound",
    text: requirement,
    type: messageType,
    providerMessageId,
    status: "received",
    at: inboundAt,
    atMs: inboundAtMs,
    receivedAt,
    receivedAtMs: Date.now(),
  };

  const existing = await leadsRef.where("phone", "==", phone).limit(1).get();
  if (!existing.empty) {
    const leadRef = existing.docs[0].ref;
    await db.runTransaction(async (tx) => {
      const currentLead = await tx.get(leadRef);
      if (!currentLead.exists) throw new Error("Lead disappeared while processing WhatsApp message");
      const priorTimestampMs = Number(currentLead.data().lastWhatsAppInboundAtMs || 0);
      const latestTimestampMs = Math.max(priorTimestampMs, inboundAtMs);
      tx.set(leadRef.collection("messages").doc(safeDocId(providerMessageId)), inboundMessage, { merge: true });
      tx.set(leadRef.collection("notes").doc(), {
        type: "whatsapp",
        text: `New WhatsApp message: ${requirement}`,
        authorId: "system",
        authorName: "WhatsApp Sync",
        visibility: "admin_only",
        sourceMessageId: providerMessageId,
        at: receivedAt,
      });
      tx.update(leadRef, {
        lastUpdated: receivedAt,
        lastWhatsAppInboundAt: new Date(latestTimestampMs).toISOString(),
        lastWhatsAppInboundAtMs: latestTimestampMs,
      });
    });
    // whatsapp_message_received on an EXISTING lead — e.g. a rule that
    // reopens/reassigns a cold lead the moment it messages back.
    emitWorkflowTrigger(db, {
      orgId,
      triggerType: "whatsapp_message_received",
      entityType: "whatsappMessage",
      entity: { leadId: leadRef.id, phone, requirement, messageType, orgId },
      dedupeToken: providerMessageId,
    }).catch(() => {});
    return { status: "duplicate", leadId: leadRef.id };
  }

  const settings = await orgCollection(db, orgId, "settings").doc("config").get();
  let assignedTo = null;
  let assignedToName = null;
  const autoAssign = settings.exists ? settings.data().autoAssign : "round-robin";
  const employee = autoAssign === "workload"
    ? await getNextEmployeeByWorkload(db, orgId)
    : await getNextEmployeeRoundRobin(db, orgId);
  if (employee) {
    assignedTo = employee.id;
    assignedToName = employee.name || null;
  }

  if (!assignedTo) {
    await queuePendingWhatsAppMessage({
      orgId, phone, name, requirement, providerMessageId, messageType, messageTimestampMs: inboundAtMs,
    });
    return { status: "queued", reason: "no_active_employees" };
  }

  const capacityReserved = await reserveLeadCapacity(orgId);
  if (!capacityReserved) {
    await queuePendingWhatsAppMessage({
      orgId, phone, name, requirement, providerMessageId, messageType, messageTimestampMs: inboundAtMs,
    });
    return { status: "queued", reason: "subscription_or_lead_limit" };
  }

  try {
    const leadRef = leadsRef.doc();
    const createdAt = nowIso();
    const batch = db.batch();
    batch.create(leadRef, {
      name: name || "WhatsApp Lead",
      phone,
      email: "",
      source: "WhatsApp",
      requirement: requirement || "",
      status: "New",
      assignedTo,
      assignedToName,
      blacklisted: false,
      priority: "Warm",
      createdAt,
      lastUpdated: createdAt,
      lastWhatsAppInboundAt: inboundAt,
      lastWhatsAppInboundAtMs: inboundAtMs,
      followUp: null,
      lastContactedAt: null,
      orgId,
    });
    batch.create(leadRef.collection("messages").doc(safeDocId(providerMessageId)), inboundMessage);
    batch.create(leadRef.collection("notes").doc("created"), {
      type: "system",
      text: "Lead created via WhatsApp",
      authorId: "system",
      authorName: "System",
      visibility: "team",
      sourceMessageId: messageId,
      at: createdAt,
    });
    batch.create(orgCollection(db, orgId, "notifications").doc(), {
      userId: assignedTo,
      text: `New WhatsApp lead: ${name || "WhatsApp Lead"} (${leadRef.id})`,
      read: false,
      at: createdAt,
      orgId,
    });
    batch.create(orgCollection(db, orgId, "activity").doc(), {
      text: `📲 WhatsApp lead auto-imported: ${name || "WhatsApp Lead"} → ${assignedToName || assignedTo}`,
      at: createdAt,
      orgId,
    });
    // Small projection used by the Mission Control inactivity aggregate.
    batch.set(db.collection("organizations").doc(orgId), {
      lastActivityAt: createdAt,
      lastActivityAtMs: Date.now(),
    }, { merge: true });
    await batch.commit();

    // Two triggers legitimately fire from this single event: the lead
    // itself was just created (lead_created — same call site convention as
    // leadIntake.js), AND a WhatsApp message was received (whatsapp_message_received).
    // Both are awaited-but-swallowed so neither can fail this lead's creation.
    const createdLead = {
      id: leadRef.id, name: name || "WhatsApp Lead", phone, email: "", source: "WhatsApp",
      requirement: requirement || "", status: "New", assignedTo, assignedToName,
      blacklisted: false, priority: "Warm", createdAt, lastUpdated: createdAt, orgId,
    };
    emitWorkflowTrigger(db, {
      orgId, triggerType: "lead_created", entityType: "lead", entity: createdLead, dedupeToken: createdAt,
    }).catch(() => {});
    emitWorkflowTrigger(db, {
      orgId, triggerType: "whatsapp_message_received", entityType: "whatsappMessage",
      entity: { leadId: leadRef.id, phone, requirement, messageType, orgId }, dedupeToken: providerMessageId,
    }).catch(() => {});

    return { status: "created", leadId: leadRef.id };
  } catch (error) {
    await releaseLeadCapacity(orgId).catch(() => {});
    throw error;
  }
}

export async function importWhatsAppLead(args) {
  const { orgId, phone, name, requirement, messageId = null, messageType = "text", messageTimestampMs = Date.now() } = args;
  if (!orgId) return { status: "error", reason: "org_not_resolved" };
  const locked = await withLease(
    `whatsappLead_${safeDocId(`${orgId}_${phone}`)}`,
    2 * 60 * 1000,
    () => importWhatsAppLeadUnlocked({ orgId, phone, name, requirement, messageId, messageType, messageTimestampMs })
  );
  if (locked !== null) return locked;
  await queuePendingWhatsAppMessage({
    orgId, phone, name, requirement,
    providerMessageId: messageId || crypto.randomUUID(), messageType, messageTimestampMs,
  });
  return { status: "queued", reason: "lead_creation_in_progress" };
}

// ─── Message Claim (exactly-once) ───────────────────────────────────

export async function claimInboundMessage(messageId, details) {
  const ref = db.collection("whatsappMessageEvents").doc(safeDocId(messageId));
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    const now = Date.now();
    if (existing.exists) {
      const prior = existing.data();
      const stillProcessing = prior.status === "processing"
        && Number(prior.processingStartedAtMs || 0) > now - 5 * 60 * 1000;
      if (prior.status === "completed") return "completed";
      if (stillProcessing) return "processing";
      tx.set(ref, {
        ...details,
        status: "processing",
        processingStartedAtMs: now,
        retryCount: Number(prior.retryCount || 0) + 1,
        retriedAt: nowIso(),
        failure: null,
      }, { merge: true });
      return true;
    }
    tx.create(ref, {
      ...details,
      status: "processing",
      receivedAt: nowIso(),
      processingStartedAtMs: now,
      retryCount: 0,
    });
    return true;
  });
}

// ─── Inbound Processing ─────────────────────────────────────────────

export async function processInboundMessage({ orgId, message, contact }) {
  const messageId = message.id;
  const providerTimestampMs = Number(message.timestamp) * 1000;
  if (!messageId) return { status: "ignored", reason: "missing_message_id" };
  if (!Number.isFinite(providerTimestampMs) || providerTimestampMs <= 0 || providerTimestampMs > Date.now() + 5 * 60 * 1000) {
    return { status: "ignored", reason: "invalid_provider_timestamp" };
  }
  const claimed = await claimInboundMessage(messageId, { orgId, from: message.from, type: message.type || "unknown" });
  if (claimed === "completed") return { status: "duplicate_event" };
  if (claimed === "processing") {
    throw new Error("WhatsApp message is still being processed; retry delivery");
  }
  const ref = db.collection("whatsappMessageEvents").doc(safeDocId(messageId));
  try {
    const result = await importWhatsAppLead({
      orgId,
      phone: message.from,
      name: contact?.profile?.name || "WhatsApp Lead",
      requirement: message.text?.body || `[${message.type || "Unsupported"} message]`,
      messageId,
      messageType: message.type || "unknown",
      messageTimestampMs: providerTimestampMs,
    });
    await ref.update({ status: "completed", completedAt: nowIso(), result });

    // ── AI Customer Care: trigger AI response (fire-and-forget) ──
    // Only triggers for text messages on successfully processed leads.
    // AI decision (auto-reply vs escalate vs skip) is handled internally.
    if ((result.status === "created" || result.status === "duplicate") && message.type === "text" && message.text?.body) {
      triggerAIResponse({
        orgId,
        leadId: result.leadId,
        phone: message.from,
        customerName: contact?.profile?.name || null,
        customerMessage: message.text.body,
      }).catch((aiError) => logger.warn({ orgId, error: aiError.message }, "AI trigger fire-and-forget failed"));
    }

    return result;
  } catch (error) {
    await ref.update({ status: "failed", failedAt: nowIso(), failure: error.message });
    throw error;
  }
}

// ─── Outbound Status Reconciliation ─────────────────────────────────

export async function reconcileOutboundWhatsAppStatus(orgId, status) {
  const clientMessageId = safeDocId(status?.biz_opaque_callback_data || "");
  if (!clientMessageId) return { status: "ignored", reason: "missing_callback_data" };
  const dispatchRef = db.collection("whatsappOutboundDispatches").doc(clientMessageId);
  await db.runTransaction(async (tx) => {
    const dispatchSnap = await tx.get(dispatchRef);
    if (!dispatchSnap.exists || dispatchSnap.data().orgId !== orgId) return;
    const dispatch = dispatchSnap.data();
    const providerStatus = String(status.status || "");
    const messageRef = orgCollection(db, orgId, "leads").doc(dispatch.leadId).collection("messages").doc(clientMessageId);
    const intentRef = db.collection("whatsappOutboundIntents").doc(dispatch.intentId);
    if (["sent", "delivered", "read"].includes(providerStatus)) {
      tx.set(messageRef, {
        status: "sent",
        providerMessageId: status.id || null,
        providerStatus,
        sentAt: nowIso(),
        sentAtMs: Date.now(),
        failure: null,
      }, { merge: true });
      tx.set(dispatchRef, { status: "sent", providerMessageId: status.id || null, providerStatus, finalizedAt: nowIso() }, { merge: true });
      tx.delete(intentRef);
    } else if (providerStatus === "failed") {
      tx.set(messageRef, { status: "failed", providerStatus, failedAt: nowIso(), failure: "WhatsApp provider rejected delivery" }, { merge: true });
      tx.set(dispatchRef, { status: "failed", providerStatus, finalizedAt: nowIso() }, { merge: true });
      tx.delete(intentRef);
    }
  });
  return { status: "reconciled" };
}

// ─── Pending Queue Processing ───────────────────────────────────────

async function migrateLegacyPendingQueue(orgId) {
  const legacyItems = await orgCollection(db, orgId, "pending_leads").get();
  for (const legacyItem of legacyItems.docs) {
    const data = legacyItem.data();
    const children = await legacyItem.ref.collection("messages").get();
    const messages = children.empty
      ? [{ data: () => ({
          name: data.name,
          requirement: data.requirement,
          messageId: data.messageId || crypto.randomUUID(),
          messageType: "text",
          messageTimestampMs: Date.parse(data.queuedAt || "") || Date.now(),
        }) }]
      : children.docs;
    for (const child of messages) {
      const message = child.data();
      await queuePendingWhatsAppMessage({
        orgId,
        phone: data.phone,
        name: message.name || data.name,
        requirement: message.requirement,
        providerMessageId: message.messageId,
        messageType: message.messageType || "text",
        messageTimestampMs: message.messageTimestampMs,
      });
    }
    const batch = db.batch();
    children.docs.forEach((child) => batch.delete(child.ref));
    batch.delete(legacyItem.ref);
    await batch.commit();
  }
}

export async function processPendingQueue(orgId = null) {
  const organizations = orgId
    ? [await db.collection("organizations").doc(orgId).get()]
    : (await db.collection("organizations").get()).docs;
  for (const orgSnap of organizations) {
    if (orgSnap?.exists) await migrateLegacyPendingQueue(orgSnap.id);
  }

  const pending = orgId
    ? await db.collection("whatsappPendingMessages").where("orgId", "==", orgId).get()
    : await db.collection("whatsappPendingMessages").get();
  let processed = 0;
  for (const pendingSnap of pending.docs) {
    const message = pendingSnap.data();
    const result = await importWhatsAppLead({
      orgId: message.orgId,
      phone: message.phone,
      name: message.name,
      requirement: message.requirement,
      messageId: message.providerMessageId,
      messageType: message.messageType || "text",
      messageTimestampMs: message.messageTimestampMs,
    });
    if (result.status !== "queued") {
      await pendingSnap.ref.delete();
      processed += 1;
    }
  }
  return processed;
}
