import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { createRateLimiter } from "../../middleware/rateLimiter.js";
import { initiateHandler, answerHandler, statusHandler, pollHandler } from "../../controllers/bridgeCall.controller.js";

const plivoLimiter = createRateLimiter({ namespace: "bridge-plivo", windowMs: 60_000, max: 30, message: "Rate limited." });
const initLimiter = createRateLimiter({ namespace: "bridge-init", windowMs: 60_000, max: 5, message: "Too many calls.", blockMs: 30_000 });

export function createBridgeCallRoutes() {
  const router = Router();
  router.post("/initiate", requireAuth, initLimiter, initiateHandler);
  router.post("/poll", requireAuth, pollHandler);
  router.get("/answer", plivoLimiter, answerHandler);
  router.post("/status", plivoLimiter, statusHandler);
  return router;
}
