/**
 * Bridge Call controller.
 */
import { bridgeCallConfig } from "../config/env.js";
import { isOrgAdmin, getActiveMembership } from "../middleware/auth.js";
import { initiateBridgeCall, handleCallCompleted, checkWalletBalance, getBridgeCallStatus, callCustomerIntoConference, hangupPlivoCall } from "../services/bridgeCall.js";
import { getActiveNumberForOrg } from "../services/voiceNumbers.js";
import { logger } from "../middleware/logger.js";
import { db } from "../bootstrap/firebase.js";
import { nowIso } from "../services/helpers.js";

async function orgHasBridgeAccess(orgId) {
  const orgSnap = await db.collection("organizations").doc(orgId).get();
  if (!orgSnap.exists) return false;
  return bridgeCallConfig.allowedPlanIds.includes(orgSnap.data().planId || "starter");
}

export async function initiateHandler(req, res) {
  try {
    const { orgId, leadId, leadPhone, leadName } = req.body || {};
    if (!orgId || !leadId || !leadPhone) return res.status(400).json({ error: "Organization, lead, and phone number are required." });

    const membership = await getActiveMembership(req.authUser.uid, orgId);
    if (!membership) return res.status(403).json({ error: "Active organization membership required." });

    if (!(await orgHasBridgeAccess(orgId))) {
      return res.status(403).json({ error: "Bridge calling is available on Growth plan and above.", code: "plan_upgrade_required" });
    }

    const wallet = await checkWalletBalance(orgId);
    if (!wallet.hasBalance) {
      return res.status(402).json({ error: "Voice Wallet balance is too low. Please top up.", code: "wallet_empty", balanceInr: wallet.balanceInr || 0 });
    }

    const employeePhone = req.authUser.phone_number || req.authUser.phoneNumber || "";
    if (!employeePhone) return res.status(400).json({ error: "Your phone number is not available." });

    const result = await initiateBridgeCall({
      orgId, leadId, leadPhone, leadName: leadName || "",
      employeePhone, employeeName: membership.displayName || req.authUser.name || "Agent",
      employeeUid: req.authUser.uid,
    });

    if (!result.ok) return res.status(502).json(result);
    return res.json({ ok: true, callId: result.callId, walletBalanceInr: wallet.balanceInr });
  } catch (e) {
    logger.error({ err: e.message }, "Bridge call initiate error");
    return res.status(500).json({ error: "Could not start bridge call." });
  }
}

/**
 * Lightweight capability check so clients (mobile app) can SHOW/HIDE the
 * "Bridge call" option without attempting a call. Returns why it's unavailable
 * so the UI can hide the option entirely (no upsell noise on the call button).
 * GET /api/v1/bridge-call/availability?orgId=...
 * Response: { available: bool, reason: 'plan'|'number'|'wallet'|null, balanceInr }
 */
export async function availabilityHandler(req, res) {
  try {
    const orgId = req.query.orgId;
    if (!orgId) return res.status(400).json({ available: false, reason: "bad_request" });

    const membership = await getActiveMembership(req.authUser.uid, orgId);
    if (!membership) return res.status(403).json({ available: false, reason: "no_membership" });

    // 1) Plan gate (Growth+).
    if (!(await orgHasBridgeAccess(orgId))) {
      return res.json({ available: false, reason: "plan" });
    }
    // 2) Org must have its own active CodeSkate Voice number.
    const number = await getActiveNumberForOrg(orgId).catch(() => null);
    if (!number) {
      return res.json({ available: false, reason: "number" });
    }
    // 3) Wallet must have at least one minute of balance.
    const wallet = await checkWalletBalance(orgId);
    if (!wallet.hasBalance) {
      return res.json({ available: false, reason: "wallet", balanceInr: wallet.balanceInr || 0 });
    }
    return res.json({ available: true, balanceInr: wallet.balanceInr || 0 });
  } catch (e) {
    logger.error({ err: e.message }, "Bridge availability error");
    return res.status(500).json({ available: false, reason: "error" });
  }
}

