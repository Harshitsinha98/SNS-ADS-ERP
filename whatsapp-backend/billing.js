// Payment / billing routes for CodeSkate — Razorpay (popup) + PayU (redirect).
//
// SECURITY:
// - All secrets (RAZORPAY_KEY_SECRET, PAYU_SALT) live only in backend env.
// - Every request is authenticated with a Firebase ID token and the caller
//   must be an owner/admin of the org being upgraded.
// - The org's plan/limits are updated with the Admin SDK (bypasses rules)
//   ONLY after a payment signature is verified — clients can never self-upgrade.

import express from "express";
import crypto from "crypto";
import { getAuth } from "firebase-admin/auth";
import { getMergedPlans, amountForPlan } from "./plans.js";

let Razorpay = null;
try {
  Razorpay = (await import("razorpay")).default;
} catch {
  console.warn("⚠️  'razorpay' package not installed — Razorpay routes disabled until `npm i razorpay`.");
}

export default function createBillingRouter(db) {
  const router = express.Router();

  const rzpEnabled = Razorpay && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET;
  const razorpay = rzpEnabled
    ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
    : null;

  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
  const PUBLIC_BACKEND_URL = process.env.PUBLIC_BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;

  // ---- auth helpers ----
  async function requireAuth(req, res, next) {
    try {
      const h = req.headers.authorization || "";
      const token = h.startsWith("Bearer ") ? h.slice(7) : null;
      if (!token) return res.status(401).json({ error: "Missing auth token" });
      const decoded = await getAuth().verifyIdToken(token);
      req.uid = decoded.uid;
      next();
    } catch {
      res.status(401).json({ error: "Invalid auth token" });
    }
  }

  async function isOrgAdmin(uid, orgId) {
    if (!uid || !orgId) return false;
    const mem = await db.collection("memberships").doc(`${uid}_${orgId}`).get();
    if (!mem.exists) return false;
    const d = mem.data();
    return d.active === true && (d.role === "owner" || d.role === "admin");
  }

  // Apply a paid plan to an org (Admin SDK — the only place limits get raised).
  // If the org already has a period in the future (renewing early), the new
  // period EXTENDS from that end date instead of resetting from today.
  // extra = { autopay?, razorpaySubscriptionId? } merged onto the org.
  async function applyPlan(orgId, plan, cycle, meta, extra = {}) {
    const periodDays = cycle === "yearly" ? 365 : 30;
    const amount = amountForPlan(plan, cycle);
    const now = Date.now();

    const orgSnap = await db.collection("organizations").doc(orgId).get();
    const cur = orgSnap.exists ? (orgSnap.data().currentPeriodEndMs || 0) : 0;
    const base = cur > now ? cur : now; // extend if still active
    const newPeriodEndMs = base + periodDays * 86400000;

    await db.collection("organizations").doc(orgId).update({
      planId: plan.id,
      planName: plan.name,
      seatsLimit: plan.includedSeats,
      leadsLimit: plan.leadsLimit,
      subscriptionStatus: "active",
      billingCycle: cycle,
      trialEndsAt: null,
      trialEndsAtMs: 0,
      currentPeriodEndMs: newPeriodEndMs,
      // a fresh payment clears any scheduled downgrade / cancel / reminder flag
      pendingPlanChange: null,
      cancelAtPeriodEnd: false,
      renewalRemindedFor: null,
      lastPayment: { ...meta, amount, cycle, at: new Date().toISOString() },
      ...extra,
    });
    await db.collection("organizations").doc(orgId).collection("activity").add({
      text: `💳 Payment received — ${plan.name} plan (${cycle}) via ${meta.gateway}. Valid till ${new Date(newPeriodEndMs).toLocaleDateString("en-IN")}`,
      at: new Date().toISOString(),
      orgId,
    });
    await db.collection("organizations").doc(orgId).collection("invoices").add({
      amount, currency: "INR", plan: plan.name, cycle,
      gateway: meta.gateway, reference: meta.paymentId || meta.mihpayid || meta.subscriptionId || null,
      status: "paid", at: new Date().toISOString(), orgId,
    });
  }

  // ============================================================
  // Which gateways are configured (frontend uses this to show buttons)
  // ============================================================
  router.get("/config", (req, res) => {
    res.json({
      razorpay: !!rzpEnabled,
      razorpayKeyId: rzpEnabled ? process.env.RAZORPAY_KEY_ID : null,
      payu: !!(process.env.PAYU_KEY && process.env.PAYU_SALT),
    });
  });

  // ============================================================
  // RAZORPAY — create order
  // ============================================================
  router.post("/razorpay/order", requireAuth, async (req, res) => {
    try {
      const { orgId, planId, cycle = "monthly" } = req.body;
      if (!razorpay) return res.status(500).json({ error: "Razorpay not configured on server" });
      if (!(await isOrgAdmin(req.uid, orgId))) return res.status(403).json({ error: "Not an admin of this org" });

      const plans = await getMergedPlans(db);
      const plan = plans[planId] || plans.growth;
      const amountPaise = amountForPlan(plan, cycle) * 100;

      const order = await razorpay.orders.create({
        amount: amountPaise,
        currency: "INR",
        receipt: `up_${orgId}_${Date.now()}`.slice(0, 40),
        notes: { orgId, planId: plan.id, cycle },
      });

      res.json({
        orderId: order.id,
        amount: amountPaise,
        currency: "INR",
        keyId: process.env.RAZORPAY_KEY_ID,
        planName: plan.name,
      });
    } catch (e) {
      console.error("razorpay/order error:", e?.message);
      res.status(500).json({ error: "Could not create order" });
    }
  });

  // ============================================================
  // RAZORPAY — verify payment + activate plan
  // ============================================================
  router.post("/razorpay/verify", requireAuth, async (req, res) => {
    try {
      const { orgId, planId, cycle = "monthly", razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
      if (!(await isOrgAdmin(req.uid, orgId))) return res.status(403).json({ error: "Not an admin of this org" });

      const expected = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      if (expected !== razorpay_signature) {
        return res.status(400).json({ error: "Payment signature verification failed" });
      }

      const plans = await getMergedPlans(db);
      const plan = plans[planId] || plans.growth;
      await applyPlan(orgId, plan, cycle, { gateway: "razorpay", paymentId: razorpay_payment_id });

      res.json({ ok: true, planName: plan.name, seatsLimit: plan.includedSeats, leadsLimit: plan.leadsLimit });
    } catch (e) {
      console.error("razorpay/verify error:", e?.message);
      res.status(500).json({ error: "Verification failed" });
    }
  });

  // ============================================================
  // PAYU — generate request hash (frontend then POSTs a form to PayU)
  // ============================================================
  router.post("/payu/hash", requireAuth, async (req, res) => {
    try {
      const { orgId, planId, cycle = "monthly", firstname = "Customer", email = "customer@example.com", phone = "9999999999" } = req.body;
      const key = process.env.PAYU_KEY, salt = process.env.PAYU_SALT;
      if (!key || !salt) return res.status(500).json({ error: "PayU not configured on server" });
      if (!(await isOrgAdmin(req.uid, orgId))) return res.status(403).json({ error: "Not an admin of this org" });

      const plans = await getMergedPlans(db);
      const plan = plans[planId] || plans.growth;
      const amount = `${amountForPlan(plan, cycle)}.00`;
      const productinfo = `${plan.name}-${cycle}`;
      const txnid = `CS${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const udf1 = orgId, udf2 = plan.id, udf3 = cycle, udf4 = "", udf5 = "";

      const hashStr = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${salt}`;
      const hash = crypto.createHash("sha512").update(hashStr).digest("hex");

      res.json({
        action: process.env.PAYU_MODE === "live" ? "https://secure.payu.in/_payment" : "https://test.payu.in/_payment",
        params: {
          key, txnid, amount, productinfo, firstname, email, phone,
          udf1, udf2, udf3, hash,
          surl: `${PUBLIC_BACKEND_URL}/api/billing/payu/callback`,
          furl: `${PUBLIC_BACKEND_URL}/api/billing/payu/callback`,
        },
      });
    } catch (e) {
      console.error("payu/hash error:", e?.message);
      res.status(500).json({ error: "Could not create PayU request" });
    }
  });

  // ============================================================
  // PAYU — callback (PayU POSTs form-encoded here after payment)
  // Handles BOTH in-app upgrades and paid SIGNUPS (via pendingSignups).
  // ============================================================
  router.post("/payu/callback", express.urlencoded({ extended: true }), async (req, res) => {
    try {
      const key = process.env.PAYU_KEY, salt = process.env.PAYU_SALT;
      const b = req.body;
      const { status, txnid, amount, productinfo, firstname, email, udf1, udf2, udf3, hash } = b;

      // reverse hash
      const revStr = `${salt}|${status}||||||${b.udf5 || ""}|${b.udf4 || ""}|${udf3 || ""}|${udf2 || ""}|${udf1 || ""}|${email}|${firstname}|${productinfo}|${amount}|${txnid}|${key}`;
      const expected = crypto.createHash("sha512").update(revStr).digest("hex");
      const ok = expected === hash && status === "success";

      // Is this a paid-signup transaction?
      const pendingRef = db.collection("pendingSignups").doc(String(txnid));
      const pendingSnap = await pendingRef.get();

      if (ok && pendingSnap.exists) {
        const s = pendingSnap.data();
        const plans = await getMergedPlans(db);
        const plan = plans[s.planId] || plans.growth;
        const orgId = await provisionWorkspace({
          uid: s.uid, phone: s.phone, orgName: s.orgName, fullName: s.fullName,
          plan, cycle: s.cycle || "monthly", paymentMeta: { gateway: "payu", mihpayid: b.mihpayid },
        });
        await pendingRef.delete().catch(() => {});
        return res.redirect(`${FRONTEND_URL}/login?paid=1&org=${orgId}`);
      }

      if (ok) {
        const plans = await getMergedPlans(db);
        const plan = plans[udf2] || plans.growth;
        await applyPlan(udf1, plan, udf3 || "monthly", { gateway: "payu", mihpayid: b.mihpayid });
      } else {
        console.warn("PayU callback rejected:", { status, hashMatch: expected === hash });
      }

      res.redirect(`${FRONTEND_URL}/admin/billing?payu=${ok ? "success" : "failed"}`);
    } catch (e) {
      console.error("payu/callback error:", e?.message);
      res.redirect(`${FRONTEND_URL}/admin/billing?payu=error`);
    }
  });

  // ============================================================
  // SIGNUP: provision a NEW workspace only AFTER a verified payment.
  // Used by Growth/Enterprise (paid) signups and Starter "Pay now".
  // ============================================================
  const SIGNUP_STATUSES = ["New", "Ringing", "Meeting Fixed", "Negotiation", "Follow-up", "Closed-Won", "Lost"];

  async function provisionWorkspace({ uid, phone, orgName, fullName, plan, cycle, paymentMeta }) {
    const orgId = `org_${Date.now()}`;
    const periodDays = cycle === "yearly" ? 365 : 30;
    const amount = amountForPlan(plan, cycle);
    const nowIso = new Date().toISOString();

    await db.collection("organizations").doc(orgId).set({
      name: orgName,
      slug: String(orgName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      createdAt: nowIso, createdBy: uid, ownerPhone: phone || null,
      planId: plan.id, planName: plan.name,
      seatsUsed: 1, seatsLimit: plan.includedSeats,
      leadsUsed: 0, leadsLimit: plan.leadsLimit,
      subscriptionStatus: "active",
      trialEndsAt: null, trialEndsAtMs: 0,
      currentPeriodEndMs: Date.now() + periodDays * 86400000,
      lastPayment: { ...paymentMeta, amount, cycle, at: nowIso },
    });
    await db.collection("users").doc(uid).set(
      { phone: phone || null, displayName: fullName, defaultOrgId: orgId, createdAt: nowIso, lastLoginAt: nowIso },
      { merge: true }
    );
    await db.collection("memberships").doc(`${uid}_${orgId}`).set({
      uid, orgId, role: "owner", displayName: fullName, phone: phone || null,
      active: true, invitedBy: uid, joinedAt: nowIso, lastActiveAt: nowIso,
    });
    await db.collection("organizations").doc(orgId).collection("settings").doc("config")
      .set({ statuses: SIGNUP_STATUSES, autoAssign: "round-robin" });
    await db.collection("organizations").doc(orgId).collection("meta").doc("leadAssignment")
      .set({ lastIndex: 0 });
    await db.collection("organizations").doc(orgId).collection("activity").add({
      text: `💳 ${fullName} created ${orgName} on the ${plan.name} plan (${cycle}, paid via ${paymentMeta.gateway})`,
      at: nowIso, orgId,
    });
    await db.collection("organizations").doc(orgId).collection("invoices").add({
      amount, currency: "INR", plan: plan.name, cycle,
      gateway: paymentMeta.gateway, reference: paymentMeta.paymentId || paymentMeta.mihpayid || null,
      status: "paid", at: nowIso, orgId,
    });
    return orgId;
  }

  // Razorpay: create order for a paid signup (no org yet).
  router.post("/signup/order", requireAuth, async (req, res) => {
    try {
      const { planId, cycle = "monthly" } = req.body;
      if (!razorpay) return res.status(500).json({ error: "Razorpay not configured on server" });
      const plans = await getMergedPlans(db);
      const plan = plans[planId] || plans.growth;
      const amountPaise = amountForPlan(plan, cycle) * 100;
      const order = await razorpay.orders.create({
        amount: amountPaise, currency: "INR",
        receipt: `su_${req.uid}_${Date.now()}`.slice(0, 40),
        notes: { uid: req.uid, planId: plan.id, cycle, kind: "signup" },
      });
      res.json({ orderId: order.id, amount: amountPaise, currency: "INR", keyId: process.env.RAZORPAY_KEY_ID, planName: plan.name });
    } catch (e) {
      console.error("signup/order error:", e?.message);
      res.status(500).json({ error: "Could not create order" });
    }
  });

  // Razorpay: verify a paid signup and provision the workspace.
  router.post("/signup/verify", requireAuth, async (req, res) => {
    try {
      const { orgName, fullName, planId, cycle = "monthly", razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
      if (!orgName || !fullName) return res.status(400).json({ error: "Missing organization details" });

      const expected = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");
      if (expected !== razorpay_signature) return res.status(400).json({ error: "Payment signature verification failed" });

      let phone = null;
      try { phone = (await getAuth().getUser(req.uid)).phoneNumber; } catch {}

      const plans = await getMergedPlans(db);
      const plan = plans[planId] || plans.growth;
      const orgId = await provisionWorkspace({
        uid: req.uid, phone, orgName: orgName.trim(), fullName: fullName.trim(),
        plan, cycle, paymentMeta: { gateway: "razorpay", paymentId: razorpay_payment_id },
      });
      res.json({ ok: true, orgId, planName: plan.name });
    } catch (e) {
      console.error("signup/verify error:", e?.message);
      res.status(500).json({ error: "Verification/provisioning failed" });
    }
  });

  // PayU: create a pending paid-signup + return the form to POST to PayU.
  router.post("/signup/payu/hash", requireAuth, async (req, res) => {
    try {
      const { orgName, fullName, planId, cycle = "monthly", email = "customer@codeskate.app" } = req.body;
      const key = process.env.PAYU_KEY, salt = process.env.PAYU_SALT;
      if (!key || !salt) return res.status(500).json({ error: "PayU not configured on server" });
      if (!orgName || !fullName) return res.status(400).json({ error: "Missing organization details" });

      let phone = null;
      try { phone = (await getAuth().getUser(req.uid)).phoneNumber; } catch {}

      const plans = await getMergedPlans(db);
      const plan = plans[planId] || plans.growth;
      const amount = `${amountForPlan(plan, cycle)}.00`;
      const productinfo = `${plan.name}-${cycle}-signup`;
      const txnid = `SU${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const firstname = fullName.trim();
      const udf1 = "signup", udf2 = plan.id, udf3 = cycle, udf4 = "", udf5 = "";

      // stash the signup details so the callback can provision after payment
      await db.collection("pendingSignups").doc(txnid).set({
        uid: req.uid, phone, orgName: orgName.trim(), fullName: firstname,
        planId: plan.id, cycle, createdAt: new Date().toISOString(),
      });

      const hashStr = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${salt}`;
      const hash = crypto.createHash("sha512").update(hashStr).digest("hex");

      res.json({
        action: process.env.PAYU_MODE === "live" ? "https://secure.payu.in/_payment" : "https://test.payu.in/_payment",
        params: {
          key, txnid, amount, productinfo, firstname, email, phone: (phone || "").replace("+91", ""),
          udf1, udf2, udf3, hash,
          surl: `${PUBLIC_BACKEND_URL}/api/billing/payu/callback`,
          furl: `${PUBLIC_BACKEND_URL}/api/billing/payu/callback`,
        },
      });
    } catch (e) {
      console.error("signup/payu/hash error:", e?.message);
      res.status(500).json({ error: "Could not create PayU signup request" });
    }
  });

  // ============================================================
  // OPTION A — Razorpay Subscriptions (auto-recurring / autopay)
  // ============================================================
  async function ensureRazorpayPlan(plan, cycle) {
    const cacheId = `${plan.id}_${cycle}`;
    const ref = db.collection("razorpayPlans").doc(cacheId);
    const snap = await ref.get();
    if (snap.exists && snap.data().razorpayPlanId) return snap.data().razorpayPlanId;
    const rp = await razorpay.plans.create({
      period: cycle === "yearly" ? "yearly" : "monthly",
      interval: 1,
      item: { name: `${plan.name} (${cycle})`, amount: amountForPlan(plan, cycle) * 100, currency: "INR" },
    });
    await ref.set({ razorpayPlanId: rp.id, planId: plan.id, cycle, createdAt: new Date().toISOString() });
    return rp.id;
  }

  // Create a subscription (customer will authorise autopay in checkout).
  router.post("/subscription/create", requireAuth, async (req, res) => {
    try {
      const { orgId, planId, cycle = "monthly" } = req.body;
      if (!razorpay) return res.status(500).json({ error: "Razorpay not configured on server" });
      if (!(await isOrgAdmin(req.uid, orgId))) return res.status(403).json({ error: "Not an admin of this org" });
      const plans = await getMergedPlans(db);
      const plan = plans[planId] || plans.growth;
      const rpPlanId = await ensureRazorpayPlan(plan, cycle);
      const sub = await razorpay.subscriptions.create({
        plan_id: rpPlanId,
        total_count: cycle === "yearly" ? 5 : 60,
        customer_notify: 1,
        notes: { orgId, planId: plan.id, cycle },
      });
      res.json({ subscriptionId: sub.id, keyId: process.env.RAZORPAY_KEY_ID, planName: plan.name });
    } catch (e) {
      console.error("subscription/create error:", e?.message);
      res.status(500).json({ error: "Could not create subscription" });
    }
  });

  // Verify the first subscription payment + enable autopay on the org.
  router.post("/subscription/verify", requireAuth, async (req, res) => {
    try {
      const { orgId, planId, cycle = "monthly", razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body;
      if (!(await isOrgAdmin(req.uid, orgId))) return res.status(403).json({ error: "Not an admin of this org" });
      const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_payment_id}|${razorpay_subscription_id}`).digest("hex");
      if (expected !== razorpay_signature) return res.status(400).json({ error: "Signature verification failed" });
      const plans = await getMergedPlans(db);
      const plan = plans[planId] || plans.growth;
      await applyPlan(orgId, plan, cycle,
        { gateway: "razorpay-autopay", paymentId: razorpay_payment_id, subscriptionId: razorpay_subscription_id },
        { autopay: true, razorpaySubscriptionId: razorpay_subscription_id });
      res.json({ ok: true, planName: plan.name });
    } catch (e) {
      console.error("subscription/verify error:", e?.message);
      res.status(500).json({ error: "Verification failed" });
    }
  });

  // Recurring webhook — Razorpay calls this every cycle (and on failures).
  router.post("/webhook/razorpay", async (req, res) => {
    try {
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
      const signature = req.headers["x-razorpay-signature"];
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
      if (secret && signature) {
        const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
        if (expected !== signature) { console.warn("razorpay webhook: bad signature"); return res.status(400).json({ error: "bad signature" }); }
      }
      const event = JSON.parse(raw.toString() || "{}");
      const sub = event.payload?.subscription?.entity;
      const orgId = sub?.notes?.orgId;
      if (orgId) {
        const plans = await getMergedPlans(db);
        const plan = plans[sub.notes.planId] || plans.growth;
        const cycle = sub.notes.cycle || "monthly";
        if (event.event === "subscription.charged") {
          await applyPlan(orgId, plan, cycle, { gateway: "razorpay-autopay", subscriptionId: sub.id }, { autopay: true, razorpaySubscriptionId: sub.id });
        } else if (event.event === "subscription.halted" || event.event === "subscription.pending") {
          await db.collection("organizations").doc(orgId).update({ subscriptionStatus: "past_due" });
        } else if (event.event === "subscription.cancelled" || event.event === "subscription.completed") {
          await db.collection("organizations").doc(orgId).update({ autopay: false });
        }
      }
      res.json({ ok: true });
    } catch (e) {
      console.error("razorpay webhook error:", e?.message);
      res.status(200).json({ ok: false });
    }
  });

  // Cancel autopay (stop future auto-charges; current period stays active).
  router.post("/subscription/cancel", requireAuth, async (req, res) => {
    try {
      const { orgId } = req.body;
      if (!(await isOrgAdmin(req.uid, orgId))) return res.status(403).json({ error: "Not an admin of this org" });
      const orgSnap = await db.collection("organizations").doc(orgId).get();
      const subId = orgSnap.data()?.razorpaySubscriptionId;
      if (subId && razorpay) { try { await razorpay.subscriptions.cancel(subId, { cancel_at_cycle_end: 1 }); } catch (e) { console.warn("rzp cancel:", e?.message); } }
      await db.collection("organizations").doc(orgId).update({ autopay: false });
      res.json({ ok: true });
    } catch (e) {
      console.error("subscription/cancel error:", e?.message);
      res.status(500).json({ error: "Could not cancel autopay" });
    }
  });

  return router;
}
