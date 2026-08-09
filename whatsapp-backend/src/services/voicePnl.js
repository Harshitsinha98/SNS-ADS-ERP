/**
 * Voice P&L service — aggregates bridge call economics per tenant.
 *
 * Used by the platform owner to see profit/loss per tenant for voice calling,
 * including failed calls (CodeSkate-absorbed cost).
 *
 * COST CALCULATION: Plivo cost is CALCULATED (not from webhook TotalCost field)
 * because Plivo's TotalCost is in USD, often 0 for conference calls, and
 * unreliable. Deterministic formula:
 *   - Connected call: ₹1.20/min (2 legs × ₹0.60, 60-sec billing increments)
 *   - Voicemail (answered then AMD cut): ₹1.20 (both legs billed 1 min minimum)
 *   - No-answer (ring only): ₹0.60 (only agent leg billed 1 min)
 *   - Agent no-confirm: ₹0.60 (only agent leg)
 */

import { db } from "../bootstrap/firebase.js";

const PLIVO_PER_LEG_PER_MIN_INR = 0.60;

/**
 * Calculate Plivo cost for a single call based on its status and duration.
 * Uses 60-sec billing increments (ceil to next minute per leg).
 */
function calculatePlivoCost(call) {
  const status = call.status || "unknown";

  if (status === "completed" || status === "wallet-deducted") {
    // Both legs connected. Each billed in 60-sec increments.
    const agentMinutes = Math.max(1, Math.ceil((call.agentSeconds || call.aLegSeconds || 60) / 60));
    const customerMinutes = Math.max(1, Math.ceil((call.customerSeconds || call.bLegSeconds || 60) / 60));
    return (agentMinutes + customerMinutes) * PLIVO_PER_LEG_PER_MIN_INR;
  }

  if (status === "customer_voicemail") {
    // Customer leg answered (voicemail picked up) → both legs billed 1 min minimum
    return 2 * PLIVO_PER_LEG_PER_MIN_INR; // ₹1.20
  }

  if (status === "no-answer") {
    // Customer never answered → only agent leg billed (was connected waiting)
    return 1 * PLIVO_PER_LEG_PER_MIN_INR; // ₹0.60
  }

  if (status === "agent_no_confirm") {
    // Agent didn't press 1 → only agent leg for the IVR duration
    return 1 * PLIVO_PER_LEG_PER_MIN_INR; // ₹0.60
  }

  // Failed/unknown — agent leg may or may not have connected
  if (call.plivoCallUuid) {
    return 1 * PLIVO_PER_LEG_PER_MIN_INR; // ₹0.60 (agent leg was initiated)
  }

  return 0; // Call never initiated (e.g., wallet empty, API error)
}

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

  // Fetch org names in bulk for display
  const orgIds = new Set();
  for (const doc of snap.docs) orgIds.add(doc.data().orgId);
  const orgNames = {};
  for (const oid of orgIds) {
    const orgSnap = await db.collection("organizations").doc(oid).get().catch(() => null);
    orgNames[oid] = orgSnap?.exists ? (orgSnap.data().organizationName || orgSnap.data().name || oid) : oid;
  }

  for (const doc of snap.docs) {
    const call = doc.data();
    const orgId = call.orgId;
    if (!byOrg[orgId]) {
      byOrg[orgId] = {
        orgId,
        orgName: orgNames[orgId] || orgId,
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
        plivoCost: 0,     // what Plivo charged CodeSkate (calculated)
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

    // Deterministic Plivo cost calculation (not from unreliable webhook field)
    t.plivoCost += calculatePlivoCost(call);
  }

  // Calculate profit + connect rate
  const tenants = Object.values(byOrg).map((t) => {
    t.plivoCost = Math.round(t.plivoCost * 100) / 100; // round to 2 decimals
    t.profit = Math.round((t.revenue - t.plivoCost) * 100) / 100;
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

  totals.plivoCost = Math.round(totals.plivoCost * 100) / 100;
  totals.profit = Math.round(totals.profit * 100) / 100;
  totals.connectRate = totals.totalCalls > 0 ? Math.round((totals.connectedCalls / totals.totalCalls) * 100) : 0;

  return { tenants, totals, callCount: snap.size };
}
