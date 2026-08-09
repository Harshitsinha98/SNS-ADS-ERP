/**
 * CodeSkate Voice controller — multi-tenant number purchase + compliance.
 *
 * Endpoints:
 *   POST /submit-compliance   — tenant submits business docs for India DID
 *   GET  /status              — tenant checks their compliance + number status
 *   GET  /numbers             — list all voice numbers for the org
 *   POST /compliance-webhook  — Plivo callback when compliance status changes
 *   POST /activate            — (platform) manually trigger number purchase after approval
 */

import { getActiveMembership, isOrgAdmin } from "../middleware/auth.js";
import { bridgeCallConfig } from "../config/env.js";
import { logger } from "../middleware/logger.js";
import {
  getIndiaRequirements,
  createComplianceApplication,
  getComplianceStatus,
  searchAvailableNumbers,
  buyNumber,
  linkNumberToCompliance,
  createPlivoApp,
  assignAppToNumber,
} from "../services/plivoCompliance.js";
import {
  createVoiceNumber,
  updateComplianceStatus,
  activateNumber,
  getOrgVoiceNumbers,
  getActiveNumberForOrg,
  getByComplianceId,
} from "../services/voiceNumbers.js";

// ─── GET /requirements ───────────────────────────────────────────────────────
// Returns the doc type IDs needed for the frontend form.
export async function requirementsHandler(req, res) {
  try {
    const data = await getIndiaRequirements();
    return res.json({ ok: true, requirements: data });
  } catch (e) {
    logger.error({ err: e.message }, "Failed to fetch compliance requirements");
    return res.status(502).json({ error: "Could not fetch requirements from Plivo." });
  }
}

// ─── POST /submit-compliance ─────────────────────────────────────────────────
// Tenant admin uploads business docs → creates Plivo compliance app.
export async function submitComplianceHandler(req, res) {
  try {
    const { orgId } = req.body;
    if (!orgId) return res.status(400).json({ error: "orgId required." });

    const membership = await getActiveMembership(req.authUser.uid, orgId);
    if (!membership || (membership.role !== "admin" && membership.role !== "owner")) {
      return res.status(403).json({ error: "Only admins can purchase voice numbers." });
    }

    // Check if org already has a pending/active compliance
    const existing = await getOrgVoiceNumbers(orgId);
    const pendingOrActive = existing.find(
      (n) => n.status === "pending_compliance" || n.status === "compliance_approved" || n.status === "active" || n.status === "purchasing"
    );
    if (pendingOrActive) {
      return res.status(409).json({
        error: "You already have a number request in progress or active.",
        existing: pendingOrActive,
      });
    }

    // Extract form fields from multipart body (parsed by multer or similar)
    const {
      businessName, email, address, city, state, postalCode,
      registrationNumber, registrationDocTypeId, gstDocTypeId,
    } = req.body;

    if (!businessName || !registrationNumber) {
      return res.status(400).json({ error: "Business name and registration number are required." });
    }

    // Files should be attached as registrationCert and gstCert
    const regFile = req.files?.registrationCert?.[0];
    const gstFile = req.files?.gstCert?.[0];

    if (!regFile || !gstFile) {
      return res.status(400).json({ error: "Both Registration Certificate and GST Certificate files are required." });
    }

    // Callback URL for Plivo to notify us on status change
    const base = bridgeCallConfig.publicBackendUrl.replace(/\/$/, "");
    const callbackUrl = `${base}/api/v1/voice/compliance-webhook`;

    // Fetch requirements if doc type IDs not provided
    let regDocTypeId = registrationDocTypeId;
    let gstTypeId = gstDocTypeId;

    if (!regDocTypeId || !gstTypeId) {
      const reqs = await getIndiaRequirements();
      const docTypes = reqs.document_types || reqs.objects?.[0]?.document_types || [];
      // Find registration cert and GST cert doc type IDs
      for (const dt of docTypes) {
        const nameLower = (dt.name || "").toLowerCase();
        if (nameLower.includes("registration") || nameLower.includes("incorporation") || nameLower.includes("udyam")) {
          regDocTypeId = regDocTypeId || dt.document_type_id;
        }
        if (nameLower.includes("gst")) {
          gstTypeId = gstTypeId || dt.document_type_id;
        }
      }
    }

    if (!regDocTypeId || !gstTypeId) {
      return res.status(500).json({ error: "Could not determine document type IDs from Plivo. Please try again." });
    }

    // Submit to Plivo
    const plivoResult = await createComplianceApplication({
      businessName,
      email: email || "",
      address: address || "",
      city: city || "",
      state: state || "",
      postalCode: postalCode || "",
      registrationNumber,
      alias: `CodeSkate-${orgId.slice(0, 8)}-${businessName.slice(0, 30)}`,
      registrationCertFile: regFile.buffer,
      registrationCertFilename: regFile.originalname || "registration_cert.pdf",
      gstCertFile: gstFile.buffer,
      gstCertFilename: gstFile.originalname || "gst_cert.pdf",
      registrationDocTypeId: regDocTypeId,
      gstDocTypeId: gstTypeId,
      callbackUrl,
    });

    const complianceId = plivoResult.compliance_id || plivoResult.id;
    if (!complianceId) {
      return res.status(502).json({ error: "Plivo did not return a compliance ID." });
    }

    // Create local record
    const record = await createVoiceNumber({
      orgId,
      complianceId,
      businessName,
    });

    return res.status(201).json({
      ok: true,
      message: "Compliance application submitted. Plivo will review within 24-48 hours.",
      complianceId,
      record,
    });
  } catch (e) {
    logger.error({ err: e.message }, "Submit compliance error");
    return res.status(500).json({ error: e.message || "Could not submit compliance application." });
  }
}

