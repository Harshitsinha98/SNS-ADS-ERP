// Frontend helpers to talk to the backend Workflow Automation Engine routes.
// Mirrors the authedPost/authedGet convention already established in
// billingApi.js — every call attaches the current user's Firebase ID token,
// and errors are normalized into `Error` instances carrying `.status`.

import { auth } from "../firebase";

const BASE = import.meta.env.VITE_BACKEND_URL || "";

async function authedRequest(method, path, body) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`);
    Object.assign(error, data, { status: res.status });
    throw error;
  }
  return data;
}

const authedPost = (path, body) => authedRequest("POST", path, body);
const authedGet = (path) => authedRequest("GET", path);
const authedPatch = (path, body) => authedRequest("PATCH", path, body);

// ---- Workflow CRUD ----
export const createWorkflow = (body) => authedPost("/api/v1/workflows", body);
export const listWorkflows = (orgId) => authedGet(`/api/v1/workflows?orgId=${encodeURIComponent(orgId)}`);
export const getWorkflow = (orgId, workflowId) =>
  authedGet(`/api/v1/workflows/${encodeURIComponent(workflowId)}?orgId=${encodeURIComponent(orgId)}`);
export const updateWorkflowMeta = (workflowId, body) =>
  authedPatch(`/api/v1/workflows/${encodeURIComponent(workflowId)}`, body);
export const setWorkflowStatus = (workflowId, body) =>
  authedPost(`/api/v1/workflows/${encodeURIComponent(workflowId)}/status`, body);

// ---- Versioning ----
export const saveWorkflowDraft = (workflowId, body) =>
  authedPost(`/api/v1/workflows/${encodeURIComponent(workflowId)}/draft`, body);
export const publishWorkflow = (workflowId, body) =>
  authedPost(`/api/v1/workflows/${encodeURIComponent(workflowId)}/publish`, body);
export const rollbackWorkflow = (workflowId, body) =>
  authedPost(`/api/v1/workflows/${encodeURIComponent(workflowId)}/rollback`, body);

// ---- Test run & run history ----
export const testRunWorkflow = (workflowId, body) =>
  authedPost(`/api/v1/workflows/${encodeURIComponent(workflowId)}/test-run`, body);
export const listWorkflowRuns = (orgId, workflowId, cursor = null) =>
  authedGet(
    `/api/v1/workflows/${encodeURIComponent(workflowId)}/runs?orgId=${encodeURIComponent(orgId)}` +
    (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "")
  );

// ---- Tickets (minimal, backing the Ticket Closed trigger) ----
export const createTicket = (body) => authedPost("/api/v1/tickets", body);
export const listTickets = (orgId, status = null) =>
  authedGet(`/api/v1/tickets?orgId=${encodeURIComponent(orgId)}${status ? `&status=${encodeURIComponent(status)}` : ""}`);
export const closeTicket = (ticketId, body) =>
  authedPost(`/api/v1/tickets/${encodeURIComponent(ticketId)}/close`, body);
