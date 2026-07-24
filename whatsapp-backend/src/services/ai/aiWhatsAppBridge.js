/**
 * AI ↔ WhatsApp Bridge.
 *
 * ARCHITECTURAL DECISION: The AI layer is integrated as a non-blocking
 * post-processing step after inbound WhatsApp messages are persisted. This
 * ensures:
 * 1. Lead creation and message deduplication remain rock-solid (unchanged).
 * 2. AI failures can never block or corrupt the inbound pipeline.
 * 3. AI responses are sent through the same WhatsApp outbound path as
 *    manual replies, maintaining delivery guarantees and audit trail.
 * 4. The org's existing workflow engine triggers still fire — AI is additive.
 *
 * Flow:
 *   processInboundMessage() → importWhatsAppLead() → [success]
 *     → triggerAIResponse() (fire-and-forget, never awaited in pipeline)
 *       → processWithAI() → if auto_reply → sendAIWhatsAppReply()
 *       → if escalate → create notification for assigned employee
 */

import { db } from "../../bootstrap/firebase.js";
import { processWithAI } from "./aiService.js";
import { nowIso, safeDocId, orgCollection } from "../helpers.js";
import { metaGraphRequest, decryptWhatsAppToken } from "../meta.js";
import { logger } from "../../middleware/logger.js";
import { emitWorkflowTrigger } from "../workflow/workflowEngine.js";

/**
 * Send an AI-generated WhatsApp reply to the customer.
 * Uses the same outbound path as manual agent replies.
 */
async function sendAIWhatsAppReply({ orgId, leadId, phone, text }) {
  // Fetch WhatsApp credentials for this org
  const credentialSnap = await db.collection("whatsappCredentials").doc(orgId).get();
  if (!credentialSnap.exists || credentialSnap.data().connectionState !== "connected") {
    logger.warn({ orgId }, "AI reply skipped: WhatsApp not connected");
    return { sent: false, reason: "whatsapp_not_connected" };
  }

  const credential = credentialSnap.data();
  const recipient = String(phone).replace(/\D/g, "");
  if (!/^\d{7,15}$/.test(recipient)) {
    return { sent: false, reason: "invalid_phone" };
  }

  const token = decryptWhatsAppToken(credential.tokenCiphertext);
  const clientMessageId = safeDocId(`ai_${orgId}_${leadId}_${Date.now()}`);

  try {
    const result = await metaGraphRequest(`${credential.phoneNumberId}/messages`, {
      method: "POST",
      token,
      body: {
        messaging_product: "whatsapp",
        to: recipient,
        type: "text",
        text: { body: text },
        biz_opaque_callback_data: clientMessageId,
      },
    });

    // Persist the AI reply in the lead's message history
    const messageRef = orgCollection(db, orgId, "leads").doc(leadId)
      .collection("messages").doc(clientMessageId);
    await messageRef.set({
      direction: "outbound",
      type: "text",
      text,
      recipient,
      status: "sent",
      providerMessageId: result?.messages?.[0]?.id || null,
      at: nowIso(),
      atMs: Date.now(),
      sentAt: nowIso(),
      sentAtMs: Date.now(),
      senderName: "AI Customer Care",
      source: "ai_customer_care",
    });

    // Write a note to the lead's notes collection (shows in Activity Stream)
    await orgCollection(db, orgId, "leads").doc(leadId)
      .collection("notes").doc().set({
        type: "whatsapp",
        text: `AI replied: ${text.slice(0, 200)}${text.length > 200 ? "..." : ""}`,
        authorId: "system",
        authorName: "AI Customer Care",
        visibility: "admin_only",
        sourceMessageId: clientMessageId,
        at: nowIso(),
      });

    // Record outbound dispatch for status reconciliation
    await db.collection("whatsappOutboundDispatches").doc(clientMessageId).set({
      orgId,
      leadId,
      intentId: clientMessageId,
      recipient,
      type: "ai_reply",
      status: "sent",
      sentAt: nowIso(),
    });

    logger.info({ orgId, leadId, messageId: clientMessageId }, "AI WhatsApp reply sent");
    return { sent: true, messageId: clientMessageId };
  } catch (error) {
    logger.error({ orgId, leadId, error: error.message }, "AI WhatsApp reply failed");
    return { sent: false, reason: error.message };
  }
}