// XML attribute values must escape '&' — Plivo rejects raw ampersands in URLs
// (multiple query params) and hangs up the call ("Invalid Action XML").
const xmlUrl = (url) => String(url).replace(/&/g, "&amp;");

export function answerHandler(req, res) {
  const { leadPhone, record, callId } = req.query;
  if (!leadPhone) return res.set("Content-Type", "application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Speak>Error.</Speak><Hangup/></Response>`);

  const base = bridgeCallConfig.publicBackendUrl.replace(/\/$/, "");
  const confirmUrl = xmlUrl(`${base}/api/v1/bridge-call/answer-confirm?callId=${encodeURIComponent(callId || "")}&leadPhone=${encodeURIComponent(leadPhone)}&record=${record || "false"}`);
  const noInputUrl = xmlUrl(`${base}/api/v1/bridge-call/answer-noinput?callId=${encodeURIComponent(callId || "")}`);

  // Press-1 confirmation: prevents voicemail from triggering customer dial.
  // Employee hears prompt → presses 1 → then customer is dialed.
  // If no input (voicemail/machine) → hang up, no customer leg.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <GetDigits action="${confirmUrl}" method="GET" timeout="8" numDigits="1" retries="1" validDigits="1" redirect="true">
    <Speak voice="Polly.Aditi" language="hi-IN">Naya lead call hai. Connect karne ke liye 1 dabayen.</Speak>
  </GetDigits>
  <Redirect method="GET">${noInputUrl}</Redirect>
</Response>`;
  res.set("Content-Type", "application/xml").send(xml);
}

export function answerConfirmHandler(req, res) {
  const { leadPhone, record, callId } = req.query;
  const digits = req.query.Digits || req.body?.Digits;

  if (digits !== "1") {
    // Agent pressed something else — hang up
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Speak voice="Polly.Aditi" language="hi-IN">Call cancel ho gayi.</Speak><Hangup/></Response>`;
    return res.set("Content-Type", "application/xml").send(xml);
  }

  const shouldRecord = record === "true";
  const base = bridgeCallConfig.publicBackendUrl.replace(/\/$/, "");
  const confRoom = `conf_${callId}`;
  const confCallbackUrl = xmlUrl(`${base}/api/v1/bridge-call/conf-event?callId=${callId}`);

  // Agent confirmed (pressed 1) → mark in-progress (frontend timer starts) and
  // trigger the customer leg WITH Answering Machine Detection (fire-and-forget).
  if (callId) {
    db.collection("bridgeCalls").doc(callId).update({
      status: "waiting_customer",
      inProgressAtMs: Date.now(),
    }).catch(() => {});
    // Call the customer into the conference with AMD (voicemail → auto hangup)
    callCustomerIntoConference(callId, leadPhone).catch(() => {});
  }

  // Employee waits in the conference until the customer (human) joins.
  // startConferenceOnEnter=false → employee hears hold music until customer joins.
  // endConferenceOnExit=true → if employee hangs up, conference ends.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak voice="Polly.Aditi" language="hi-IN">Customer ko connect kar rahe hain, please wait.</Speak>
  <Conference startConferenceOnEnter="false" endConferenceOnExit="true" waitSound="https://s3.amazonaws.com/plivocloud/music.mp3" timeLimit="${bridgeCallConfig.maxCallDurationSeconds}"${shouldRecord ? ` record="true" recordingCallbackUrl="${xmlUrl(`${base}/api/v1/bridge-call/status?callId=${callId}`)}" recordingCallbackMethod="POST"` : ""} callbackUrl="${confCallbackUrl}" callbackMethod="POST">${confRoom}</Conference>
</Response>`;
  res.set("Content-Type", "application/xml").send(xml);
}

// Customer's leg answered by a HUMAN (AMD passed) → join the conference.
export function customerAnswerHandler(req, res) {
  const { callId } = req.query;
  const confRoom = `conf_${callId}`;

  // Customer (human) answered → mark in-progress so the frontend timer starts
  // counting the real conversation.
  if (callId) {
    db.collection("bridgeCalls").doc(callId).update({
      status: "in-progress",
      customerJoinedAtMs: Date.now(),
    }).catch(() => {});
  }

  // Customer joins and starts the conference (both now hear each other).
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Conference startConferenceOnEnter="true" endConferenceOnExit="true" timeLimit="${bridgeCallConfig.maxCallDurationSeconds}">${confRoom}</Conference>
</Response>`;
  res.set("Content-Type", "application/xml").send(xml);
}

