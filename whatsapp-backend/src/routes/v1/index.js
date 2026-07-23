/**
 * V1 API route aggregator.
 *
 * ARCHITECTURAL DECISION: API versioning strategy:
 * - All new routes live under /api/v1/*
 * - Legacy unversioned routes (/api/*) are mounted in parallel for backward
 *   compatibility — the frontend and webhook callers continue working without
 *   any URL changes.
 * - When the frontend is updated to use /api/v1/*, the legacy mounts can be
 *   removed with a single deletion in app.js.
 *
 * This "parallel mount" approach avoids a big-bang migration while giving new
 * integrations a stable, versioned contract.
 */

import { Router } from "express";
import { createWhatsAppRoutes } from "./whatsapp.routes.js";
import { createSubscriptionRoutes, createFollowUpAutomationRoutes } from "./subscription.routes.js";
import { createHealthRoutes } from "./health.routes.js";
import { createWorkflowRoutes, createTicketRoutes } from "./workflow.routes.js";
import { createPlatformRoutes } from "./platform.routes.js";
import { createAIRoutes } from "./ai.routes.js";
import { publicChatMessage } from "../../controllers/publicChat.controller.js";

export function createV1Router() {
  const router = Router();

  // Health — no auth required
  router.use("/", createHealthRoutes());

  // Public AI chat widget — no auth required (rate-limited by IP)
  router.post("/public/chat", publicChatMessage);

  // WhatsApp management
  router.use("/whatsapp", createWhatsAppRoutes());

  // Subscription lifecycle (platform admin)
  router.use("/subscription", createSubscriptionRoutes());

  // Follow-up automation (org admin)
  router.use("/follow-ups", createFollowUpAutomationRoutes());

  // Workflow Automation Engine (org admin) — CRUD/versioning/execution
  router.use("/workflows", createWorkflowRoutes());

  // Tickets (org admin) — minimal model backing the ticket_closed trigger
  router.use("/tickets", createTicketRoutes());

  // AI Customer Care (org admin + platform admin)
  router.use("/ai", createAIRoutes());

  // Platform Owner Console — cross-tenant operations (platform admin only)
  router.use("/platform", createPlatformRoutes());

  return router;
}
