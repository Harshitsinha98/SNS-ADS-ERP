import crypto from "crypto";
import express from "express";
import { getAuth } from "firebase-admin/auth";
import { getNextEmployeeByWorkload, getNextEmployeeRoundRobin } from "./utils/assignLead.js";

const nowIso = () => new Date().toISOString();
const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const trimText = (value, length = 240) => String(value || "").trim().slice(0, length);
const hashValue = (value) => crypto.createHash("sha256").update(String(value || "")).digest("hex");

export function normalizeLeadPhone(value) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  // Indian ten-digit website forms are normalized to E.164. Other valid
  // country-code numbers remain supported for future international customers.
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  if (/^\d{7,15}$/.test(digits)) return `+${digits}`;
  return "";
}

export function normalizeLeadEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function phoneAliases(value) {
  const normalized = normalizeLeadPhone(value);
  const raw = String(value || "").trim();
  const digits = normalized.replace(/\D/g, "");
  return [...new Set([raw, normalized, digits, digits.startsWith("91") ? digits.slice(2) : ""]
    .filter(Boolean))];
}

function leadDedupEntries(lead) {
  const entries = [];
  if (lead.externalLeadId) entries.push(["external", lead.externalLeadId]);
  for (const phone of phoneAliases(lead.phone)) entries.push(["phone", phone]);
  if (lead.email) entries.push(["email", lead.email]);
  return [...new Map(entries.map(([type, value]) => [`${type}:${value}`, { type, value }])).values()];
}

function subscriptionAllowsLeadCreation(org) {
  return org.subscriptionStatus === "active"
    || (org.subscriptionStatus === "trialing" && (!org.trialEndsAtMs || org.trialEndsAtMs > Date.now()));
}

function normalizeLeadPayload(input = {}, { source, origin }) {
  const phone = normalizeLeadPhone(input.phone);
  const email = normalizeLeadEmail(input.email);
  if (!phone && !email) {
    const error = new Error("Provide a valid phone number or email address");
    error.status = 400;
    throw error;
  }

  const name = trimText(input.name, 120) || (origin === "manual" ? "New Lead" : "Website Lead");
  return {
    name,
    phone,
    email,
    source: trimText(source, 80) || "Website",
    sourceDetail: trimText(input.sourceDetail || input.source, 120) || null,
    campaign: trimText(input.campaign, 120) || null,
    requirement: trimText(input.requirement || input.message, 2000),
    externalLeadId: trimText(input.externalLeadId, 160) || null,
    utmSource: trimText(input.utmSource, 120) || null,
    utmMedium: trimText(input.utmMedium, 120) || null,
    utmCampaign: trimText(input.utmCampaign, 120) || null,
    priority: ["Hot", "Warm", "Cold"].includes(input.priority) ? input.priority : "Warm",
    origin,
  };
}

