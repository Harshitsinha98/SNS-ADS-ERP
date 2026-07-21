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

export function createV1Router() {
  const router = Router();

  // Health — no auth required
  router.use("/", createHealthRoutes());

  // WhatsApp management
  router.use("/whatsapp", createWhatsAppRoutes());

  // Subscription lifecycle (platform admin)
  router.use("/subscription", createSubscriptionRoutes());

  // Follow-up automation (org admin)
  router.use("/follow-ups", createFollowUpAutomationRoutes());

  return router;
}
