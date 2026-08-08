/**
 * Bridge Call controller.
 */
import { bridgeCallConfig } from "../config/env.js";
import { isOrgAdmin, getActiveMembership } from "../middleware/auth.js";
import { initiateBridgeCall, handleCallCompleted, checkWalletBalance, getBridgeCallStatus } from "../services/bridgeCall.js";
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
      return res.status(402).json({ error: "Voice call wallet is empty. Please top up.", code: "wallet_empty", balanceMinutes: 0 });
    }

    const employeePhone = req.authUser.phone_number || req.authUser.phoneNumber || "";
    if (!employeePhone) return res.status(400).json({ error: "Your phone number is not available." });

    const result = await initiateBridgeCall({
      orgId, leadId, leadPhone, leadName: leadName || "",
      employeePhone, employeeName: membership.displayName || req.authUser.name || "Agent",
      employeeUid: req.authUser.uid,
    });

    if (!result.ok) return res.status(502).json(result);
    return res.json({ ok: true, callId: result.callId, walletBalance: wallet.balanceMinutes });
  } catch (e) {
    logger.error({ err: e.message }, "Bridge call initiate error");
    return res.status(500).json({ error: "Could not start bridge call." });
  }
}

export function answerHandler(req, res) {
  const { leadPhone, record, callId } = req.query;
  if (!leadPhone) return res.set("Content-Type", "application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Speak>Error.</Speak><Hangup/></Response>`);

  const base = bridgeCallConfig.publicBackendUrl.replace(/\/$/, "");
  const confirmUrl = `${base}/api/v1/bridge-call/answer-confirm?callId=${encodeURIComponent(callId || "")}&leadPhone=${encodeURIComponent(leadPhone)}&record=${record || "false"}`;
  const noInputUrl = `${base}/api/v1/bridge-call/answer-noinput?callId=${encodeURIComponent(callId || "")}`;

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

  const from = bridgeCallConfig.fromNumber.replace(/\D/g, "");
  const shouldRecord = record === "true";
  const statusUrl = `${bridgeCallConfig.publicBackendUrl.replace(/\/$/, "")}/api/v1/bridge-call/status?callId=${callId || ""}`;

  // Dial customer with machine_detection (AMD) — if voicemail detected, Plivo
  // returns machine_detection status and we avoid charging admin for voicemail.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak voice="Polly.Aditi" language="hi-IN">Connecting.</Speak>
  <Dial callerId="${from}" timeLimit="${bridgeCallConfig.maxCallDurationSeconds}" action="${statusUrl}" method="POST" ringTimeout="${bridgeCallConfig.ringTimeoutSeconds}"${shouldRecord ? ` record="true" recordingCallbackUrl="${statusUrl}" recordingCallbackMethod="POST"` : ""}>
    <Number machineDetection="hangup" machineDetectionTimeout="5000">${String(leadPhone).replace(/\D/g, "")}</Number>
  </Dial>
</Response>`;
  res.set("Content-Type", "application/xml").send(xml);
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
