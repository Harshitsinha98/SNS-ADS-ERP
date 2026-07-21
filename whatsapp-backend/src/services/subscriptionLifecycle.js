/**
 * Subscription lifecycle service.
 *
 * ARCHITECTURAL DECISION: The daily subscription lifecycle cron logic was
 * inline in server.js. Extracting it:
 * 1. Makes the renewal reminder → past_due → expired state machine testable.
 * 2. Allows the lifecycle to be triggered manually (platform admin endpoint)
 *    or via cron with identical behavior.
 * 3. Separates scheduling concerns (cron.schedule) from business logic.
 */

import { db } from "../bootstrap/firebase.js";
import { DAY_MS, GRACE_DAYS } from "../config/constants.js";
import { getMergedPlans } from "../../plans.js";
import { nowIso, orgCollection } from "./helpers.js";
import { notifyOrgAdmins } from "./org.js";
import { logger } from "../middleware/logger.js";

/**
 * Run the subscription lifecycle: reminders, past_due transitions,
 * expiry enforcement, and scheduled downgrades.
 *
 * Returns a summary of actions taken.
 */
export async function runSubscriptionLifecycle() {
  const now = Date.now();
  const plans = await getMergedPlans(db);
  const organizations = await db.collection("organizations").get();
  let reminded = 0;
  let pastDue = 0;
  let expired = 0;
  let downgraded = 0;

  for (const orgSnap of organizations.docs) {
    const org = orgSnap.data();
    const ref = orgSnap.ref;
    const periodEnd = Number(org.currentPeriodEndMs || 0);

    // ── Scheduled Downgrade ──
    if (org.pendingPlanChange && periodEnd && now >= periodEnd) {
      const target = plans[org.pendingPlanChange.toPlanId] || plans.starter;
      const cycle = org.pendingPlanChange.cycle === "yearly" ? "yearly" : "monthly";
      const newEnd = now + (cycle === "yearly" ? 365 : 30) * DAY_MS;
      await ref.update({
        planId: target.id,
        planName: target.name,
        seatsLimit: target.includedSeats,
        leadsLimit: target.leadsLimit,
        billingCycle: cycle,
        currentPeriodEndMs: newEnd,
        subscriptionStatus: "active",
        pendingPlanChange: null,
        renewalRemindedFor: null,
      });
      await orgCollection(db, orgSnap.id, "activity").add({
        text: `⬇️ Plan changed to ${target.name} (scheduled downgrade applied)`,
        at: nowIso(),
        orgId: orgSnap.id,
      });
      await notifyOrgAdmins(
        orgSnap.id,
        `Your plan is now ${target.name}. Upgrade again to get more seats and leads.`
      );
      downgraded += 1;
      continue;
    }

    // ── Renewal Reminder ──
    if (org.subscriptionStatus === "active" && periodEnd) {
      const daysLeft = Math.ceil((periodEnd - now) / DAY_MS);
      if (!org.autopay && daysLeft <= 5 && daysLeft >= 0 && org.renewalRemindedFor !== String(periodEnd)) {
        await notifyOrgAdmins(
          orgSnap.id,
          `⏰ Your ${org.planName} plan expires in ${daysLeft} day(s). Renew it from the Billing page.`
        );
        await ref.update({ renewalRemindedFor: String(periodEnd) });
        reminded += 1;
      }

      // ── Active → Past Due ──
      if (now >= periodEnd) {
        await ref.update({ subscriptionStatus: "past_due" });
        await notifyOrgAdmins(
          orgSnap.id,
          `⚠️ Your plan has expired. Renew within ${GRACE_DAYS} day(s) or features will be locked.`
        );
        pastDue += 1;
      }
    }

    // ── Past Due → Expired ──
    if (org.subscriptionStatus === "past_due" && periodEnd && now >= periodEnd + GRACE_DAYS * DAY_MS) {
      await ref.update({ subscriptionStatus: "expired" });
      await notifyOrgAdmins(
        orgSnap.id,
        "🔒 Grace period over — features locked. Renew to reactivate your workspace."
      );
      expired += 1;
    }
  }

  const summary = { reminded, pastDue, expired, downgraded };
  logger.info(summary, "Subscription lifecycle completed");
  return summary;
}
