/**
 * WhatsApp API routes (v1).
 *
 * ARCHITECTURAL DECISION: Routes are declarative wiring — they connect
 * URL patterns to middleware chains and controller handlers. No business
 * logic lives here. This makes the API surface scannable at a glance and
 * enables automatic OpenAPI documentation generation in the future.
 */

import { Router } from "express";
import { requireAuth } from "../../middleware/index.js";
import {
  connectWhatsApp,
  getWhatsAppStatus,
  repairWebhook,
  disconnectWhatsApp,
  sendMessage,
  syncNow,
} from "../../controllers/index.js";

export function createWhatsAppRoutes() {
  const router = Router();

  router.post("/connect", requireAuth, connectWhatsApp);
  router.post("/status", requireAuth, getWhatsAppStatus);
  router.post("/repair-webhook", requireAuth, repairWebhook);
  router.post("/disconnect", requireAuth, disconnectWhatsApp);
  router.post("/messages", requireAuth, sendMessage);
  router.post("/sync-now", requireAuth, syncNow);

  return router;
}
