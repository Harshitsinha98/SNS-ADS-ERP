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
import { recordCronJobHealth, recomputeMissionControlMetrics } from "./services/platformAnalytics.js";

// ── Cron Jobs ──────────────────────────────────────────────────────

/**
 * Record job state independently of job execution. A skipped run means another
 * instance owns the distributed lease, so it must not overwrite the shared
 * health state or create a false platform alert.
 */
function runMonitoredCron(jobName, work) {
  work()
    .then((result) => {
      if (result !== null) {
        recordCronJobHealth(jobName, "healthy").catch((healthError) =>
          logger.error({ err: healthError, jobName }, "Could not record cron job success")
        );
      }
      return result;
    })
    .catch(async (error) => {
      await recordCronJobHealth(jobName, "failed", error).catch((healthError) =>
        logger.error({ err: healthError, jobName }, "Could not record cron job failure")
      );
      logger.error({ err: error, jobName }, "Scheduled job failed");
    });
}

function recordCronStart(jobName) {
  return recordCronJobHealth(jobName, "running").catch((healthError) =>
    logger.error({ err: healthError, jobName }, "Could not record cron job start")
  );
}

// Every 5 minutes: drain pending WhatsApp queue + follow-up automation
cron.schedule("*/5 * * * *", () => {
  runMonitoredCron("pendingQueue", () => withLease("pendingQueue", 4 * 60 * 1000, async () => {
    await recordCronStart("pendingQueue");
    const imported = await processPendingQueue();
    if (imported) logger.info({ imported }, "Pending WhatsApp queue drained");
    return imported;
  }));

  runMonitoredCron("followUpAutomation", () => withLease("followUpAutomation", 4 * 60 * 1000, async () => {
    await recordCronStart("followUpAutomation");
    const summary = await runFollowUpAutomation(db);
    if (summary.reminders || summary.escalations) {
      logger.info(summary, "Follow-up automation completed");
    }
    return summary;
  }));
});

// Daily at 6 AM IST: subscription lifecycle (renewals, expiry)
cron.schedule("0 6 * * *", () => {
  runMonitoredCron("subscriptionLifecycle", () =>
    withLease("subscriptionLifecycle", 30 * 60 * 1000, async () => {
      await recordCronStart("subscriptionLifecycle");
      return runSubscriptionLifecycle();
    })
  );
}, { timezone: "Asia/Kolkata" });

// Every 15 minutes: update the O(1) aggregate read used by Mission Control.
cron.schedule("*/15 * * * *", () => {
  runMonitoredCron("missionControlReconciliation", () =>
    withLease("missionControlReconciliation", 14 * 60 * 1000, async () => {
      await recordCronStart("missionControlReconciliation");
      return recomputeMissionControlMetrics();
    })
  );
});

// ── Start Listener ─────────────────────────────────────────────────

app.listen(serverConfig.port, () => {
  logger.info({
    port: serverConfig.port,
    webhookVerified: Boolean(metaConfig.whatsappAppSecret),
  }, "Backend started");
});
