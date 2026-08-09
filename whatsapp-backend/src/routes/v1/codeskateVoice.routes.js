/**
 * CodeSkate Voice routes — multi-tenant number purchase via Plivo Compliance.
 *
 * POST /submit-compliance   — upload docs + create compliance app (multer multipart)
 * GET  /requirements        — fetch required doc types from Plivo
 * GET  /status              — tenant's compliance + number status
 * GET  /numbers             — list all voice numbers for org
 * POST /compliance-webhook  — Plivo status-change callback (no auth)
 * POST /activate            — platform admin manually trigger provisioning
 */

import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/auth.js";
import { createRateLimiter } from "../../middleware/rateLimiter.js";
import {
  requirementsHandler,
  submitComplianceHandler,
  statusHandler,
  numbersHandler,
  complianceWebhookHandler,
  activateHandler,
} from "../../controllers/codeskateVoice.controller.js";

// Multer in-memory storage for doc uploads (max 5MB per file, 2 files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
  fileFilter: (req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    cb(null, allowed.includes(file.mimetype));
  },
});

const submitLimiter = createRateLimiter({ namespace: "voice-submit", windowMs: 3600_000, max: 3, message: "Too many compliance submissions. Try again in an hour." });
const webhookLimiter = createRateLimiter({ namespace: "voice-webhook", windowMs: 60_000, max: 30, message: "Rate limited." });

export function createCodeskateVoiceRoutes() {
  const router = Router();

  // Tenant-facing (auth required)
  router.get("/requirements", requireAuth, requirementsHandler);
  router.post(
    "/submit-compliance",
    requireAuth,
    submitLimiter,
    upload.fields([
      { name: "registrationCert", maxCount: 1 },
      { name: "gstCert", maxCount: 1 },
    ]),
    submitComplianceHandler
  );
  router.get("/status", requireAuth, statusHandler);
  router.get("/numbers", requireAuth, numbersHandler);

  // Plivo webhook (no auth — validate signature in production)
  router.post("/compliance-webhook", webhookLimiter, complianceWebhookHandler);

  // Platform admin manual trigger
  router.post("/activate", requireAuth, activateHandler);

  return router;
}
