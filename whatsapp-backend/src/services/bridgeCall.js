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

export async function handleCallCompleted(callId, { duration, recordingUrl, status, bLegUuid }) {
  const callRef = db.collection("bridgeCalls").doc(callId);
  const snap = await callRef.get();
  if (!snap.exists) { logger.warn({ callId }, "Bridge call status for unknown callId"); return; }

  const call = snap.data();
  if (call.status === "completed" || call.status === "wallet-deducted") return;

  const durationSeconds = Number(duration) || 0;
  const billedMinutes = Math.ceil(durationSeconds / 60);
  const costInr = billedMinutes * bridgeCallConfig.costPerMinuteInr;

  const updateData = {
    status: durationSeconds > 0 ? "completed" : (status || "no-answer"),
    durationSeconds, billedMinutes, costInr,
    completedAt: nowIso(), completedAtMs: Date.now(),
  };
  if (recordingUrl) updateData.recordingUrl = recordingUrl;
  if (bLegUuid) updateData.plivoBLegUuid = bLegUuid;
  await callRef.update(updateData);

  if (billedMinutes > 0) await deductWalletMinutes(call.orgId, billedMinutes, costInr, callId);

  if (durationSeconds > 0 && call.leadId) {
    await orgCollection(db, call.orgId, "leads").doc(call.leadId).collection("notes").add({
      type: "bridge_call",
      text: `Bridge call: ${call.employeeName || "Agent"} \u2192 ${call.leadName || call.leadPhone} (${formatDuration(durationSeconds)})`,
      authorId: call.employeeUid, authorName: call.employeeName || "Agent",
      visibility: "team", at: nowIso(), bridgeCallId: callId, duration: durationSeconds,
      ...(recordingUrl ? { recordingUrl } : {}),
    }).catch((e) => logger.warn({ err: e.message }, "Bridge call note write failed"));
  }
  logger.info({ callId, durationSeconds, billedMinutes, costInr }, "Bridge call completed");
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
    description: `Bridge call usage (${minutes} min${minutes > 1 ? "s" : ""})`,
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