function valueFrom(input, names) {
  for (const name of names) {
    const value = input?.[name];
    if (Array.isArray(value) && value.length) return value[0];
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return "";
}

// Most form platforms use slightly different field labels. The generic
// webhook accepts their common spellings without asking clients to write code.
function normalizeWebhookPayload(input = {}) {
  const firstName = valueFrom(input, ["firstName", "first_name", "firstname"]);
  const lastName = valueFrom(input, ["lastName", "last_name", "lastname"]);
  const fullName = valueFrom(input, ["name", "fullName", "full_name", "fullname"]);
  return {
    name: fullName || `${firstName} ${lastName}`.trim(),
    phone: valueFrom(input, ["phone", "phoneNumber", "phone_number", "mobile", "mobileNumber", "mobile_number", "tel"]),
    email: valueFrom(input, ["email", "emailAddress", "email_address"]),
    requirement: valueFrom(input, ["requirement", "message", "comments", "comment", "description", "enquiry", "inquiry"]),
    sourceDetail: valueFrom(input, ["sourceDetail", "source_detail", "formName", "form_name", "source"]),
    campaign: valueFrom(input, ["campaign", "campaignName", "campaign_name"]),
    externalLeadId: valueFrom(input, ["externalLeadId", "external_lead_id", "submissionId", "submission_id", "responseId", "response_id", "entryId", "entry_id"]),
    utmSource: valueFrom(input, ["utmSource", "utm_source"]),
    utmMedium: valueFrom(input, ["utmMedium", "utm_medium"]),
    utmCampaign: valueFrom(input, ["utmCampaign", "utm_campaign"]),
    priority: valueFrom(input, ["priority"]),
  };
}

function normalizeDomains(value) {
  const rawValues = Array.isArray(value) ? value : String(value || "").split(/[\n,]/);
  const domains = rawValues.map((item) => {
    const text = trimText(item, 300).replace(/^\*\./, "");
    if (!text) return "";
    try {
      return new URL(text.includes("://") ? text : `https://${text}`).hostname.toLowerCase();
    } catch {
      return "";
    }
  }).filter(Boolean);
  return [...new Set(domains)];
}

function isAllowedEmbedDomain(domains, candidate) {
  const domain = normalizeDomains([candidate])[0];
  return Boolean(domain && domains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`)));
}

function integrationUrls({ publicBackendUrl, publicFrontendUrl, orgId, formToken, webhookToken, hostedFormAvailable }) {
  const backend = String(publicBackendUrl).replace(/\/$/, "");
  const frontend = String(publicFrontendUrl).replace(/\/$/, "");
  const encodedOrgId = encodeURIComponent(orgId);
  return {
    // This token is public because it appears in an iframe URL. It can only
    // submit a Turnstile-verified hosted form and never authorizes webhooks.
    embedUrl: hostedFormAvailable ? `${frontend}/website-lead-form/${encodedOrgId}/${formToken}` : null,
    // This separate secret is for trusted servers/form providers only.
    webhookUrl: `${backend}/api/leads/webhook/${encodedOrgId}/${webhookToken}`,
  };
}

async function findDuplicateLead(leadsRef, lead) {
  if (lead.externalLeadId) {
    const external = await leadsRef.where("externalLeadId", "==", lead.externalLeadId).limit(1).get();
    if (!external.empty) return { doc: external.docs[0], reason: "external_lead_id" };
  }

  for (const phone of phoneAliases(lead.phone)) {
    const matches = await leadsRef.where("phone", "==", phone).limit(1).get();
    if (!matches.empty) return { doc: matches.docs[0], reason: "phone" };
  }

  if (lead.email) {
    const matches = await leadsRef.where("email", "==", lead.email).limit(1).get();
    if (!matches.empty) return { doc: matches.docs[0], reason: "email" };
  }
  return null;
}

async function reserveLeadCapacity(db, orgId) {
  const orgRef = db.collection("organizations").doc(orgId);
  return db.runTransaction(async (tx) => {
    const orgSnap = await tx.get(orgRef);
    if (!orgSnap.exists) {
      const error = new Error("Organization not found");
      error.status = 404;
      throw error;
    }
    const org = orgSnap.data();
    if (!subscriptionAllowsLeadCreation(org)) {
      const error = new Error("An active subscription or trial is required to create leads");
      error.status = 403;
      throw error;
    }
    const limit = Number(org.leadsLimit || 0);
    const used = Number(org.leadsUsed || 0);
    if (limit > 0 && used + 1 > limit) {
      const error = new Error("Lead limit reached. Upgrade your plan to add more leads.");
      error.status = 409;
      throw error;
    }
    tx.update(orgRef, { leadsUsed: used + 1 });
    return true;
  });
}

async function releaseLeadCapacity(db, orgId) {
  const orgRef = db.collection("organizations").doc(orgId);
  await db.runTransaction(async (tx) => {
    const org = await tx.get(orgRef);
    if (!org.exists) return;
    tx.update(orgRef, { leadsUsed: Math.max(0, Number(org.data().leadsUsed || 0) - 1) });
  });
}

async function chooseAssignee(db, orgId) {
  const settings = await db.collection("organizations").doc(orgId).collection("settings").doc("config").get();
  const assigner = settings.exists && settings.data().autoAssign === "workload" ? "workload" : "round-robin";
  const employee = assigner === "workload"
    ? await getNextEmployeeByWorkload(db, orgId)
    : await getNextEmployeeRoundRobin(db, orgId);
  if (!employee?.id) {
    const error = new Error("Add an active employee before creating leads");
    error.status = 409;
    throw error;
  }
  return employee;
}

export async function createLeadFromIntake({ db, orgId, input, source, origin, actorId = "system" }) {
  const lead = normalizeLeadPayload(input, { source, origin });
  const leadsRef = db.collection("organizations").doc(orgId).collection("leads");
  const duplicate = await findDuplicateLead(leadsRef, lead);
  if (duplicate) {
    return { ok: true, duplicate: true, leadId: duplicate.doc.id, duplicateReason: duplicate.reason };
  }

  const employee = await chooseAssignee(db, orgId);
  await reserveLeadCapacity(db, orgId);
  try {
    // Recheck after capacity reservation to prevent simultaneous requests from
    // creating a duplicate lead after the first request's initial check.
    const recheckedDuplicate = await findDuplicateLead(leadsRef, lead);
    if (recheckedDuplicate) {
      await releaseLeadCapacity(db, orgId);
      return { ok: true, duplicate: true, leadId: recheckedDuplicate.doc.id, duplicateReason: recheckedDuplicate.reason };
    }

    const createdAt = nowIso();
    const leadRef = leadsRef.doc();
    const batch = db.batch();
    // These `create` writes form unique, server-owned indexes. If two requests
    // arrive at once with the same phone, email, or provider submission ID,
    // Firestore allows only one batch to commit.
    for (const entry of leadDedupEntries(lead)) {
      batch.create(
        db.collection("organizations").doc(orgId).collection("leadDedup").doc(hashValue(`${entry.type}:${entry.value}`)),
        { leadId: leadRef.id, type: entry.type, createdAt }
      );
    }
    batch.create(leadRef, {
      ...lead,
      status: "New",
      assignedTo: employee.id,
      assignedToName: employee.name || employee.displayName || null,
      blacklisted: false,
      createdAt,
      lastUpdated: createdAt,
      followUp: null,
      lastContactedAt: null,
      orgId,
    });
    batch.create(leadRef.collection("notes").doc("created"), {
      type: "system",
      text: `Lead created via ${lead.source}`,
      authorId: actorId,
      authorName: origin === "manual" ? "Workspace admin" : origin === "webhook" ? "Website webhook" : "Hosted website form",
      visibility: "team",
      at: createdAt,
    });
    batch.create(db.collection("organizations").doc(orgId).collection("notifications").doc(), {
      userId: employee.id,
      text: `New ${lead.source} lead: ${lead.name} (${leadRef.id})`,
      read: false,
      at: createdAt,
      orgId,
    });
    batch.create(db.collection("organizations").doc(orgId).collection("activity").doc(), {
      text: `${lead.source} lead created: ${lead.name} → ${employee.name || employee.id}`,
      at: createdAt,
      orgId,
      actorId,
      leadId: leadRef.id,
      source: lead.source,
    });
    await batch.commit();
    return { ok: true, duplicate: false, leadId: leadRef.id, assignedTo: employee.id, assignedToName: employee.name || employee.displayName || null };
  } catch (error) {
    await releaseLeadCapacity(db, orgId).catch(() => {});
    // A conflicting unique-index write means another concurrent request won.
    // Return the existing lead instead of surfacing a transient write error.
    const duplicateAfterFailure = await findDuplicateLead(leadsRef, lead).catch(() => null);
    if (duplicateAfterFailure) {
      return {
        ok: true,
        duplicate: true,
        leadId: duplicateAfterFailure.doc.id,
        duplicateReason: duplicateAfterFailure.reason,
      };
    }
    throw error;
  }
}

export default function createLeadIntakeRouter(db, {
  publicBackendUrl = "",
  publicFrontendUrl = "",
  turnstileSiteKey = "",
  turnstileSecret = "",
  requireHttpsPublicUrls = false,
} = {}) {
  const router = express.Router();
  router.use(express.urlencoded({ extended: false, limit: "1mb" }));

  function integrationRef(orgId) {
    return db.collection("websiteLeadIntegrations").doc(orgId);
  }

  function hasValidPublicUrl(value) {
    try {
      const parsed = new URL(String(value || ""));
      return requireHttpsPublicUrls ? parsed.protocol === "https:" : ["http:", "https:"].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  async function takeRateLimit(scope, orgId, ip, maxRequests) {
    const windowMs = 10 * 60 * 1000;
    const now = Date.now();
    const bucket = Math.floor(now / windowMs);
    const ref = db.collection("websiteLeadRateLimits").doc(hashValue(`${scope}:${orgId}:${ip}:${bucket}`));
    return db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      const count = current.exists ? Number(current.data().count || 0) : 0;
      if (count >= maxRequests) return false;
      tx.set(ref, {
        scope,
        orgId,
        bucket,
        count: count + 1,
        // Set a native timestamp so Firestore TTL can automatically clean this
        // shared limiter record after its window (configure TTL on expiresAt).
        expiresAt: new Date((bucket + 1) * windowMs),
        expiresAtMs: (bucket + 1) * windowMs,
        updatedAt: nowIso(),
      }, { merge: true });
      return true;
    });
  }

  async function verifyHostedFormChallenge(token, ip) {
    if (!turnstileSiteKey || !turnstileSecret) {
      const error = new Error("Hosted forms are unavailable until Cloudflare Turnstile is configured");
      error.status = 503;
      throw error;
    }
    if (!token) {
      const error = new Error("Please complete the security check");
      error.status = 400;
      throw error;
    }
    let response;
    try {
      response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret: turnstileSecret, response: token, remoteip: String(ip || "") }),
      });
    } catch {
      const error = new Error("Could not verify the security check. Please try again.");
      error.status = 502;
      throw error;
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success !== true) {
      const error = new Error("Security check failed. Please try again.");
      error.status = 400;
      throw error;
    }
  }

  async function requireAuth(req, res, next) {
    try {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      if (!token) return res.status(401).json({ error: "Missing auth token" });
      req.authUser = await getAuth().verifyIdToken(token);
      return next();
    } catch {
      return res.status(401).json({ error: "Invalid auth token" });
    }
  }

  async function requireOrgAdmin(req, res, next) {
    const orgId = String(req.body?.orgId || req.query?.orgId || req.params?.orgId || "").trim();
    if (!orgId) return res.status(400).json({ error: "Organization is required" });
    const membership = await db.collection("memberships").doc(`${req.authUser.uid}_${orgId}`).get();
    const role = membership.data()?.role;
    if (!membership.exists || membership.data()?.active !== true || !["owner", "admin"].includes(role)) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    req.orgId = orgId;
    return next();
  }

  async function loadIntegration(orgId, token, channel) {
    const integration = await integrationRef(orgId).get();
    const data = integration.data();
    const hashField = channel === "form" ? "formTokenHash" : "webhookTokenHash";
    if (!integration.exists || data.active !== true || !safeEqual(data[hashField], hashValue(token))) {
      const error = new Error("Invalid or inactive website integration link");
      error.status = 401;
      throw error;
    }
    return data;
  }

  function publicIntegrationConfig(data) {
    return {
      formTitle: data.formTitle || "Talk to our team",
      submitLabel: data.submitLabel || "Send enquiry",
      successMessage: data.successMessage || "Thank you. Our team will contact you shortly.",
      // A site key is public by design; the matching secret stays on Render.
      turnstileSiteKey: turnstileSiteKey || null,
    };
  }

  router.post("/manual", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      const result = await createLeadFromIntake({
        db,
        orgId: req.orgId,
        input: req.body,
        source: trimText(req.body?.source, 80) || "Manual",
        origin: "manual",
        actorId: req.authUser.uid,
      });
      res.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Could not create lead" });
    }
  });

  // One workspace-level configuration creates both a no-code hosted form and
  // a secret URL for server-side/no-code provider webhooks. The token is shown
  // once only; regenerate it to revoke all prior embed/webhook URLs.
  router.get("/integrations", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      const integration = await integrationRef(req.orgId).get();
      if (!integration.exists || integration.data().active !== true) {
        return res.json({ configured: false });
      }
      const data = integration.data();
      return res.json({
        configured: true,
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
        formTokenPrefix: data.formTokenPrefix || null,
        webhookTokenPrefix: data.webhookTokenPrefix || null,
        allowedDomains: data.allowedDomains || [],
        hostedFormAvailable: Boolean(turnstileSiteKey && turnstileSecret),
        ...publicIntegrationConfig(data),
      });
    } catch {
      return res.status(500).json({ error: "Could not load website integration" });
    }
  });

  router.post("/integrations", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      const allowedDomains = normalizeDomains(req.body?.allowedDomains);
      if (!hasValidPublicUrl(publicFrontendUrl) || !hasValidPublicUrl(publicBackendUrl)) {
        return res.status(503).json({ error: "Set valid PUBLIC_FRONTEND_URL and PUBLIC_BACKEND_URL values before creating website links" });
      }
      const formToken = `csk_form_${crypto.randomBytes(24).toString("base64url")}`;
      const webhookToken = `csk_hook_${crypto.randomBytes(32).toString("base64url")}`;
      const createdAt = nowIso();
      const previous = await integrationRef(req.orgId).get();
      const savedConfig = {
        // Informational workspace record for the client website(s). Public
        // form abuse protection comes from server-verified Turnstile, not a
        // caller-controlled browser domain value.
        allowedDomains,
        formTitle: trimText(req.body?.formTitle, 100) || "Talk to our team",
        submitLabel: trimText(req.body?.submitLabel, 60) || "Send enquiry",
        successMessage: trimText(req.body?.successMessage, 240) || "Thank you. Our team will contact you shortly.",
      };
      await integrationRef(req.orgId).set({
        orgId: req.orgId,
        // Public hosted forms and trusted provider webhooks intentionally use
        // different credentials. A public iframe URL can never call /webhook.
        formTokenHash: hashValue(formToken),
        formTokenPrefix: formToken.slice(0, 14),
        webhookTokenHash: hashValue(webhookToken),
        webhookTokenPrefix: webhookToken.slice(0, 14),
        ...savedConfig,
        active: true,
        createdBy: req.authUser.uid,
        createdAt: previous.exists ? previous.data().createdAt || createdAt : createdAt,
        updatedAt: createdAt,
      });
      const hostedFormAvailable = Boolean(turnstileSiteKey && turnstileSecret);
      return res.status(201).json({
        ok: true,
        formTokenPrefix: formToken.slice(0, 14),
        webhookTokenPrefix: webhookToken.slice(0, 14),
        hostedFormAvailable,
        ...publicIntegrationConfig(savedConfig),
        ...integrationUrls({
          publicBackendUrl,
          publicFrontendUrl,
          orgId: req.orgId,
          formToken,
          webhookToken,
          hostedFormAvailable,
        }),
      });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || "Could not create website integration" });
    }
  });

  router.post("/website-key", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      const secret = `csk_live_${crypto.randomBytes(24).toString("base64url")}`;
      const keyHash = hashValue(secret);
      await db.collection("websiteLeadKeys").doc(req.orgId).set({
        orgId: req.orgId,
        keyHash,
        keyPrefix: secret.slice(0, 13),
        createdBy: req.authUser.uid,
        createdAt: nowIso(),
        active: true,
      });
      res.json({
        ok: true,
        key: secret,
        endpoint: `${String(publicBackendUrl).replace(/\/$/, "")}/api/leads/website/${req.orgId}`,
      });
    } catch {
      res.status(500).json({ error: "Could not create website intake key" });
    }
  });

  router.get("/public-form/:orgId/:token", async (req, res) => {
    try {
      const { orgId, token } = req.params;
      const integration = await loadIntegration(orgId, token, "form");
      if (!turnstileSiteKey || !turnstileSecret) {
        return res.status(503).json({ error: "Hosted forms are unavailable until Cloudflare Turnstile is configured" });
      }
      return res.json(publicIntegrationConfig(integration));
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || "Could not load website form" });
    }
  });

  router.post("/public-form/:orgId/:token", async (req, res) => {
    try {
      const { orgId, token } = req.params;
      await loadIntegration(orgId, token, "form");
      if (trimText(req.body?._cskWebsite, 200)) {
        return res.status(400).json({ error: "Spam submission rejected" });
      }
      await verifyHostedFormChallenge(req.body?.turnstileToken, req.ip);
      if (!(await takeRateLimit("hosted_form", orgId, req.ip, 12))) {
        return res.status(429).json({ error: "Too many submissions. Please try again later." });
      }
      await createLeadFromIntake({
        db,
        orgId,
        input: {
          ...normalizeWebhookPayload(req.body || {}),
          sourceDetail: "CodeSkate hosted form",
        },
        source: "Website",
        origin: "hosted_form",
        actorId: "website_form",
      });
      // This is a public browser endpoint. Do not reveal whether a lead already
      // exists or expose internal lead/employee identifiers to the visitor.
      return res.status(201).json({ ok: true });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || "Could not receive website lead" });
    }
  });

  // This URL is designed for trusted form-plugin webhooks, Zapier, Make,
  // Pabbly, and custom backends. It accepts a documented flat JSON or
  // urlencoded payload; nested providers should use a mapping step first.
  router.post("/webhook/:orgId/:token", async (req, res) => {
    try {
      const { orgId, token } = req.params;
      await loadIntegration(orgId, token, "webhook");
      if (!(await takeRateLimit("webhook", orgId, req.ip, 30))) {
        return res.status(429).json({ error: "Too many intake requests. Please try again later." });
      }
      const result = await createLeadFromIntake({
        db,
        orgId,
        input: normalizeWebhookPayload(req.body || {}),
        source: "Website",
        origin: "webhook",
        actorId: "website_webhook",
      });
      return res.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || "Could not receive website lead" });
    }
  });

  // This advanced endpoint uses a header key and is intentionally kept for
  // custom server-side integrations where a secret must not live in a URL.
  router.post("/website/:orgId", async (req, res) => {
    try {
      const orgId = String(req.params.orgId || "").trim();
      const suppliedKey = String(req.headers["x-codeskate-intake-key"] || "").trim();
      if (!orgId || !suppliedKey) return res.status(401).json({ error: "Website intake key is required" });

      const keySnap = await db.collection("websiteLeadKeys").doc(orgId).get();
      const keyData = keySnap.data();
      const keyHash = hashValue(suppliedKey);
      if (!keySnap.exists || keyData.active !== true || !safeEqual(keyData.keyHash, keyHash)) {
        return res.status(401).json({ error: "Invalid website intake key" });
      }
      if (!(await takeRateLimit("developer_api", orgId, req.ip, 30))) {
        return res.status(429).json({ error: "Too many intake requests. Please try again later." });
      }

      const result = await createLeadFromIntake({
        db,
        orgId,
        input: req.body || {},
        source: "Website",
        origin: "website",
        actorId: "website_intake",
      });
      return res.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || "Could not receive website lead" });
    }
  });

  return router;
}