// ─── GET /status ─────────────────────────────────────────────────────────────
// Tenant checks their compliance + number status.
export async function statusHandler(req, res) {
  try {
    const { orgId } = req.query;
    if (!orgId) return res.status(400).json({ error: "orgId required." });

    const membership = await getActiveMembership(req.authUser.uid, orgId);
    if (!membership) return res.status(403).json({ error: "Access denied." });

    const numbers = await getOrgVoiceNumbers(orgId);
    if (numbers.length === 0) {
      return res.json({ ok: true, hasNumber: false, numbers: [] });
    }

    // For the latest pending one, refresh status from Plivo
    const pending = numbers.find((n) => n.status === "pending_compliance");
    if (pending && pending.complianceId) {
      try {
        const plivoStatus = await getComplianceStatus(pending.complianceId);
        if (plivoStatus.status && plivoStatus.status !== pending.complianceStatus) {
          await updateComplianceStatus(pending.complianceId, {
            status: plivoStatus.status,
            rejectionReason: plivoStatus.rejection_reason || null,
          });
          pending.complianceStatus = plivoStatus.status;
          if (plivoStatus.status === "accepted") pending.status = "compliance_approved";
          if (plivoStatus.status === "rejected") pending.rejectionReason = plivoStatus.rejection_reason;
        }
      } catch (e) {
        // Non-fatal — return stale data
        logger.warn({ err: e.message }, "Could not refresh compliance status from Plivo");
      }
    }

    const activeNumber = numbers.find((n) => n.status === "active");

    return res.json({
      ok: true,
      hasNumber: Boolean(activeNumber),
      activeNumber: activeNumber || null,
      numbers,
    });
  } catch (e) {
    logger.error({ err: e.message }, "Voice status error");
    return res.status(500).json({ error: "Could not fetch voice number status." });
  }
}

