/**
 * Bridge Call service — Plivo two-leg call bridging.
 *
 * Flow:
 *   1. Backend initiates outbound call to EMPLOYEE's phone (Leg A).
 *   2. When employee picks up, Plivo fetches the "answer URL" from our backend.
 *   3. Answer URL returns Plivo XML that dials the LEAD's number (Leg B).
 *   4. Both parties are connected — neither sees the other's real number.
 *   5. On hangup, Plivo POSTs call status + recording URL to our webhook.
 *   6. Backend stores the call record and deducts wallet minutes.
 */

import crypto from "crypto";
import { db } from "../bootstrap/firebase.js";
import { bridgeCallConfig } from "../config/env.js";
import { logger } from "../middleware/logger.js";
import { nowIso, orgCollection } from "./helpers.js";

const toDigits = (phone) => String(phone || "").replace(/\D/g, "");

/**
 * Fetch a single call leg's actual duration (seconds) from Plivo's CDR API.
 * Used when webhooks don't include the B-leg (customer) talk duration.
 * Best-effort: returns 0 on any failure.
 */
async function fetchPlivoCallDuration(callUuid) {
  if (!callUuid) return 0;
  try {
    const auth = Buffer.from(
      `${bridgeCallConfig.plivoAuthId}:${bridgeCallConfig.plivoAuthToken}`
    ).toString("base64");
    const res = await fetch(
      `https://api.plivo.com/v1/Account/${bridgeCallConfig.plivoAuthId}/Call/${callUuid}/`,
      { headers: { Authorization: `Basic ${auth}` } }
    );
    if (!res.ok) return 0;
    const data = await res.json().catch(() => ({}));
    return Number(data.duration) || 0;
  } catch {
    return 0;
  }
}

function ensureE164Digits(phone) {
  const digits = toDigits(phone);
  if (digits.length === 10) return `91${digits}`;
  if (digits.startsWith("91") && digits.length === 12) return digits;
  return digits;
}

export async function initiateBridgeCall({
  orgId, leadId, leadPhone, employeePhone, employeeName, employeeUid, leadName, record,
}) {
  if (!bridgeCallConfig.enabled) {
    return { ok: false, error: "Bridge calling is not configured on the server." };
  }

  const from = toDigits(bridgeCallConfig.fromNumber);
  const to = ensureE164Digits(employeePhone);
  const leadTo = ensureE164Digits(leadPhone);

  if (to.length < 10 || leadTo.length < 10) {
    return { ok: false, error: "Invalid phone number." };
  }

  const callId = crypto.randomUUID();
  const shouldRecord = record !== undefined ? record : bridgeCallConfig.recordByDefault;

  const base = bridgeCallConfig.publicBackendUrl.replace(/\/$/, "");
  const answerUrl = `${base}/api/v1/bridge-call/answer?callId=${callId}&leadPhone=${encodeURIComponent(leadTo)}&record=${shouldRecord}`;
  const statusUrl = `${base}/api/v1/bridge-call/status?callId=${callId}`;

  const callRef = db.collection("bridgeCalls").doc(callId);
  await callRef.set({
    callId, orgId, leadId,
    leadPhone: leadTo, leadName: leadName || "",
    employeePhone: to, employeeName: employeeName || "", employeeUid,
    status: "initiating",
    record: shouldRecord,
    initiatedAt: nowIso(), initiatedAtMs: Date.now(),
    durationSeconds: 0, costInr: 0,
    recordingUrl: null, plivoCallUuid: null, plivoBLegUuid: null,
  });

  try {
    const auth = Buffer.from(
      `${bridgeCallConfig.plivoAuthId}:${bridgeCallConfig.plivoAuthToken}`
    ).toString("base64");

    const res = await fetch(
      `https://api.plivo.com/v1/Account/${bridgeCallConfig.plivoAuthId}/Call/`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
        body: JSON.stringify({
          from, to,
          answer_url: answerUrl, answer_method: "GET",
          hangup_url: statusUrl, hangup_method: "POST",
          ring_timeout: bridgeCallConfig.ringTimeoutSeconds,
          time_limit: bridgeCallConfig.maxCallDurationSeconds,
          caller_name: "CodeSkate CRM",
          ...(shouldRecord ? { record: "true", recording_callback_url: statusUrl, recording_callback_method: "POST" } : {}),
        }),
      }
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) {
      const errMsg = data?.error || data?.message || `Plivo responded ${res.status}`;
      logger.error({ callId, err: errMsg }, "Bridge call initiation failed");
      await callRef.update({ status: "failed", failedAt: nowIso(), failureReason: errMsg });
      return { ok: false, error: "Could not initiate the call. Please try again." };
    }

    const plivoCallUuid = data?.request_uuid || data?.call_uuid?.[0] || null;
    await callRef.update({ status: "ringing", plivoCallUuid });
    logger.info({ callId, plivoCallUuid, to, leadTo }, "Bridge call initiated — ringing employee");
    return { ok: true, callId, plivoCallUuid };
  } catch (e) {
    logger.error({ callId, err: e.message }, "Bridge call exception");
    await callRef.update({ status: "failed", failedAt: nowIso(), failureReason: e.message });
    return { ok: false, error: "Call service is temporarily unavailable." };
  }
}