// Async AMD result for the customer leg.
//
// Plivo runs machine detection in the background (machine_detection: "true",
// 10s window) and hits THIS url ONLY when a machine / voicemail is detected —
// for a real human it is never called, so the conference simply continues and
// a real customer is NEVER dropped by detection.
//
// When a machine IS detected, the SYSTEM ends both legs and charges nothing.
// There is no manual lever (no agent keypress, no admin action) that can reach
// this "no charge" path, so it can't be gamed. Because the cut happens within
// the opening ~10s, a rare false positive costs only a redial — never a
// mid-conversation drop.
export async function customerAmdHandler(req, res) {
  try {
    const callId = req.query.callId || req.body?.callId;
    const body = req.body || {};
    const machineRaw = String(body.Machine || body.machine || body.machine_detection || body.AnsweredBy || "").toLowerCase();
    const isMachine = machineRaw === "true" || machineRaw.includes("machine");
    logger.info({ callId, machine: machineRaw }, "Customer AMD result webhook");

    const base = bridgeCallConfig.publicBackendUrl.replace(/\/$/, "");
    const confRoom = `conf_${callId}`;

    if (!isMachine) {
      // Not a machine (or ambiguous) — bias to connect. Keep the customer in the
      // conference so a real human is never dropped, even if Plivo calls us.
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Conference startConferenceOnEnter="true" endConferenceOnExit="true" timeLimit="${bridgeCallConfig.maxCallDurationSeconds}">${confRoom}</Conference>
</Response>`;
      return res.set("Content-Type", "application/xml").send(xml);
    }

    // Machine / voicemail — no charge, and the SYSTEM ends both legs.
    if (callId) {
      const snap = await db.collection("bridgeCalls").doc(callId).get().catch(() => null);
      const call = snap && snap.exists ? snap.data() : null;
      const terminal = ["wallet-deducted", "customer_voicemail", "no-answer", "agent_no_confirm"];
      if (call && !terminal.includes(call.status)) {
        await db.collection("bridgeCalls").doc(callId).update({
          status: "customer_voicemail",
          completedAt: nowIso(), completedAtMs: Date.now(),
          durationSeconds: 0, customerSeconds: 0, billedMinutes: 0, costInr: 0,
          amdResult: "machine",
          failureReason: "Customer voicemail detected (async AMD) — no charge.",
        }).catch(() => {});
      }
      // Belt-and-suspenders: also end the agent's waiting leg (and the customer
      // leg) via the Plivo API, in case the Hangup XML below isn't executed.
      if (call?.plivoCallUuid) hangupPlivoCall(call.plivoCallUuid).catch(() => {});
      if (call?.plivoBLegUuid) hangupPlivoCall(call.plivoBLegUuid).catch(() => {});
    }

    // Hang up the customer leg immediately (endConferenceOnExit ends the agent's
    // wait too). The status is already marked customer_voicemail above, so the
    // subsequent hangup webhook will skip billing.
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
    return res.set("Content-Type", "application/xml").send(xml);
  } catch (e) {
    logger.error({ err: e.message }, "Customer AMD webhook error");
    return res.set("Content-Type", "application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  }
}

// Customer leg ended — this tells us if it was voicemail / no-answer / real talk.
export async function customerStatusHandler(req, res) {
  try {
    const callId = req.query.callId || req.body?.callId;
    if (!callId) return res.status(200).send("ok");
    const body = req.body || {};
    logger.info({ callId, body }, "Customer leg status webhook");

    const machine = body.Machine || body.machine_detection || body.AnsweredBy || null;
    const hangupCause = body.HangupCause || body.hangup_cause || null;
    const callStatus = body.CallStatus || body.Status || null;
    const customerSeconds = Number(body.Duration || body.BillDuration || 0);

    const isMachine = String(machine).toLowerCase().includes("machine") || machine === "true";
    const noAnswer = callStatus === "no-answer" || hangupCause === "NO_ANSWER" || hangupCause === "NO_USER_RESPONSE" || hangupCause === "USER_BUSY";

    const snap = await db.collection("bridgeCalls").doc(callId).get();
    const call = snap.exists ? snap.data() : null;

    if (isMachine || (customerSeconds === 0 && noAnswer)) {
      // Voicemail or no-answer → end agent's wait, no charge to tenant.
      // Still track Plivo cost (CodeSkate absorbs this).
      const plivoCostBLeg = Number(body.TotalCost || body.total_cost || 0);
      await db.collection("bridgeCalls").doc(callId).update({
        status: isMachine ? "customer_voicemail" : "no-answer",
        completedAt: nowIso(), completedAtMs: Date.now(),
        durationSeconds: 0, customerSeconds: 0, billedMinutes: 0, costInr: 0,
        plivoCostBLeg,
        failureReason: isMachine ? "Customer voicemail (AMD) — no charge." : "Customer did not answer — no charge.",
      }).catch(() => {});
      if (call?.plivoCallUuid) await hangupPlivoCall(call.plivoCallUuid); // end agent leg
      return res.status(200).send("ok");
    }

    // Real human conversation happened → bill customer talk time.
    const plivoCostBLeg = Number(body.TotalCost || body.total_cost || 0);
    if (call && call.status !== "wallet-deducted") {
      await handleCallCompleted(callId, {
        aLegSeconds: 0,
        bLegSeconds: customerSeconds,
        dialStatus: "completed",
        recordingUrl: body.RecordUrl || body.RecordingUrl || null,
        status: "completed",
        bLegUuid: body.CallUUID || null,
        plivoCostBLeg,
      });
    }
    return res.status(200).send("ok");
  } catch (e) {
    logger.error({ err: e.message }, "Customer status webhook error");
    return res.status(200).send("ok");
  }
}

// Conference events (member enter/exit) — optional logging/precision.
export function confEventHandler(req, res) {
  return res.status(200).send("ok");
}

export function answerNoInputHandler(req, res) {
  const { callId } = req.query;
  // Employee didn't press 1 (voicemail or didn't respond) — hang up gracefully.
  // Mark call as agent_no_confirm in Firestore.
  if (callId) {
    db.collection("bridgeCalls").doc(callId).update({
      status: "agent_no_confirm",
      completedAt: nowIso(),
      completedAtMs: Date.now(),
      failureReason: "Agent did not confirm (voicemail or no response).",
    }).catch(() => {});
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak voice="Polly.Aditi" language="hi-IN">Koi response nahi mila. Call khatam ho rahi hai.</Speak>
  <Hangup/>
</Response>`;
  res.set("Content-Type", "application/xml").send(xml);
}

export async function statusHandler(req, res) {
  try {
    const callId = req.query.callId || req.body?.callId;
    if (!callId) return res.status(200).send("ok");
    const body = req.body || {};
    logger.info({ callId, body }, "Bridge call status webhook received");

    // Plivo sends multiple callbacks to the same URL:
    // 1. Dial action callback → has DialStatus, DialBLegUUID
    // 2. Hangup callback → has Duration (A-leg total), CallStatus
    // 3. Recording callback → has RecordUrl
    //
    // We handle all — handleCallCompleted is idempotent (skips if already processed).

    const dialStatus = body.DialStatus || body.dial_status || null;
    const aLegDuration = Number(body.Duration || body.duration || body.ALegDuration || 0);
    const bLegDuration = Number(body.DialBLegDuration || body.BLegDuration || body.DialBLegBillDuration || 0);

    // If this is a Dial action callback, Duration = B-leg connected duration
    // If this is a hangup callback, Duration = total A-leg duration
    // We need to determine which callback this is:
    const isDialCallback = Boolean(dialStatus); // has DialStatus → it's from <Dial> action
    const isRecordingCallback = Boolean(body.RecordUrl || body.RecordingUrl);

    let effectiveBLegSeconds = 0;
    let effectiveALegSeconds = 0;

    if (isDialCallback) {
      // Dial action callback: Duration here is the B-leg connected time
      effectiveBLegSeconds = dialStatus === "completed" ? (bLegDuration || aLegDuration) : 0;
      // A-leg was alive from answer until now — at minimum 1 min (employee heard TTS + ringing)
      effectiveALegSeconds = aLegDuration || effectiveBLegSeconds || 0;
    } else if (!isRecordingCallback) {
      // Hangup callback: Duration = total A-leg time
      effectiveALegSeconds = aLegDuration;
      effectiveBLegSeconds = bLegDuration;
    }

    await handleCallCompleted(callId, {
      aLegSeconds: effectiveALegSeconds,
      bLegSeconds: effectiveBLegSeconds,
      dialStatus,
      recordingUrl: body.RecordUrl || body.RecordingUrl || body.recording_url || null,
      status: body.CallStatus || body.Status || body.call_status || dialStatus || null,
      bLegUuid: body.DialBLegUUID || body.BLegUUID || body.b_leg_uuid || null,
      machineDetection: body.Machine || body.machine_detection || null,
      plivoCostALeg: Number(body.TotalCost || body.total_cost || 0),
    });
    return res.status(200).send("ok");
  } catch (e) {
    logger.error({ err: e.message }, "Bridge call status webhook error");
    return res.status(200).send("ok");
  }
}

export async function pollHandler(req, res) {
  try {
    const { callId } = req.body || {};
    if (!callId) return res.status(400).json({ error: "callId required." });
    const call = await getBridgeCallStatus(callId);
    if (!call) return res.status(404).json({ error: "Call not found." });
    const membership = await getActiveMembership(req.authUser.uid, call.orgId);
    if (!membership) return res.status(403).json({ error: "Access denied." });
    return res.json({
      callId: call.callId,
      status: call.status,
      durationSeconds: call.durationSeconds || 0,
      agentSeconds: call.agentSeconds || 0,
      customerSeconds: call.customerSeconds || 0,
      billedMinutes: call.billedMinutes || 0,
      costInr: call.costInr || 0,
      recordingUrl: call.recordingUrl || null,
    });
  } catch (e) {
    return res.status(500).json({ error: "Could not fetch call status." });
  }
}

/**
 * Call history for a tenant's org — all bridge calls, paginated.
 */
export async function historyHandler(req, res) {
  try {
    const { orgId, limit: limitStr, startAfter } = req.query;
    if (!orgId) return res.status(400).json({ error: "orgId required." });
    const membership = await getActiveMembership(req.authUser.uid, orgId);
    if (!membership) return res.status(403).json({ error: "Access denied." });
    if (membership.role !== "admin" && membership.role !== "owner") {
      return res.status(403).json({ error: "Only admins can view call history." });
    }

    const pageSize = Math.min(Number(limitStr) || 50, 100);
    let q = db.collection("bridgeCalls")
      .where("orgId", "==", orgId)
      .orderBy("initiatedAtMs", "desc")
      .limit(pageSize);

    if (startAfter) {
      q = q.startAfter(Number(startAfter));
    }

    const snap = await q.get();
    const calls = snap.docs.map((d) => {
      const c = d.data();
      return {
        callId: c.callId,
        status: c.status,
        initiatedAt: c.initiatedAt,
        initiatedAtMs: c.initiatedAtMs,
        employeeName: c.employeeName || "Agent",
        leadName: c.leadName || c.leadPhone || "",
        leadPhone: c.leadPhone,
        durationSeconds: c.durationSeconds || 0,
        agentSeconds: c.agentSeconds || 0,
        customerSeconds: c.customerSeconds || 0,
        billedMinutes: c.billedMinutes || 0,
        costInr: c.costInr || 0,
        recordingUrl: c.recordingUrl || null,
        failureReason: c.failureReason || null,
      };
    });

    const lastMs = calls.length > 0 ? calls[calls.length - 1].initiatedAtMs : null;

    return res.json({ ok: true, calls, nextCursor: lastMs, hasMore: calls.length === pageSize });
  } catch (e) {
    logger.error({ err: e.message }, "Call history error");
    return res.status(500).json({ error: "Could not load call history." });
  }
}


/**
 * Recordings list — returns all bridge calls that have a recording for an org.
 * Prefers R2 URL (permanent) over Plivo CDN URL (temporary ~90 days).
 * Paginated, filterable by employee and date range.
 */
export async function recordingsHandler(req, res) {
  try {
    const { orgId, limit: limitStr, startAfter, employee, from, to } = req.query;
    if (!orgId) return res.status(400).json({ error: "orgId required." });
    const membership = await getActiveMembership(req.authUser.uid, orgId);
    if (!membership) return res.status(403).json({ error: "Access denied." });
    if (membership.role !== "admin" && membership.role !== "owner") {
      return res.status(403).json({ error: "Only admins can view recordings." });
    }

    const pageSize = Math.min(Number(limitStr) || 30, 100);

    // Base query — all calls for this org ordered by time
    let q = db.collection("bridgeCalls")
      .where("orgId", "==", orgId)
      .orderBy("initiatedAtMs", "desc")
      .limit(pageSize * 3); // over-fetch since we filter for recordings client-side

    if (startAfter) {
      q = q.startAfter(Number(startAfter));
    }

    // Date range filter (if provided)
    if (from) {
      const fromMs = new Date(from).getTime();
      if (!isNaN(fromMs)) q = q.where("initiatedAtMs", ">=", fromMs);
    }
    if (to) {
      const toMs = new Date(to).getTime() + 86400000; // end of day
      if (!isNaN(toMs)) q = q.where("initiatedAtMs", "<=", toMs);
    }

    const snap = await q.get();

    // Filter to only calls with recordings, apply employee filter
    const recordings = [];
    for (const d of snap.docs) {
      if (recordings.length >= pageSize) break;
      const c = d.data();
      const recUrl = c.r2RecordingUrl || c.recordingUrl;
      if (!recUrl) continue;
      if (employee && c.employeeUid !== employee && !c.employeeName?.toLowerCase().includes(employee.toLowerCase())) continue;

      recordings.push({
        callId: c.callId,
        initiatedAt: c.initiatedAt,
        initiatedAtMs: c.initiatedAtMs,
        employeeName: c.employeeName || "Agent",
        employeeUid: c.employeeUid || null,
        leadName: c.leadName || c.leadPhone || "",
        leadPhone: c.leadPhone,
        durationSeconds: c.durationSeconds || 0,
        customerSeconds: c.customerSeconds || 0,
        recordingUrl: recUrl,
        isR2: Boolean(c.r2RecordingUrl),
      });
    }

    const lastMs = recordings.length > 0 ? recordings[recordings.length - 1].initiatedAtMs : null;

    return res.json({ ok: true, recordings, nextCursor: lastMs, hasMore: recordings.length === pageSize });
  } catch (e) {
    logger.error({ err: e.message }, "Recordings list error");
    return res.status(500).json({ error: "Could not load recordings." });
  }
}