// ─── GET /numbers ────────────────────────────────────────────────────────────
export async function numbersHandler(req, res) {
  try {
    const { orgId } = req.query;
    if (!orgId) return res.status(400).json({ error: "orgId required." });

    const membership = await getActiveMembership(req.authUser.uid, orgId);
    if (!membership) return res.status(403).json({ error: "Access denied." });

    const numbers = await getOrgVoiceNumbers(orgId);
    return res.json({ ok: true, numbers });
  } catch (e) {
    return res.status(500).json({ error: "Could not fetch voice numbers." });
  }
}

// ─── POST /compliance-webhook ────────────────────────────────────────────────
// Plivo calls this when compliance status changes (accepted/rejected).
// No auth (Plivo webhook) — should validate Plivo signature in production.
export async function complianceWebhookHandler(req, res) {
  try {
    const body = req.body || {};
    const complianceId = body.compliance_id || body.id;
    const status = body.status;
    const rejectionReason = body.rejection_reason || null;

    logger.info({ complianceId, status, rejectionReason }, "Compliance webhook received");

    if (!complianceId || !status) {
      return res.status(200).send("ok"); // Plivo may ping with empty data
    }

    // Update our record
    const updated = await updateComplianceStatus(complianceId, { status, rejectionReason });

    // If accepted → auto-purchase a number
    if (status === "accepted" && updated) {
      // Fire-and-forget: buy number in background
      autoProvisionNumber(complianceId, updated.orgId).catch((e) =>
        logger.error({ complianceId, err: e.message }, "Auto-provision failed")
      );
    }

    return res.status(200).send("ok");
  } catch (e) {
    logger.error({ err: e.message }, "Compliance webhook error");
    return res.status(200).send("ok"); // always 200 to Plivo
  }
}

// ─── POST /activate (platform admin manual trigger) ──────────────────────────
export async function activateHandler(req, res) {
  try {
    const { complianceId } = req.body;
    if (!complianceId) return res.status(400).json({ error: "complianceId required." });

    const record = await getByComplianceId(complianceId);
    if (!record) return res.status(404).json({ error: "Voice number record not found." });

    await autoProvisionNumber(complianceId, record.orgId);
    return res.json({ ok: true, message: "Number provisioned." });
  } catch (e) {
    logger.error({ err: e.message }, "Manual activate error");
    return res.status(500).json({ error: e.message || "Activation failed." });
  }
}

// ─── Auto-provision: search → buy → link → create app → assign ──────────────

async function autoProvisionNumber(complianceId, orgId) {
  logger.info({ complianceId, orgId }, "Auto-provisioning number...");

  // 1. Search available India local numbers
  const available = await searchAvailableNumbers({ limit: 3 });
  if (!available.length) {
    throw new Error("No India local numbers available. Please contact support.");
  }

  // Pick the first available
  const chosen = available[0];
  const phoneNumber = chosen.number;

  // 2. Buy the number
  await buyNumber(phoneNumber);
  logger.info({ phoneNumber }, "Number purchased");

  // 3. Link to compliance
  await linkNumberToCompliance(phoneNumber, complianceId);
  logger.info({ phoneNumber, complianceId }, "Number linked to compliance");

  // 4. Create Plivo Application (routes calls through CodeSkate backend)
  const base = bridgeCallConfig.publicBackendUrl.replace(/\/$/, "");
  const appResult = await createPlivoApp({
    appName: `CodeSkate-Voice-${orgId.slice(0, 8)}`,
    answerUrl: `${base}/api/v1/bridge-call/answer`,
    hangupUrl: `${base}/api/v1/bridge-call/status`,
  });
  const plivoAppId = appResult.app_id;

  // 5. Assign app to number
  if (plivoAppId) {
    await assignAppToNumber(phoneNumber, plivoAppId);
  }

  // 6. Update Firestore record → active
  const displayNumber = `+${phoneNumber.slice(0, 2)} ${phoneNumber.slice(2, 7)} ${phoneNumber.slice(7)}`;
  await activateNumber(complianceId, { phoneNumber, displayNumber, plivoAppId });

  logger.info({ orgId, phoneNumber, plivoAppId }, "Voice number fully provisioned and active");
}
