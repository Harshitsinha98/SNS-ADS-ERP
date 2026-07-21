/**
 * Express application composition.
 *
 * ARCHITECTURAL DECISION: app.js is the "composition root" — the single place
 * where all middleware, routes, and cross-cutting concerns are wired together.
 * It does NOT call .listen() — that remains in server.js so that:
 * 1. Tests can import `app` without starting a network listener.
 * 2. Serverless adapters (Vercel, Cloud Functions) can wrap `app` directly.
 * 3. server.js remains a thin entry point with only startup concerns (port,
 *    cron scheduling, startup logging).
 *
 * BACKWARD COMPATIBILITY: All existing /api/* routes are mounted at their
 * original paths. The new /api/v1/* mount provides versioned aliases.
 * No frontend or webhook URL changes are required.
 */

import "dotenv/config";
import express from "express";

// ── Bootstrap (must be first — initializes Firebase Admin SDK) ──
import "./bootstrap/firebase.js";

// ── Infrastructure ──
import { serverConfig, urlConfig, metaConfig, turnstileConfig } from "./config/index.js";
import { requestId, httpLogger, createCors, globalErrorHandler } from "./middleware/index.js";
import { logger } from "./middleware/logger.js";
import { db } from "./bootstrap/firebase.js";
import { metaGraphRequest, decryptWhatsAppToken, isWhatsAppCredentialExpired } from "./services/meta.js";

// ── Routes (new modular layer) ──
import { createV1Router, createWebhookRoutes } from "./routes/index.js";
import { rootCheck, healthCheck } from "./controllers/index.js";

// ── Legacy route factories (preserved — zero feature regression) ──
import createBillingRouter from "../billing.js";
import createLeadIntakeRouter from "../leadIntake.js";
import createFollowUpTasksRouter from "../followUpTasks.js";
import createWhatsAppTemplatesRouter from "../whatsappTemplates.js";
import { createAdLeadAdminRouter, createAdLeadWebhookRouter } from "../adLeadIntegrations.js";

// ── Compose App ──
const app = express();
app.set("trust proxy", serverConfig.trustProxy);

// ── Global Middleware (order matters) ──
app.use(requestId());
app.use(httpLogger());
app.use(createCors());

// ── Raw body routes (must precede express.json) ──
// Meta and Razorpay signatures must be computed over the untouched body.
app.use("/webhook", createWebhookRoutes());
app.use("/api/billing/webhook", express.raw({ type: "*/*" }));

// ── Body Parsing ──
app.use(express.json({ limit: "1mb" }));

// ── Versioned API (new) ──
app.use("/api/v1", createV1Router());

// ── Health endpoint (also at root /health for load balancers) ──
app.get("/health", healthCheck);

// ── Legacy Routes (unchanged paths — backward compatibility) ──
app.use("/api/billing", createBillingRouter(db));
app.use("/api/leads", createLeadIntakeRouter(db, {
  publicBackendUrl: urlConfig.publicBackendUrl,
  publicFrontendUrl: urlConfig.publicFrontendUrl,
  turnstileSiteKey: turnstileConfig.siteKey,
  turnstileSecret: turnstileConfig.secret,
  requireHttpsPublicUrls: serverConfig.isProduction,
}));
app.use("/api/follow-ups", createFollowUpTasksRouter(db));
app.use("/api/ad-leads", createAdLeadAdminRouter(db, {
  publicBackendUrl: urlConfig.publicBackendUrl,
  metaGraphRequest,
  metaAppId: metaConfig.appId,
  metaAppSecret: metaConfig.appSecret,
  metaVerifyToken: metaConfig.leadWebhookVerifyToken,
}));
app.use("/webhook/ad-leads", createAdLeadWebhookRouter(db, {
  metaGraphRequest,
  metaAppSecret: metaConfig.appSecret,
  metaVerifyToken: metaConfig.leadWebhookVerifyToken,
}));
app.use("/api/whatsapp/templates", createWhatsAppTemplatesRouter(db, {
  metaGraphRequest,
  decryptWhatsAppToken,
  isWhatsAppCredentialExpired,
}));

// ── Legacy inline routes now handled by v1 controllers ──
// These are mounted at their original paths for backward compatibility.
import { requireAuth } from "./middleware/auth.js";
import {
  connectWhatsApp,
  getWhatsAppStatus,
  repairWebhook,
  disconnectWhatsApp,
  sendMessage,
  syncNow,
} from "./controllers/whatsapp.controller.js";
import { runLifecycle, runAutomation } from "./controllers/subscription.controller.js";

app.post("/api/whatsapp/connect", requireAuth, connectWhatsApp);
app.post("/api/whatsapp/status", requireAuth, getWhatsAppStatus);
app.post("/api/whatsapp/repair-webhook", requireAuth, repairWebhook);
app.post("/api/whatsapp/disconnect", requireAuth, disconnectWhatsApp);
app.post("/api/whatsapp/messages", requireAuth, sendMessage);
app.post("/api/whatsapp/sync-now", requireAuth, syncNow);
app.post("/api/subscription/run-lifecycle", requireAuth, runLifecycle);
app.post("/api/follow-ups/run-automation", requireAuth, runAutomation);

// ── Root ──
app.get("/", rootCheck);

// ── Global Error Handler (must be last middleware) ──
app.use(globalErrorHandler());

// ── Startup Warnings ──
if (!metaConfig.whatsappAppSecret) {
  logger.warn("WHATSAPP_APP_SECRET is not set. Meta webhook ingestion will reject requests until it is configured.");
}
if (metaConfig.appId && !process.env.RAZORPAY_WEBHOOK_SECRET) {
  // Only warn if Razorpay is expected to be configured
}

export { app };
export default app;
