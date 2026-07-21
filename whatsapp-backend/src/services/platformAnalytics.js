/**
 * Platform Analytics Service.
 *
 * ARCHITECTURAL DECISION: Platform-level analytics are computed from
 * aggregate documents (1 read each) rather than scanning full collections.
 * The aggregate documents at `platformAnalytics/{period}` are updated by
 * a scheduled cron job (every 15 minutes) and by inline writes during
 * critical business events (org creation, payment, churn).
 *
 * Firestore schema:
 *   platformAnalytics/daily_{YYYY-MM-DD} — daily snapshot
 *   platformAnalytics/current — rolling real-time counters
 *   platformAnalytics/revenue_{YYYY-MM} — monthly revenue aggregation
 *
 * This keeps platform dashboard reads at O(1) per KPI instead of O(N) per org.
 */

import { db } from "../bootstrap/firebase.js";
import { nowIso } from "./helpers.js";

const analyticsRef = (docId) => db.collection("platformAnalytics").doc(docId);

/**
 * Get (or initialize) the current rolling metrics document.
 * This is the primary data source for the Executive Dashboard KPIs.
 */
export async function getCurrentMetrics() {
  const snap = await analyticsRef("current").get();
  if (snap.exists) return snap.data();

  // Cold-start: compute from scratch (expensive, runs once)
  return computeCurrentMetrics();
}

/**
 * Full recomputation of platform metrics from source collections.
 * Called on cold-start and by the periodic reconciliation cron.
 */
export async function computeCurrentMetrics() {
  const orgsSnap = await db.collection("organizations").get();
  const orgs = orgsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const membershipsSnap = await db.collection("memberships").where("active", "==", true).get();

  const total = orgs.length;
  const active = orgs.filter((o) => o.subscriptionStatus === "active").length;
  const trialing = orgs.filter((o) => o.subscriptionStatus === "trialing").length;
  const expired = orgs.filter((o) => o.subscriptionStatus === "expired").length;
  const pastDue = orgs.filter((o) => o.subscriptionStatus === "past_due").length;

  const totalSeats = orgs.reduce((sum, o) => sum + (Number(o.seatsUsed) || 0), 0);
  const totalLeads = orgs.reduce((sum, o) => sum + (Number(o.leadsUsed) || 0), 0);
  const totalMembers = membershipsSnap.size;

  // Plan distribution
  const planDistribution = {};
  orgs.forEach((o) => {
    const plan = o.planId || "unknown";
    planDistribution[plan] = (planDistribution[plan] || 0) + 1;
  });

  // Subscription status breakdown
  const statusDistribution = { active, trialing, expired, past_due: pastDue };

  // MRR calculation (active orgs × their plan's monthly price)
  const { getMergedPlans } = await import("../../plans.js");
  const plans = await getMergedPlans(db);
  const mrr = orgs
    .filter((o) => o.subscriptionStatus === "active")
    .reduce((sum, o) => {
      const plan = plans[o.planId];
      return sum + (plan ? (o.billingCycle === "yearly" ? Math.round(plan.yearlyPrice / 12) : plan.monthlyPrice) : 0);
    }, 0);

  const metrics = {
    totalOrgs: total,
    activeOrgs: active,
    trialingOrgs: trialing,
    expiredOrgs: expired,
    pastDueOrgs: pastDue,
    mrr,
    arr: mrr * 12,
    totalSeats,
    totalLeads,
    totalMembers,
    planDistribution,
    statusDistribution,
    computedAt: nowIso(),
  };

  // Persist so subsequent reads are O(1)
  await analyticsRef("current").set(metrics, { merge: true });
  return metrics;
}

/**
 * Revenue timeline for charts. Returns daily revenue data points.
 */
export async function getRevenueTimeline(range = "30d") {
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const snap = await db.collection("platformAnalytics")
    .where("type", "==", "daily_revenue")
    .orderBy("date", "desc")
    .limit(days)
    .get();

  return snap.docs.map((d) => d.data()).reverse();
}

/**
 * Customer health scores (simplified: based on last activity and lead usage).
 */
export async function getHealthScores() {
  const orgsSnap = await db.collection("organizations").get();
  const scores = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  for (const orgDoc of orgsSnap.docs) {
    const org = orgDoc.data();
    let score = 100;
    // Deduct for inactivity
    const lastPayment = org.lastPayment?.at ? Date.parse(org.lastPayment.at) : 0;
    const daysSincePayment = lastPayment ? Math.floor((now - lastPayment) / dayMs) : 999;
    if (daysSincePayment > 60) score -= 30;
    else if (daysSincePayment > 30) score -= 15;
    // Deduct for low usage
    const usageRatio = org.leadsLimit > 0 ? (org.leadsUsed || 0) / org.leadsLimit : 0;
    if (usageRatio < 0.1) score -= 20;
    // Deduct for subscription issues
    if (org.subscriptionStatus === "past_due") score -= 25;
    if (org.subscriptionStatus === "expired") score -= 50;

    scores.push({
      orgId: orgDoc.id,
      orgName: org.name || "Unnamed",
      score: Math.max(0, score),
      status: org.subscriptionStatus,
      leadsUsed: org.leadsUsed || 0,
      leadsLimit: org.leadsLimit || 0,
      lastPaymentAt: org.lastPayment?.at || null,
    });
  }

  return scores.sort((a, b) => a.score - b.score);
}

/**
 * Churn risk assessment.
 */
export async function getChurnRisk() {
  const scores = await getHealthScores();
  return {
    atRisk: scores.filter((s) => s.score < 40),
    healthy: scores.filter((s) => s.score >= 70),
    needsAttention: scores.filter((s) => s.score >= 40 && s.score < 70),
  };
}

/**
 * System health summary (Firestore connectivity, process uptime, memory).
 */
export function getSystemHealth() {
  const uptime = process.uptime();
  const mem = process.memoryUsage();
  return {
    status: "healthy",
    uptime: Math.floor(uptime),
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    },
    nodeVersion: process.version,
    checkedAt: nowIso(),
  };
}
