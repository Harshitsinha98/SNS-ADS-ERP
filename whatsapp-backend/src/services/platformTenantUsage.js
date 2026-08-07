/**
 * Cross-tenant usage & renewal visibility for the Platform Owner Console.
 *
 * ARCHITECTURAL DECISION: The console already streams organization documents
 * client-side, but three things it needs are NOT on the org document:
 *
 *  1. Voice wallet balance      → lives in the root `voiceWallets/{orgId}`
 *  2. Effective AI allowance    → only derivable from PLAN_LIMITS + addOns,
 *                                 which is server-side plan data
 *  3. Renewal urgency buckets   → needs consistent "now" and grace-period math
 *
 * Doing this join on the server keeps the plan table authoritative in one place
 * (the browser never has to mirror pricing logic) and means one request answers
 * "which tenant is about to run out of what".
 */

import { db } from "../bootstrap/firebase.js";
import { getEffectiveLimits } from "../billing/planLimits.js";
import { currentMonthKey } from "../billing/quotaEnforcement.js";
import { logger } from "../middleware/logger.js";

const DAY_MS = 24 * 60 * 60 * 1000;
// Matches the renewal reminder window used by the subscription lifecycle cron.
const EXPIRING_SOON_DAYS = 7;

/** Remaining units for a limit, where -1 means unlimited. */
function remaining(limit, used) {
  if (limit === -1) return { limit: -1, used, remaining: -1, unlimited: true, pct: 0 };
  const safeLimit = Number(limit || 0);
  const left = Math.max(0, safeLimit - used);
  return {
    limit: safeLimit,
    used,
    remaining: left,
    unlimited: false,
    pct: safeLimit > 0 ? Math.min(100, Math.round((used / safeLimit) * 100)) : 0,
  };
}

/**
 * Per-tenant usage snapshot across every metered resource, plus renewal state.
 *
 * Voice wallets are fetched in one pass over the collection rather than per-org,
 * so this stays O(orgs + wallets) instead of O(orgs) round-trips.
 */
export async function getTenantUsageOverview() {
  const [orgsSnap, walletsSnap] = await Promise.all([
    db.collection("organizations").get(),
    db.collection("voiceWallets").get().catch(() => ({ docs: [] })),
  ]);

  const wallets = new Map();
  for (const doc of walletsSnap.docs || []) {
    const w = doc.data();
    wallets.set(doc.id, {
      // bridgeCall.js deducts from balanceMinutes, so it is the source of truth
      // for bridge minutes; bridgeMinutes is the newer mirror of the same value.
      bridgeMinutes: Number(w.balanceMinutes ?? w.bridgeMinutes ?? 0),
      aiVoiceMinutes: Number(w.aiMinutes || 0),
      totalSpentInr: Number(w.totalSpentInr || 0),
      lastDeductedAt: w.lastDeductedAt || null,
    });
  }

  const now = Date.now();
  const monthKey = currentMonthKey();

  const tenants = orgsSnap.docs.map((doc) => {
    const org = doc.data();
    const planId = org.planId || "starter";
    const addOns = org.addOns || {};
    const limits = getEffectiveLimits(planId, addOns);

    // Mirrors the lazy monthly rollover in quotaEnforcement: a counter tagged
    // with a previous month reads as zero rather than as exhausted.
    const aiUsed = org.aiUsageMonth === monthKey ? Number(org.aiMessagesUsedThisMonth || 0) : 0;

    const periodEndMs = Number(org.currentPeriodEndMs || 0);
    const trialEndsAtMs = Number(org.trialEndsAtMs || 0);
    const status = org.subscriptionStatus || "trialing";

    // Trials expire on their own clock; paid plans on the billing period.
    const effectiveEndMs = status === "trialing" && trialEndsAtMs > 0 ? trialEndsAtMs : periodEndMs;
    const daysLeft = effectiveEndMs > 0 ? Math.ceil((effectiveEndMs - now) / DAY_MS) : null;

    const renewal =
      status === "expired" ? "expired"
      : status === "past_due" ? "past_due"
      : effectiveEndMs > 0 && effectiveEndMs <= now ? "lapsed"
      : daysLeft !== null && daysLeft <= EXPIRING_SOON_DAYS ? "expiring_soon"
      : "healthy";

    const wallet = wallets.get(doc.id) || { bridgeMinutes: 0, aiVoiceMinutes: 0, totalSpentInr: 0, lastDeductedAt: null };

    const activeAddOns = Object.values(addOns)
      .filter((a) => a?.active)
      .map((a) => ({ id: a.addOnId, name: a.addOnName, quantity: Number(a.quantity || 1) }));

    return {
      orgId: doc.id,
      name: org.name || doc.id,
      ownerPhone: org.ownerPhone || null,
      planId,
      planName: org.planName || limits.name || planId,
      subscriptionStatus: status,
      billingCycle: org.billingCycle || "monthly",
      autopay: org.autopay === true,
      whatsappConnected: org.whatsappConnected === true,
      createdAt: org.createdAt || null,
      lifetimeRevenue: Number(org.lifetimeRevenue || 0),

      // Renewal
      renewal,
      daysLeft,
      currentPeriodEndMs: periodEndMs || null,
      trialEndsAtMs: trialEndsAtMs || null,

      // Metered resources
      aiReplies: remaining(limits.aiMessagesPerMonth, aiUsed),
      leads: remaining(limits.leadsPerMonth, Number(org.leadsUsed || 0)),
      seats: remaining(limits.seatsIncluded, Number(org.seatsUsed || 0)),
      voice: wallet,

      activeAddOns,
    };
  });

  // Most urgent first: expired, then past due, then soonest renewal.
  const rank = { expired: 0, lapsed: 1, past_due: 2, expiring_soon: 3, healthy: 4 };
  tenants.sort((a, b) =>
    (rank[a.renewal] - rank[b.renewal]) || ((a.daysLeft ?? 9999) - (b.daysLeft ?? 9999))
  );

  const summary = {
    tenants: tenants.length,
    expired: tenants.filter((t) => t.renewal === "expired" || t.renewal === "lapsed").length,
    pastDue: tenants.filter((t) => t.renewal === "past_due").length,
    expiringSoon: tenants.filter((t) => t.renewal === "expiring_soon").length,
    aiExhausted: tenants.filter((t) => !t.aiReplies.unlimited && t.aiReplies.remaining === 0).length,
    aiNearLimit: tenants.filter((t) => !t.aiReplies.unlimited && t.aiReplies.pct >= 80 && t.aiReplies.remaining > 0).length,
    voiceEmpty: tenants.filter((t) => t.voice.bridgeMinutes <= 0).length,
    voiceLow: tenants.filter((t) => t.voice.bridgeMinutes > 0 && t.voice.bridgeMinutes < 50).length,
    totalVoiceMinutes: tenants.reduce((sum, t) => sum + t.voice.bridgeMinutes, 0),
    totalAiRepliesUsed: tenants.reduce((sum, t) => sum + t.aiReplies.used, 0),
  };

  logger.info({ tenants: summary.tenants }, "Tenant usage overview computed");
  return { summary, tenants, monthKey, generatedAt: new Date().toISOString() };
}
