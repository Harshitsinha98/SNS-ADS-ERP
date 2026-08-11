/**
 * Multi-channel OTP routes — all public (pre-authentication).
 *
 * These sit in front of login/signup, so they cannot require a Firebase ID
 * token. Abuse protection lives in the OTP service (send cooldown, per-window
 * send cap, and verify attempt cap) AND the IP-based rate limiter below.
 */
import { Router } from "express";
import { getOtpConfig, sendOtpHandler, verifyOtpHandler, plivoAnswerHandler } from "../../controllers/otp.controller.js";
import { createRateLimiter } from "../../middleware/rateLimiter.js";

// ── IP-based rate limiters (defense against distributed OTP spam) ──────
// These limit how many OTP operations a SINGLE IP can perform, regardless
// of how many different phone numbers it targets.
const otpSendLimiter = createRateLimiter({
  namespace: "otp-send",
  windowMs: 15 * 60_000,  // 15 minutes
  max: 50,                 // raised for testing (was 10); revert to 10 before going live
  message: "Too many OTP requests from this network. Please wait a few minutes.",
  blockMs: 60_000,         // block IP for 1 min after exceeding (was 5 min)
});

const otpVerifyLimiter = createRateLimiter({
  namespace: "otp-verify",
  windowMs: 15 * 60_000,
  max: 50,                 // raised for testing (was 15); revert to 15 before going live
  message: "Too many verification attempts from this network. Please wait.",
  blockMs: 60_000,         // was 5 min
});

// Plivo answer URL limiter — only Plivo should hit this; legitimate traffic
// is 1 request per outbound call we initiate (~5 calls/hour max per number).
const plivoAnswerLimiter = createRateLimiter({
  namespace: "plivo-answer",
  windowMs: 60_000,        // 1 minute
  max: 10,                 // max 10 per minute (very generous for legit use)
  message: "Rate limited.",
});

export function createOtpRoutes() {
  const router = Router();
  router.get("/config", getOtpConfig);
  router.post("/send", otpSendLimiter, sendOtpHandler);
  router.post("/verify", otpVerifyLimiter, verifyOtpHandler);
  // Plivo fetches this URL when the outbound call connects. Returns TTS XML.
  router.get("/plivo-answer", plivoAnswerLimiter, plivoAnswerHandler);
  return router;
}
