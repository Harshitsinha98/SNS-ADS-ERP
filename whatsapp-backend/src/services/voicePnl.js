/**
 * Voice P&L service — aggregates bridge call economics per tenant.
 *
 * Used by the platform owner to see profit/loss per tenant for voice calling,
 * including failed calls (CodeSkate-absorbed cost).
 */

import { db } from "../bootstrap/firebase.js";

/**
 * Get per-tenant voice P&L for a date range.
 * Returns: { tenants: [...], totals: {...} }
 */
export async function getVoicePnl({ fromMs, toMs } = {}) {
  let q = db.collection("bridgeCalls").orderBy("initiatedAtMs", "desc");
  if (fromMs) q = q.where("initiatedAtMs", ">=", fromMs);
  if (toMs) q = q.where("initiatedAtMs", "<=", toMs);
  q = q.limit(10000); // reasonable cap

  const snap = await q.get();
  const byOrg = {};

  for (const doc of snap.docs) {
    const call = doc.data();
    const orgId = call.orgId;
    if (!byOrg[orgId]) {
      byOrg[orgId] = {
        orgId,
        totalCalls: 0,
        connectedCalls: 0,
        failedCalls: 0,
        voicemailCalls: 0,
        noAnswerCalls: 0,
        agentNoConfirmCalls: 0,
        totalCustomerSeconds: 0,
        totalAgentSeconds: 0,
        totalBilledMinutes: 0,
        revenue: 0,       // what tenant paid (costInr)
        plivoCost: 0,     // what Plivo charged us
        profit: 0,
        connectRate: 0,
      };
    }

    const t = byOrg[orgId];
    t.totalCalls++;

    const status = call.status || "unknown";
    if (status === "completed" || status === "wallet-deducted") {
      t.connectedCalls++;
      t.totalCustomerSeconds += call.customerSeconds || call.durationSeconds || 0;
      t.totalAgentSeconds += call.agentSeconds || call.aLegSeconds || 0;
      t.totalBilledMinutes += call.billedMinutes || 0;
      t.revenue += call.costInr || 0;
    } else if (status === "customer_voicemail") {
      t.voicemailCalls++;
      t.failedCalls++;
    } else if (status === "no-answer") {
      t.noAnswerCalls++;
      t.failedCalls++;
    } else if (status === "agent_no_confirm") {
      t.agentNoConfirmCalls++;
      t.failedCalls++;
    } else {
      t.failedCalls++;
    }

    // Plivo cost (sum all legs — A + B)
    t.plivoCost += (call.plivoCost || 0) + (call.plivoCostALeg || 0) + (call.plivoCostBLeg || 0);
    // Avoid double-counting: if plivoCost already includes both legs, don't add individual
    if (call.plivoCost && call.plivoCost > 0) {
      // plivoCost is the combined field — use only that
      t.plivoCost -= (call.plivoCostALeg || 0) + (call.plivoCostBLeg || 0);
      t.plivoCost += call.plivoCost;
    }
  }

  // Calculate profit + connect rate
  const tenants = Object.values(byOrg).map((t) => {
    t.profit = t.revenue - t.plivoCost;
    t.connectRate = t.totalCalls > 0 ? Math.round((t.connectedCalls / t.totalCalls) * 100) : 0;
    return t;
  });

  // Sort by most calls
  tenants.sort((a, b) => b.totalCalls - a.totalCalls);

  // Totals
  const totals = tenants.reduce((acc, t) => {
    acc.totalCalls += t.totalCalls;
    acc.connectedCalls += t.connectedCalls;
    acc.failedCalls += t.failedCalls;
    acc.revenue += t.revenue;
    acc.plivoCost += t.plivoCost;
    acc.profit += t.profit;
    return acc;
  }, { totalCalls: 0, connectedCalls: 0, failedCalls: 0, revenue: 0, plivoCost: 0, profit: 0 });

  totals.connectRate = totals.totalCalls > 0 ? Math.round((totals.connectedCalls / totals.totalCalls) * 100) : 0;

  return { tenants, totals, callCount: snap.size };
}
