/**
 * Workspace provisioning service.
 *
 * ARCHITECTURAL DECISION: Workspace creation (both paid signup and trial) is
 * the highest-risk billing operation because it creates an organization,
 * membership, user profile, settings, and billing event atomically. Isolating
 * this logic:
 * 1. Makes the provisioning transaction auditable and testable.
 * 2. Centralizes the signup session lifecycle (claim → attach → complete)
 *    that prevents double-provisioning from browser retries or webhook races.
 * 3. Separates workspace structure from gateway-specific payment verification.
 */

import crypto from "crypto";
import { getAuth } from "firebase-admin/auth";
import { nowIso, safeDocId, httpError, slugify, phoneKey, amountForPlan } from "./helpers.js";
import { DEFAULT_STATUSES, DAY_MS } from "../config/constants.js";
import { platformConfig } from "../config/env.js";

/**
 * Check that a user doesn't already have a workspace.
 */
export async function assertNoExistingWorkspace(db, uid) {
  const [membershipSnap, userSnap, authRecord] = await Promise.all([
    db.collection("memberships").where("uid", "==", uid).limit(10).get(),
    db.collection("users").doc(uid).get(),
    getAuth().getUser(uid),
  ]);
  const hasActiveMembership = membershipSnap.docs.some((m) => m.data().active === true);
  const hasWorkspaceProfile = Boolean(userSnap.exists && userSnap.data().defaultOrgId);
  if (hasActiveMembership || hasWorkspaceProfile || authRecord.phoneNumber === platformConfig.ownerPhone) {
    throw httpError(409, "This number is already registered. Please sign in instead.");
  }
}

/**
 * Claim a signup session lock (prevents duplicate checkouts).
 */
export async function claimSignupSession(db, uid) {
  const ref = db.collection("signupSessions").doc(uid);
  const claimId = crypto.randomUUID();
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    const now = Date.now();
    if (existing.exists && existing.data().status === "pending") return { created: false, ...existing.data() };
    if (existing.exists && existing.data().status === "creating") {
      throw httpError(409, "Your checkout is still being prepared. Please try again shortly or contact support.");
    }
    tx.set(ref, { uid, status: "creating", claimId, createdAt: nowIso(), createdAtMs: now });
    return { created: true, claimId };
  });
}

/**
 * Attach a provider intent ID to a claimed signup session.
 */
export async function attachSignupSession(db, uid, claimId, provider, intentId) {
  const ref = db.collection("signupSessions").doc(uid);
  await db.runTransaction(async (tx) => {
    const session = await tx.get(ref);
    if (!session.exists || session.data().status !== "creating" || session.data().claimId !== claimId) {
      throw httpError(409, "Your checkout session was replaced. Please try again.");
    }
    tx.update(ref, { status: "pending", provider, intentId, updatedAt: nowIso() });
  });
}

/**
 * Abandon a creating session if provider intent creation fails.
 */
export async function abandonCreatingSignupSession(db, uid, claimId) {
  const ref = db.collection("signupSessions").doc(uid);
  await db.runTransaction(async (tx) => {
    const session = await tx.get(ref);
    if (session.exists && session.data().status === "creating" && session.data().claimId === claimId) tx.delete(ref);
  });
}

/**
 * Assert that a signup session belongs to the expected user/intent.
 */
export async function assertSignupSessionOwner(db, uid, intentId) {
  const session = await db.collection("signupSessions").doc(uid).get();
  if (!session.exists) return;
  const data = session.data();
  if (data.status !== "pending" || data.intentId !== intentId) {
    throw httpError(409, "This checkout session is no longer active. Please contact support if payment was completed.");
  }
}

/**
 * Mark a signup session as completed.
 */
export async function completeSignupSession(db, uid, intentId) {
  await db.collection("signupSessions").doc(uid).set({
    status: "completed", intentId, completedAt: nowIso(),
  }, { merge: true });
}

/**
 * Provision a new workspace — the atomic transaction that creates everything.
 */
export async function provisionWorkspace(db, { uid, phone, orgName, fullName, plan, cycle, paymentMeta, eventId }) {
  const orgRef = db.collection("organizations").doc();
  const userRef = db.collection("users").doc(uid);
  const membershipRef = db.collection("memberships").doc(`${uid}_${orgRef.id}`);
  const eventRef = db.collection("billingEvents").doc(safeDocId(eventId));
  const periodDays = cycle === "yearly" ? 365 : 30;
  const amount = amountForPlan(plan, cycle);
  const createdAt = nowIso();

  const result = await db.runTransaction(async (tx) => {
    const [existingEvent, existingUser] = await Promise.all([tx.get(eventRef), tx.get(userRef)]);
    if (existingEvent.exists) return { alreadyApplied: true, orgId: existingEvent.data().result?.orgId };
    if (existingUser.exists && existingUser.data().defaultOrgId) {
      throw httpError(409, "This number is already registered. Please sign in instead.");
    }

    const periodEnd = Date.now() + periodDays * DAY_MS;
    tx.create(orgRef, {
      name: orgName, slug: slugify(orgName), createdAt, createdBy: uid, ownerPhone: phone || null,
      lastActivityAt: createdAt, lastActivityAtMs: Date.now(),
      planId: plan.id, planName: plan.name, seatsUsed: 1, seatsLimit: plan.includedSeats,
      leadsUsed: 0, leadsLimit: plan.leadsLimit, subscriptionStatus: "active",
      trialEndsAt: null, trialEndsAtMs: 0, billingCycle: cycle, currentPeriodEndMs: periodEnd,
      lastPayment: { ...paymentMeta, amount, cycle, at: createdAt },
    });
    tx.set(userRef, { phone: phone || null, displayName: fullName, defaultOrgId: orgRef.id, createdAt, lastLoginAt: createdAt }, { merge: true });
    tx.create(membershipRef, { uid, orgId: orgRef.id, role: "owner", displayName: fullName, phone: phone || null, active: true, invitedBy: uid, joinedAt: createdAt, lastActiveAt: createdAt });
    tx.create(eventRef, {
      eventId,
      orgId: orgRef.id,
      gateway: paymentMeta.gateway,
      paymentReference: paymentMeta.paymentId || paymentMeta.mihpayid || null,
      amount,
      currency: "INR",
      cycle,
      appliedAt: createdAt,
      result: { orgId: orgRef.id, planName: plan.name },
    });
    tx.set(orgRef.collection("settings").doc("config"), { statuses: DEFAULT_STATUSES, autoAssign: "round-robin" });
    tx.set(orgRef.collection("meta").doc("leadAssignment"), { lastIndex: 0 });
    tx.set(orgRef.collection("activity").doc(`workspace_${safeDocId(eventId)}`), { text: `💳 ${fullName} created ${orgName} on the ${plan.name} plan (${cycle}, paid via ${paymentMeta.gateway})`, at: createdAt, orgId: orgRef.id });
    tx.set(orgRef.collection("invoices").doc(safeDocId(eventId)), { amount, currency: "INR", plan: plan.name, cycle, gateway: paymentMeta.gateway, reference: paymentMeta.paymentId || paymentMeta.mihpayid || null, status: "paid", at: createdAt, orgId: orgRef.id });
    return { alreadyApplied: false, orgId: orgRef.id };
  });
  return result.orgId;
}
