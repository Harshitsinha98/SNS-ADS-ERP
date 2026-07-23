/**
 * AI Customer Care API client.
 *
 * Calls /api/v1/ai/* endpoints for org-admin AI configuration,
 * knowledge base management, test playground, and usage analytics.
 */

import { auth } from "../firebase";

const BASE = import.meta.env.VITE_BACKEND_URL || "";

async function aiGet(path) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), data, { status: res.status });
  return data;
}

async function aiPost(path, body) {
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

async function aiPatch(path, body) {
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

async function aiDelete(path) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), data, { status: res.status });
  return data;
}

// ── Configuration ──
export const getAIConfig = (orgId) => aiGet(`/api/v1/ai/config?orgId=${orgId}`);
export const saveAIConfig = (orgId, updates) => aiPatch("/api/v1/ai/config", { orgId, ...updates });

// ── Knowledge Base ──
export const listKnowledgeBase = (orgId) => aiGet(`/api/v1/ai/knowledge-base?orgId=${orgId}`);
export const getKnowledgeStats = (orgId) => aiGet(`/api/v1/ai/knowledge-base/stats?orgId=${orgId}`);
export const createArticle = (orgId, article) => aiPost("/api/v1/ai/knowledge-base", { orgId, ...article });
export const updateArticle = (orgId, articleId, updates) => aiPatch(`/api/v1/ai/knowledge-base/${articleId}`, { orgId, ...updates });
export const deleteArticle = (orgId, articleId) => aiDelete(`/api/v1/ai/knowledge-base/${articleId}?orgId=${orgId}`);
export const bulkImportArticles = (orgId, articles) => aiPost("/api/v1/ai/knowledge-base/bulk-import", { orgId, articles });

// ── Test Playground ──
export const testAI = (orgId, message) => aiPost("/api/v1/ai/test", { orgId, message });

// ── Usage Stats ──
export const getAIUsage = (orgId, days = 30) => aiGet(`/api/v1/ai/usage?orgId=${orgId}&days=${days}`);

// ── Platform AI Stats ──
export const getPlatformAIUsage = (days = 30) => aiGet(`/api/v1/ai/platform-usage?days=${days}`);
