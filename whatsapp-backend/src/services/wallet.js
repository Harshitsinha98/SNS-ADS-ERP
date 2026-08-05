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
    return { bridgeMinutes: 0, aiMinutes: 0, totalSpentInr: 0 };
  }
  const data = snap.data();
  return {
    bridgeMinutes: data.balanceMinutes || data.bridgeMinutes || 0,
    aiMinutes: data.aiMinutes || 0,
    totalSpentInr: data.totalSpentInr || 0,
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
export async function createWalletOrder({ orgId, packId }) {
  const pack = PACKS[packId];
  if (!pack) throw Object.assign(new Error("Invalid pack"), { status: 400 });

  // Plan gate — verify org is on a plan that allows this pack
  const orgSnap = await db.collection("organizations").doc(orgId).get();
  if (!orgSnap.exists) throw Object.assign(new Error("Organization not found"), { status: 404 });
  const orgPlanId = orgSnap.data().planId || "starter";
  if (!pack.requiredPlans.has(orgPlanId)) {
    const planNames = [...pack.requiredPlans].map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(", ");
    throw Object.assign(
      new Error(`Voice wallet top-up requires a ${planNames} plan. Please upgrade.`),
      { status: 403, code: "plan_required" }
    );
  }

  const rzp = await getRazorpay();
  if (!rzp) throw Object.assign(new Error("Razorpay is not configured"), { status: 503 });

  const amountPaise = pack.price * 100;
  const receiptId = `wallet_${orgId}_${Date.now()}`;

  const order = await rzp.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: receiptId,
    notes: { orgId, packId, type: "wallet_topup" },
  });

  // Persist an intent for idempotent verification
  await db.collection("walletIntents").doc(order.id).set({
    orderId: order.id,
    orgId,
    packId,
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
// VERIFY PAYMENT & CREDIT MINUTES
// ─────────────────────────────────────────────────────────────────────────────
export async function verifyAndCreditWallet({
  orgId,
  packId,
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
}) {
  const pack = PACKS[packId];
  if (!pack) throw Object.assign(new Error("Invalid pack"), { status: 400 });

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

  // 2. Fetch intent (idempotency check)
  const intentRef = db.collection("walletIntents").doc(razorpay_order_id);
  const intentSnap = await intentRef.get();
  if (!intentSnap.exists) throw Object.assign(new Error("Payment session not found"), { status: 404 });
  const intent = intentSnap.data();
  if (intent.status === "completed") {
    return { alreadyApplied: true, minutes: pack.minutes };
  }
  if (intent.orgId !== orgId || intent.packId !== packId) {
    throw Object.assign(new Error("Payment session mismatch"), { status: 403 });
  }

  // 3. Credit minutes atomically
  const walletRef = db.collection("voiceWallets").doc(orgId);
  const txnRef = db.collection("walletTransactions").doc();

  await db.runTransaction(async (tx) => {
    const walletSnap = await tx.get(walletRef);
    const wallet = walletSnap.exists ? walletSnap.data() : { bridgeMinutes: 0, balanceMinutes: 0, aiMinutes: 0, totalSpentInr: 0 };

    // Bridge pack adds to both balanceMinutes (legacy compat) and bridgeMinutes
    const updates = { orgId };
    if (pack.field === "bridgeMinutes") {
      updates.balanceMinutes = (wallet.balanceMinutes || 0) + pack.minutes;
      updates.bridgeMinutes = (wallet.bridgeMinutes || 0) + pack.minutes;
    } else {
      updates[pack.field] = (wallet[pack.field] || 0) + pack.minutes;
    }
    updates.lastToppedUpAt = nowIso();

    tx.set(walletRef, updates, { merge: true });

    // Record the transaction
    tx.create(txnRef, {
      orgId,
      type: "topup",
      packId,
      packName: pack.name,
      minutes: pack.minutes,
      amountInr: pack.price,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      description: `Top-up: ${pack.name} (+${pack.minutes} mins)`,
      createdAt: nowIso(),
      timestamp: Date.now(),
    });

    // Mark intent complete
    tx.update(intentRef, { status: "completed", completedAt: nowIso(), paymentId: razorpay_payment_id });
  });

  logger.info({ orgId, packId, minutes: pack.minutes, paymentId: razorpay_payment_id }, "Wallet top-up successful");
  return { alreadyApplied: false, minutes: pack.minutes };
}
