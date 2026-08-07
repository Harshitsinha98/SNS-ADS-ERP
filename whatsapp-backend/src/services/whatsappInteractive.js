/**
 * WhatsApp Interactive Message sender (reply buttons + list menus).
 *
 * ARCHITECTURAL DECISION: Interactive messages go through the same outbound
 * contract as text/template sends — message doc, admin-only note, and a
 * whatsappOutboundDispatches record — so delivery-status reconciliation,
 * the Activity Stream, and the conversation UI all keep working unchanged.
 *
 * The chosen button/row `id` is what comes back on the inbound webhook as
 * interactive.button_reply.id / interactive.list_reply.id, so callers should
 * use stable, machine-readable ids (e.g. "qualify_interest:pricing") and let
 * the human-facing text live in `title`.
 *
 * Meta enforces hard length limits and silently rejects the whole message if
 * any are exceeded, so every field is truncated defensively here rather than
 * trusting callers.
 */

import { db } from "../bootstrap/firebase.js";
import { nowIso, safeDocId, orgCollection } from "./helpers.js";
import { metaGraphRequest, decryptWhatsAppToken } from "./meta.js";
import { logger } from "../middleware/logger.js";

// Meta's documented limits for interactive messages.
const LIMITS = {
  header: 60,
  body: 1024,
  footer: 60,
  buttonTitle: 20,
  buttons: 3,
  listButton: 20,
  sectionTitle: 24,
  rowTitle: 24,
  rowDescription: 72,
  rows: 10,
};

const cut = (value, max) => String(value ?? "").trim().slice(0, max);

/**
 * Shared outbound plumbing: resolve credentials, POST to Meta, then persist
 * the message + note + dispatch record exactly like the existing text sender.
 * `payload` is the type-specific part of the Meta body (type + its object).
 */
async function dispatch({
  orgId, leadId, phone, payload, messageFields, previewText,
  source, senderName, noteLabel, idPrefix, dispatchType,
}) {
  const credentialSnap = await db.collection("whatsappCredentials").doc(orgId).get();
  if (!credentialSnap.exists || credentialSnap.data().connectionState !== "connected") {
    return { sent: false, reason: "whatsapp_not_connected" };
  }
  const credential = credentialSnap.data();

  const recipient = String(phone).replace(/\D/g, "");
  if (!/^\d{7,15}$/.test(recipient)) return { sent: false, reason: "invalid_phone" };

  const token = decryptWhatsAppToken(credential.tokenCiphertext);
  const clientMessageId = safeDocId(`${idPrefix}_${orgId}_${leadId}_${Date.now()}`);

  try {
    const result = await metaGraphRequest(`${credential.phoneNumberId}/messages`, {
      method: "POST",
      token,
      body: {
        messaging_product: "whatsapp",
        to: recipient,
        ...payload,
        biz_opaque_callback_data: clientMessageId,
      },
    });

    await orgCollection(db, orgId, "leads").doc(leadId)
      .collection("messages").doc(clientMessageId).set({
        direction: "outbound",
        text: previewText,
        recipient,
        status: "sent",
        providerMessageId: result?.messages?.[0]?.id || null,
        at: nowIso(),
        atMs: Date.now(),
        sentAt: nowIso(),
        sentAtMs: Date.now(),
        senderName: senderName || "AI Customer Care",
        ...(source ? { source } : {}),
        ...messageFields,
      });

    await orgCollection(db, orgId, "leads").doc(leadId)
      .collection("notes").doc().set({
        type: "whatsapp",
        text: `${noteLabel || "Sent message"}: ${previewText.slice(0, 200)}`,
        authorId: "system",
        authorName: senderName || "AI Customer Care",
        visibility: "admin_only",
        sourceMessageId: clientMessageId,
        at: nowIso(),
      }).catch(() => {});

    await db.collection("whatsappOutboundDispatches").doc(clientMessageId).set({
      orgId,
      leadId,
      intentId: clientMessageId,
      recipient,
      type: dispatchType,
      status: "sent",
      sentAt: nowIso(),
    }).catch(() => {});

    logger.info({ orgId, leadId, messageId: clientMessageId, dispatchType },
      "WhatsApp message sent");
    return { sent: true, messageId: clientMessageId };
  } catch (error) {
    logger.error({ orgId, leadId, dispatchType, error: error.message }, "WhatsApp send failed");
    return { sent: false, reason: error.message };
  }
}

/**
 * Plain text send used by the qualification flow and session notices.
 * Kept here so all non-agent outbound shares one audited code path.
 */
export async function sendPlainText({
  orgId, leadId, phone, text,
  source = "ai_customer_care", senderName = "AI Customer Care", noteLabel = "AI sent",
  idPrefix = "ai_txt", dispatchType = "ai_reply",
}) {
  const body = cut(text, 4096);
  if (!body) return { sent: false, reason: "empty_text" };
  return dispatch({
    orgId, leadId, phone,
    payload: { type: "text", text: { body } },
    messageFields: { type: "text" },
    previewText: body,
    source, senderName, noteLabel, idPrefix, dispatchType,
  });
}

