/**
 * Server entry point — thin bootstrap wrapper.
 *
 * ARCHITECTURAL DECISION: server.js is now only responsible for:
 * 1. Importing the composed Express app.
 * 2. Starting the HTTP listener.
 * 3. Scheduling cron jobs.
 * 4. Startup logging.
 *
 * All middleware composition, route mounting, and configuration live in app.js.
 * This separation enables:
 * - Integration tests that import `app` without starting a network listener.
 * - Serverless deployment (Vercel/Cloud Functions) wrapping `app` directly.
 * - Clear ownership: server.js = infrastructure, app.js = application.
 */

import cron from "node-cron";
import { app } from "./app.js";
import { serverConfig, metaConfig } from "./config/index.js";
import { logger } from "./middleware/logger.js";
import { withLease } from "./services/lease.js";
import { processPendingQueue } from "./services/whatsapp.js";
import { runSubscriptionLifecycle } from "./services/subscriptionLifecycle.js";
import { runFollowUpAutomation } from "../followUpAutomation.js";
import { db } from "./bootstrap/firebase.js";

// ── Cron Jobs ──────────────────────────────────────────────────────

// Every 5 minutes: drain pending WhatsApp queue + follow-up automation
cron.schedule("*/5 * * * *", () => {
  withLease("pendingQueue", 4 * 60 * 1000, async () => {
    const imported = await processPendingQueue();
    if (imported) logger.info({ imported }, "Pending WhatsApp queue drained");
  }).catch((error) => logger.error({ err: error }, "Pending queue cron error"));

  withLease("followUpAutomation", 4 * 60 * 1000, async () => {
    const summary = await runFollowUpAutomation(db);
    if (summary.reminders || summary.escalations) {
      logger.info(summary, "Follow-up automation completed");
    }
  }).catch((error) => logger.error({ err: error }, "Follow-up automation cron error"));
});

// Daily at 6 AM IST: subscription lifecycle (renewals, expiry)
cron.schedule("0 6 * * *", () => {
  withLease("subscriptionLifecycle", 30 * 60 * 1000, runSubscriptionLifecycle)
    .catch((error) => logger.error({ err: error }, "Subscription lifecycle cron error"));
}, { timezone: "Asia/Kolkata" });

// ── Start Listener ─────────────────────────────────────────────────

app.listen(serverConfig.port, () => {
  logger.info({
    port: serverConfig.port,
    webhookVerified: Boolean(metaConfig.whatsappAppSecret),
  }, "Backend started");
});
