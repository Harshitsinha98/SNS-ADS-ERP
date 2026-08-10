/**
 * Org-Internal Ticket Service — employees raise issues to their admin.
 *
 * Firestore: `organizations/{orgId}/tickets/{ticketId}`
 * {
 *   id, ticketNumber, raisedBy (uid), raisedByName, raisedByRole,
 *   subject, description, status: "open"|"in_progress"|"resolved",
 *   priority: "low"|"medium"|"high",
 *   replies: [{ from, fromName, text, at }],
 *   createdAt, updatedAt, resolvedAt,
 * }
 *
 * Auto-cleanup: resolved tickets older than 24 hours are deleted by a daily cron.
 */

import { db } from "../bootstrap/firebase.js";
import { logger } from "../middleware/logger.js";

const nowIso = () => new Date().toISOString();

function ticketsCol(orgId) {
  return db.collection("organizations").doc(orgId).collection("tickets");
}

/**
 * Get next org-specific ticket number (INT-001, INT-002...).
 */
async function getNextOrgTicketNumber(orgId) {
  const counterRef = db.collection("organizations").doc(orgId).collection("counters").doc("tickets");
  const newCount = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists ? (snap.data().count || 0) : 0;
    const next = current + 1;
    tx.set(counterRef, { count: next }, { merge: true });
    return next;
  });
  return `INT-${String(newCount).padStart(3, "0")}`;
}

/**
 * Create an internal ticket.
 */
export async function createOrgTicket({ orgId, raisedBy, raisedByName, raisedByRole, subject, description, priority, linkedSupportTicketId }) {
  const col = ticketsCol(orgId);
  const ref = col.doc();
  const ticketNumber = await getNextOrgTicketNumber(orgId);

  const ticket = {
    id: ref.id,
    ticketNumber,
    raisedBy,
    raisedByName: raisedByName || "Team member",
    raisedByRole: raisedByRole || "employee",
    subject: subject || "Internal ticket",
    description: description || "",
    status: "open",
    priority: priority || "medium",
    linkedSupportTicketId: linkedSupportTicketId || null,
    replies: [],
    createdAt: nowIso(),
    createdAtMs: Date.now(),
    updatedAt: nowIso(),
    resolvedAt: null,
  };

  await ref.set(ticket);
  logger.info({ orgId, ticketId: ref.id, ticketNumber, raisedByName }, "Org internal ticket created");
  return ticket;
}

/**
 * List tickets for an org (all for admin, own for employee).
 */
export async function listOrgTickets(orgId, { uid, role } = {}) {
  const col = ticketsCol(orgId);
  let snap;

  if (role === "admin" || role === "owner") {
    // Admin sees all
    snap = await col.get();
  } else {
    // Employee sees only their own
    snap = await col.where("raisedBy", "==", uid).get();
  }

  const tickets = snap.docs.map((d) => d.data());
  tickets.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  return tickets;
}

/**
 * Get a single ticket.
 */
export async function getOrgTicket(orgId, ticketId) {
  const snap = await ticketsCol(orgId).doc(ticketId).get();
  return snap.exists ? snap.data() : null;
}

/**
 * Add a reply.
 */
export async function replyToOrgTicket(orgId, ticketId, { from, fromName, text }) {
  const ref = ticketsCol(orgId).doc(ticketId);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const replies = snap.data().replies || [];
  replies.push({ from, fromName: fromName || "Team", text, at: nowIso() });

  await ref.update({ replies, updatedAt: nowIso() });
  return { ...snap.data(), replies };
}

/**
 * Update ticket status.
 */
export async function updateOrgTicketStatus(orgId, ticketId, status) {
  const ref = ticketsCol(orgId).doc(ticketId);
  const update = { status, updatedAt: nowIso() };
  if (status === "resolved") update.resolvedAt = nowIso();
  await ref.update(update);
  return update;
}

/**
 * Auto-cleanup: delete resolved tickets older than 24 hours.
 * Called by daily cron.
 */
export async function cleanupResolvedOrgTickets() {
  const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
  // We need to scan all orgs' tickets — use collectionGroup query
  const snap = await db.collectionGroup("tickets")
    .where("status", "==", "resolved")
    .get();

  let deleted = 0;
  for (const doc of snap.docs) {
    const ticket = doc.data();
    const resolvedAt = ticket.resolvedAt ? new Date(ticket.resolvedAt).getTime() : 0;
    if (resolvedAt > 0 && resolvedAt < cutoffMs) {
      await doc.ref.delete();
      deleted++;
    }
  }

  if (deleted > 0) logger.info({ deleted }, "Cleaned up resolved org tickets (24h+)");
  return { deleted };
}
