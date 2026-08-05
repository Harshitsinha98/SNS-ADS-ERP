/**
 * Broadcast routes — WhatsApp bulk template sending.
 *
 * All endpoints require Firebase auth (Bearer token).
 * Org admin access is checked inside each controller.
 */

import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { createHandler, listHandler, statusHandler, cancelHandler } from "../../controllers/broadcast.controller.js";

export function createBroadcastRoutes() {
  const router = Router();

  router.post("/create", requireAuth, createHandler);
  router.get("/list", requireAuth, listHandler);
  router.get("/status", requireAuth, statusHandler);
  router.post("/cancel", requireAuth, cancelHandler);

  return router;
}
