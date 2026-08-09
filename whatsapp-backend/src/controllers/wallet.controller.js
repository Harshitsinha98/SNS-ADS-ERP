/**
 * Wallet controller — request handlers for Voice Wallet endpoints.
 *
 * Routes:
 *   GET  /api/wallet/balance?orgId=...       → getBalance
 *   GET  /api/wallet/transactions?orgId=...  → getTransactions
 *   POST /api/wallet/order                   → createOrder
 *   POST /api/wallet/verify                  → verifyPayment
 */

import {
  getWalletBalance,
  getWalletTransactions,
  createWalletOrder,
  verifyAndCreditWallet,
} from "../services/wallet.js";
import { isOrgAdmin } from "../middleware/auth.js";

// ── GET /balance ──
export async function getBalance(req, res) {
  try {
    const orgId = req.query.orgId;
    if (!orgId) return res.status(400).json({ error: "orgId is required" });

    // Verify caller is an admin of this org
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }

    const balance = await getWalletBalance(orgId);
    return res.json(balance);
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || "Failed to fetch balance" });
  }
}

// ── GET /transactions ──
export async function getTransactions(req, res) {
  try {
    const orgId = req.query.orgId;
    if (!orgId) return res.status(400).json({ error: "orgId is required" });

    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }

    const transactions = await getWalletTransactions(orgId);
    return res.json({ transactions });
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || "Failed to fetch transactions" });
  }
}

// ── POST /order ──
export async function createOrder(req, res) {
  try {
    const { orgId, packId, amountInr } = req.body;
    if (!orgId || (!packId && !amountInr)) return res.status(400).json({ error: "orgId and an amount are required" });

    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }

    const order = await createWalletOrder({ orgId, packId, amountInr });
    return res.json(order);
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || "Failed to create order" });
  }
}

// ── POST /verify ──
export async function verifyPayment(req, res) {
  try {
    const { orgId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!orgId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing required payment verification fields" });
    }

    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }

    const result = await verifyAndCreditWallet({
      orgId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });

    return res.json({ ok: true, ...result });
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || "Payment verification failed" });
  }
}
