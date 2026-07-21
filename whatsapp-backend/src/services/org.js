/**
 * Organization-level business logic service.
 *
 * ARCHITECTURAL DECISION: Org-scoped helpers (subscription checks, lead
 * capacity management, admin notifications) were scattered inline throughout
 * server.js. Extracting them:
 * 1. Makes subscription-gating logic testable without HTTP.
 * 2. Ensures capacity reservation/release is atomic and consistent.
 * 3. Provides a clear seam for future multi-tenancy enhancements.
 */

import { db } from "../bootstrap/firebase.js";
import { nowIso, orgCollection } from "./helpers.js";

/**
 * Check if an org's subscription allows lead creation/import.
 */
export function subscriptionAllowsLeads(org) {
  if (org.subscriptionStatus === "active") return true;
  return (
    org.subscriptionStatus === "trialing" &&
    (!org.trialEndsAtMs || org.trialEndsAtMs > Date.now())
  );
}

/**
 * Atomically reserve lead capacity. Returns false if limit exceeded or
 * subscription is inactive.
 */
export async function reserveLeadCapacity(orgId, count = 1) {
  const orgRef = db.collection("organizations").doc(orgId);
  return db.runTransaction(async (tx) => {
    const orgSnap = await tx.get(orgRef);
    if (!orgSnap.exists) return false;
    const org = orgSnap.data();
    if (!subscriptionAllowsLeads(org)) return false;
    const limit = Number(org.leadsLimit || 0);
    const used = Number(org.leadsUsed || 0);
    if (limit > 0 && used + count > limit) return false;
    tx.update(orgRef, { leadsUsed: used + count });
    return true;
  });
}

/**
 * Release previously reserved lead capacity (on failure rollback).
 */
export async function releaseLeadCapacity(orgId, count = 1) {
  const orgRef = db.collection("organizations").doc(orgId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(orgRef);
    if (!snap.exists) return;
    tx.update(orgRef, {
      leadsUsed: Math.max(0, Number(snap.data().leadsUsed || 0) - count),
    });
  });
}

/**
 * Send a notification to all org admins/owners.
 */
export async function notifyOrgAdmins(orgId, text) {
  const admins = await db
    .collection("memberships")
    .where("orgId", "==", orgId)
    .where("active", "==", true)
    .get();
  const batch = db.batch();
  let count = 0;
  admins.docs.forEach((member) => {
    const data = member.data();
    if (data.role === "owner" || data.role === "admin") {
      batch.create(orgCollection(db, orgId, "notifications").doc(), {
        userId: data.uid,
        text,
        type: "billing",
        read: false,
        at: nowIso(),
        orgId,
      });
      count += 1;
    }
  });
  if (count) await batch.commit();
}

/**
 * Resolve an orgId from a WhatsApp phone_number_id routing table.
 * Returns null for unknown numbers — multi-tenant traffic must never
 * fall into an arbitrary organization.
 */
export async function resolveOrgId(phoneNumberId) {
  if (!phoneNumberId) return null;
  try {
    const config = await db.collection("whatsappConfigs").doc(String(phoneNumberId)).get();
    return config.exists && config.data().active === true && config.data().orgId
      ? config.data().orgId
      : null;
  } catch (error) {
    // Routing-store failures must be retried by Meta; treating them as an
    // unknown number would silently acknowledge and lose a signed message.
    throw error;
  }
}
