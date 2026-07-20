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
  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`);
    Object.assign(error, data, { status: res.status });
    throw error;
  }
  return data;
}

async function authedGet(path) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`);
    Object.assign(error, data, { status: res.status });
    throw error;
  }
  return data;
}

export async function getAccountStatus(phone) {
  const res = await fetch(`${BASE}/api/billing/account-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Could not check account (${res.status})`);
    Object.assign(error, data, { status: res.status });
    throw error;
  }
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

// ---- autopay (Razorpay Subscriptions — Option A) ----
export const createSubscription = (body) => authedPost("/api/billing/subscription/create", body);
export const verifySubscription = (body) => authedPost("/api/billing/subscription/verify", body);
export const cancelAutopay = (body) => authedPost("/api/billing/subscription/cancel", body);

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


// ---- secured workspace, team, lead, and platform operations ----
export const provisionTrialWorkspace = (body) => authedPost("/api/billing/trial/provision", body);
export const claimTeamInvites = () => authedPost("/api/billing/team/claim-invites", {});
export const inviteTeamMember = (body) => authedPost("/api/billing/team/invite", body);
export const setTeamMemberStatus = (body) => authedPost("/api/billing/team/member-status", body);
export const setTeamMemberRole = (body) => authedPost("/api/billing/team/member-role", body);
export const schedulePlanDowngrade = (body) => authedPost("/api/billing/subscription/schedule-downgrade", body);
export const cancelPlanDowngrade = (body) => authedPost("/api/billing/subscription/cancel-downgrade", body);
export const importBulkLeads = (body) => authedPost("/api/billing/leads/bulk-import", body);
export const createManualLead = (body) => authedPost("/api/leads/manual", body);
export const rotateWebsiteLeadIntakeKey = (body) => authedPost("/api/leads/website-key", body);
export const getWebsiteLeadIntegration = (orgId) => authedGet(`/api/leads/integrations?orgId=${encodeURIComponent(orgId)}`);
export const createWebsiteLeadIntegration = (body) => authedPost("/api/leads/integrations", body);
export const reassignBulkLeads = (body) => authedPost("/api/billing/leads/reassign-bulk", body);
export const platformOrgAction = (body) => authedPost("/api/billing/platform/org-action", body);
export const triggerWhatsAppSync = (body) => authedPost("/api/whatsapp/sync-now", body);
export const getWhatsAppConnection = (body) => authedPost("/api/whatsapp/status", body);
export const connectWhatsAppBusiness = (body) => authedPost("/api/whatsapp/connect", body);
export const disconnectWhatsAppBusiness = (body) => authedPost("/api/whatsapp/disconnect", body);
export const repairWhatsAppWebhook = (body) => authedPost("/api/whatsapp/repair-webhook", body);
export const sendWhatsAppMessage = (body) => authedPost("/api/whatsapp/messages", body);
