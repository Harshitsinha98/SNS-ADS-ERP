/**
 * Frontend client for the Bridge Call API.
 */
import { auth } from "../firebase";

const BASE = import.meta.env.VITE_BACKEND_URL || "";

async function authPost(path, body) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

export async function initiateBridgeCall({ orgId, leadId, leadPhone, leadName }) {
  const { ok, data } = await authPost("/api/v1/bridge-call/initiate", { orgId, leadId, leadPhone, leadName });
  if (!ok) return { ok: false, error: data.error || "Could not start call.", code: data.code };
  return { ok: true, callId: data.callId, walletBalance: data.walletBalance };
}

export async function pollBridgeCallStatus(callId) {
  const { ok, data } = await authPost("/api/v1/bridge-call/poll", { callId });
  return ok ? data : null;
}

export function watchBridgeCall(callId, onUpdate, intervalMs = 3000) {
  let stopped = false;
  const terminal = new Set(["completed", "wallet-deducted", "failed", "no-answer", "agent_no_confirm", "customer_voicemail"]);
  const poll = async () => {
    if (stopped) return;
    const result = await pollBridgeCallStatus(callId);
    if (result && onUpdate) onUpdate(result);
    if (result && terminal.has(result.status)) return;
    if (!stopped) setTimeout(poll, intervalMs);
  };
  poll();
  return () => { stopped = true; };
}
