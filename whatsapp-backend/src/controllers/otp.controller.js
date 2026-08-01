/**
 * Multi-channel OTP controller.
 *
 * Flow:
 *   POST /api/v1/otp/send    { phone }          → delivers a code (WA→SMS→voice)
 *   POST /api/v1/otp/verify  { phone, code }    → returns a Firebase custom token
 *
 * The verify step is the important one: after a code checks out we resolve the
 * caller to a Firebase Auth user BY PHONE NUMBER and mint a custom token for
 * that exact uid. This preserves uid continuity for accounts that were
 * originally created via Firebase Phone Auth, so their existing memberships,
 * leads and data keep resolving. New numbers get a fresh Auth user created.
 *
 * `GET /api/v1/otp/config` lets the frontend discover whether multi-channel
 * OTP is live; when it isn't, the client transparently falls back to the
 * built-in Firebase Phone Auth flow.
 */
import { adminAuth } from "../bootstrap/firebase.js";
import { otpConfig } from "../config/env.js";
import { sendOtp, verifyOtp } from "../services/otpService.js";
import { logger } from "../middleware/logger.js";

export function getOtpConfig(req, res) {
  res.json({ enabled: otpConfig.enabled, channels: otpConfig.channelOrder });
}

export async function sendOtpHandler(req, res) {
  try {
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ error: "Phone number is required." });

    const result = await sendOtp(phone);
    if (!result.ok) {
      return res.status(result.retryAfter ? 429 : 400).json(result);
    }
    return res.json(result);
  } catch (e) {
    logger.error({ err: e.message }, "OTP send handler error");
    return res.status(500).json({ error: "Could not send verification code." });
  }
}

export async function verifyOtpHandler(req, res) {
  try {
    const { phone, code } = req.body || {};
    if (!phone || !code) return res.status(400).json({ error: "Phone and code are required." });

    const result = await verifyOtp(phone, code);
    if (!result.ok) return res.status(400).json(result);

    const e164 = result.e164;

    // Resolve to an existing Auth user by phone to keep the uid stable; create
    // one if this is a brand-new number.
    let userRecord = await adminAuth.getUserByPhoneNumber(e164).catch(() => null);
    if (!userRecord) {
      userRecord = await adminAuth.createUser({ phoneNumber: e164 });
    }

    const customToken = await adminAuth.createCustomToken(userRecord.uid, { phone: e164 });
    return res.json({ ok: true, token: customToken, uid: userRecord.uid });
  } catch (e) {
    logger.error({ err: e.message }, "OTP verify handler error");
    return res.status(500).json({ error: "Could not verify code." });
  }
}
