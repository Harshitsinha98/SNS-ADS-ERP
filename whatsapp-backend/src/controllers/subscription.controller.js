/**
 * Subscription lifecycle & follow-up automation controller.
 *
 * ARCHITECTURAL DECISION: Admin-triggered lifecycle and automation endpoints
 * are separated from cron scheduling. This enables:
 * 1. Manual triggering by platform admins for debugging.
 * 2. Clear separation between "when to run" (cron) and "what to run" (service).
 * 3. Consistent auth/response handling via the controller pattern.
 */

import { isPlatformAdmin, isOrgAdmin } from "../middleware/auth.js";
import { withLease } from "../services/lease.js";
import { safeDocId } from "../services/helpers.js";
import { runSubscriptionLifecycle } from "../services/subscriptionLifecycle.js";
import { runFollowUpAutomation } from "../../followUpAutomation.js";
import { db } from "../bootstrap/firebase.js";

/**
 * POST /api/subscription/run-lifecycle — Platform admin manual trigger.
 */
export async function runLifecycle(req, res) {
  try {
    if (!(await isPlatformAdmin(req.authUser))) {
      return res.status(403).json({ error: "Platform owner access required" });
    }
    const summary = await withLease(
      "subscriptionLifecycle",
      30 * 60 * 1000,
      runSubscriptionLifecycle
    );
    res.json({ ok: true, ...(summary || {}) });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Could not run lifecycle" });
  }
}

/**
 * POST /api/follow-ups/run-automation — Org admin manual trigger.
 */
export async function runAutomation(req, res) {
  try {
    const orgId = String(req.body?.orgId || "").trim();
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    const reenrollPaused = req.body?.reenrollPaused !== false;
    const summary = await withLease(
      `followUpAutomation_${safeDocId(orgId)}`,
      4 * 60 * 1000,
      () => runFollowUpAutomation(db, { orgId, reenrollPaused })
    );
    return res.json({ ok: true, ...(summary || { scanned: 0, reminders: 0, escalations: 0 }) });
  } catch (error) {
    (req.log || console).error("Manual follow-up automation run failed:", error.message);
    return res.status(error.status || 500).json({ error: "Could not run follow-up automation" });
  }
}
