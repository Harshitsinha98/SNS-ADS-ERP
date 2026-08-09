/**
 * Voice Wallet Service — balance, transactions, top-up order creation & credit.
 *
 * Firestore collections:
 *   - voiceWallets/{orgId}        — balance doc (bridgeMinutes, aiMinutes, totalSpentInr)
 *   - walletTransactions/{txnId}  — individual credit/debit records
 *
 * The existing bridgeCall.js deducts from voiceWallets/{orgId}.balanceMinutes
 * (bridge calls). This service adds the top-up (credit) side and introduces
 * a separate aiMinutes field for AI Voice Bot packs.
 */

import crypto from "crypto";
import { db } from "../bootstrap/firebase.js";
import { razorpayConfig } from "../config/env.js";
import { logger } from "../middleware/logger.js";

const nowIso = () => new Date().toISOString();

// ── Unified rupee wallet ──────────────────────────────────────────────────
// The wallet is now a single rupee balance (`balanceInr`). All usage — bridge
// calls, number rent, and (future) AI voice — deducts rupees at its own rate.
// Legacy minute balances are folded into rupees once via migrateWalletToInr().
const LEGACY_BRIDGE_MIN_RATE = 2.20; // ₹ value of a legacy bridge minute
const LEGACY_AI_MIN_RATE = 8;        // ₹ value of a legacy AI minute (₹3999/500)
const MIN_TOPUP_INR = 100;
const WALLET_PLANS = new Set(["growth", "enterprise", "enterprise_plus"]);

/**
 * One-time, idempotent migration: fold any legacy minute balances into the
 * rupee balance (`balanceInr`) and mark the wallet migrated. Safe to call on
 * every balance read / deduction — it no-ops after the first run.
 */
export async function migrateWalletToInr(orgId) {
  const ref = db.collection("voiceWallets").doc(orgId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { balanceInr: 0 };
    const data = snap.data();
    if (data.migratedToInr) return data;

    const legacyBridge = Number(data.balanceMinutes ?? data.bridgeMinutes ?? 0);
    const legacyAi = Number(data.aiMinutes || 0);
    const addInr = legacyBridge * LEGACY_BRIDGE_MIN_RATE + legacyAi * LEGACY_AI_MIN_RATE;

    const update = {
      balanceInr: Number(data.balanceInr || 0) + addInr,
      balanceMinutes: 0, bridgeMinutes: 0, aiMinutes: 0,
      migratedToInr: true, migratedAt: nowIso(),
    };
    tx.set(ref, update, { merge: true });

    if (addInr > 0) {
      const txnRef = db.collection("walletTransactions").doc();
      tx.create(txnRef, {
        orgId, type: "credit", packId: "balance_migration", packName: "Balance migration",
        minutes: 0, amountInr: addInr,
        description: `Converted ${legacyBridge} bridge + ${legacyAi} AI mins to ₹${Math.round(addInr)} wallet balance`,
        createdAt: nowIso(), timestamp: Date.now(),
      });
    }
    return { ...data, ...update };
  });
}

// ── Pack definitions (must stay in sync with frontend plans.js ADD_ONS) ──
const PACKS = {
  voice_bridge_pack: {
    id: "voice_bridge_pack",
    name: "Bridge Call Wallet",
    price: 1999,        // INR
    minutes: 1000,
    field: "bridgeMinutes",
    requiredPlans: new Set(["growth", "enterprise", "enterprise_plus"]),
  },
  voice_ai_pack: {
    id: "voice_ai_pack",
    name: "AI Voice Bot Wallet",
    price: 3999,
    minutes: 500,
    field: "aiMinutes",
    requiredPlans: new Set(["enterprise", "enterprise_plus"]),
  },
};

