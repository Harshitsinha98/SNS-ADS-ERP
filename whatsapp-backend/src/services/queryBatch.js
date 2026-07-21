/**
 * Query Batching Utility
 *
 * OPTIMIZATION RATIONALE:
 * The bulk-import endpoint in billing.js has an N+1 pattern where it queries
 * each employee's lead count individually:
 *
 *   await Promise.all(employees.map(async (employee) => {
 *     const assigned = await orgRef.collection("leads")
 *       .where("assignedTo", "==", employee.uid).get();
 *     workload[employee.uid] = assigned.docs.reduce(...);
 *   }));
 *
 * For 10 employees, this is 10 separate collection queries (10 reads billed
 * per query minimum + 1 per doc returned). With 200 leads per employee, that's
 * 10 queries × (1 + 200 docs) = 2,010 reads.
 *
 * This utility provides:
 * 1. getWorkloadCounts() — Uses the aggregate document (1 read) instead
 * 2. batchedMembershipCheck() — Fetches multiple memberships in one query
 *    instead of N individual doc.get() calls
 *
 * COST IMPACT:
 * - Workload count: 2,010 reads → 1 read (99.95% reduction)
 * - Membership checks: N reads → 1 query (when checking multiple members)
 */

import { getAggregates } from "./aggregates.js";

/**
 * Get workload counts for all active employees in an org.
 * Uses the pre-computed aggregate document instead of N individual queries.
 *
 * Falls back to a single query if aggregates haven't been reconciled yet.
 *
 * @param {Firestore} db
 * @param {string} orgId
 * @param {Array} employees - Array of employee objects with .uid
 * @returns {Promise<Map<string, number>>} uid → open lead count
 */
export async function getWorkloadCounts(db, orgId, employees) {
  // Try aggregate first (1 read)
  const aggregates = await getAggregates(db, orgId);
  if (aggregates.leadsByAssignee && Object.keys(aggregates.leadsByAssignee).length > 0) {
    const workload = {};
    for (const emp of employees) {
      workload[emp.uid] = Number(aggregates.leadsByAssignee[emp.uid] || 0);
    }
    return workload;
  }

  // Fallback: Single query for all open leads, then count in-memory
  // This is O(total_open_leads) reads but only 1 query vs N queries.
  const orgRef = db.collection("organizations").doc(orgId);
  const allLeads = await orgRef.collection("leads")
    .where("status", "not-in", ["Closed-Won", "Lost"])
    .get();

  const workload = {};
  for (const emp of employees) {
    workload[emp.uid] = 0;
  }
  allLeads.docs.forEach((doc) => {
    const data = doc.data();
    if (data.assignedTo && workload.hasOwnProperty(data.assignedTo)) {
      workload[data.assignedTo]++;
    }
  });
  return workload;
}

/**
 * Batch check multiple memberships in a single query.
 * Instead of N individual doc.get() calls, uses a where-in query.
 *
 * Firestore "in" queries support up to 30 values. For larger sets,
 * automatically chunks into multiple queries.
 *
 * @param {Firestore} db
 * @param {string} orgId
 * @param {Array<string>} uids - User IDs to check
 * @returns {Promise<Map<string, object>>} uid → membership data
 */
export async function batchedMembershipCheck(db, orgId, uids) {
  const results = new Map();
  if (!uids.length) return results;

  // Firestore "in" queries limited to 30 values
  const chunks = [];
  for (let i = 0; i < uids.length; i += 30) {
    chunks.push(uids.slice(i, i + 30));
  }

  await Promise.all(chunks.map(async (chunk) => {
    const snap = await db.collection("memberships")
      .where("orgId", "==", orgId)
      .where("uid", "in", chunk)
      .where("active", "==", true)
      .get();
    snap.docs.forEach((doc) => {
      const data = doc.data();
      results.set(data.uid, data);
    });
  }));

  return results;
}

/**
 * Batch fetch documents by their IDs.
 * Firestore getAll() supports up to 100 documents per call.
 *
 * @param {Firestore} db
 * @param {Array<DocumentReference>} refs - Document references
 * @returns {Promise<Array<DocumentSnapshot>>}
 */
export async function batchGetDocs(db, refs) {
  if (!refs.length) return [];
  const results = [];
  // Firestore getAll() can handle up to 100 refs
  for (let i = 0; i < refs.length; i += 100) {
    const chunk = refs.slice(i, i + 100);
    const snaps = await db.getAll(...chunk);
    results.push(...snaps);
  }
  return results;
}