/**
 * Notify the assigned employee that AI escalated a conversation.
 */
async function notifyEscalation({ orgId, leadId, assignedTo, reason, customerMessage }) {
  if (!assignedTo) return;

  const reasonText = {
    customer_requested_human: "Customer asked to speak with a person",
    low_confidence: "AI was not confident enough to auto-reply",
    intent_excluded_by_config: "Message intent is configured for human handling",
    daily_ai_limit_reached: "Daily AI message limit reached",
    max_ai_replies_per_lead_reached: "Maximum AI replies for this lead reached",
    ai_processing_error: "AI service encountered an error",
  }[reason] || reason;

  await orgCollection(db, orgId, "notifications").doc().set({
    userId: assignedTo,
    text: `AI escalated a WhatsApp conversation: ${reasonText}. Customer said: "${String(customerMessage).slice(0, 100)}"`,
    type: "ai_escalation",
    read: false,
    at: nowIso(),
    orgId,
    leadId,
  });
}

/**
 * Main entry point: called after a WhatsApp message is successfully processed.
 *
 * This function is FIRE-AND-FORGET — it never throws back to the caller.
 * Any failure is logged and the conversation falls back to human handling.
 */
export async function triggerAIResponse({ orgId, leadId, phone, customerName, customerMessage }) {
  try {
    const aiResult = await processWithAI({
      orgId,
      leadId,
      message: customerMessage,
      customerName,
      customerPhone: phone,
    });

    switch (aiResult.action) {
      case "auto_reply": {
        const sendResult = await sendAIWhatsAppReply({
          orgId,
          leadId,
          phone,
          text: aiResult.response,
        });

        // Log AI interaction in org activity (non-critical)
        orgCollection(db, orgId, "activity").add({
          text: `AI auto-replied to ${customerName || phone} (intent: ${aiResult.intent}, confidence: ${aiResult.confidence.toFixed(2)})`,
          at: nowIso(),
          orgId,
          leadId,
          source: "ai_customer_care",
        }).catch(() => {});

        return { action: "auto_reply", sent: sendResult.sent, intent: aiResult.intent };
      }

      case "escalate": {
        // Get the lead's assigned employee for notification
        const leadSnap = await orgCollection(db, orgId, "leads").doc(leadId).get();
        const assignedTo = leadSnap.exists ? leadSnap.data().assignedTo : null;

        await notifyEscalation({
          orgId,
          leadId,
          assignedTo,
          reason: aiResult.reason,
          customerMessage,
        });

        // Emit ai_escalation workflow trigger — org admins can build
        // workflows that fire when AI escalates (e.g., reassign lead,
        // send template, create ticket).
        emitWorkflowTrigger(db, {
          orgId,
          triggerType: "ai_escalation",
          entityType: "lead",
          entity: {
            id: leadId,
            ...(leadSnap.exists ? leadSnap.data() : {}),
            aiIntent: aiResult.intent,
            aiConfidence: aiResult.confidence,
            aiEscalationReason: aiResult.reason,
            lastMessage: customerMessage,
          },
          dedupeToken: `ai_esc_${leadId}_${Date.now()}`,
        }).catch(() => {});

        // Log escalation in activity
        orgCollection(db, orgId, "activity").add({
          text: `AI escalated conversation with ${customerName || phone} to human agent (reason: ${aiResult.reason})`,
          at: nowIso(),
          orgId,
          leadId,
          source: "ai_customer_care",
        }).catch(() => {});

        return { action: "escalate", reason: aiResult.reason };
      }

      case "disabled":
      case "skip":
        // AI not active for this org or within working hours — silent no-op
        return { action: aiResult.action, reason: aiResult.reason };

      default:
        return { action: "unknown" };
    }
  } catch (error) {
    logger.error({ orgId, leadId, error: error.message }, "AI trigger failed completely");
    return { action: "error", error: error.message };
  }
}
