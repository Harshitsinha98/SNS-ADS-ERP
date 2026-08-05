/**
 * Bridge Call controller.
 */
import { bridgeCallConfig } from "../config/env.js";
import { isOrgAdmin, getActiveMembership } from "../middleware/auth.js";
import { initiateBridgeCall, handleCallCompleted, checkWalletBalance, getBridgeCallStatus } from "../services/bridgeCall.js";
import { logger } from "../middleware/logger.js";
import { db } from "../bootstrap/firebase.js";

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

  const from = bridgeCallConfig.fromNumber.replace(/\D/g, "");
  const shouldRecord = record === "true";
  const statusUrl = `${bridgeCallConfig.publicBackendUrl.replace(/\/$/, "")}/api/v1/bridge-call/status?callId=${callId || ""}`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak voice="Polly.Aditi" language="hi-IN">Connecting you to the customer.</Speak>
  <Dial callerId="${from}" timeLimit="${bridgeCallConfig.maxCallDurationSeconds}" action="${statusUrl}" method="POST"${shouldRecord ? ` record="true" recordingCallbackUrl="${statusUrl}" recordingCallbackMethod="POST"` : ""}>
    <Number>${String(leadPhone).replace(/\D/g, "")}</Number>
  </Dial>
</Response>`;
  res.set("Content-Type", "application/xml").send(xml);
}

export async function statusHandler(req, res) {
  try {
    const callId = req.query.callId || req.body?.callId;
    if (!callId) return res.status(200).send("ok");
    const body = req.body || {};
    const duration = Number(body.Duration || body.duration || body.RecordingDuration || body.BillDuration || 0);
    logger.info({ callId, body, duration }, "Bridge call status webhook received");
    await handleCallCompleted(callId, {
      duration,
      recordingUrl: body.RecordUrl || body.RecordingUrl || body.recording_url || null,
      status: body.CallStatus || body.Status || body.call_status || null,
      bLegUuid: body.BLegUUID || body.b_leg_uuid || null,
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
    return res.json({ callId: call.callId, status: call.status, durationSeconds: call.durationSeconds || 0, recordingUrl: call.recordingUrl || null });
  } catch (e) {
    return res.status(500).json({ error: "Could not fetch call status." });
  }
}
