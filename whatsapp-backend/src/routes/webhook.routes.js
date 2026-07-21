/**
 * Meta webhook routes.
 *
 * ARCHITECTURAL DECISION: Webhook routes are mounted at the top level (/webhook)
 * outside the /api namespace. They use raw body parsing (for HMAC verification)
 * and are NOT versioned — Meta's webhook configuration points to a fixed URL
 * that cannot be changed without re-subscribing.
 */

import { Router } from "express";
import express from "express";
import { verifyWebhook, handleWebhook } from "../controllers/index.js";

export function createWebhookRoutes() {
  const router = Router();

  // Meta requires raw body for signature verification
  router.use(express.raw({ type: "application/json" }));

  router.get("/", verifyWebhook);
  router.post("/", handleWebhook);

  return router;
}
