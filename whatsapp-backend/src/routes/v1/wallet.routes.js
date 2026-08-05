/**
 * Wallet routes — prepaid voice wallet top-up via Razorpay.
 *
 * Endpoints:
 *   GET  /balance?orgId=...       — current balance (bridge + AI minutes)
 *   GET  /transactions?orgId=...  — transaction history (credits & debits)
 *   POST /order                   — create Razorpay order for a pack
 *   POST /verify                  — verify payment & credit minutes
 *
 * All endpoints require Firebase auth (Bearer token).
 * Org admin access is checked inside each controller.
 */

import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getBalance, getTransactions, createOrder, verifyPayment } from "../../controllers/wallet.controller.js";

export function createWalletRoutes() {
  const router = Router();

  router.get("/balance", requireAuth, getBalance);
  router.get("/transactions", requireAuth, getTransactions);
  router.post("/order", requireAuth, createOrder);
  router.post("/verify", requireAuth, verifyPayment);

  return router;
}
