/**
 * Voice Numbers service — Firestore CRUD for tenant-owned phone numbers.
 *
 * Firestore Schema: `voiceNumbers/{docId}`
 * {
 *   orgId: string,              // tenant org
 *   phoneNumber: string,        // E.164 (e.g., "918012345678")
 *   displayNumber: string,      // formatted for UI ("+91 80123 45678")
 *   complianceId: string,       // Plivo compliance application UUID
 *   complianceStatus: string,   // "submitted" | "accepted" | "rejected" | "suspended" | "expired"
 *   rejectionReason: string|null,
 *   plivoAppId: string|null,    // Plivo Application UUID (answer/hangup routing)
 *   status: string,             // "pending_compliance" | "compliance_approved" | "purchasing" | "active" | "suspended" | "cancelled"
 *   businessName: string,       // legal name submitted
 *   monthlyCostInr: number,     // what tenant pays (e.g., 500)
 *   plivoCostInr: number,       // what Plivo charges (~200)
 *   purchasedAt: string|null,   // ISO timestamp
 *   activatedAt: string|null,
 *   createdAt: string,
 *   updatedAt: string,
 * }
 *
 * Multi-tenant isolation: all queries filter by orgId.
 * A tenant can have multiple numbers (future scale).
 */

import { db } from "../bootstrap/firebase.js";
import { logger } from "../middleware/logger.js";
import { nowIso } from "./helpers.js";

const COLLECTION = "voiceNumbers";

/**
 * Create a new voice number record (starts in pending_compliance state).
 */
export async function createVoiceNumber({
  orgId, complianceId, businessName, monthlyCostInr = 500, plivoCostInr = 200,
}) {
  const docRef = db.collection(COLLECTION).doc();
  const record = {
    id: docRef.id,
    orgId,
    phoneNumber: null,
    displayNumber: null,
    complianceId,
    complianceStatus: "submitted",
    rejectionReason: null,
    plivoAppId: null,
    status: "pending_compliance",
    businessName,
    monthlyCostInr,
    plivoCostInr,
    purchasedAt: null,
    activatedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await docRef.set(record);
  logger.info({ orgId, complianceId }, "Voice number record created (pending compliance)");
  return record;
}

/**
 * Update compliance status (called from webhook or poll).
 */
export async function updateComplianceStatus(complianceId, { status, rejectionReason }) {
  const snap = await db.collection(COLLECTION)
    .where("complianceId", "==", complianceId)
    .limit(1)
    .get();

  if (snap.empty) {
    logger.warn({ complianceId }, "No voice number found for compliance ID");
    return null;
  }

  const doc = snap.docs[0];
  const update = {
    complianceStatus: status,
    updatedAt: nowIso(),
  };

  if (status === "accepted") {
    update.status = "compliance_approved";
  } else if (status === "rejected") {
    update.status = "pending_compliance"; // can resubmit
    update.rejectionReason = rejectionReason || null;
  } else if (status === "suspended" || status === "expired") {
    update.status = "suspended";
  }

  await doc.ref.update(update);
  logger.info({ complianceId, status }, "Voice number compliance status updated");
  return { ...doc.data(), ...update };
}

/**
 * Mark number as purchased and assign Plivo details.
 */
export async function activateNumber(complianceId, { phoneNumber, displayNumber, plivoAppId }) {
  const snap = await db.collection(COLLECTION)
    .where("complianceId", "==", complianceId)
    .limit(1)
    .get();

  if (snap.empty) return null;

  const doc = snap.docs[0];
  const update = {
    phoneNumber,
    displayNumber: displayNumber || phoneNumber,
    plivoAppId: plivoAppId || null,
    status: "active",
    purchasedAt: nowIso(),
    activatedAt: nowIso(),
    updatedAt: nowIso(),
  };

  await doc.ref.update(update);
  logger.info({ complianceId, phoneNumber }, "Voice number activated");
  return { ...doc.data(), ...update };
}

/**
 * Get all voice numbers for an org.
 */
export async function getOrgVoiceNumbers(orgId) {
  const snap = await db.collection(COLLECTION)
    .where("orgId", "==", orgId)
    .get();

  // Sort in-memory (avoids needing a composite Firestore index for a
  // collection that will typically have 1-2 docs per org).
  const docs = snap.docs.map((d) => d.data());
  docs.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return docs;
}

/**
 * Get the active (primary) number for an org.
 * Used by bridge call to determine which number to call from.
 */
export async function getActiveNumberForOrg(orgId) {
  const snap = await db.collection(COLLECTION)
    .where("orgId", "==", orgId)
    .where("status", "==", "active")
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].data();
}

/**
 * Get a voice number record by compliance ID.
 */
export async function getByComplianceId(complianceId) {
  const snap = await db.collection(COLLECTION)
    .where("complianceId", "==", complianceId)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].data();
}

/**
 * Cancel/deactivate a number (admin action or non-payment).
 */
export async function cancelNumber(orgId, phoneNumber) {
  const snap = await db.collection(COLLECTION)
    .where("orgId", "==", orgId)
    .where("phoneNumber", "==", phoneNumber)
    .limit(1)
    .get();

  if (snap.empty) return null;

  await snap.docs[0].ref.update({
    status: "cancelled",
    updatedAt: nowIso(),
  });

  return { ...snap.docs[0].data(), status: "cancelled" };
}
