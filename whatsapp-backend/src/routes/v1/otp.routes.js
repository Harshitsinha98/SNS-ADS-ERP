/**
 * Multi-channel OTP routes — all public (pre-authentication).
 *
 * These sit in front of login/signup, so they cannot require a Firebase ID
 * token. Abuse protection lives in the OTP service (send cooldown, per-window
 * send cap, and verify attempt cap).
 */
import { Router } from "express";
import { getOtpConfig, sendOtpHandler, verifyOtpHandler } from "../../controllers/otp.controller.js";

export function createOtpRoutes() {
  const router = Router();
  router.get("/config", getOtpConfig);
  router.post("/send", sendOtpHandler);
  router.post("/verify", verifyOtpHandler);
  return router;
}
