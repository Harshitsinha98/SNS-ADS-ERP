/**
 * Multi-channel OTP service.
 *
 * Responsibilities:
 *  - Generate a numeric code and store only its SHA-256 hash (peppered) in
 *    Firestore `otpVerifications/{e164}` — the plaintext code never persists.
 *  - Enforce send rate-limits (cooldown + max sends per rolling window) and
 *    verify attempt-limits, so the endpoint can't be abused for spam or
 *    brute-force.
 *  - Deliver via the WhatsApp → SMS → Voice fallback chain.
 *
 * Security notes:
 *  - Codes are single-use and expire after `ttlSeconds`.
 *  - On too many wrong attempts the code is invalidated and a fresh send is
 *    required.
 *  - In non-production with no provider configured, the code is returned in
 *    the API response (`devCode`) purely so the flow is testable locally. This
 *    NEVER happens in production.
 */
import crypto from "crypto";
import { db } from "../bootstrap/firebase.js";
import { otpConfig } from "../config/env.js";
import { sendViaChannels } from "./otpChannels.js";
import { logger } from "../middleware/logger.js";

const COLLECTION = "otpVerifications";
const isProd = process.env.NODE_ENV === "production";

const toE164 = (phone) => "+91" + String(phone || "").replace(/\D/g, "").slice(-10);
const nowMs = () => Date.now();

function generateCode(length) {
  const max = 10 ** length;
  const n = crypto.randomInt(0, max);
  return String(n).padStart(length, "0");
}

function hashCode(code, e164) {
  return crypto
    .createHash("sha256")
    .update(`${code}:${e164}:${otpConfig.hashPepper}`)
    .digest("hex");
}

/**
 * Generate, persist and deliver an OTP.
 * @returns {Promise<{ ok, channel?, error?, retryAfter?, devCode? }>}
 */
export async function sendOtp(phone) {
  const e164 = toE164(phone);
  if (e164.length !== 13) return { ok: false, error: "Invalid phone number." };

  const ref = db.collection(COLLECTION).doc(e164);
  const snap = await ref.get();
  const prev = snap.exists ? snap.data() : null;

  // Rate limits ---------------------------------------------------------
  if (prev) {
    const sinceLast = (nowMs() - (prev.lastSentAtMs || 0)) / 1000;
    if (sinceLast < otpConfig.resendCooldownSeconds) {
      return {
        ok: false,
        error: "Please wait before requesting another code.",
        retryAfter: Math.ceil(otpConfig.resendCooldownSeconds - sinceLast),
      };
    }
    const windowStart = nowMs() - otpConfig.sendWindowSeconds * 1000;
    const recentSends = (prev.sendTimestamps || []).filter((t) => t > windowStart);
    if (recentSends.length >= otpConfig.maxSendsPerWindow) {
      return { ok: false, error: "Too many code requests. Please try again later." };
    }
  }

  // Generate + persist --------------------------------------------------
  const code = generateCode(otpConfig.codeLength);
  const expiresAtMs = nowMs() + otpConfig.ttlSeconds * 1000;
  const windowStart = nowMs() - otpConfig.sendWindowSeconds * 1000;
  const sendTimestamps = [...((prev?.sendTimestamps) || []).filter((t) => t > windowStart), nowMs()];

  // Deliver (or dev-fallback) ------------------------------------------
  let channel = null;
  if (otpConfig.enabled) {
    const result = await sendViaChannels(e164, code);
    if (!result.ok) {
      logger.error({ e164, tried: result.tried }, "All OTP channels failed");
      return { ok: false, error: "Could not send the verification code. Please try again." };
    }
    channel = result.channel;
  } else if (isProd) {
    return { ok: false, error: "OTP service is not configured." };
  } else {
    channel = "dev";
    logger.warn({ e164, code }, "OTP dev mode — no provider configured");
  }

  await ref.set({
    codeHash: hashCode(code, e164),
    expiresAtMs,
    attempts: 0,
    lastSentAtMs: nowMs(),
    sendTimestamps,
    lastChannel: channel,
    verified: false,
  });

  return {
    ok: true,
    channel,
    // Only surface the code locally for testing — never in production.
    ...(channel === "dev" ? { devCode: code } : {}),
  };
}

/**
 * Verify a submitted code.
 * @returns {Promise<{ ok, e164?, error? }>}
 */
export async function verifyOtp(phone, code) {
  const e164 = toE164(phone);
  const ref = db.collection(COLLECTION).doc(e164);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "No code found. Please request a new one." };

  const data = snap.data();
  if (data.verified) return { ok: false, error: "This code was already used. Request a new one." };
  if (nowMs() > data.expiresAtMs) return { ok: false, error: "Code expired. Please request a new one." };
  if ((data.attempts || 0) >= otpConfig.maxAttempts) {
    await ref.delete();
    return { ok: false, error: "Too many incorrect attempts. Please request a new code." };
  }

  const matches = hashCode(String(code || "").trim(), e164) === data.codeHash;
  if (!matches) {
    await ref.update({ attempts: (data.attempts || 0) + 1 });
    return { ok: false, error: "Incorrect code. Please check and try again." };
  }

  // Single-use: mark verified so the same code can't be replayed.
  await ref.update({ verified: true, verifiedAtMs: nowMs() });
  return { ok: true, e164 };
}
