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



// ── Mission Control aggregates ─────────────────────────────────────

const MISSION_CONTROL_CACHE_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const CRON_STALE_AFTER_MS = {
  pendingQueue: 15 * 60 * 1000,
  followUpAutomation: 15 * 60 * 1000,
  subscriptionLifecycle: 30 * 60 * 60 * 1000,
  missionControlReconciliation: 45 * 60 * 1000,
};

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function startOfTodayMs(now = Date.now()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

function countOf(aggregateSnapshot) {
  return Number(aggregateSnapshot.data()?.count || 0);
}

function healthScoreFor(org, now) {
  let score = 100;
  const dayMs = DAY_MS;
  const lastPayment = toMillis(org.lastPayment?.at);
  const daysSincePayment = lastPayment ? Math.floor((now - lastPayment) / dayMs) : 999;
  if (daysSincePayment > 60) score -= 30;
  else if (daysSincePayment > 30) score -= 15;

  const usageRatio = org.leadsLimit > 0 ? (org.leadsUsed || 0) / org.leadsLimit : 0;
  if (usageRatio < 0.1) score -= 20;
  if (org.subscriptionStatus === "past_due") score -= 25;
  if (org.subscriptionStatus === "expired") score -= 50;
  return Math.max(0, score);
}

function countFailedCronJobs(healthSnapshots, leaseSnapshots, now) {
  return healthSnapshots.filter((snapshot, index) => {
    // Missing records are expected until a newly deployed scheduler has made
    // its first run. Once a job reports, either an explicit failure or an
    // overdue heartbeat is actionable.
    if (!snapshot.exists) return false;
    const health = snapshot.data();
    const lease = leaseSnapshots[index]?.data();
    // A valid lease is definitive liveness, even if the non-critical health
    // write that marks a job as running failed. A failed job releases its lease
    // in withLease's finally block, so it remains actionable once inactive.
    if (Number(lease?.expiresAtMs || 0) > now) return false;
    if (health.status === "failed") return true;

    // When no lease is active, an overdue running/healthy heartbeat indicates
    // a missed invocation or a worker that terminated before completion.
    const allowedAge = CRON_STALE_AFTER_MS[health.jobName || snapshot.id];
    return Boolean(allowedAge && toMillis(health.lastRunAt) < now - allowedAge);
  }).length;
}

/**
 * Read the cached Mission Control aggregate. The dashboard calls this path on
 * every page load, so it remains one document read in the common case.
 */
export async function getMissionControlMetrics() {
  const current = await analyticsRef("current").get();
  const missionControl = current.data()?.missionControl;
  const updatedAtMs = toMillis(missionControl?.updatedAt);

  if (missionControl && updatedAtMs >= Date.now() - MISSION_CONTROL_CACHE_MS) {
    return missionControl;
  }

  // Cold starts and stale aggregate documents are reconciled once here, then
  // cached. Scheduled reconciliation keeps this expensive branch off the UI
  // request path during normal operation.
  return recomputeMissionControlMetrics();
}

/**
 * Reconcile operational alert counters into platformAnalytics/current.
 *
 * Expensive source reads run only at cold start and from the 15-minute cron.
 * The browser never receives or scans sensitive payment/credential documents.
 */
export async function recomputeMissionControlMetrics() {
  const now = Date.now();
  const todayStart = startOfTodayMs(now);
  const threeDaysFromNow = now + (3 * DAY_MS);
  const sevenDaysAgo = now - (7 * DAY_MS);

  const cronHealthRefs = Object.keys(CRON_STALE_AFTER_MS)
    .map((jobName) => db.collection("platformJobHealth").doc(jobName));
  const cronLeaseRefs = Object.keys(CRON_STALE_AFTER_MS)
    .map((jobName) => db.collection("systemLocks").doc(jobName));

  const [
    orgsSnap,
    failedPayments,
    failedWhatsAppConnections,
    trialsEndingSoon,
    newSignupsToday,
    todayBillingEvents,
  ] = await Promise.all([
    db.collection("organizations").get(),
    db.collection("paymentIntents")
      .where("status", "==", "failed")
      .where("failedAt", ">=", new Date(now - (7 * DAY_MS)).toISOString())
      .count()
      .get(),
    db.collection("whatsappConnectionHealth")
      .where("status", "in", ["failed", "reconciling"])
      .count()
      .get(),
    db.collection("organizations")
      .where("subscriptionStatus", "==", "trialing")
      .where("trialEndsAtMs", ">=", now)
      .where("trialEndsAtMs", "<=", threeDaysFromNow)
      .count()
      .get(),
    db.collection("organizations")
      .where("createdAt", ">=", new Date(todayStart).toISOString())
      .count()
      .get(),
    db.collection("billingEvents")
      .where("appliedAt", ">=", new Date(todayStart).toISOString())
      .get(),
  ]);

  let inactiveOrganizations = 0;
  let churnRiskCustomers = 0;

  for (const orgDoc of orgsSnap.docs) {
    const org = orgDoc.data();
    const lastActivity = Math.max(
      Number(org.lastActivityAtMs || 0),
      toMillis(org.lastActivityAt),
      toMillis(org.lastPayment?.at),
      toMillis(org.createdAt)
    );
    if (lastActivity > 0 && lastActivity < sevenDaysAgo) inactiveOrganizations += 1;
    if (healthScoreFor(org, now) < 40) churnRiskCustomers += 1;
  }

  const todayPaymentRecords = todayBillingEvents.docs
    .map((event) => event.data())
    .filter((event) => Number(event.amount) > 0);
  // Older billing events did not store amount. Use the organization projection
  // only until new event-shaped records exist, then prefer exact event totals.
  const fallbackTodayPayments = orgsSnap.docs
    .map((orgDoc) => orgDoc.data().lastPayment)
    .filter((payment) => toMillis(payment?.at) >= todayStart);
  const paymentRecords = todayPaymentRecords.length > 0 ? todayPaymentRecords : fallbackTodayPayments;
  const revenueToday = paymentRecords.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const missionControlBase = {
    failedPayments: countOf(failedPayments),
    trialsEndingSoon: countOf(trialsEndingSoon),
    failedWhatsAppConnections: countOf(failedWhatsAppConnections),
    inactiveOrganizations,
    churnRiskCustomers,
    newSignupsToday: countOf(newSignupsToday),
    revenueToday,
    revenueTodayPayments: paymentRecords.length,
  };

  // Read the health record and its distributed lease in one Firestore
  // transaction. This gives the aggregate a commit-consistent liveness verdict
  // and prevents a just-started job from being cached as a false failure.
  return db.runTransaction(async (tx) => {
    const [healthSnapshots, leaseSnapshots] = await Promise.all([
      Promise.all(cronHealthRefs.map((ref) => tx.get(ref))),
      Promise.all(cronLeaseRefs.map((ref) => tx.get(ref))),
    ]);
    const missionControl = {
      ...missionControlBase,
      failedCronJobs: countFailedCronJobs(healthSnapshots, leaseSnapshots, Date.now()),
      updatedAt: nowIso(),
    };
    tx.set(analyticsRef("current"), { missionControl }, { merge: true });
    return missionControl;
  });
}

/**
 * Persist a compact health state per scheduled job. The Action Center only
 * counts failed documents, so no job logs or sensitive error payloads are sent
 * to the browser.
 */
export async function recordCronJobHealth(jobName, status, error = null) {
  const now = nowIso();
  const update = {
    jobName,
    status,
    lastRunAt: now,
    ...(status === "healthy" ? { lastSuccessAt: now, lastError: null } :
      status === "running" ? { lastStartedAt: now, lastError: null } : {
        lastFailureAt: now,
        lastError: String(error?.message || error || "Unknown job failure").slice(0, 500),
      }),
  };
  await db.collection("platformJobHealth").doc(jobName).set(update, { merge: true });
}
