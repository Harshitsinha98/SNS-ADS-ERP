/**
 * Platform Console routes (v1).
 *
 * ARCHITECTURAL DECISION: Every route here is gated by requirePlatformAdmin.
 * These routes are completely separate from org-level routes — they give
 * the platform owner cross-tenant visibility and control without touching
 * any org-admin functionality.
 */

import { Router } from "express";
import { requireAuth, requirePlatformAdmin } from "../../middleware/index.js";
import {
  getPlatformStats, getRevenueTimeline, getMissionControl,
  listOrganizations, getOrganizationDetail, exportOrganization, performOrgAction, bulkOrganizationAction,
  getBillingOverview,
  getCustomerSuccess,
  getInfrastructureHealth,
  getWhatsAppOverview,
  listAuditLogs,
  listFeatureFlags, toggleFeatureFlag, createFeatureFlag,
  getPlatformSettings, updatePlatformSettings,
  getTenantUsage,
  getVoicePnlHandler,
} from "../../controllers/platform.controller.js";
import { getPlatformAIStats } from "../../controllers/ai.controller.js";
import { adminPendingHandler, adminApproveHandler, adminRejectHandler } from "../../controllers/codeskateVoice.controller.js";

export function createPlatformRoutes() {
  const router = Router();

  // All routes require platform admin
  router.use(requireAuth);
  router.use(requirePlatformAdmin);

  // Executive Dashboard
  router.get("/stats", getPlatformStats);
  router.get("/revenue", getRevenueTimeline);
  router.get("/mission-control", getMissionControl);

  // Organization Management
  router.get("/organizations", listOrganizations);
  router.post("/organizations/bulk-action", bulkOrganizationAction);
  router.get("/organizations/:orgId/export", exportOrganization);
  router.get("/organizations/:orgId", getOrganizationDetail);
  router.post("/organizations/:orgId/action", performOrgAction);

  // Billing
  router.get("/billing/overview", getBillingOverview);

  // Customer Success
  router.get("/customer-success/scores", getCustomerSuccess);

  // Infrastructure
  router.get("/infrastructure/health", getInfrastructureHealth);

  // WhatsApp Operations
  router.get("/whatsapp/overview", getWhatsAppOverview);

  // Audit Logs
  router.get("/audit-logs", listAuditLogs);

  // Feature Flags
  router.get("/feature-flags", listFeatureFlags);
  router.patch("/feature-flags/:flagId", toggleFeatureFlag);
  router.post("/feature-flags", createFeatureFlag);

  // Platform Settings
  router.get("/settings", getPlatformSettings);
  router.patch("/settings", updatePlatformSettings);

  // AI Usage & Cost (platform-wide)
  router.get("/ai-usage", getPlatformAIStats);

  // Per-tenant usage & renewal visibility (voice minutes, AI allowance, expiry)
  router.get("/tenant-usage", getTenantUsage);

  // Voice P&L — per-tenant profit/loss for bridge calling
  router.get("/voice-pnl", getVoicePnlHandler);

  // Voice Number admin — approve/reject/list pending requests
  router.get("/voice-requests", adminPendingHandler);
  router.post("/voice-approve", adminApproveHandler);
  router.post("/voice-reject", adminRejectHandler);

  // Support tickets — platform admin view (all tickets across orgs)
  router.get("/support-tickets", async (req, res) => {
    try {
      const { listTickets } = await import("../../services/supportTickets.js");
      const { status } = req.query;
      const tickets = await listTickets({ status: status || undefined });
      res.json({ ok: true, tickets });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.post("/support-tickets/:id/reply", async (req, res) => {
    try {
      const { replyToTicket, getTicket } = await import("../../services/supportTickets.js");
      const result = await replyToTicket(req.params.id, { from: "platform_admin", text: req.body.text || "" });
      if (!result) return res.status(404).json({ error: "Ticket not found" });

      // Also push reply to the linked org-internal ticket (if exists)
      const ticket = await getTicket(req.params.id);
      if (ticket?.orgId && ticket?.subject) {
        try {
          const { db: fireDb } = await import("../../bootstrap/firebase.js");
          const orgTicketsSnap = await fireDb.collection("organizations").doc(ticket.orgId)
            .collection("tickets")
            .where("subject", "==", `[Support] ${ticket.subject}`)
            .limit(1)
            .get();
          if (!orgTicketsSnap.empty) {
            const orgTicketRef = orgTicketsSnap.docs[0].ref;
            const orgTicketData = orgTicketsSnap.docs[0].data();
            const replies = orgTicketData.replies || [];
            replies.push({ from: "support_team", fromName: "CodeSkate Support", text: req.body.text || "", at: new Date().toISOString() });
            await orgTicketRef.update({ replies, updatedAt: new Date().toISOString() });
          }
        } catch { /* non-fatal */ }
      }

      res.json({ ok: true, ticket: result });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.post("/support-tickets/:id/status", async (req, res) => {
    try {
      const { updateTicketStatus, getTicket } = await import("../../services/supportTickets.js");
      const result = await updateTicketStatus(req.params.id, req.body.status || "resolved");

      // Sync status to linked org-internal ticket
      const ticket = await getTicket(req.params.id);
      if (ticket?.orgId && ticket?.subject) {
        try {
          const { db: fireDb } = await import("../../bootstrap/firebase.js");
          const orgTicketsSnap = await fireDb.collection("organizations").doc(ticket.orgId)
            .collection("tickets")
            .where("subject", "==", `[Support] ${ticket.subject}`)
            .limit(1)
            .get();
          if (!orgTicketsSnap.empty) {
            const update = { status: req.body.status || "resolved", updatedAt: new Date().toISOString() };
            if (req.body.status === "resolved") update.resolvedAt = new Date().toISOString();
            await orgTicketsSnap.docs[0].ref.update(update);
          }
        } catch { /* non-fatal */ }
      }

      res.json({ ok: true, ...result });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}
