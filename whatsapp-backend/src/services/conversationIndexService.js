/**
 * Conversation index — the read model behind the Team Inbox.
 *
 * ARCHITECTURAL DECISION: The inbox needs "every conversation, newest first,
 * with its last message and unread count". Deriving that from the per-lead
 * `messages` subcollections would need one query per lead on every render —
 * unusable and expensive. So the backend maintains a denormalized summary
 * document per lead that the inbox can listen to with a single query.
 *
 *   organizations/{orgId}/conversations/{leadId}
 *
 * This is a pure projection: it is always rebuilt from events (inbound msg,
 * outbound msg, session change) and never read back to make a decision, so a
 * missed write self-heals on the next message rather than corrupting state.
 *
 * Writes here are ALWAYS fire-and-forget at the call sites — an inbox summary
 * failing must never break message delivery or lead creation.
 */

import { FieldValue } from "firebase-admin/firestore";
import { db } from "../bootstrap/firebase.js";
import { nowIso, orgCollection } from "./helpers.js";
import { logger } from "../middleware/logger.js";

const PREVIEW_MAX = 300;

const conversationRef = (orgId, leadId) =>
  orgCollection(db, orgId, "conversations").doc(leadId);

const preview = (text) => String(text ?? "").trim().slice(0, PREVIEW_MAX);

/**
 * Record an inbound customer message. Bumps the unread counter so the inbox
 * can show "needs attention", and moves the conversation to the top.
 */
export async function recordInboundConversation({
  orgId, leadId, leadName, phone, text, messageType, atMs,
  assignedTo = null, assignedToName = null, status = null,
}) {
  if (!orgId || !leadId) return;
  try {
    await conversationRef(orgId, leadId).set({
      orgId,
      leadId,
      ...(leadName ? { leadName } : {}),
      ...(phone ? { phone } : {}),
      lastMessage: preview(text),
      lastMessageType: messageType || "text",
      lastDirection: "inbound",
      lastMessageAtMs: Number(atMs) || Date.now(),
      lastMessageAt: new Date(Number(atMs) || Date.now()).toISOString(),
      lastInboundAtMs: Number(atMs) || Date.now(),
      unreadCount: FieldValue.increment(1),
      ...(assignedTo !== undefined ? { assignedTo } : {}),
      ...(assignedToName !== undefined ? { assignedToName } : {}),
      ...(status ? { status } : {}),
      updatedAt: nowIso(),
      updatedAtMs: Date.now(),
    }, { merge: true });
  } catch (error) {
    logger.warn({ orgId, leadId, err: error.message }, "Conversation index inbound update failed");
  }
}

/**
 * Record an outbound message (agent, AI, or automation). Any reply clears the
 * unread counter, since the conversation has now been responded to.
 */
export async function recordOutboundConversation({
  orgId, leadId, text, messageType, senderName, source = null, atMs,
}) {
  if (!orgId || !leadId) return;
  try {
    await conversationRef(orgId, leadId).set({
      orgId,
      leadId,
      lastMessage: preview(text),
      lastMessageType: messageType || "text",
      lastDirection: "outbound",
      lastMessageAtMs: Number(atMs) || Date.now(),
      lastMessageAt: new Date(Number(atMs) || Date.now()).toISOString(),
      lastOutboundAtMs: Number(atMs) || Date.now(),
      lastSenderName: senderName || null,
      lastOutboundSource: source,
      unreadCount: 0,
      updatedAt: nowIso(),
      updatedAtMs: Date.now(),
    }, { merge: true });
  } catch (error) {
    logger.warn({ orgId, leadId, err: error.message }, "Conversation index outbound update failed");
  }
}

/**
 * Mirror ownership / AI state onto the summary so the inbox can filter by
 * "mine", "unassigned", and show who is handling each chat without extra reads.
 */
