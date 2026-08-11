/**
 * Chat Session API client.
 *
 * Calls /api/v1/chat-sessions/* endpoints for human takeover,
 * session management, and session-bounded message access.
 */

import { auth } from "../firebase";

const BASE = import.meta.env.VITE_BACKEND_URL || "https://api.codeskate.com";

async function sessionPost(path, body) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), data);
  return data;
}

async function sessionGet(path) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), data);
  return data;
}

// Actions
export const takeOverLead = (orgId, leadId, reason) =>
  sessionPost("/api/v1/chat-sessions/takeover", { orgId, leadId, reason });

export const resolveSession = (orgId, leadId, sessionId, summary) =>
  sessionPost("/api/v1/chat-sessions/resolve", { orgId, leadId, sessionId, summary });

export const reassignSession = (orgId, leadId, newEmployeeId, newEmployeeName) =>
  sessionPost("/api/v1/chat-sessions/reassign", { orgId, leadId, newEmployeeId, newEmployeeName });

export const reEnableAI = (orgId, leadId) =>
  sessionPost("/api/v1/chat-sessions/re-enable-ai", { orgId, leadId });

// Team Inbox actions
export const claimConversation = (orgId, leadId) =>
  sessionPost("/api/v1/chat-sessions/claim", { orgId, leadId });

export const releaseConversation = (orgId, leadId, summary) =>
  sessionPost("/api/v1/chat-sessions/release", { orgId, leadId, summary });

export const markConversationRead = (orgId, leadId) =>
  sessionPost("/api/v1/chat-sessions/mark-read", { orgId, leadId });

export const rebuildInbox = (orgId) =>
  sessionPost("/api/v1/chat-sessions/rebuild-index", { orgId });

// Queries
export const getActiveSession = (orgId, leadId) =>
  sessionGet(`/api/v1/chat-sessions/active?orgId=${orgId}&leadId=${leadId}`);

export const getSessionMessages = (orgId, leadId, sessionId) =>
  sessionGet(`/api/v1/chat-sessions/messages?orgId=${orgId}&leadId=${leadId}&sessionId=${sessionId}`);

export const getSessionHistory = (orgId, leadId) =>
  sessionGet(`/api/v1/chat-sessions/history?orgId=${orgId}&leadId=${leadId}`);
