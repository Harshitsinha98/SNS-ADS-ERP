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
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) logger.error({ status: res.status, data }, "Telegram support alert HTTP error");
    else logger.info("Telegram support alert sent successfully");
  } catch (e) {
    logger.error({ err: e.message }, "Telegram support alert network error");
  }
}

/**
 * Generate next ticket number (CS-001, CS-002, ...).
 * Uses a counter doc for atomicity.
 */
async function getNextTicketNumber() {
  const counterRef = db.collection("platformCounters").doc("supportTickets");
  const newCount = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists ? (snap.data().count || 0) : 0;
    const next = current + 1;
    tx.set(counterRef, { count: next }, { merge: true });
    return next;
  });
  return `CS-${String(newCount).padStart(3, "0")}`;
}

/**
 * Create a support ticket + send Telegram alert.
 */
export async function createTicket({
  orgId, orgName, userId, userName, userPhone, userRole,
  subject, description, conversationHistory, priority,
}) {
  const ref = db.collection(COLLECTION).doc();
  const ticketNumber = await getNextTicketNumber();
  const ticket = {
    id: ref.id,
    ticketNumber,
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
    `🎫 <b>New Support Ticket ${ticket.ticketNumber}</b>`,
    ``,
    `<b>From:</b> ${ticket.userName} (${ticket.userRole})`,
    ticket.orgName ? `<b>Org:</b> ${ticket.orgName}` : "",
    `<b>Subject:</b> ${ticket.subject}`,
    `<b>Issue:</b> ${ticket.description.slice(0, 200)}${ticket.description.length > 200 ? "..." : ""}`,
    ``,
    `<b>Priority:</b> ${ticket.priority}`,
    `→ crm.codeskate.com/platform/support`,
  ].filter(Boolean).join("\n");

  sendTelegramAlert(alert).catch(() => {});

  logger.info({ ticketId: ref.id, orgId, userName }, "Support ticket created");
  return ticket;
}

/**
 * List tickets (platform admin — all; or filtered by orgId for a tenant).
 * Avoids composite index by sorting in-memory (ticket count always < 100).
 */
export async function listTickets({ orgId, status, limit: lim = 100 } = {}) {
  let q = db.collection(COLLECTION);
  if (orgId) q = q.where("orgId", "==", orgId);
  if (status) q = q.where("status", "==", status);
  q = q.limit(lim);

  const snap = await q.get();
  const tickets = snap.docs.map((d) => d.data());
  // Sort newest first in-memory (avoids composite index requirement)
  tickets.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  return tickets;
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
