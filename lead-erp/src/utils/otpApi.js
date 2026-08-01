/**
 * Frontend client for the multi-channel OTP backend (WhatsApp → SMS → Voice).
 *
 * These endpoints are public (pre-auth), so no Firebase token is attached.
 * When the backend reports the feature is not configured, callers fall back
 * to Firebase Phone Auth (handled in AuthContext).
 */
const BASE = import.meta.env.VITE_BACKEND_URL || "";

async function postJson(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

/** Is multi-channel OTP live on the backend? Cached after first check. */
let _configCache;
export async function getOtpConfig() {
  if (_configCache !== undefined) return _configCache;
  try {
    const res = await fetch(`${BASE}/api/v1/otp/config`);
    _configCache = res.ok ? await res.json() : { enabled: false };
  } catch {
    _configCache = { enabled: false };
  }
  return _configCache;
}

export async function sendOtpRequest(phone) {
  const { ok, data } = await postJson("/api/v1/otp/send", { phone });
  if (!ok) return { ok: false, error: data.error || "Could not send code.", retryAfter: data.retryAfter };
  return { ok: true, channel: data.channel, devCode: data.devCode };
}

export async function verifyOtpRequest(phone, code) {
  const { ok, data } = await postJson("/api/v1/otp/verify", { phone, code });
  if (!ok) return { ok: false, error: data.error || "Verification failed." };
  return { ok: true, token: data.token };
}