export async function handleCallCompleted(callId, { aLegSeconds, bLegSeconds, dialStatus, recordingUrl, status, bLegUuid, machineDetection }) {
  const callRef = db.collection("bridgeCalls").doc(callId);
  const snap = await callRef.get();
  if (!snap.exists) { logger.warn({ callId }, "Bridge call status for unknown callId"); return; }

  const call = snap.data();
  if (call.status === "wallet-deducted") return; // fully processed, skip
  if (call.status === "agent_no_confirm") return; // already handled by noinput endpoint

  // Allow re-processing if status is already "completed" but duration is still 0
  if (call.status === "completed" && call.durationSeconds > 0) return;

  // Customer voicemail detected by AMD — no charge, end call
  if (machineDetection === "true" || machineDetection === "machine_start" || dialStatus === "machine") {
    await callRef.update({
      status: "customer_voicemail",
      completedAt: nowIso(), completedAtMs: Date.now(),
      failureReason: "Customer voicemail detected (AMD). No charge.",
      durationSeconds: 0, costInr: 0, billedMinutes: 0,
    });
    logger.info({ callId }, "Bridge call — customer voicemail (AMD), no charge");
    return;
  }

  // ── 2-Leg Billing Logic ──
  // Plivo charges us per-leg, 60/60 increment (ceil to next minute).
  // We mirror that to the customer at ₹1/min per leg.
  //
  // Leg A (employee): billed from the moment employee answers until hangup.
  //   - If employee answered (which they must have, since answerURL was hit),
  //     minimum 1 min is charged even if B-leg didn't connect.
  // Leg B (customer): billed only if customer answered (DialStatus=completed).
  //   - Duration = actual talk time, rounded up to next minute.

  let aSeconds = Number(aLegSeconds) || 0;
  let bSeconds = Number(bLegSeconds) || 0;

  // Plivo's webhooks often don't include the B-leg (customer) talk duration.
  // Fetch accurate per-leg durations from Plivo's CDR API for transparency.
  const bLegCallUuid = bLegUuid || call.plivoBLegUuid;
  if (bSeconds === 0 && bLegCallUuid) {
    const cdr = await fetchPlivoCallDuration(bLegCallUuid);
    if (cdr > 0) bSeconds = cdr;
  }
  if (aSeconds === 0 && call.plivoCallUuid) {
    const cdr = await fetchPlivoCallDuration(call.plivoCallUuid);
    if (cdr > 0) aSeconds = cdr;
  }

  const bLegConnected = dialStatus === "completed" || bSeconds > 0 || (aSeconds > 0 && dialStatus !== "no-answer" && dialStatus !== "busy" && dialStatus !== "cancel");

  // ── Transparent billing ──
  // agentSeconds  = how long the agent (employee) leg was connected
  // customerSeconds = actual talk time with the customer (B-leg)
  // We bill the CUSTOMER conversation time (rounded up to the next minute),
  // which is the fair, transparent metric shown to the tenant.
  const agentSeconds = aSeconds;
  const customerSeconds = bSeconds > 0 ? bSeconds : (bLegConnected ? aSeconds : 0);

  // Billed minutes = customer conversation time, min 1 min if connected
  const billedMinutes = bLegConnected ? Math.max(1, Math.ceil(customerSeconds / 60)) : 0;
  const costInr = billedMinutes * bridgeCallConfig.costPerMinuteInr;

  // durationSeconds shown in UI = actual talk time (customer), fallback agent
  const durationSeconds = customerSeconds || agentSeconds;

  const updateData = {
    status: bLegConnected ? "completed" : (status || dialStatus || "no-answer"),
    durationSeconds,
    agentSeconds,
    customerSeconds,
    aLegSeconds: aSeconds,
    bLegSeconds: bSeconds,
    billedMinutes,
    costInr,
    dialStatus: dialStatus || null,
    completedAt: nowIso(), completedAtMs: Date.now(),
  };
  if (recordingUrl) updateData.recordingUrl = recordingUrl;
  if (bLegUuid) updateData.plivoBLegUuid = bLegUuid;
  await callRef.update(updateData);

  // Only deduct wallet when the customer actually connected and we have a duration
  if (billedMinutes > 0 && customerSeconds > 0) {
    await deductWalletMinutes(call.orgId, billedMinutes, costInr, callId);
  }

  // Add lead note only if actual conversation happened (B-leg connected)
  if (bLegConnected && call.leadId) {
    const noteText = `Bridge call: ${call.employeeName || "Agent"} \u2192 ${call.leadName || call.leadPhone} — Agent ${formatDuration(agentSeconds)}, Customer ${formatDuration(customerSeconds)} — ₹${costInr.toFixed(0)} (${billedMinutes} min)`;
    await orgCollection(db, call.orgId, "leads").doc(call.leadId).collection("notes").add({
      type: "bridge_call",
      text: noteText,
      authorId: call.employeeUid, authorName: call.employeeName || "Agent",
      visibility: "team", at: nowIso(), bridgeCallId: callId, duration: customerSeconds,
      agentSeconds, customerSeconds,
      ...(recordingUrl ? { recordingUrl } : {}),
    }).catch((e) => logger.warn({ err: e.message }, "Bridge call note write failed"));
  } else if (!bLegConnected && call.leadId) {
    // Customer didn't pick up — still log it
    await orgCollection(db, call.orgId, "leads").doc(call.leadId).collection("notes").add({
      type: "bridge_call",
      text: `Bridge call: ${call.employeeName || "Agent"} \u2192 ${call.leadName || call.leadPhone} — customer didn't answer (no charge)`,
      authorId: call.employeeUid, authorName: call.employeeName || "Agent",
      visibility: "team", at: nowIso(), bridgeCallId: callId, duration: 0,
    }).catch((e) => logger.warn({ err: e.message }, "Bridge call note write failed"));
  }

  logger.info({ callId, aLegBilledMinutes, bLegBilledMinutes, totalBilledMinutes, costInr, dialStatus }, "Bridge call completed — 2-leg billing applied");
}

