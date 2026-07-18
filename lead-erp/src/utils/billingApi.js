// Frontend helpers to talk to the backend billing routes.
// The backend base URL comes from VITE_BACKEND_URL (same var used for the
// WhatsApp sync). Every authed call attaches the Firebase ID token.

import { auth } from "../firebase";

const BASE = import.meta.env.VITE_BACKEND_URL || "";

async function authedPost(path, body) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function getBillingConfig() {
  try {
    const res = await fetch(`${BASE}/api/billing/config`);
    if (!res.ok) return { razorpay: false, payu: false };
    return await res.json();
  } catch {
    return { razorpay: false, payu: false };
  }
}

export const createRazorpayOrder = (body) => authedPost("/api/billing/razorpay/order", body);
export const verifyRazorpayPayment = (body) => authedPost("/api/billing/razorpay/verify", body);
export const getPayuHash = (body) => authedPost("/api/billing/payu/hash", body);

// ---- paid SIGNUP (no org yet — backend provisions after payment) ----
export const createSignupOrder = (body) => authedPost("/api/billing/signup/order", body);
export const verifySignupPayment = (body) => authedPost("/api/billing/signup/verify", body);
export const getSignupPayuHash = (body) => authedPost("/api/billing/signup/payu/hash", body);

// ---- checkout helpers ----

export function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

// Build + auto-submit a hidden form to PayU (redirect-based flow).
export function submitPayuForm(action, params) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  Object.entries(params).forEach(([k, v]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = k;
    input.value = v ?? "";
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}