/** Interactive-specific wrapper around dispatch(). */
function dispatchInteractive({
  orgId, leadId, phone, interactive, previewText, source, senderName, noteLabel, idPrefix,
}) {
  return dispatch({
    orgId, leadId, phone,
    payload: { type: "interactive", interactive },
    messageFields: {
      type: "interactive",
      interactiveType: interactive.type,
      // Persist the rendered options so the CRM conversation view can show
      // what the customer was actually offered.
      interactiveOptions: extractOptions(interactive),
    },
    previewText,
    source, senderName, noteLabel, idPrefix,
    dispatchType: "interactive",
  });
}

/** Flatten buttons/rows into a simple [{id,title}] list for storage + UI. */
function extractOptions(interactive) {
  if (interactive.type === "button") {
    return (interactive.action?.buttons || []).map((b) => ({
      id: b.reply?.id, title: b.reply?.title,
    }));
  }
  if (interactive.type === "list") {
    return (interactive.action?.sections || []).flatMap((s) =>
      (s.rows || []).map((r) => ({ id: r.id, title: r.title, description: r.description || null }))
    );
  }
  return [];
}

/**
 * Reply buttons — up to 3 tappable options (e.g. Yes / No / Talk to agent).
 * `options`: [{ id, title }]
 */
export async function sendInteractiveButtons({
  orgId, leadId, phone, bodyText, options, headerText = "", footerText = "",
  source = "ai_customer_care", senderName = "AI Customer Care", noteLabel = "AI asked",
}) {
  const buttons = (options || []).slice(0, LIMITS.buttons)
    .filter((o) => o?.id && o?.title)
    .map((o) => ({ type: "reply", reply: { id: cut(o.id, 256), title: cut(o.title, LIMITS.buttonTitle) } }));

  if (buttons.length === 0) return { sent: false, reason: "no_valid_options" };

  const interactive = {
    type: "button",
    ...(headerText ? { header: { type: "text", text: cut(headerText, LIMITS.header) } } : {}),
    body: { text: cut(bodyText, LIMITS.body) },
    ...(footerText ? { footer: { text: cut(footerText, LIMITS.footer) } } : {}),
    action: { buttons },
  };

  return dispatchInteractive({
    orgId, leadId, phone, interactive,
    previewText: cut(bodyText, LIMITS.body),
    source, senderName, noteLabel, idPrefix: "ai_btn",
  });
}

/**
 * List menu — a tappable menu of up to 10 rows across sections. Used for
 * catalogues / category pickers where 3 buttons are not enough.
 * `sections`: [{ title, rows: [{ id, title, description }] }]
 */
export async function sendInteractiveList({
  orgId, leadId, phone, bodyText, buttonLabel = "View options", sections,
  headerText = "", footerText = "",
  source = "ai_customer_care", senderName = "AI Customer Care", noteLabel = "AI sent menu",
}) {
  // Meta caps total rows across ALL sections, so budget them globally.
  let remaining = LIMITS.rows;
  const safeSections = [];
  for (const section of sections || []) {
    if (remaining <= 0) break;
    const rows = (section.rows || [])
      .filter((r) => r?.id && r?.title)
      .slice(0, remaining)
      .map((r) => ({
        id: cut(r.id, 200),
        title: cut(r.title, LIMITS.rowTitle),
        ...(r.description ? { description: cut(r.description, LIMITS.rowDescription) } : {}),
      }));
    if (rows.length === 0) continue;
    remaining -= rows.length;
    safeSections.push({ title: cut(section.title || "Options", LIMITS.sectionTitle), rows });
  }

  if (safeSections.length === 0) return { sent: false, reason: "no_valid_rows" };

  const interactive = {
    type: "list",
    ...(headerText ? { header: { type: "text", text: cut(headerText, LIMITS.header) } } : {}),
    body: { text: cut(bodyText, LIMITS.body) },
    ...(footerText ? { footer: { text: cut(footerText, LIMITS.footer) } } : {}),
    action: { button: cut(buttonLabel, LIMITS.listButton), sections: safeSections },
  };

  return dispatchInteractive({
    orgId, leadId, phone, interactive,
    previewText: cut(bodyText, LIMITS.body),
    source, senderName, noteLabel, idPrefix: "ai_list",
  });
}

/**
 * Normalize an inbound interactive reply into { id, title }.
 * Handles current interactive replies and the legacy `button` message type.
 */
export function parseInteractiveReply(message) {
  const buttonReply = message?.interactive?.button_reply;
  if (buttonReply) return { id: buttonReply.id || null, title: buttonReply.title || "" };

  const listReply = message?.interactive?.list_reply;
  if (listReply) return { id: listReply.id || null, title: listReply.title || "" };

  // Legacy template quick-reply buttons arrive as type "button".
  if (message?.button) return { id: message.button.payload || null, title: message.button.text || "" };

  return null;
}
