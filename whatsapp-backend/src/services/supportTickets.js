/**
 * Support Ticket Service — in-app support for CodeSkate customers.
 *
 * Firestore: `supportTickets/{ticketId}`
 * {
 *   id, orgId, orgName, userId, userName, userPhone, userRole,
 *   subject, description, conversationHistory (AI chat before escalation),
 *   status: "open" | "in_progress" | "resolved" | "closed",
 *   priority: "low" | "medium" | "high",
 *   createdAt, updatedAt, resolvedAt,
 *   replies: [{ from, text, at }]
 * }
 *
 * On creation: Telegram alert to platform owner.
 */

import { db } from "../bootstrap/firebase.js";
import { logger } from "../middleware/logger.js";

const COLLECTION = "supportTickets";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8723408383:AAGfvSxO3bFmC9JzTVLFXW2wHmzb0Hn_yvM";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_ALERT_CHAT_ID || "8831961350";

const nowIso = () => new Date().toISOString();

async function sendTelegramAlert(message) {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }),
    });
  } catch (e) {
    logger.warn({ err: e.message }, "Support ticket Telegram alert failed");
  }
}

/**
 * Create a support ticket + send Telegram alert.
 */
export async function createTicket({
  orgId, orgName, userId, userName, userPhone, userRole,
  subject, description, conversationHistory, priority,
}) {
  const ref = db.collection(COLLECTION).doc();
  const ticket = {
    id: ref.id,
    orgId: orgId || null,
    orgName: orgName || "",
    userId: userId || null,
    userName: userName || "Anonymous",
    userPhone: userPhone || "",
    userRole: userRole || "unknown",
    subject: subject || "Support request",
    description: description || "",
    conversationHistory: conversationHistory || [],
    status: "open",
    priority: priority || "medium",
    replies: [],
    createdAt: nowIso(),
    createdAtMs: Date.now(),
    updatedAt: nowIso(),
    resolvedAt: null,
  };

  await ref.set(ticket);

  // Telegram alert
  const alert = [
    `🎫 <b>New Support Ticket</b>`,
    ``,
    `<b>From:</b> ${ticket.userName} (${ticket.userRole})`,
    ticket.orgName ? `<b>Org:</b> ${ticket.orgName}` : "",
    `<b>Subject:</b> ${ticket.subject}`,
    `<b>Issue:</b> ${ticket.description.slice(0, 200)}${ticket.description.length > 200 ? "..." : ""}`,
    ``,
    `<b>Priority:</b> ${ticket.priority}`,
    `→ /platform/support`,
  ].filter(Boolean).join("\n");

  sendTelegramAlert(alert).catch(() => {});

  logger.info({ ticketId: ref.id, orgId, userName }, "Support ticket created");
  return ticket;
}

/**
 * List tickets (platform admin — all; or filtered by orgId for a tenant).
 */
export async function listTickets({ orgId, status, limit: lim = 50 } = {}) {
  let q = db.collection(COLLECTION).orderBy("createdAtMs", "desc").limit(lim);
  if (orgId) q = q.where("orgId", "==", orgId);
  if (status) q = q.where("status", "==", status);

  const snap = await q.get();
  return snap.docs.map((d) => d.data());
}

/**
 * Get a single ticket.
 */
export async function getTicket(ticketId) {
  const snap = await db.collection(COLLECTION).doc(ticketId).get();
  return snap.exists ? snap.data() : null;
}

/**
 * Add a reply to a ticket (platform owner reply or user follow-up).
 */
export async function replyToTicket(ticketId, { from, text }) {
  const ref = db.collection(COLLECTION).doc(ticketId);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const replies = snap.data().replies || [];
  replies.push({ from, text, at: nowIso() });

  await ref.update({ replies, updatedAt: nowIso() });
  return { ...snap.data(), replies };
}

/**
 * Update ticket status.
 */
export async function updateTicketStatus(ticketId, status) {
  const ref = db.collection(COLLECTION).doc(ticketId);
  const update = { status, updatedAt: nowIso() };
  if (status === "resolved" || status === "closed") update.resolvedAt = nowIso();
  await ref.update(update);
  return { id: ticketId, ...update };
}