async function deductWalletMinutes(orgId, minutes, costInr, callId) {
  const walletRef = db.collection("voiceWallets").doc(orgId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(walletRef);
    const wallet = snap.exists ? snap.data() : { balanceMinutes: 0, bridgeMinutes: 0, totalSpentInr: 0 };
    const newBalance = Math.max(0, (wallet.balanceMinutes || 0) - minutes);
    const newBridge = Math.max(0, (wallet.bridgeMinutes || 0) - minutes);
    tx.set(walletRef, {
      orgId,
      balanceMinutes: newBalance,
      bridgeMinutes: newBridge,
      totalSpentInr: (wallet.totalSpentInr || 0) + costInr,
      lastDeductedAt: nowIso(), lastCallId: callId,
    }, { merge: true });
  });

  // Record debit transaction for wallet history
  await db.collection("walletTransactions").add({
    orgId,
    type: "debit",
    packId: "bridge_call_usage",
    packName: "Bridge Call",
    minutes: -minutes,
    amountInr: costInr,
    description: `Bridge call (${minutes} min — A+B legs)`,
    callId,
    createdAt: nowIso(),
    timestamp: Date.now(),
  }).catch(() => {});

  await db.collection("bridgeCalls").doc(callId).update({ status: "wallet-deducted" }).catch(() => {});
}

export async function checkWalletBalance(orgId) {
  const snap = await db.collection("voiceWallets").doc(orgId).get();
  const balance = snap.exists ? (snap.data().balanceMinutes || 0) : 0;
  return { hasBalance: balance > 0, balanceMinutes: balance };
}

export async function getBridgeCallStatus(callId) {
  const snap = await db.collection("bridgeCalls").doc(callId).get();
  return snap.exists ? snap.data() : null;
}

function formatDuration(s) { const m = Math.floor(s / 60); return m > 0 ? `${m}m ${s % 60}s` : `${s}s`; }
