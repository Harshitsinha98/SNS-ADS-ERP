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
  createVoiceNumberRequest,
  registerOwnedNumber,
  setNumberPriority,
  cancelNumber,
  updateComplianceStatus,
  activateNumber,
  getOrgVoiceNumbers,
  getActiveNumberForOrg,
  getByComplianceId,
} from "../services/voiceNumbers.js";
import { uploadBufferToR2 } from "../services/r2Storage.js";

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

    // Extract form fields from multipart body (parsed by multer)
    const {
      businessName, email, address, city, state, postalCode, registrationNumber,
    } = req.body;

    if (!businessName || !registrationNumber) {
      return res.status(400).json({ error: "Business name and registration number are required." });
    }

    // Files attached as registrationCert and gstCert
    const regFile = req.files?.registrationCert?.[0];
    const gstFile = req.files?.gstCert?.[0];

    if (!regFile || !gstFile) {
      return res.status(400).json({ error: "Both Registration Certificate and GST Certificate files are required." });
    }

    // ── Robust flow: store the request + documents; provisioning is handled
    // by CodeSkate (Plivo console compliance + number assign). This decouples
    // us from Plivo's compliance API and never hard-fails the tenant.
    // A tenant CAN request multiple numbers (each billed separately).

    // Upload both documents to R2 (permanent, auditable). Best-effort.
    const ts = Date.now();
    const ext = (f) => (f.mimetype?.includes("pdf") ? "pdf" : f.mimetype?.includes("png") ? "png" : "jpg");
    const regKey = `compliance/${orgId}/${ts}-registration.${ext(regFile)}`;
    const gstKey = `compliance/${orgId}/${ts}-gst.${ext(gstFile)}`;

    const [regUrl, gstUrl] = await Promise.all([
      uploadBufferToR2(regKey, regFile.buffer, regFile.mimetype),
      uploadBufferToR2(gstKey, gstFile.buffer, gstFile.mimetype),
    ]);

    // Create the voice-number request record (pending CodeSkate review).
    const record = await createVoiceNumberRequest({
      orgId,
      businessName,
      registrationNumber,
      email: email || "",
      address: address || "",
      city: city || "",
      state: state || "",
      postalCode: postalCode || "",
      registrationDocUrl: regUrl,
      registrationDocFilename: regFile.originalname || regKey,
      gstDocUrl: gstUrl,
      gstDocFilename: gstFile.originalname || gstKey,
    });

    logger.info({ orgId, businessName, recordId: record.id }, "Voice number request submitted for review");

    return res.status(201).json({
      ok: true,
      message: "Request submitted! We'll verify your documents and activate your number within 24-48 hours.",
      record,
    });
  } catch (e) {
    logger.error({ err: e.message }, "Submit compliance error");
    return res.status(500).json({ error: e.message || "Could not submit your request. Please try again." });
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

// ─── POST /priority (admin: reorder which numbers survive underfunding) ──────
export async function priorityHandler(req, res) {
  try {
    const { orgId, numberId, priority } = req.body || {};
    if (!orgId || !numberId || priority == null) {
      return res.status(400).json({ error: "orgId, numberId and priority are required." });
    }
    const membership = await getActiveMembership(req.authUser.uid, orgId);
    if (!membership || (membership.role !== "admin" && membership.role !== "owner")) {
      return res.status(403).json({ error: "Only admins can reorder numbers." });
    }
    const updated = await setNumberPriority(orgId, numberId, priority);
    if (!updated) return res.status(404).json({ error: "Number not found." });
    return res.json({ ok: true, record: updated });
  } catch (e) {
    logger.error({ err: e.message }, "Set priority error");
    return res.status(500).json({ error: "Could not update priority." });
  }
}

// ─── POST /register-owned (platform owner: add an existing owned number) ─────
// Lets the platform owner attach a number CodeSkate already owns on Plivo to a
// tenant org as active — without going through compliance. Used for the shared
// CodeSkate number or numbers bought manually in the Plivo console.
const PLATFORM_OWNER_PHONE = process.env.PLATFORM_OWNER_PHONE || "+919653043939";

export async function registerOwnedHandler(req, res) {
  try {
    const callerPhone = req.authUser.phone_number || req.authUser.phoneNumber || "";
    if (callerPhone !== PLATFORM_OWNER_PHONE) {
      return res.status(403).json({ error: "Only the platform owner can register owned numbers." });
    }

    const { orgId, phoneNumber, displayNumber, businessName, chargeRent } = req.body || {};
    if (!orgId || !phoneNumber) {
      return res.status(400).json({ error: "orgId and phoneNumber are required." });
    }

    const record = await registerOwnedNumber({
      orgId,
      phoneNumber,
      displayNumber: displayNumber || null,
      businessName: businessName || "",
      chargeRent: chargeRent !== false, // default true; pass false for CodeSkate's own free number
    });

    return res.status(201).json({ ok: true, record });
  } catch (e) {
    logger.error({ err: e.message }, "Register owned number error");
    return res.status(500).json({ error: e.message || "Could not register number." });
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


// ─── POST /cancel (customer cancels their own number request/active number) ──
// - pending_review / rejected → free cancel (nothing purchased)
// - active / suspended → deactivate number (stop rent, bridge falls back to "get number")
export async function cancelHandler(req, res) {
  try {
    const { orgId, numberId } = req.body || {};
    if (!orgId || !numberId) return res.status(400).json({ error: "orgId and numberId are required." });

    const membership = await getActiveMembership(req.authUser.uid, orgId);
    if (!membership || (membership.role !== "admin" && membership.role !== "owner")) {
      return res.status(403).json({ error: "Only admins can cancel numbers." });
    }

    const result = await cancelNumber(orgId, numberId);
    if (!result) return res.status(404).json({ error: "Number not found." });

    return res.json({ ok: true, message: "Number request cancelled.", record: result });
  } catch (e) {
    logger.error({ err: e.message }, "Cancel number error");
    return res.status(500).json({ error: e.message || "Could not cancel." });
  }
}

// ─── POST /admin-reject (platform owner rejects a pending request with reason) ──
export async function adminRejectHandler(req, res) {
  try {
    const callerPhone = req.authUser.phone_number || req.authUser.phoneNumber || "";
    if (callerPhone !== PLATFORM_OWNER_PHONE) {
      return res.status(403).json({ error: "Only the platform owner can reject requests." });
    }

    const { numberId, reason } = req.body || {};
    if (!numberId) return res.status(400).json({ error: "numberId is required." });

    const ref = db.collection("voiceNumbers").doc(numberId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Number request not found." });

    await ref.update({
      status: "rejected",
      complianceStatus: "rejected",
      rejectionReason: reason || "Your documents could not be verified. Please resubmit with correct details.",
      updatedAt: new Date().toISOString(),
    });

    return res.json({ ok: true, message: "Request rejected." });
  } catch (e) {
    logger.error({ err: e.message }, "Admin reject error");
    return res.status(500).json({ error: e.message || "Could not reject." });
  }
}

// ─── POST /admin-approve (platform owner approves + assigns a number) ────────
// After verifying docs on Plivo console and purchasing the number there,
// platform owner enters the phone number here → system activates it for the org.
export async function adminApproveHandler(req, res) {
  try {
    const callerPhone = req.authUser.phone_number || req.authUser.phoneNumber || "";
    if (callerPhone !== PLATFORM_OWNER_PHONE) {
      return res.status(403).json({ error: "Only the platform owner can approve requests." });
    }

    const { numberId, phoneNumber, displayNumber } = req.body || {};
    if (!numberId || !phoneNumber) {
      return res.status(400).json({ error: "numberId and phoneNumber are required." });
    }

    const ref = db.collection("voiceNumbers").doc(numberId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Number request not found." });
    const num = snap.data();

    const digits = String(phoneNumber).replace(/\D/g, "");
    const display = displayNumber || `+${digits.slice(0, 2)} ${digits.slice(2, 7)} ${digits.slice(7)}`;

    await ref.update({
      phoneNumber: digits,
      displayNumber: display,
      status: "active",
      complianceStatus: "accepted",
      rejectionReason: null,
      activatedAt: new Date().toISOString(),
      purchasedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Charge first month rent from wallet (if paid number)
    if ((num.monthlyCostInr || 0) > 0) {
      const { chargeFirstMonthRent } = await import("../services/voiceNumbers.js");
      await chargeFirstMonthRent(num.orgId, numberId).catch((e) =>
        logger.warn({ numberId, err: e.message }, "First-month rent charge failed on admin approve")
      );
    }

    logger.info({ numberId, phoneNumber: digits, orgId: num.orgId }, "Number approved and activated by platform admin");
    return res.json({ ok: true, message: "Number approved and activated.", phoneNumber: digits, displayNumber: display });
  } catch (e) {
    logger.error({ err: e.message }, "Admin approve error");
    return res.status(500).json({ error: e.message || "Could not approve." });
  }
}

// ─── GET /admin-pending (platform owner: list all pending voice number requests) ──
export async function adminPendingHandler(req, res) {
  try {
    const callerPhone = req.authUser.phone_number || req.authUser.phoneNumber || "";
    if (callerPhone !== PLATFORM_OWNER_PHONE) {
      return res.status(403).json({ error: "Only the platform owner can view pending requests." });
    }

    const snap = await db.collection("voiceNumbers")
      .where("status", "in", ["pending_review", "compliance_approved", "rejected"])
      .get();

    const requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Sort newest first
    requests.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    return res.json({ ok: true, requests });
  } catch (e) {
    logger.error({ err: e.message }, "Admin pending list error");
    return res.status(500).json({ error: "Could not load pending requests." });
  }
}
