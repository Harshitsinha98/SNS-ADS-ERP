/**
 * Org-internal ticket routes.
 *
 * POST /org-tickets/create      — raise a ticket (employee or admin)
 * GET  /org-tickets/list        — list tickets (admin: all, employee: own)
 * POST /org-tickets/:id/reply   — reply to a ticket
 * POST /org-tickets/:id/status  — update status (admin only)
 */

import { Router } from "express";
import { requireAuth, getActiveMembership } from "../../middleware/auth.js";
import {
  createOrgTicket, listOrgTickets, replyToOrgTicket, updateOrgTicketStatus,
} from "../../services/orgTickets.js";

export function createOrgTicketRoutes() {
  const router = Router();

  router.post("/create", requireAuth, async (req, res) => {
    try {
      const { orgId, subject, description, priority } = req.body || {};
      if (!orgId) return res.status(400).json({ error: "orgId required." });

      const membership = await getActiveMembership(req.authUser.uid, orgId);
      if (!membership) return res.status(403).json({ error: "Active membership required." });

      const ticket = await createOrgTicket({
        orgId,
        raisedBy: req.authUser.uid,
        raisedByName: membership.displayName || membership.name || req.authUser.phone_number || "Team member",
        raisedByRole: membership.role || "employee",
        subject, description, priority,
      });

      return res.status(201).json({ ok: true, ticket });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Could not create ticket." });
    }
  });

  router.get("/list", requireAuth, async (req, res) => {
    try {
      const { orgId } = req.query;
      if (!orgId) return res.status(400).json({ error: "orgId required." });

      const membership = await getActiveMembership(req.authUser.uid, orgId);
      if (!membership) return res.status(403).json({ error: "Active membership required." });

      const tickets = await listOrgTickets(orgId, { uid: req.authUser.uid, role: membership.role });
      return res.json({ ok: true, tickets });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Could not load tickets." });
    }
  });

  router.post("/:id/reply", requireAuth, async (req, res) => {
    try {
      const { orgId, text } = req.body || {};
      if (!orgId || !text) return res.status(400).json({ error: "orgId and text required." });

      const membership = await getActiveMembership(req.authUser.uid, orgId);
      if (!membership) return res.status(403).json({ error: "Active membership required." });

      const result = await replyToOrgTicket(orgId, req.params.id, {
        from: req.authUser.uid,
        fromName: membership.displayName || membership.name || "Team",
        text,
      });

      if (!result) return res.status(404).json({ error: "Ticket not found." });
      return res.json({ ok: true, ticket: result });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Could not reply." });
    }
  });

  router.post("/:id/status", requireAuth, async (req, res) => {
    try {
      const { orgId, status } = req.body || {};
      if (!orgId || !status) return res.status(400).json({ error: "orgId and status required." });

      const membership = await getActiveMembership(req.authUser.uid, orgId);
      if (!membership || (membership.role !== "admin" && membership.role !== "owner")) {
        return res.status(403).json({ error: "Only admins can update ticket status." });
      }

      await updateOrgTicketStatus(orgId, req.params.id, status);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Could not update status." });
    }
  });

  return router;
}
