// Secure billing, workspace, team, and platform administration routes.
// All entitlement and privileged membership changes are performed with Firebase
// Admin SDK after a verified, idempotent server-side operation.

import express from "express";
import crypto from "crypto";
import { getAuth } from "firebase-admin/auth";
import { getMergedPlans, amountForPlan } from "./plans.js";

let Razorpay = null;
try {
  Razorpay = (await import("razorpay")).default;
} catch {
  console.warn("⚠️ 'razorpay' package not installed — Razorpay checkout is disabled.");
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STATUSES = ["New", "Ringing", "Meeting Fixed", "Negotiation", "Follow-up", "Closed-Won", "Lost"];
const TEAM_ROLES = new Set(["employee", "admin"]);
const PLATFORM_OWNER_PHONE = process.env.PLATFORM_OWNER_PHONE || "+919653043939";

const nowIso = () => new Date().toISOString();
const phoneKey = (phone) => String(phone || "").replace(/\D/g, "");
const safeDocId = (value) => String(value).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 140);
const same = (left, right) => {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const normalizeCycle = (cycle) => (cycle === "yearly" ? "yearly" : "monthly");

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function slugify(name) {
  return String(name || "workspace")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "workspace";
}

export default function createBillingRouter(db) {
  const router = express.Router();
  const rzpEnabled = Boolean(Razorpay && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  const razorpay = rzpEnabled
    ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
    : null;
  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
  const PUBLIC_BACKEND_URL = process.env.PUBLIC_BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;

  async function requireAuth(req, res, next) {
    try {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      if (!token) return res.status(401).json({ error: "Missing auth token" });
      req.authUser = await getAuth().verifyIdToken(token);
      return next();
    } catch {
      return res.status(401).json({ error: "Invalid auth token" });
    }
  }

  async function isPlatformAdmin(authUser) {
    if (!authUser?.uid) return false;
    if (authUser.phone_number === PLATFORM_OWNER_PHONE) return true;
    const snap = await db.collection("platformAdmins").doc(authUser.uid).get();
    return snap.exists;
  }

  async function requirePlatformAdmin(req, res, next) {
    try {
      if (!(await isPlatformAdmin(req.authUser))) return res.status(403).json({ error: "Platform owner access required" });
      return next();
    } catch {
      return res.status(403).json({ error: "Platform owner access required" });
    }
  }

  async function isOrgAdmin(uid, orgId) {
    if (!uid || !orgId) return false;
    const membership = await db.collection("memberships").doc(`${uid}_${orgId}`).get();
    const data = membership.data();
    return Boolean(membership.exists && data.active && (data.role === "owner" || data.role === "admin"));
  }

  async function requireOrgAdmin(req, res, next) {
    const orgId = req.body?.orgId;
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) return res.status(403).json({ error: "Organization admin access required" });
    return next();
  }

  async function getPlan(dbRef, planId, cycle) {
    const plans = await getMergedPlans(dbRef);
    const plan = plans[planId];
    if (!plan) throw httpError(400, "Invalid plan");
    return { plan, cycle: normalizeCycle(cycle) };
  }

  function subscriptionAllowsLeadCreation(org) {
    if (org.subscriptionStatus === "active") return true;
    return org.subscriptionStatus === "trialing"
      && (!org.trialEndsAtMs || Number(org.trialEndsAtMs) > Date.now());
  }

  async function getTrialDays() {
    const config = await db.collection("platformConfig").doc("global").get();
    const value = Number(config.data()?.trialDays);
    return Number.isFinite(value) && value >= 0 && value <= 90 ? value : 7;
  }

  async function audit(orgId, text, extra = {}) {
    await db.collection("organizations").doc(orgId).collection("activity").add({
      text,
      orgId,
      at: nowIso(),
      ...extra,
    });
  }

  // A gateway event is atomically recorded together with the plan change. This
  // makes retries and duplicate webhooks harmless: one payment/event can add
  // exactly one billing period.
  async function applyPlan(orgId, plan, cycle, meta, eventId, extra = {}) {
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
        ...extra,
      });
      tx.create(eventRef, {
        eventId,
        orgId,
        gateway: meta.gateway,
        paymentReference: meta.paymentId || meta.mihpayid || meta.subscriptionId || null,
        appliedAt: nowIso(),
        result,
      });
      tx.set(invoiceRef, {
        amount,
        currency: "INR",
        plan: plan.name,
        cycle,
        gateway: meta.gateway,
        reference: meta.paymentId || meta.mihpayid || meta.subscriptionId || null,
        status: "paid",
        at: nowIso(),
        orgId,
      });
      tx.set(activityRef, {
        text: `💳 Payment received — ${plan.name} plan (${cycle}) via ${meta.gateway}. Valid until ${new Date(newPeriodEndMs).toLocaleDateString("en-IN")}`,
        at: nowIso(),
        orgId,
      });
      return { alreadyApplied: false, ...result };
    });
  }

  async function createIntent(id, data) {
    await db.collection("paymentIntents").doc(id).create({
      ...data,
      status: "created",
      createdAt: nowIso(),
    });
  }

  async function beginIntent(intentId, uid, expectedKind) {
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
      // A process can die after claiming an intent but before recording the
      // idempotent billing event. Reclaim stale work so a verified payment is
      // never stranded; applyPlan itself prevents a duplicate entitlement.
      tx.update(ref, { status: "processing", verificationStartedAt: nowIso(), verificationStartedAtMs: now, failure: null });
      return { ...intent, completed: false };
    });
  }

  async function finishIntent(intentId, outcome) {
    await db.collection("paymentIntents").doc(intentId).set({
      status: "completed",
      completedAt: nowIso(),
      outcome,
    }, { merge: true });
  }

  async function failIntent(intentId, message) {
    await db.collection("paymentIntents").doc(intentId).set({
      status: "failed",
      failedAt: nowIso(),
      failure: message,
    }, { merge: true });
  }

  async function verifyRazorpayPayment({ orderId, paymentId, signature, intent }) {
    if (!razorpay) throw httpError(503, "Razorpay is not configured");
    const expectedSignature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`).digest("hex");
    if (!same(expectedSignature, signature)) throw httpError(400, "Payment signature verification failed");

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

  async function provisionWorkspace({ uid, phone, orgName, fullName, plan, cycle, paymentMeta, eventId }) {
    const orgRef = db.collection("organizations").doc();
    const userRef = db.collection("users").doc(uid);
    const membershipRef = db.collection("memberships").doc(`${uid}_${orgRef.id}`);
    const eventRef = db.collection("billingEvents").doc(safeDocId(eventId));
    const periodDays = cycle === "yearly" ? 365 : 30;
    const amount = amountForPlan(plan, cycle);
    const createdAt = nowIso();

    const result = await db.runTransaction(async (tx) => {
      const existingEvent = await tx.get(eventRef);
      if (existingEvent.exists) return { alreadyApplied: true, orgId: existingEvent.data().result?.orgId };

      const periodEnd = Date.now() + periodDays * DAY_MS;
      tx.create(orgRef, {
        name: orgName,
        slug: slugify(orgName),
        createdAt,
        createdBy: uid,
        ownerPhone: phone || null,
        planId: plan.id,
        planName: plan.name,
        seatsUsed: 1,
        seatsLimit: plan.includedSeats,
        leadsUsed: 0,
        leadsLimit: plan.leadsLimit,
        subscriptionStatus: "active",
        trialEndsAt: null,
        trialEndsAtMs: 0,
        billingCycle: cycle,
        currentPeriodEndMs: periodEnd,
        lastPayment: { ...paymentMeta, amount, cycle, at: createdAt },
      });
      tx.set(userRef, {
        phone: phone || null,
        displayName: fullName,
        defaultOrgId: orgRef.id,
        createdAt,
        lastLoginAt: createdAt,
      }, { merge: true });
      tx.create(membershipRef, {
        uid,
        orgId: orgRef.id,
        role: "owner",
        displayName: fullName,
        phone: phone || null,
        active: true,
        invitedBy: uid,
        joinedAt: createdAt,
        lastActiveAt: createdAt,
      });
      tx.create(eventRef, {
        eventId,
        orgId: orgRef.id,
        gateway: paymentMeta.gateway,
        paymentReference: paymentMeta.paymentId || paymentMeta.mihpayid || null,
        appliedAt: createdAt,
        result: { orgId: orgRef.id, planName: plan.name },
      });
      tx.set(orgRef.collection("settings").doc("config"), { statuses: DEFAULT_STATUSES, autoAssign: "round-robin" });
      tx.set(orgRef.collection("meta").doc("leadAssignment"), { lastIndex: 0 });
      tx.set(orgRef.collection("activity").doc(`workspace_${safeDocId(eventId)}`), {
        text: `💳 ${fullName} created ${orgName} on the ${plan.name} plan (${cycle}, paid via ${paymentMeta.gateway})`,
        at: createdAt,
        orgId: orgRef.id,
      });
      tx.set(orgRef.collection("invoices").doc(safeDocId(eventId)), {
        amount,
        currency: "INR",
        plan: plan.name,
        cycle,
        gateway: paymentMeta.gateway,
        reference: paymentMeta.paymentId || paymentMeta.mihpayid || null,
        status: "paid",
        at: createdAt,
        orgId: orgRef.id,
      });
      return { alreadyApplied: false, orgId: orgRef.id };
    });
    return result.orgId;
  }

  // Public gateway configuration only; private gateway secrets never leave the backend.
  router.get("/config", (req, res) => {
    res.json({
      razorpay: rzpEnabled,
      razorpayKeyId: rzpEnabled ? process.env.RAZORPAY_KEY_ID : null,
      payu: Boolean(process.env.PAYU_KEY && process.env.PAYU_SALT),
    });
  });

  // ----- secure trial workspace provisioning -----
  router.post("/trial/provision", requireAuth, async (req, res) => {
    try {
      const orgName = String(req.body?.orgName || "").trim();
      const fullName = String(req.body?.fullName || "").trim();
      if (!orgName || !fullName) throw httpError(400, "Organization and owner name are required");
      const authRecord = await getAuth().getUser(req.authUser.uid);
      const phone = authRecord.phoneNumber;
      if (!phone) throw httpError(400, "A verified phone number is required");
      const trialRef = db.collection("trialsUsed").doc(phoneKey(phone));
      const orgRef = db.collection("organizations").doc();
      const trialDays = await getTrialDays();
      const { plan } = await getPlan(db, "starter", "monthly");
      if (!plan.trial) throw httpError(400, "Free trial is not available for this plan");
      const createdAt = nowIso();
      const endMs = Date.now() + trialDays * DAY_MS;

      await db.runTransaction(async (tx) => {
        const used = await tx.get(trialRef);
        if (used.exists) throw httpError(409, "This number has already used its free trial");
        tx.create(trialRef, { phone, uid: req.authUser.uid, orgId: orgRef.id, usedAt: createdAt });
        tx.create(orgRef, {
          name: orgName,
          slug: slugify(orgName),
          createdAt,
          createdBy: req.authUser.uid,
          ownerPhone: phone,
          planId: plan.id,
          planName: plan.name,
          subscriptionStatus: "trialing",
          seatsUsed: 1,
          seatsLimit: plan.includedSeats,
          leadsUsed: 0,
          leadsLimit: plan.leadsLimit,
          trialEndsAt: new Date(endMs).toISOString(),
          trialEndsAtMs: endMs,
        });
        tx.set(db.collection("users").doc(req.authUser.uid), {
          phone,
          displayName: fullName,
          defaultOrgId: orgRef.id,
          createdAt,
          lastLoginAt: createdAt,
        }, { merge: true });
        tx.create(db.collection("memberships").doc(`${req.authUser.uid}_${orgRef.id}`), {
          uid: req.authUser.uid,
          orgId: orgRef.id,
          role: "owner",
          displayName: fullName,
          phone,
          active: true,
          invitedBy: req.authUser.uid,
          joinedAt: createdAt,
          lastActiveAt: createdAt,
        });
        tx.set(orgRef.collection("settings").doc("config"), { statuses: DEFAULT_STATUSES, autoAssign: "round-robin" });
        tx.set(orgRef.collection("meta").doc("leadAssignment"), { lastIndex: 0 });
        tx.set(orgRef.collection("activity").doc("trial_started"), {
          text: `🎉 ${fullName} started a ${trialDays}-day free trial on ${plan.name}`,
          at: createdAt,
          orgId: orgRef.id,
        });
      });
      res.json({ ok: true, orgId: orgRef.id, trialDays });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Could not create trial workspace" });
    }
  });

  // ----- Razorpay one-time payments -----
  router.post("/razorpay/order", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      if (!razorpay) throw httpError(503, "Razorpay is not configured on the server");
      const { plan, cycle } = await getPlan(db, req.body.planId, req.body.cycle);
      const amountPaise = amountForPlan(plan, cycle) * 100;
      const order = await razorpay.orders.create({
        amount: amountPaise,
        currency: "INR",
        receipt: `up_${req.body.orgId}_${Date.now()}`.slice(0, 40),
        notes: { kind: "upgrade" },
      });
      await createIntent(order.id, {
        kind: "upgrade",
        uid: req.authUser.uid,
        orgId: req.body.orgId,
        planId: plan.id,
        cycle,
        amountPaise,
        expiresAtMs: Date.now() + 30 * 60 * 1000,
      });
      res.json({ orderId: order.id, amount: amountPaise, currency: "INR", keyId: process.env.RAZORPAY_KEY_ID, planName: plan.name });
    } catch (error) {
      console.error("razorpay/order:", error.message);
      res.status(error.status || 500).json({ error: error.message || "Could not create payment order" });
    }
  });

  router.post("/razorpay/verify", requireAuth, async (req, res) => {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
    try {
      const intent = await beginIntent(orderId, req.authUser.uid, "upgrade");
      if (intent.completed) return res.json({ ok: true, replay: true, ...(intent.outcome || {}) });
      const { payment } = await verifyRazorpayPayment({ orderId, paymentId, signature, intent });
      const { plan, cycle } = await getPlan(db, intent.planId, intent.cycle);
      const result = await applyPlan(intent.orgId, plan, cycle, { gateway: "razorpay", paymentId: payment.id }, `razorpay_payment_${payment.id}`);
      await finishIntent(orderId, result);
      res.json({ ok: true, ...result });
    } catch (error) {
      if (orderId) await failIntent(orderId, error.message).catch(() => {});
      console.error("razorpay/verify:", error.message);
      res.status(error.status || 500).json({ error: error.message || "Payment verification failed" });
    }
  });

  // ----- Razorpay paid workspace signup -----
  router.post("/signup/order", requireAuth, async (req, res) => {
    try {
      if (!razorpay) throw httpError(503, "Razorpay is not configured on the server");
      const orgName = String(req.body?.orgName || "").trim();
      const fullName = String(req.body?.fullName || "").trim();
      if (!orgName || !fullName) throw httpError(400, "Organization and owner name are required");
      const { plan, cycle } = await getPlan(db, req.body.planId, req.body.cycle);
      const amountPaise = amountForPlan(plan, cycle) * 100;
      const order = await razorpay.orders.create({
        amount: amountPaise,
        currency: "INR",
        receipt: `su_${req.authUser.uid}_${Date.now()}`.slice(0, 40),
        notes: { kind: "signup" },
      });
      await createIntent(order.id, {
        kind: "signup",
        uid: req.authUser.uid,
        planId: plan.id,
        cycle,
        amountPaise,
        orgName,
        fullName,
        expiresAtMs: Date.now() + 30 * 60 * 1000,
      });
      res.json({ orderId: order.id, amount: amountPaise, currency: "INR", keyId: process.env.RAZORPAY_KEY_ID, planName: plan.name });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Could not create payment order" });
    }
  });

  router.post("/signup/verify", requireAuth, async (req, res) => {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
    try {
      const intent = await beginIntent(orderId, req.authUser.uid, "signup");
      if (intent.completed) return res.json({ ok: true, replay: true, ...(intent.outcome || {}) });
      const { payment } = await verifyRazorpayPayment({ orderId, paymentId, signature, intent });
      const userRecord = await getAuth().getUser(req.authUser.uid);
      const { plan, cycle } = await getPlan(db, intent.planId, intent.cycle);
      const orgId = await provisionWorkspace({
        uid: req.authUser.uid,
        phone: userRecord.phoneNumber || null,
        orgName: intent.orgName,
        fullName: intent.fullName,
        plan,
        cycle,
        paymentMeta: { gateway: "razorpay", paymentId: payment.id },
        eventId: `razorpay_payment_${payment.id}`,
      });
      const result = { orgId, planName: plan.name };
      await finishIntent(orderId, result);
      res.json({ ok: true, ...result });
    } catch (error) {
      if (orderId) await failIntent(orderId, error.message).catch(() => {});
      console.error("signup/verify:", error.message);
      res.status(error.status || 500).json({ error: error.message || "Workspace provisioning failed" });
    }
  });

  // ----- PayU -----
  async function createPayuIntent({ kind, uid, orgId = null, orgName = null, fullName = null, planId, cycle, email, phone }) {
    const key = process.env.PAYU_KEY;
    const salt = process.env.PAYU_SALT;
    if (!key || !salt) throw httpError(503, "PayU is not configured on the server");
    const { plan, cycle: normalizedCycle } = await getPlan(db, planId, cycle);
    const amount = `${amountForPlan(plan, normalizedCycle)}.00`;
    const txnid = `${kind === "signup" ? "SU" : "CS"}${Date.now()}${crypto.randomInt(100, 999)}`;
    const productinfo = kind === "signup" ? `${plan.name}-${normalizedCycle}-signup` : `${plan.name}-${normalizedCycle}`;
    const udf1 = kind === "signup" ? "signup" : orgId;
    const udf2 = plan.id;
    const udf3 = normalizedCycle;
    const udf4 = "";
    const udf5 = "";
    const hashString = `${key}|${txnid}|${amount}|${productinfo}|${fullName || "Customer"}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${salt}`;
    const hash = crypto.createHash("sha512").update(hashString).digest("hex");
    await createIntent(txnid, {
      kind,
      uid,
      orgId,
      orgName,
      fullName: fullName || "Customer",
      planId: plan.id,
      cycle: normalizedCycle,
      amount,
      productinfo,
      email,
      phone,
      expiresAtMs: Date.now() + 30 * 60 * 1000,
    });
    return {
      action: process.env.PAYU_MODE === "live" ? "https://secure.payu.in/_payment" : "https://test.payu.in/_payment",
      params: {
        key,
        txnid,
        amount,
        productinfo,
        firstname: fullName || "Customer",
        email,
        phone: String(phone || "").replace("+91", ""),
        udf1,
        udf2,
        udf3,
        hash,
        surl: `${PUBLIC_BACKEND_URL}/api/billing/payu/callback`,
        furl: `${PUBLIC_BACKEND_URL}/api/billing/payu/callback`,
      },
    };
  }

  router.post("/payu/hash", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      const form = await createPayuIntent({
        kind: "upgrade",
        uid: req.authUser.uid,
        orgId: req.body.orgId,
        planId: req.body.planId,
        cycle: req.body.cycle,
        fullName: String(req.body.firstname || "Customer").slice(0, 80),
        email: String(req.body.email || "customer@codeskate.app").slice(0, 120),
        phone: req.body.phone || "",
      });
      res.json(form);
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Could not create PayU request" });
    }
  });

  router.post("/signup/payu/hash", requireAuth, async (req, res) => {
    try {
      const orgName = String(req.body?.orgName || "").trim();
      const fullName = String(req.body?.fullName || "").trim();
      if (!orgName || !fullName) throw httpError(400, "Organization and owner name are required");
      const userRecord = await getAuth().getUser(req.authUser.uid);
      const form = await createPayuIntent({
        kind: "signup",
        uid: req.authUser.uid,
        orgName,
        fullName,
        planId: req.body.planId,
        cycle: req.body.cycle,
        email: String(req.body.email || "customer@codeskate.app").slice(0, 120),
        phone: userRecord.phoneNumber || "",
      });
      res.json(form);
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Could not create PayU request" });
    }
  });

  router.post("/payu/callback", express.urlencoded({ extended: true }), async (req, res) => {
    const body = req.body || {};
    const txnid = String(body.txnid || "");
    try {
      const key = process.env.PAYU_KEY;
      const salt = process.env.PAYU_SALT;
      if (!key || !salt) throw httpError(503, "PayU is not configured");
      const intentSnap = await db.collection("paymentIntents").doc(txnid).get();
      if (!intentSnap.exists) throw httpError(404, "Unknown PayU payment session");
      const intent = intentSnap.data();
      const reverseHash = `${salt}|${body.status || ""}||||||${body.udf5 || ""}|${body.udf4 || ""}|${body.udf3 || ""}|${body.udf2 || ""}|${body.udf1 || ""}|${body.email || ""}|${body.firstname || ""}|${body.productinfo || ""}|${body.amount || ""}|${txnid}|${key}`;
      const expected = crypto.createHash("sha512").update(reverseHash).digest("hex");
      if (!same(expected, body.hash) || body.status !== "success") throw httpError(400, "PayU callback verification failed");
      if (String(body.amount) !== intent.amount || String(body.productinfo) !== intent.productinfo || String(body.udf2) !== intent.planId || String(body.udf3) !== intent.cycle) {
        throw httpError(400, "PayU payment details do not match the server payment session");
      }
      const eventId = `payu_payment_${body.mihpayid || txnid}`;
      const { plan, cycle } = await getPlan(db, intent.planId, intent.cycle);
      let redirect;
      if (intent.kind === "signup") {
        const userRecord = await getAuth().getUser(intent.uid);
        const orgId = await provisionWorkspace({
          uid: intent.uid,
          phone: userRecord.phoneNumber || null,
          orgName: intent.orgName,
          fullName: intent.fullName,
          plan,
          cycle,
          paymentMeta: { gateway: "payu", mihpayid: body.mihpayid || txnid },
          eventId,
        });
        await finishIntent(txnid, { orgId, planName: plan.name });
        redirect = `${FRONTEND_URL}/login?paid=1&org=${encodeURIComponent(orgId)}`;
      } else if (intent.kind === "upgrade") {
        const result = await applyPlan(intent.orgId, plan, cycle, { gateway: "payu", mihpayid: body.mihpayid || txnid }, eventId);
        await finishIntent(txnid, result);
        redirect = `${FRONTEND_URL}/admin/billing?payu=success`;
      } else {
        throw httpError(400, "Unsupported PayU payment type");
      }
      return res.redirect(303, redirect);
    } catch (error) {
      if (txnid) await failIntent(txnid, error.message).catch(() => {});
      console.error("payu/callback:", error.message);
      return res.redirect(303, `${FRONTEND_URL}/admin/billing?payu=failed`);
    }
  });

  // ----- Razorpay subscriptions / autopay -----
  async function ensureRazorpayPlan(plan, cycle) {
    const cacheRef = db.collection("razorpayPlans").doc(`${plan.id}_${cycle}`);
    const cache = await cacheRef.get();
    if (cache.exists && cache.data().razorpayPlanId) return cache.data().razorpayPlanId;
    const created = await razorpay.plans.create({
      period: cycle === "yearly" ? "yearly" : "monthly",
      interval: 1,
      item: { name: `${plan.name} (${cycle})`, amount: amountForPlan(plan, cycle) * 100, currency: "INR" },
    });
    await cacheRef.set({ razorpayPlanId: created.id, planId: plan.id, cycle, createdAt: nowIso() });
    return created.id;
  }

  router.post("/subscription/create", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      if (!razorpay) throw httpError(503, "Razorpay is not configured on the server");
      const { plan, cycle } = await getPlan(db, req.body.planId, req.body.cycle);
      const razorpayPlanId = await ensureRazorpayPlan(plan, cycle);
      const subscription = await razorpay.subscriptions.create({
        plan_id: razorpayPlanId,
        total_count: cycle === "yearly" ? 5 : 60,
        customer_notify: 1,
        notes: { kind: "codeskate_autopay" },
      });
      await db.collection("subscriptionIntents").doc(subscription.id).create({
        uid: req.authUser.uid,
        orgId: req.body.orgId,
        planId: plan.id,
        cycle,
        subscriptionId: subscription.id,
        status: "created",
        createdAt: nowIso(),
      });
      res.json({ subscriptionId: subscription.id, keyId: process.env.RAZORPAY_KEY_ID, planName: plan.name });
    } catch (error) {
      console.error("subscription/create:", error.message);
      res.status(error.status || 500).json({ error: error.message || "Could not create subscription" });
    }
  });

  router.post("/subscription/verify", requireAuth, async (req, res) => {
    try {
      const paymentId = req.body?.razorpay_payment_id;
      const subscriptionId = req.body?.razorpay_subscription_id;
      const signature = req.body?.razorpay_signature;
      const intentRef = db.collection("subscriptionIntents").doc(subscriptionId);
      const intentSnap = await intentRef.get();
      if (!intentSnap.exists) throw httpError(404, "Unknown subscription session");
      const intent = intentSnap.data();
      if (intent.uid !== req.authUser.uid) throw httpError(403, "Subscription session does not belong to this user");
      const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${paymentId}|${subscriptionId}`).digest("hex");
      if (!same(expected, signature)) throw httpError(400, "Subscription signature verification failed");
      const payment = await razorpay.payments.fetch(paymentId);
      if (payment.subscription_id !== subscriptionId || payment.status !== "captured") throw httpError(400, "Subscription payment is not captured");
      const { plan, cycle } = await getPlan(db, intent.planId, intent.cycle);
      const result = await applyPlan(intent.orgId, plan, cycle,
        { gateway: "razorpay-autopay", paymentId, subscriptionId },
        `razorpay_subscription_payment_${paymentId}`,
        { autopay: true, razorpaySubscriptionId: subscriptionId });
      await intentRef.set({ status: "verified", verifiedAt: nowIso() }, { merge: true });
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error("subscription/verify:", error.message);
      res.status(error.status || 500).json({ error: error.message || "Subscription verification failed" });
    }
  });

  router.post("/webhook/razorpay", async (req, res) => {
    let eventRef = null;
    try {
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
      const signature = req.headers["x-razorpay-signature"];
      if (!secret || !signature) return res.status(503).json({ error: "Razorpay webhook signing is not configured" });
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
      const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
      if (!same(expected, signature)) return res.status(400).json({ error: "Invalid webhook signature" });
      const event = JSON.parse(raw.toString("utf8") || "{}");
      const webhookId = req.headers["x-razorpay-event-id"] || crypto.createHash("sha256").update(raw).digest("hex");
      eventRef = db.collection("razorpayWebhookEvents").doc(safeDocId(webhookId));
      const claimed = await db.runTransaction(async (tx) => {
        const existing = await tx.get(eventRef);
        const now = Date.now();
        if (existing.exists) {
          const prior = existing.data();
          const stillProcessing = prior.status === "processing"
            && Number(prior.processingStartedAtMs || 0) > now - 5 * 60 * 1000;
          if (prior.status === "completed" || stillProcessing) return false;
          tx.set(eventRef, {
            status: "processing",
            processingStartedAtMs: now,
            receivedAt: nowIso(),
            retryCount: Number(prior.retryCount || 0) + 1,
            failure: null,
          }, { merge: true });
          return true;
        }
        tx.create(eventRef, {
          event: event.event || "unknown",
          receivedAt: nowIso(),
          processingStartedAtMs: now,
          retryCount: 0,
          status: "processing",
        });
        return true;
      });
      if (!claimed) return res.json({ ok: true, duplicate: true });

      const subscription = event.payload?.subscription?.entity;
      const subscriptionId = subscription?.id;
      const intentSnap = subscriptionId ? await db.collection("subscriptionIntents").doc(subscriptionId).get() : null;
      if (!intentSnap?.exists) throw httpError(400, "Webhook subscription is not recognized");
      const intent = intentSnap.data();
      if (event.event === "subscription.charged") {
        const { plan, cycle } = await getPlan(db, intent.planId, intent.cycle);
        const paymentId = event.payload?.payment?.entity?.id || `${subscriptionId}_${event.created_at || webhookId}`;
        await applyPlan(intent.orgId, plan, cycle,
          { gateway: "razorpay-autopay", paymentId, subscriptionId },
          `razorpay_subscription_payment_${paymentId}`,
          { autopay: true, razorpaySubscriptionId: subscriptionId });
      } else if (event.event === "subscription.halted" || event.event === "subscription.pending") {
        await db.collection("organizations").doc(intent.orgId).update({ subscriptionStatus: "past_due" });
      } else if (event.event === "subscription.cancelled" || event.event === "subscription.completed") {
        await db.collection("organizations").doc(intent.orgId).update({ autopay: false });
      }
      await eventRef.update({ status: "completed", completedAt: nowIso(), failure: null });
      res.json({ ok: true });
    } catch (error) {
      if (eventRef) {
        await eventRef.set({ status: "failed", failedAt: nowIso(), failure: error.message || "Unknown processing error" }, { merge: true })
          .catch((recordError) => console.error("Could not record webhook failure:", recordError.message));
      }
      console.error("razorpay/webhook:", error.message);
      res.status(error.status || 500).json({ error: "Webhook processing failed" });
    }
  });

  router.post("/subscription/cancel", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      const orgRef = db.collection("organizations").doc(req.body.orgId);
      const org = await orgRef.get();
      const subscriptionId = org.data()?.razorpaySubscriptionId;
      if (subscriptionId && razorpay) await razorpay.subscriptions.cancel(subscriptionId, { cancel_at_cycle_end: 1 });
      await orgRef.update({ autopay: false });
      await audit(req.body.orgId, "Autopay disabled by organization admin", { actorId: req.authUser.uid });
      res.json({ ok: true });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Could not cancel autopay" });
    }
  });

  // ----- controlled organization and team operations -----
  router.post("/subscription/schedule-downgrade", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      const { plan, cycle } = await getPlan(db, req.body.toPlanId, req.body.cycle);
      const orgRef = db.collection("organizations").doc(req.body.orgId);
      const org = await orgRef.get();
      if (!org.exists || !org.data().currentPeriodEndMs) throw httpError(400, "An active paid subscription is required to schedule a downgrade");
      await orgRef.update({ pendingPlanChange: { toPlanId: plan.id, cycle, scheduledBy: req.authUser.uid, scheduledAt: nowIso() } });
      await audit(req.body.orgId, `Downgrade scheduled to ${plan.name}`, { actorId: req.authUser.uid });
      res.json({ ok: true });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Could not schedule downgrade" });
    }
  });

  router.post("/subscription/cancel-downgrade", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      await db.collection("organizations").doc(req.body.orgId).update({ pendingPlanChange: null });
      await audit(req.body.orgId, "Scheduled downgrade cancelled", { actorId: req.authUser.uid });
      res.json({ ok: true });
    } catch (error) {
      res.status(error.status || 500).json({ error: "Could not cancel downgrade" });
    }
  });

  router.post("/team/claim-invites", requireAuth, async (req, res) => {
    try {
      const phone = req.authUser.phone_number;
      if (!phone) throw httpError(400, "A verified phone number is required");
      const invites = await db.collection("invites").where("phone", "==", phone).where("active", "==", true).get();
      const claimed = [];
      for (const inviteSnap of invites.docs) {
        const invite = inviteSnap.data();
        const membershipRef = db.collection("memberships").doc(`${req.authUser.uid}_${invite.orgId}`);
        const orgRef = db.collection("organizations").doc(invite.orgId);
        const result = await db.runTransaction(async (tx) => {
          const [freshInvite, existingMembership, orgSnap] = await Promise.all([
            tx.get(inviteSnap.ref),
            tx.get(membershipRef),
            tx.get(orgRef),
          ]);
          if (!freshInvite.exists || !freshInvite.data().active || !orgSnap.exists) return false;
          if (!existingMembership.exists) {
            tx.create(membershipRef, {
              uid: req.authUser.uid,
              orgId: invite.orgId,
              role: invite.role === "admin" ? "admin" : "employee",
              displayName: invite.displayName || "Member",
              email: invite.email || "",
              phone,
              active: true,
              invitedBy: invite.invitedBy || null,
              joinedAt: nowIso(),
              lastActiveAt: nowIso(),
            });
          } else if (!existingMembership.data().active) {
            // The invite already reserved a seat. Restore this verified user
            // without incrementing seatsUsed a second time.
            tx.update(membershipRef, { active: true, lastActiveAt: nowIso() });
          } else {
            // This invite targeted an already active member; release the
            // reserved seat because no membership is being added or restored.
            const org = orgSnap.data();
            tx.update(orgRef, { seatsUsed: Math.max(1, Number(org.seatsUsed || 1) - 1) });
          }
          tx.update(inviteSnap.ref, { active: false, claimed: true, claimedByUid: req.authUser.uid, claimedAt: nowIso() });
          tx.set(db.collection("users").doc(req.authUser.uid), {
            phone,
            displayName: invite.displayName || "Member",
            defaultOrgId: invite.orgId,
            lastLoginAt: nowIso(),
          }, { merge: true });
          return true;
        });
        if (result) claimed.push(invite.orgId);
      }
      res.json({ ok: true, claimedOrgIds: claimed });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Could not claim invitations" });
    }
  });

  router.post("/team/invite", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      const orgId = req.body.orgId;
      const phone = `+91${phoneKey(req.body.phone).slice(-10)}`;
      const displayName = String(req.body.name || "").trim();
      const role = TEAM_ROLES.has(req.body.role) ? req.body.role : "employee";
      if (phone.length !== 13 || !displayName) throw httpError(400, "A name and valid 10-digit phone number are required");
      const orgRef = db.collection("organizations").doc(orgId);
      const inviteRef = db.collection("invites").doc(`${phone}_${orgId}`);
      await db.runTransaction(async (tx) => {
        const [orgSnap, inviteSnap] = await Promise.all([tx.get(orgRef), tx.get(inviteRef)]);
        if (!orgSnap.exists) throw httpError(404, "Organization not found");
        const org = orgSnap.data();
        const trialValid = org.subscriptionStatus === "trialing" && (!org.trialEndsAtMs || org.trialEndsAtMs > Date.now());
        if (org.subscriptionStatus !== "active" && !trialValid) throw httpError(403, "Your subscription is not active");
        if (Number(org.seatsUsed || 0) >= Number(org.seatsLimit || 0)) throw httpError(409, "Seat limit reached");
        if (inviteSnap.exists && inviteSnap.data().active) throw httpError(409, "This number is already invited");
        tx.set(inviteRef, {
          phone,
          orgId,
          displayName,
          email: String(req.body.email || "").trim(),
          role,
          active: true,
          claimed: false,
          invitedBy: req.authUser.uid,
          createdAt: nowIso(),
        });
        tx.update(orgRef, { seatsUsed: Number(org.seatsUsed || 0) + 1 });
      });
      await audit(orgId, `Team member invited: ${displayName} (${role})`, { actorId: req.authUser.uid });
      res.json({ ok: true });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Could not invite team member" });
    }
  });

  router.post("/team/member-status", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      const { orgId, uid, active } = req.body;
      const orgRef = db.collection("organizations").doc(orgId);
      const memberRef = db.collection("memberships").doc(`${uid}_${orgId}`);
      await db.runTransaction(async (tx) => {
        const [orgSnap, memberSnap] = await Promise.all([tx.get(orgRef), tx.get(memberRef)]);
        if (!orgSnap.exists || !memberSnap.exists) throw httpError(404, "Team member not found");
        const member = memberSnap.data();
        const org = orgSnap.data();
        if (member.role === "owner") throw httpError(403, "An owner cannot be changed from this action");
        if (member.active === Boolean(active)) return;
        if (active && Number(org.seatsUsed || 0) >= Number(org.seatsLimit || 0)) throw httpError(409, "Seat limit reached");
        tx.update(memberRef, { active: Boolean(active), lastActiveAt: nowIso() });
        tx.update(orgRef, { seatsUsed: Math.max(1, Number(org.seatsUsed || 1) + (active ? 1 : -1)) });
      });
      await audit(orgId, `Team member ${active ? "activated" : "deactivated"}`, { actorId: req.authUser.uid, targetUid: uid });
      res.json({ ok: true });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Could not update team member" });
    }
  });

  router.post("/team/member-role", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      const { orgId, uid, role } = req.body;
      if (!TEAM_ROLES.has(role)) throw httpError(400, "Invalid team role");
      const memberRef = db.collection("memberships").doc(`${uid}_${orgId}`);
      const member = await memberRef.get();
      if (!member.exists || member.data().role === "owner") throw httpError(403, "This member role cannot be changed");
      await memberRef.update({ role });
      await audit(orgId, `Team member role changed to ${role}`, { actorId: req.authUser.uid, targetUid: uid });
      res.json({ ok: true });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Could not change team member role" });
    }
  });

  router.post("/leads/bulk-import", requireAuth, requireOrgAdmin, async (req, res) => {
    const { orgId, rows, assigner = "round-robin" } = req.body || {};
    const importId = safeDocId(req.body?.importId || crypto.randomUUID());
    const importRef = db.collection("leadImports").doc(importId);
    let canRecordFailure = false;
    try {
      if (!Array.isArray(rows) || rows.length === 0) throw httpError(400, "No leads were supplied");
      if (rows.length > 5000) throw httpError(400, "Import up to 5,000 leads at a time");
      const contentHash = crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
      const orgRef = db.collection("organizations").doc(orgId);
      const importState = await db.runTransaction(async (tx) => {
        const [orgSnap, importSnap] = await Promise.all([tx.get(orgRef), tx.get(importRef)]);
        if (!orgSnap.exists) throw httpError(404, "Organization not found");
        if (!subscriptionAllowsLeadCreation(orgSnap.data())) throw httpError(403, "An active subscription or trial is required to import leads");
        if (importSnap.exists) {
          const existing = importSnap.data();
          if (existing.orgId !== orgId || existing.uid !== req.authUser.uid || existing.contentHash !== contentHash) {
            throw httpError(409, "Import ID cannot be reused for different data");
          }
          return existing;
        }
        const initial = {
          orgId,
          uid: req.authUser.uid,
          contentHash,
          rowCount: rows.length,
          imported: 0,
          status: "processing",
          createdAt: nowIso(),
        };
        tx.create(importRef, initial);
        return initial;
      });
      if (importState.status === "completed") {
        return res.json({ ok: true, imported: Number(importState.imported || 0), replay: true, importId });
      }
      canRecordFailure = true;

      const employeesSnap = await db.collection("memberships").where("orgId", "==", orgId).where("active", "==", true).get();
      const employees = employeesSnap.docs.map((doc) => doc.data()).filter((member) => member.role === "employee");
      if (!employees.length) throw httpError(409, "No active employees are available for assignment");

      // Start workload assignment from existing *open* leads instead of an
      // artificial zero baseline. This favors the least-loaded employee.
      const workload = {};
      await Promise.all(employees.map(async (employee) => {
        const assigned = await orgRef.collection("leads").where("assignedTo", "==", employee.uid).get();
        workload[employee.uid] = assigned.docs.reduce((count, lead) => {
          const status = lead.data().status;
          return count + (["Closed-Won", "Lost", "Closed-Lost"].includes(status) ? 0 : 1);
        }, 0);
      }));

      let roundRobinIndex = 0;
      for (let start = 0; start < rows.length; start += 400) {
        const leads = rows.slice(start, start + 400).map((row, offset) => {
          let employee;
          if (assigner === "workload") {
            employee = employees.reduce((lowest, candidate) => workload[candidate.uid] < workload[lowest.uid] ? candidate : lowest, employees[0]);
            workload[employee.uid] += 1;
          } else {
            employee = employees[(roundRobinIndex++) % employees.length];
          }
          const createdAt = nowIso();
          return {
            ref: orgRef.collection("leads").doc(`import_${importId}_${start + offset}`),
            data: {
              name: row.name || row.Name || "Unknown",
              phone: row.phone || row.Phone || "",
              email: row.email || row.Email || "",
              source: row.source || row.Source || "Import",
              requirement: row.requirement || row.Requirement || "",
              status: "New",
              assignedTo: employee.uid,
              assignedToName: employee.displayName || null,
              blacklisted: false,
              priority: "Warm",
              createdAt,
              lastUpdated: createdAt,
              followUp: null,
              lastContactedAt: null,
              orgId,
              importId,
            },
          };
        });

        await db.runTransaction(async (tx) => {
          const [orgSnap, currentImportSnap] = await Promise.all([tx.get(orgRef), tx.get(importRef)]);
          if (!orgSnap.exists || !currentImportSnap.exists) throw httpError(404, "Import workspace no longer exists");
          if (!subscriptionAllowsLeadCreation(orgSnap.data())) throw httpError(403, "An active subscription or trial is required to import leads");
          const existingLeads = await Promise.all(leads.map((lead) => tx.get(lead.ref)));
          const newLeads = leads.filter((_, index) => !existingLeads[index].exists);
          const org = orgSnap.data();
          const limit = Number(org.leadsLimit || 0);
          const used = Number(org.leadsUsed || 0);
          if (limit > 0 && used + newLeads.length > limit) {
            throw httpError(409, `Lead limit reached. ${Math.max(0, limit - used)} lead slots remain.`);
          }
          newLeads.forEach((lead) => tx.create(lead.ref, lead.data));
          const currentImport = currentImportSnap.data();
          if (newLeads.length) tx.update(orgRef, { leadsUsed: used + newLeads.length });
          tx.update(importRef, {
            status: "processing",
            imported: Number(currentImport.imported || 0) + newLeads.length,
            lastBatchAt: nowIso(),
          });
        });
      }
      const completed = await db.runTransaction(async (tx) => {
        const importSnap = await tx.get(importRef);
        const imported = Number(importSnap.data()?.imported || 0);
        tx.update(importRef, { status: "completed", completedAt: nowIso() });
        return imported;
      });
      await audit(orgId, `${completed} leads imported`, { actorId: req.authUser.uid, importId });
      res.json({ ok: true, imported: completed, importId });
    } catch (error) {
      if (canRecordFailure) {
        await importRef.set({ status: "failed", failedAt: nowIso(), failure: error.message || "Import failed" }, { merge: true })
          .catch((recordError) => console.error("Could not record import failure:", recordError.message));
      }
      res.status(error.status || 500).json({ error: error.message || "Could not import leads", importId });
    }
  });

  router.post("/leads/reassign-bulk", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      const { orgId, fromEmployeeId, toEmployeeId, toEmployeeName } = req.body;
      const leads = await db.collection("organizations").doc(orgId).collection("leads").where("assignedTo", "==", fromEmployeeId).get();
      const open = leads.docs.filter((d) => !["Closed-Won", "Lost"].includes(d.data().status));
      for (let start = 0; start < open.length; start += 400) {
        const batch = db.batch();
        open.slice(start, start + 400).forEach((lead) => batch.update(lead.ref, {
          assignedTo: toEmployeeId,
          assignedToName: toEmployeeName || null,
          lastUpdated: nowIso(),
        }));
        await batch.commit();
      }
      await audit(orgId, `${open.length} open leads bulk reassigned`, { actorId: req.authUser.uid, fromEmployeeId, toEmployeeId });
      res.json({ ok: true, count: open.length });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Could not reassign leads" });
    }
  });

  // Platform owner actions retain an immutable server audit trail and always set
  // a real expiry instead of granting an open-ended active subscription.
  router.post("/platform/org-action", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const { orgId, action } = req.body;
      const orgRef = db.collection("organizations").doc(orgId);
      const orgSnap = await orgRef.get();
      if (!orgSnap.exists) throw httpError(404, "Organization not found");
      const org = orgSnap.data();
      if (action === "activate") {
        const { plan } = await getPlan(db, org.planId || "growth", "monthly");
        const endMs = Date.now() + 30 * DAY_MS;
        await orgRef.update({
          planId: plan.id,
          planName: plan.name,
          seatsLimit: plan.includedSeats,
          leadsLimit: plan.leadsLimit,
          subscriptionStatus: "active",
          billingCycle: "monthly",
          trialEndsAt: null,
          trialEndsAtMs: 0,
          currentPeriodEndMs: endMs,
          manualEntitlement: { reason: "platform_owner_activation", grantedBy: req.authUser.uid, grantedAt: nowIso() },
        });
        await audit(orgId, `Platform owner granted a 30-day ${plan.name} entitlement`, { actorId: req.authUser.uid });
        return res.json({ ok: true, message: `${plan.name} active until ${new Date(endMs).toLocaleDateString("en-IN")}` });
      }
      if (action === "trial") {
        const trialDays = await getTrialDays();
        const { plan } = await getPlan(db, org.planId || "starter", "monthly");
        const endMs = Date.now() + trialDays * DAY_MS;
        await orgRef.update({
          planId: plan.id,
          planName: plan.name,
          seatsLimit: plan.includedSeats,
          leadsLimit: plan.leadsLimit,
          subscriptionStatus: "trialing",
          trialEndsAt: new Date(endMs).toISOString(),
          trialEndsAtMs: endMs,
          currentPeriodEndMs: 0,
          manualEntitlement: { reason: "platform_owner_trial", grantedBy: req.authUser.uid, grantedAt: nowIso() },
        });
        await audit(orgId, `Platform owner started a ${trialDays}-day trial`, { actorId: req.authUser.uid });
        return res.json({ ok: true, message: `${trialDays}-day trial started` });
      }
      if (action === "join") {
        const membershipRef = db.collection("memberships").doc(`${req.authUser.uid}_${orgId}`);
        const userRecord = await getAuth().getUser(req.authUser.uid);
        await membershipRef.set({
          uid: req.authUser.uid,
          orgId,
          role: "owner",
          displayName: userRecord.displayName || "Platform Owner",
          phone: userRecord.phoneNumber || null,
          active: true,
          invitedBy: req.authUser.uid,
          joinedAt: nowIso(),
          lastActiveAt: nowIso(),
          platformGranted: true,
        }, { merge: true });
        await db.collection("users").doc(req.authUser.uid).set({ defaultOrgId: orgId, lastLoginAt: nowIso() }, { merge: true });
        await audit(orgId, "Platform owner joined workspace", { actorId: req.authUser.uid });
        return res.json({ ok: true, message: "Owner access granted" });
      }
      throw httpError(400, "Unsupported platform action");
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Platform action failed" });
    }
  });

  return router;
}
