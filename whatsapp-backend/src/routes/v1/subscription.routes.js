/**
 * Subscription lifecycle routes (v1).
 */

import { Router } from "express";
import { requireAuth } from "../../middleware/index.js";
import { runLifecycle, runAutomation } from "../../controllers/index.js";

export function createSubscriptionRoutes() {
  const router = Router();

  router.post("/run-lifecycle", requireAuth, runLifecycle);

  return router;
}

export function createFollowUpAutomationRoutes() {
  const router = Router();

  router.post("/run-automation", requireAuth, runAutomation);

  return router;
}
