/**
 * Ticket Service — minimal support-ticket model.
 *
 * ARCHITECTURAL DECISION: Tickets did not previously exist in this codebase.
 * This is intentionally a small, standalone model (not a Lead subtype) so it
 * can be extended independently later, but it follows the exact same
 * org-scoping and audit conventions as `leads`/`followUpTasks`
 * (orgCollection helper, `activity` log entries, ISO timestamps) so it reads
 * as native to this codebase rather than bolted on.
 *
 * `closeTicket()` is the single call site that emits the `ticket_closed`
 * workflow trigger — mirroring how `leadIntake.js`/`followUpTasks.js` each
 * own exactly one write path for their respective state transitions.
 */

import { nowIso, safeDocId, orgCollection } from "./helpers.js";
import { emitWorkflowTrigger } from "./workflow/workflowEngine.js";

const TICKET_STATUSES = new Set(["open", "in_progress", "closed"]);

function ticketError(status, message) {
  return Object.assign(new Error(message), { status });
}

export async function createTicket(db, orgId, {
  subject, description = "", leadId = null, priority = "Warm",
  assignedTo = null, assignedToName = null, tags = [], product = null, city = null,
  source = "Manual", actorId,
}) {
  if (!subject) throw ticketError(400, "Subject is required");
  const ref = orgCollection(db, orgId, "tickets").doc();
  const createdAt = nowIso();
  const ticket = {
    id: ref.id,
    orgId,
    leadId,
    subject: String(subject).trim().slice(0, 200),
    description: String(description).trim().slice(0, 2000),
    status: "open",
    priority,
    assignedTo,
    assignedToName,
    tags: Array.isArray(tags) ? tags.slice(0, 20) : [],
    product,
    city,
    source,
    createdBy: actorId,
    createdAt,
    updatedAt: createdAt,
    closedAt: null,
    closedBy: null,
  };
  await ref.set(ticket);
  await orgCollection(db, orgId, "activity").add({
    text: `Ticket created: ${ticket.subject}`,
    at: createdAt, orgId, actorId, leadId, source: "ticket",
  });
  return ticket;
}

export async function getTicket(db, orgId, ticketId) {
  const snap = await orgCollection(db, orgId, "tickets").doc(ticketId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

export async function listTickets(db, orgId, { status = null, assignedTo = null } = {}) {
  let query = orgCollection(db, orgId, "tickets");
  if (status) query = query.where("status", "==", status);
  if (assignedTo) query = query.where("assignedTo", "==", assignedTo);
  const snap = await query.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function updateTicketStatus(db, orgId, ticketId, status, actorId) {
  if (!TICKET_STATUSES.has(status)) throw ticketError(400, "Invalid ticket status");
  const ref = orgCollection(db, orgId, "tickets").doc(ticketId);

  const updatedTicket = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw ticketError(404, "Ticket not found");
    const ticket = snap.data();
    const updatedAt = nowIso();
    const update = { status, updatedAt };
    if (status === "closed" && ticket.status !== "closed") {
      update.closedAt = updatedAt;
      update.closedBy = actorId;
    }
    tx.update(ref, update);
    return { ...ticket, ...update, id: ticketId };
  });

  await orgCollection(db, orgId, "activity").add({
    text: `Ticket ${status === "closed" ? "closed" : "status changed to " + status}: ${updatedTicket.subject}`,
    at: updatedTicket.updatedAt, orgId, actorId, leadId: updatedTicket.leadId, source: "ticket",
  });

  // Fire-and-await-but-never-throw: a workflow failure must never roll back
  // or fail the ticket-closing transaction itself.
  if (status === "closed") {
    await emitWorkflowTrigger(db, {
      orgId,
      triggerType: "ticket_closed",
      entityType: "ticket",
      entity: updatedTicket,
      dedupeToken: `${ticketId}_${updatedTicket.closedAt}`,
    }).catch(() => {});
  }

  return updatedTicket;
}

/** Convenience wrapper matching the trigger name in the requirements exactly. */
export async function closeTicket(db, orgId, ticketId, actorId) {
  return updateTicketStatus(db, orgId, ticketId, "closed", actorId);
}
