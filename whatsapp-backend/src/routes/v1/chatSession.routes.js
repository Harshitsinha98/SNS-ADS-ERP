/**
 * Chat Session routes (v1).
 *
 * Endpoints for human takeover, session management, and
 * session-bounded message access.
 */

import { Router } from "express";
import { requireAuth } from "../../middleware/index.js";
import {
  takeOver,
  resolveSession,
  reassignSession,
  reEnableAIForLead,
  getActive,
  getMessages,
  getHistory,
} from "../../controllers/chatSession.controller.js";

export function createChatSessionRoutes() {
  const router = Router();

  router.use(requireAuth);

  // Actions
  router.post("/takeover", takeOver);
  router.post("/resolve", resolveSession);
  router.post("/reassign", reassignSession);
  router.post("/re-enable-ai", reEnableAIForLead);

  // Queries
  router.get("/active", getActive);
  router.get("/messages", getMessages);
  router.get("/history", getHistory);

  return router;
}
