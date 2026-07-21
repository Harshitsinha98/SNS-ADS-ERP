/**
 * Firestore Aggregate Document Service
 *
 * OPTIMIZATION RATIONALE:
 * Instead of counting leads by querying the entire leads collection
 * (O(N) reads every time a count is needed), we maintain pre-computed
 * counters in a single aggregate document per org.
 *
 * Document path: organizations/{orgId}/aggregates/counts
 *
 * Fields:
 * - activeLeadCount: Number of leads NOT in terminal status (Closed-Won, Lost)
 * - totalLeadCount: Total leads in the org
 * - openFollowUpCount: Number of open follow-up tasks
 * - leadsByStatus: { "New": 5, "Ringing": 3, ... }
 * - leadsByAssignee: { "uid1": 12, "uid2": 8, ... }
 * - lastUpdatedAt: ISO timestamp
 *
 * COST IMPACT:
 * Before: Backend counted leads by querying .where("assignedTo", "==", uid).get()
 *   for EACH employee during bulk import (N+1 pattern). Each count = full
 *   collection scan of that employee's leads.
 * After: Single doc read for the aggregate. O(1) vs O(leads_per_employee).
 *
 * For an org with 5 employees × 200 leads each:
 * - Before: 5 × 200 = 1000 reads per bulk import
 * - After: 1 read of the aggregate doc = 1 read
 * - Savings: 999 reads per bulk import operation
 */

const orgCollection = (db, orgId, name) =>
  db.collection("organizations").doc(orgId).collection(name);

/**
 * Increment/decrement the active lead count atomically.
 * Called by lead creation, status change, and deletion workflows.
 *
 * @param {Firestore} db
 * @param {Transaction|null} tx - If provided, runs within the transaction
 * @param {string} orgId
 * @param {object} deltas - { activeLeadCount: +1, totalLeadCount: +1, ... }
 */
export async function updateAggregates(db, tx, orgId, deltas) {
  const aggRef = orgCollection(db, orgId, "aggregates").doc("counts");

  if (tx) {
    const snap = await tx.get(aggRef);
    const current = snap.exists ? snap.data() : {};
    const updated = { ...current, lastUpdatedAt: new Date().toISOString() };
    for (const [key, delta] of Object.entries(deltas)) {
      if (typeof delta === "number") {
        updated[key] = Math.max(0, (Number(current[key]) || 0) + delta);
      } else if (typeof delta === "object") {
        // Nested map updates (e.g., leadsByStatus, leadsByAssignee)
        updated[key] = { ...(current[key] || {}) };
        for (const [subKey, subDelta] of Object.entries(delta)) {
          updated[key][subKey] = Math.max(0, (Number(updated[key][subKey]) || 0) + subDelta);
        }
      }
    }
    tx.set(aggRef, updated, { merge: true });
  } else {
    // Non-transactional update (best-effort, for background reconciliation)
    await db.runTransaction(async (innerTx) => {
      const snap = await innerTx.get(aggRef);
      const current = snap.exists ? snap.data() : {};
      const updated = { ...current, lastUpdatedAt: new Date().toISOString() };
      for (const [key, delta] of Object.entries(deltas)) {
        if (typeof delta === "number") {
          updated[key] = Math.max(0, (Number(current[key]) || 0) + delta);
        } else if (typeof delta === "object") {
          updated[key] = { ...(current[key] || {}) };
          for (const [subKey, subDelta] of Object.entries(delta)) {
            updated[key][subKey] = Math.max(0, (Number(updated[key][subKey]) || 0) + subDelta);
          }
        }
      }
      innerTx.set(aggRef, updated, { merge: true });
    });
  }
}

/**
 * Get the current aggregate counts for an org.
 * Single doc read instead of collection scan.
 *
 * @param {Firestore} db
 * @param {string} orgId
 * @returns {Promise<object>}
 */
export async function getAggregates(db, orgId) {
  const snap = await orgCollection(db, orgId, "aggregates").doc("counts").get();
  return snap.exists ? snap.data() : {
    activeLeadCount: 0,
    totalLeadCount: 0,
    openFollowUpCount: 0,
    leadsByStatus: {},
    leadsByAssignee: {},
  };
}

/**
 * Reconcile aggregates by scanning the actual collection.
 * Called periodically (e.g., daily cron) to fix any drift.
 * This is an expensive operation but runs rarely.
 *
 * @param {Firestore} db
 * @param {string} orgId
 */
export async function reconcileAggregates(db, orgId) {
  const leadsSnap = await orgCollection(db, orgId, "leads").get();
  const tasksSnap = await orgCollection(db, orgId, "followUpTasks")
    .where("status", "==", "open").get();

  const closedStatuses = new Set(["Closed-Won", "Lost"]);
  let activeLeadCount = 0;
  const leadsByStatus = {};
  const leadsByAssignee = {};

  leadsSnap.docs.forEach((doc) => {
    const data = doc.data();
    const status = data.status || "New";
    if (!closedStatuses.has(status)) activeLeadCount++;
    leadsByStatus[status] = (leadsByStatus[status] || 0) + 1;
    if (data.assignedTo) {
      leadsByAssignee[data.assignedTo] = (leadsByAssignee[data.assignedTo] || 0) + 1;
    }
  });

  await orgCollection(db, orgId, "aggregates").doc("counts").set({
    activeLeadCount,
    totalLeadCount: leadsSnap.size,
    openFollowUpCount: tasksSnap.size,
    leadsByStatus,
    leadsByAssignee,
    lastUpdatedAt: new Date().toISOString(),
    reconciledAt: new Date().toISOString(),
  });

  return { activeLeadCount, totalLeadCount: leadsSnap.size, openFollowUpCount: tasksSnap.size };
}
