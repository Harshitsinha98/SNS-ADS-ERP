/**
 * Payment intent & plan application service.
 *
 * ARCHITECTURAL DECISION: Payment handling is the most complex billing concern
 * because of exactly-once semantics (idempotent plan application via eventId),
 * multi-gateway support (Razorpay + PayU), and the need for atomic workspace
 * provisioning. Isolating it:
 * 1. Makes payment verification testable without HTTP.
 * 2. Keeps the intent lifecycle (create → begin → finish/fail) in one place.
 * 3. Centralizes the critical applyPlan() transaction that guards against
 *    duplicate entitlements.
 */

import crypto from "crypto";
import { nowIso, safeDocId, httpError, same, amountForPlan } from "./helpers.js";
import { DAY_MS } from "../config/constants.js";

/**
 * Apply a plan to an organization — idempotent via eventId.
 * This is the core billing mutation: one payment = one period extension.
 */
export async function applyPlan(db, orgId, plan, cycle, meta, eventId, extra = {}) {
  const periodDays = cycle === "yearly" ? 365 : 30;
  const amount = amountForPlan(plan, cycle);
  const eventRef = db.collection("billingEvents").doc(safeDocId(eventId));
  const orgRef = db.collection("organizations").doc(orgId);
  const invoiceRef = orgRef.collection("invoices").doc(safeDocId(eventId));
  const activityRef = orgRef.collection("activity").doc(`payment_${safeDocId(eventId)}`);

  return db.runTransaction(async (tx) => {
    const [eventSnap, orgSnap] = await Promise.all([tx.get(eventRef), tx.get(orgRef)]);
    if (eventSnap.exists) return { alreadyApplied: true, ...(eventSnap.data().result || {}) };
    if (!orgSnap.exists) throw httpError(404, "Organization not found");

    const org = orgSnap.data();
    const now = Date.now();
    const currentEnd = Number(org.currentPeriodEndMs || 0);
    const newPeriodEndMs = Math.max(now, currentEnd > now ? currentEnd : now) + periodDays * DAY_MS;
    const result = { planName: plan.name, seatsLimit: plan.includedSeats, leadsLimit: plan.leadsLimit, currentPeriodEndMs: newPeriodEndMs };

    tx.update(orgRef, {
      planId: plan.id,
      planName: plan.name,
      seatsLimit: plan.includedSeats,
      leadsLimit: plan.leadsLimit,
      subscriptionStatus: "active",
      billingCycle: cycle,
      trialEndsAt: null,
      trialEndsAtMs: 0,
      currentPeriodEndMs: newPeriodEndMs,
      pendingPlanChange: null,
      cancelAtPeriodEnd: false,
      renewalRemindedFor: null,
      lastPayment: { ...meta, amount, cycle, at: nowIso() },
      // Compact organization-level projection for Mission Control. This avoids
      // collection-group scans when detecting inactive customers.
      lastActivityAt: nowIso(),
      lastActivityAtMs: now,
      ...extra,
    });
    tx.create(eventRef, {
      eventId,
      orgId,
      gateway: meta.gateway,
      paymentReference: meta.paymentId || meta.mihpayid || meta.subscriptionId || null,
      amount,
      currency: "INR",
      cycle,
      appliedAt: nowIso(),
      result,
    });
    tx.set(invoiceRef, { amount, currency: "INR", plan: plan.name, cycle, gateway: meta.gateway, reference: meta.paymentId || meta.mihpayid || meta.subscriptionId || null, status: "paid", at: nowIso(), orgId });
    tx.set(activityRef, { text: `💳 Payment received — ${plan.name} plan (${cycle}) via ${meta.gateway}. Valid until ${new Date(newPeriodEndMs).toLocaleDateString("en-IN")}`, at: nowIso(), orgId });
    return { alreadyApplied: false, ...result };
  });
}

/**
 * Create a payment intent record.
 */
export async function createIntent(db, id, data) {
  await db.collection("paymentIntents").doc(id).create({
    ...data,
    status: "created",
    createdAt: nowIso(),
  });
}

/**
 * Begin processing a payment intent (claim with mutex semantics).
 */
export async function beginIntent(db, intentId, uid, expectedKind) {
  const ref = db.collection("paymentIntents").doc(intentId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw httpError(404, "Payment session not found");
    const intent = snap.data();
    if (intent.uid !== uid || intent.kind !== expectedKind) throw httpError(403, "Payment session does not belong to this user");
    if (intent.status === "completed") return { ...intent, completed: true };
    const now = Date.now();
    const startedAtMs = Number(intent.verificationStartedAtMs || 0) || Date.parse(intent.verificationStartedAt || "") || 0;
    if (intent.status === "processing" && startedAtMs > now - 5 * 60 * 1000) {
      throw httpError(409, "Payment verification is already in progress");
    }
    if (intent.expiresAtMs && intent.expiresAtMs < now) throw httpError(400, "Payment session expired");
    tx.update(ref, { status: "processing", verificationStartedAt: nowIso(), verificationStartedAtMs: now, failure: null });
    return { ...intent, completed: false };
  });
}

/**
 * Mark a payment intent as completed.
 */
export async function finishIntent(db, intentId, outcome) {
  await db.collection("paymentIntents").doc(intentId).set({
    status: "completed",
    completedAt: nowIso(),
    outcome,
  }, { merge: true });
}

/**
 * Mark a payment intent as failed (only if not already completed).
 */
export async function failIntent(db, intentId, message) {
  const ref = db.collection("paymentIntents").doc(intentId);
  await db.runTransaction(async (tx) => {
    const intent = await tx.get(ref);
    if (!intent.exists || intent.data().status === "completed") return;
    tx.set(ref, { status: "failed", failedAt: nowIso(), failure: message }, { merge: true });
  });
}

/**
 * Verify a Razorpay payment was captured and matches expected amount.
 */
export async function verifyRazorpayCapturedPayment(razorpay, { orderId, paymentId, intent }) {
  if (!razorpay) throw httpError(503, "Razorpay is not configured");
  const [order, payment] = await Promise.all([
    razorpay.orders.fetch(orderId),
    razorpay.payments.fetch(paymentId),
  ]);
  if (order.id !== orderId || payment.order_id !== orderId) throw httpError(400, "Payment is not linked to this order");
  if (Number(order.amount) !== Number(intent.amountPaise) || Number(payment.amount) !== Number(intent.amountPaise)) {
    throw httpError(400, "Payment amount does not match the selected plan");
  }
  if (payment.status !== "captured") throw httpError(400, "Payment has not been captured");
  return { order, payment };
}

/**
 * Verify Razorpay payment via signature.
 */
export async function verifyRazorpayPayment(razorpay, razorpayKeySecret, { orderId, paymentId, signature, intent }) {
  if (!razorpay) throw httpError(503, "Razorpay is not configured");
  const expectedSignature = crypto.createHmac("sha256", razorpayKeySecret)
    .update(`${orderId}|${paymentId}`).digest("hex");
  if (!same(expectedSignature, signature)) throw httpError(400, "Payment signature verification failed");
  return verifyRazorpayCapturedPayment(razorpay, { orderId, paymentId, intent });
}
