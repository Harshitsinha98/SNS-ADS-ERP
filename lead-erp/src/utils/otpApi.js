/**
 * Frontend client for the multi-channel OTP backend (WhatsApp → SMS → Voice).
 *
 * These endpoints are public (pre-auth), so no Firebase token is attached.
 * When the backend reports the feature is not configured, callers fall back
 * to Firebase Phone Auth (handled in AuthContext).
 *
 * NATIVE (Capacitor) NOTE:
 * On Android/iOS the WebView origin is `https://localhost`, which browser CORS
 * treats as cross-origin against the API host. To avoid CORS entirely on the
 * native app we route these specific OTP calls through Capacitor's native HTTP
 * (`CapacitorHttp`), which is not subject to browser CORS. We do this ONLY for
 * OTP requests and deliberately DO NOT enable the global fetch patch — that
 * would intercept Firebase's fetch/XHR and break Firestore realtime listeners.
 */
import { Capacitor, CapacitorHttp } from "@capacitor/core";

const BASE = import.meta.env.VITE_BACKEND_URL || "https://api.codeskate.com";
const isNative = Capacitor.isNativePlatform();

// GET helper — native uses CapacitorHttp (no CORS), web uses fetch.
async function getJson(path) {
  if (isNative) {
    const res = await CapacitorHttp.get({
      url: `${BASE}${path}`,
      headers: { "Content-Type": "application/json" },
    });
    const ok = res.status >= 200 && res.status < 300;
    const data = typeof res.data === "string" ? safeParse(res.data) : (res.data || {});
    return { status: res.status, ok, data };
  }
  const res = await fetch(`${BASE}${path}`);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

// POST helper — native uses CapacitorHttp (no CORS), web uses fetch.
async function postJson(path, body) {
  if (isNative) {
    const res = await CapacitorHttp.post({
      url: `${BASE}${path}`,
      headers: { "Content-Type": "application/json" },
      data: body,
    });
    const ok = res.status >= 200 && res.status < 300;
    const data = typeof res.data === "string" ? safeParse(res.data) : (res.data || {});
    return { status: res.status, ok, data };
  }
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

function safeParse(str) {
  try { return JSON.parse(str); } catch { return {}; }
}

/** Is multi-channel OTP live on the backend? Cached after first check. */
let _configCache;
export async function getOtpConfig() {
  if (_configCache !== undefined) return _configCache;
  try {
    const { ok, data } = await getJson("/api/v1/otp/config");
    _configCache = ok ? data : { enabled: false };
  } catch {
    _configCache = { enabled: false };
  }
  return _configCache;
}

export async function sendOtpRequest(phone, channel) {
  // `channel` ("whatsapp"|"sms"|"voice") forces a specific delivery channel
  // for user-requested fallbacks; omit it to use the default fallback chain.
  const body = channel ? { phone, channel } : { phone };
  const { ok, data } = await postJson("/api/v1/otp/send", body);
  if (!ok) return { ok: false, error: data.error || "Could not send code.", retryAfter: data.retryAfter };
  return { ok: true, channel: data.channel, devCode: data.devCode };
}

export async function verifyOtpRequest(phone, code) {
  const { ok, data } = await postJson("/api/v1/otp/verify", { phone, code });
  if (!ok) return { ok: false, error: data.error || "Verification failed." };
  return { ok: true, token: data.token };
}
