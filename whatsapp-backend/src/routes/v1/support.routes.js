/**
 * Support routes — AI chat + ticket CRUD for logged-in users.
 *
 * POST /support/chat     — AI support chat (OpenAI + CodeSkate KB)
 * POST /support/ticket   — create a support ticket (escalation)
 * GET  /support/tickets  — list user's own tickets
 */

import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { createRateLimiter } from "../../middleware/rateLimiter.js";
import { supportChatHandler, createTicketHandler, listUserTicketsHandler } from "../../controllers/support.controller.js";

const chatLimiter = createRateLimiter({ namespace: "support-chat", windowMs: 60_000, max: 20, message: "Too many messages. Slow down." });
const ticketLimiter = createRateLimiter({ namespace: "support-ticket", windowMs: 3600_000, max: 5, message: "Max 5 tickets per hour." });

export function createSupportRoutes() {
  const router = Router();
  router.post("/chat", requireAuth, chatLimiter, supportChatHandler);
  router.post("/ticket", requireAuth, ticketLimiter, createTicketHandler);
  router.get("/tickets", requireAuth, listUserTicketsHandler);
  return router;
}
