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
  claimConversation,
  releaseConversation,
  markRead,
  rebuildIndex,
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

  // Team Inbox actions
  router.post("/claim", claimConversation);
  router.post("/release", releaseConversation);
  router.post("/mark-read", markRead);
  router.post("/rebuild-index", rebuildIndex);

  // Queries
  router.get("/active", getActive);
  router.get("/messages", getMessages);
  router.get("/history", getHistory);

  return router;
}