// ── Razorpay (lazy init) ──
let razorpay = null;
async function getRazorpay() {
  if (razorpay) return razorpay;
  if (!razorpayConfig.enabled) return null;
  try {
    const Razorpay = (await import("razorpay")).default;
    razorpay = new Razorpay({ key_id: razorpayConfig.keyId, key_secret: razorpayConfig.keySecret });
    return razorpay;
  } catch {
    logger.warn("razorpay package not available — wallet top-up disabled");
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET BALANCE
// ─────────────────────────────────────────────────────────────────────────────
export async function getWalletBalance(orgId) {
  const snap = await db.collection("voiceWallets").doc(orgId).get();
  if (!snap.exists) {
    return { balanceInr: 0, totalSpentInr: 0, bridgeMinutes: 0, aiMinutes: 0 };
  }
  // Fold any legacy minutes into the rupee balance (idempotent, one-time).
  const data = await migrateWalletToInr(orgId);
  return {
    balanceInr: Number(data.balanceInr || 0),
    totalSpentInr: Number(data.totalSpentInr || 0),
    // Legacy fields kept for backward-compat; always 0 post-migration.
    bridgeMinutes: 0,
    aiMinutes: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET TRANSACTIONS
// ─────────────────────────────────────────────────────────────────────────────
export async function getWalletTransactions(orgId, limit = 50) {
  const snap = await db
    .collection("walletTransactions")
    .where("orgId", "==", orgId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE RAZORPAY ORDER (top-up)
// ─────────────────────────────────────────────────────────────────────────────
export async function createWalletOrder({ orgId, packId, amountInr }) {
  // Unified money top-up. `amountInr` is the rupee amount the customer wants to
  // add. (Legacy packId still supported — resolves to that pack's price.)
  let amount = Number(amountInr);
  if (!amount && packId && PACKS[packId]) amount = PACKS[packId].price;
  amount = Math.round(amount);
  if (!amount || amount < MIN_TOPUP_INR) {
    throw Object.assign(new Error(`Minimum top-up is ₹${MIN_TOPUP_INR}.`), { status: 400 });
  }

  // Plan gate — the Voice Wallet is a Growth+ feature.
  const orgSnap = await db.collection("organizations").doc(orgId).get();
  if (!orgSnap.exists) throw Object.assign(new Error("Organization not found"), { status: 404 });
  const orgPlanId = orgSnap.data().planId || "starter";
  if (!WALLET_PLANS.has(orgPlanId)) {
    throw Object.assign(
      new Error("Voice Wallet top-up requires a Growth plan or above. Please upgrade."),
      { status: 403, code: "plan_required" }
    );
  }

  const rzp = await getRazorpay();
  if (!rzp) throw Object.assign(new Error("Razorpay is not configured"), { status: 503 });

  const amountPaise = amount * 100;
  const receiptId = `wallet_${orgId}_${Date.now()}`;

  const order = await rzp.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: receiptId,
    notes: { orgId, type: "wallet_topup" },
  });

  // Persist an intent for idempotent verification (rupee amount is source of truth)
  await db.collection("walletIntents").doc(order.id).set({
    orderId: order.id,
    orgId,
    amountInr: amount,
    amountPaise,
    status: "created",
    createdAt: nowIso(),
  });

  return {
    orderId: order.id,
    amount: amountPaise,
    currency: "INR",
    keyId: razorpayConfig.keyId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VERIFY PAYMENT & CREDIT RUPEE BALANCE
// ─────────────────────────────────────────────────────────────────────────────
export async function verifyAndCreditWallet({
  orgId,
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
}) {
  // 1. Verify HMAC signature
  const expectedSig = crypto
    .createHmac("sha256", razorpayConfig.keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  const sigBuffer = Buffer.from(String(razorpay_signature || ""));
  const expBuffer = Buffer.from(expectedSig);
  if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
    throw Object.assign(new Error("Payment signature verification failed"), { status: 400 });
  }

  // 2. Fetch intent (idempotency + amount source of truth)
  const intentRef = db.collection("walletIntents").doc(razorpay_order_id);
  const intentSnap = await intentRef.get();
  if (!intentSnap.exists) throw Object.assign(new Error("Payment session not found"), { status: 404 });
  const intent = intentSnap.data();
  const creditInr = Number(intent.amountInr || (intent.amountPaise ? intent.amountPaise / 100 : 0));
  if (intent.status === "completed") {
    return { alreadyApplied: true, amountInr: creditInr };
  }
  if (intent.orgId !== orgId) {
    throw Object.assign(new Error("Payment session mismatch"), { status: 403 });
  }

  // 3. Credit rupee balance atomically
  const walletRef = db.collection("voiceWallets").doc(orgId);
  const txnRef = db.collection("walletTransactions").doc();

  await db.runTransaction(async (tx) => {
    const walletSnap = await tx.get(walletRef);
    const wallet = walletSnap.exists ? walletSnap.data() : {};

    tx.set(walletRef, {
      orgId,
      balanceInr: Number(wallet.balanceInr || 0) + creditInr,
      migratedToInr: true, // new top-ups are already rupee-native
      lastToppedUpAt: nowIso(),
    }, { merge: true });

    tx.create(txnRef, {
      orgId,
      type: "topup",
      packId: "wallet_topup",
      packName: "Wallet Top-up",
      minutes: 0,
      amountInr: creditInr,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      description: `Wallet top-up (+₹${Math.round(creditInr)})`,
      createdAt: nowIso(),
      timestamp: Date.now(),
    });

    tx.update(intentRef, { status: "completed", completedAt: nowIso(), paymentId: razorpay_payment_id });
  });

  logger.info({ orgId, creditInr, paymentId: razorpay_payment_id }, "Wallet top-up successful");
  return { alreadyApplied: false, amountInr: creditInr };
}
