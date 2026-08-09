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
const DEFAULT_RENT_INR = 500;
const RENT_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Create a voice-number REQUEST record (tenant submitted docs, awaiting
 * CodeSkate review + provisioning). Stores business details + document URLs.
 * A tenant can create multiple requests (multiple numbers, each billed).
 */
export async function createVoiceNumberRequest({
  orgId, businessName, registrationNumber, email, address, city, state, postalCode,
  registrationDocUrl, registrationDocFilename, gstDocUrl, gstDocFilename,
  monthlyCostInr = 500, plivoCostInr = 200,
}) {
  const docRef = db.collection(COLLECTION).doc();
  const record = {
    id: docRef.id,
    orgId,
    phoneNumber: null,
    displayNumber: null,
    complianceId: null,
    complianceStatus: "pending_review",
    rejectionReason: null,
    plivoAppId: null,
    status: "pending_review", // awaiting CodeSkate admin action
    businessName,
    registrationNumber: registrationNumber || "",
    email: email || "",
    address: address || "",
    city: city || "",
    state: state || "",
    postalCode: postalCode || "",
    // Document references (stored in R2)
    registrationDocUrl: registrationDocUrl || null,
    registrationDocFilename: registrationDocFilename || null,
    gstDocUrl: gstDocUrl || null,
    gstDocFilename: gstDocFilename || null,
    monthlyCostInr,
    plivoCostInr,
    purchasedAt: null,
    activatedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await docRef.set(record);
  logger.info({ orgId, businessName }, "Voice number request created (pending review)");
  return record;
}

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
 * Register an existing, already-owned Plivo number to an org as ACTIVE.
 * Used by the platform owner to bring pre-owned numbers (e.g. the shared
 * CodeSkate number) into a tenant's account. Starts the monthly rent clock
 * unless chargeRent=false (e.g. for CodeSkate's own free number).
 */
export async function registerOwnedNumber({
  orgId, phoneNumber, displayNumber, businessName,
  monthlyCostInr = DEFAULT_RENT_INR, chargeRent = true,
}) {
  const digits = String(phoneNumber || "").replace(/\D/g, "");
  const docRef = db.collection(COLLECTION).doc();
  const nextRentAtMs = chargeRent ? Date.now() + RENT_PERIOD_MS : null;
  const record = {
    id: docRef.id,
    orgId,
    phoneNumber: digits,
    displayNumber: displayNumber || digits,
    complianceId: null,
    complianceStatus: "accepted",
    rejectionReason: null,
    plivoAppId: null,
    status: "active",
    businessName: businessName || "",
    monthlyCostInr: chargeRent ? monthlyCostInr : 0,
    plivoCostInr: 200,
    purchasedAt: nowIso(),
    activatedAt: nowIso(),
    lastRentAtMs: chargeRent ? Date.now() : null,
    lastRentAt: chargeRent ? nowIso() : null,
    nextRentAtMs,
    nextRentAt: nextRentAtMs ? new Date(nextRentAtMs).toISOString() : null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await docRef.set(record);
  logger.info({ orgId, phoneNumber: digits }, "Owned number registered as active");
  return record;
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
  const nextRentAtMs = Date.now() + RENT_PERIOD_MS;
  const update = {
    phoneNumber,
    displayNumber: displayNumber || phoneNumber,
    plivoAppId: plivoAppId || null,
    status: "active",
    purchasedAt: nowIso(),
    activatedAt: nowIso(),
    lastRentAtMs: Date.now(),
    lastRentAt: nowIso(),
    nextRentAtMs,
    nextRentAt: new Date(nextRentAtMs).toISOString(),
    updatedAt: nowIso(),
  };

  await doc.ref.update(update);
  logger.info({ complianceId, phoneNumber }, "Voice number activated");
  return { ...doc.data(), ...update };
}

/**
 * Charge monthly rent for all active numbers whose rent is due.
 * Deducts ₹rent from the org's Voice Wallet rupee balance (balanceInr) and
 * records a walletTransactions debit. If the wallet can't cover the rent, the
 * number is SUSPENDED (bridge calls fall back to the shared number) until the
 * tenant tops up — no silent negative balance.
 *
 * Designed to be idempotent per-period: nextRentAtMs gates re-charging.
 */
export async function chargeDueRents() {
  const now = Date.now();
  const snap = await db.collection(COLLECTION).where("status", "==", "active").get();
  let charged = 0, suspended = 0;

  for (const doc of snap.docs) {
    const num = doc.data();
    if (!num.monthlyCostInr || num.monthlyCostInr <= 0) continue; // free number
    if ((num.nextRentAtMs || 0) > now) continue; // not due yet

    const rent = num.monthlyCostInr || DEFAULT_RENT_INR;
    const walletRef = db.collection("voiceWallets").doc(num.orgId);

    try {
      const outcome = await db.runTransaction(async (tx) => {
        const wSnap = await tx.get(walletRef);
        const wallet = wSnap.exists ? wSnap.data() : {};
        const balanceInr = Number(wallet.balanceInr || 0);

        if (balanceInr < rent) {
          tx.update(doc.ref, {
            status: "suspended",
            rentFailedAt: nowIso(),
            rejectionReason: "Voice Wallet balance too low for monthly number rent. Top up to reactivate.",
            updatedAt: nowIso(),
          });
          return "suspended";
        }

        const nextRentAtMs = now + RENT_PERIOD_MS;
        tx.set(walletRef, {
          balanceInr: balanceInr - rent,
          totalSpentInr: (wallet.totalSpentInr || 0) + rent,
        }, { merge: true });

        tx.update(doc.ref, {
          lastRentAtMs: now, lastRentAt: nowIso(),
          nextRentAtMs, nextRentAt: new Date(nextRentAtMs).toISOString(),
          updatedAt: nowIso(),
        });

        const txnRef = db.collection("walletTransactions").doc();
        tx.create(txnRef, {
          orgId: num.orgId,
          type: "debit",
          packId: "number_rent",
          packName: "Number Rent",
          minutes: 0,
          amountInr: rent,
          description: `Number rent — ${num.displayNumber || num.phoneNumber} (30 days)`,
          createdAt: nowIso(),
          timestamp: now,
        });
        return "charged";
      });

      if (outcome === "charged") charged++;
      else if (outcome === "suspended") suspended++;
    } catch (e) {
      logger.error({ orgId: num.orgId, err: e.message }, "Rent charge failed for number");
    }
  }

  return { checked: snap.size, charged, suspended };
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