export async function syncConversationOwnership({
  orgId, leadId, leadName, phone, assignedTo, assignedToName,
  aiEnabled, activeChatSessionId, activeChatSessionEmployee, activeChatSessionEmployeeName,
  status,
}) {
  if (!orgId || !leadId) return;
  try {
    await conversationRef(orgId, leadId).set({
      orgId,
      leadId,
      ...(leadName !== undefined ? { leadName } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(assignedTo !== undefined ? { assignedTo } : {}),
      ...(assignedToName !== undefined ? { assignedToName } : {}),
      ...(aiEnabled !== undefined ? { aiEnabled } : {}),
      ...(activeChatSessionId !== undefined ? { activeChatSessionId } : {}),
      ...(activeChatSessionEmployee !== undefined ? { activeChatSessionEmployee } : {}),
      ...(activeChatSessionEmployeeName !== undefined ? { activeChatSessionEmployeeName } : {}),
      ...(status !== undefined ? { status } : {}),
      updatedAt: nowIso(),
      updatedAtMs: Date.now(),
    }, { merge: true });
  } catch (error) {
    logger.warn({ orgId, leadId, err: error.message }, "Conversation index ownership sync failed");
  }
}

/** Clear the unread badge when an agent opens the conversation. */
export async function markConversationRead(orgId, leadId) {
  if (!orgId || !leadId) return { ok: false };
  await conversationRef(orgId, leadId).set({
    unreadCount: 0,
    readAt: nowIso(),
    updatedAt: nowIso(),
    updatedAtMs: Date.now(),
  }, { merge: true });
  return { ok: true };
}

/** Remove a conversation summary (used when a lead is hard-deleted). */
export async function deleteConversationIndex(orgId, leadId) {
  if (!orgId || !leadId) return;
  await conversationRef(orgId, leadId).delete().catch(() => {});
}

/**
 * Backfill / repair the index for an org by walking its leads. Used to
 * populate the inbox for orgs whose conversations predate this feature.
 */
export async function rebuildConversationIndex(orgId, { limit = 500 } = {}) {
  const leadsSnap = await orgCollection(db, orgId, "leads")
    .orderBy("lastWhatsAppInboundAtMs", "desc")
    .limit(limit)
    .get()
    .catch(() => null);

  if (!leadsSnap || leadsSnap.empty) return { rebuilt: 0 };

  let rebuilt = 0;
  for (const doc of leadsSnap.docs) {
    const lead = doc.data();
    // Only leads that have actually had a WhatsApp exchange belong in an inbox.
    if (!lead.lastWhatsAppInboundAtMs && !lead.lastWhatsAppOutboundAtMs) continue;

    const lastMsgSnap = await doc.ref.collection("messages")
      .orderBy("atMs", "desc").limit(1).get().catch(() => null);
    const lastMsg = lastMsgSnap && !lastMsgSnap.empty ? lastMsgSnap.docs[0].data() : null;

    await conversationRef(orgId, doc.id).set({
      orgId,
      leadId: doc.id,
      leadName: lead.name || lead.phone || "Customer",
      phone: lead.phone || "",
      status: lead.status || "New",
      assignedTo: lead.assignedTo || null,
      assignedToName: lead.assignedToName || null,
      aiEnabled: lead.aiEnabled !== false,
      activeChatSessionId: lead.activeChatSessionId || null,
      activeChatSessionEmployee: lead.activeChatSessionEmployee || null,
      lastMessage: preview(lastMsg?.text || ""),
      lastMessageType: lastMsg?.type || "text",
      lastDirection: lastMsg?.direction || "inbound",
      lastMessageAtMs: Number(lastMsg?.atMs) || Number(lead.lastWhatsAppInboundAtMs) || Date.now(),
      lastMessageAt: new Date(
        Number(lastMsg?.atMs) || Number(lead.lastWhatsAppInboundAtMs) || Date.now()
      ).toISOString(),
      // A rebuild cannot know what was already read, so start cleared rather
      // than showing every historical conversation as unread.
      unreadCount: 0,
      rebuiltAt: nowIso(),
      updatedAt: nowIso(),
      updatedAtMs: Date.now(),
    }, { merge: true });
    rebuilt++;
  }

  logger.info({ orgId, rebuilt }, "Conversation index rebuilt");
  return { rebuilt };
}
