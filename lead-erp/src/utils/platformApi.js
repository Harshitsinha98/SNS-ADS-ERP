/**
 * Platform Console API client.
 *
 * ARCHITECTURAL DECISION: This is the frontend API layer for the Platform
 * Owner Console. It follows the exact same authedPost/authedGet pattern as
 * billingApi.js but calls /api/v1/platform/* endpoints which are guarded by
 * the requirePlatformAdmin middleware on the backend.
 *
 * All heavy operations (cross-org analytics, audit log queries, feature flag
 * toggles) go through the backend to avoid expensive client-side Firestore
 * scans and to enforce platform-admin-only access at the API level.
 */

import { auth } from "../firebase";

const BASE = import.meta.env.VITE_BACKEND_URL || "";

async function platformPost(path, body) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), data, { status: res.status });
  return data;
}

async function platformGet(path) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), data, { status: res.status });
  return data;
}

async function platformPatch(path, body) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), data, { status: res.status });
  return data;
}

// ── Executive Dashboard ──
export const getPlatformStats = () => platformGet("/api/v1/platform/stats");
export const getRevenueTimeline = (range = "30d") => platformGet(`/api/v1/platform/revenue?range=${range}`);

// ── Organization Management ──
export const listOrganizations = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return platformGet(`/api/v1/platform/organizations?${qs}`);
};
export const getOrganizationDetail = (orgId) => platformGet(`/api/v1/platform/organizations/${orgId}`);
export const performOrgAction = (orgId, action, params = {}) =>
  platformPost(`/api/v1/platform/organizations/${orgId}/action`, { action, ...params });
export const bulkOrgAction = (orgIds, action) =>
  platformPost("/api/v1/platform/organizations/bulk-action", { orgIds, action });

// ── Subscription & Billing ──
export const getBillingOverview = () => platformGet("/api/v1/platform/billing/overview");
export const listPayments = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return platformGet(`/api/v1/platform/billing/payments?${qs}`);
};
export const exportBillingReport = (range) => platformPost("/api/v1/platform/billing/export", { range });

// ── Customer Success ──
export const getHealthScores = () => platformGet("/api/v1/platform/customer-success/scores");
export const getChurnRisk = () => platformGet("/api/v1/platform/customer-success/churn-risk");
export const getOnboardingFunnel = () => platformGet("/api/v1/platform/customer-success/onboarding");

// ── Platform Analytics ──
export const getUsageAnalytics = (range = "30d") => platformGet(`/api/v1/platform/analytics/usage?range=${range}`);
export const getGrowthMetrics = (range = "30d") => platformGet(`/api/v1/platform/analytics/growth?range=${range}`);

// ── Infrastructure ──
export const getSystemHealth = () => platformGet("/api/v1/platform/infrastructure/health");
export const getErrorRates = (range = "24h") => platformGet(`/api/v1/platform/infrastructure/errors?range=${range}`);
export const getFirestoreMetrics = () => platformGet("/api/v1/platform/infrastructure/firestore");

// ── WhatsApp Operations ──
export const getWhatsAppOverview = () => platformGet("/api/v1/platform/whatsapp/overview");
export const listWhatsAppConnections = () => platformGet("/api/v1/platform/whatsapp/connections");
export const getMessageVolume = (range = "7d") => platformGet(`/api/v1/platform/whatsapp/volume?range=${range}`);

// ── AI Usage & Cost ──
export const getAiUsageOverview = () => platformGet("/api/v1/platform/ai/overview");
export const getAiCostBreakdown = (range = "30d") => platformGet(`/api/v1/platform/ai/costs?range=${range}`);

// ── Audit Logs ──
export const listAuditLogs = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return platformGet(`/api/v1/platform/audit-logs?${qs}`);
};
export const exportAuditLogs = (params) => platformPost("/api/v1/platform/audit-logs/export", params);

// ── Feature Flags ──
export const listFeatureFlags = () => platformGet("/api/v1/platform/feature-flags");
export const toggleFeatureFlag = (flagId, enabled) =>
  platformPatch(`/api/v1/platform/feature-flags/${flagId}`, { enabled });
export const createFeatureFlag = (body) => platformPost("/api/v1/platform/feature-flags", body);

// ── Platform Settings ──
export const getPlatformSettings = () => platformGet("/api/v1/platform/settings");
export const updatePlatformSettings = (patch) => platformPatch("/api/v1/platform/settings", patch);

// ── Support Center ──
export const listSupportTickets = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return platformGet(`/api/v1/platform/support/tickets?${qs}`);
};
export const getSupportTicket = (ticketId) => platformGet(`/api/v1/platform/support/tickets/${ticketId}`);
export const updateSupportTicket = (ticketId, body) =>
  platformPatch(`/api/v1/platform/support/tickets/${ticketId}`, body);
