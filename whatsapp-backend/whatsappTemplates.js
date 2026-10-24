import crypto from "crypto";
import express from "express";
import { getAuth } from "firebase-admin/auth";

const MAX_TEMPLATE_PARAMETER_LENGTH = 1024;
const nowIso = () => new Date().toISOString();
const safeDocId = (value) => String(value || "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 180);
const orgCollection = (db, orgId, name) => db.collection("organizations").doc(orgId).collection(name);

function normalizeRecipient(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return /^\d{7,15}$/.test(digits) ? digits : null;
}

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

function bodyTemplateDetails(components, parameterFormat) {
  const body = (components || []).find((component) => String(component?.type || "").toUpperCase() === "BODY") || {};
  const header = (components || []).find((component) => String(component?.type || "").toUpperCase() === "HEADER") || {};
  const text = String(body.text || "");
  // Unique placeholders in first-appearance order. A variable may legally be
  // reused in the body (e.g. "Hi {{1}} ... thanks {{1}}"), so dedupe first.
  const tokens = [...new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1]))];
  const named = String(parameterFormat || "").toUpperCase() === "NAMED" || tokens.some((token) => !/^\d+$/.test(token));
  let parameterCount = tokens.length;
  let parameterNames = [];
  let unsupportedReason = null;
  if (named) {
    parameterNames = tokens;
    if (!tokens.every((token) => /^[a-z0-9_]+$/.test(token))) unsupportedReason = "Invalid named body variables";
  } else if (tokens.length) {
    const numbers = tokens.map(Number).sort((a, b) => a - b);
    parameterCount = numbers[numbers.length - 1];
    if (!numbers.every((item, index) => item === index + 1)) unsupportedReason = "Body variables are not sequential ({{1}}, {{2}}, …)";
  }
  // Header handling. A TEXT header with no variables needs nothing extra.
  // IMAGE / VIDEO / DOCUMENT headers are supported: the sender supplies a
  // public media URL at send time. A TEXT header that contains a variable is
  // still unsupported (we'd need a separate header parameter UI for it).
  const headerFormat = String(header.format || "").toUpperCase() || (header.text ? "TEXT" : "");
  const MEDIA_HEADERS = new Set(["IMAGE", "VIDEO", "DOCUMENT"]);
  const requiresMedia = MEDIA_HEADERS.has(headerFormat);
  if (headerFormat === "TEXT" && /\{\{[^}]+\}\}/.test(String(header.text || ""))) {
    unsupportedReason = "Header variables are not supported yet";
  } else if (headerFormat && headerFormat !== "TEXT" && !requiresMedia) {
    // e.g. LOCATION headers
    unsupportedReason = `${headerFormat.toLowerCase()} header is not supported yet`;
  }
  const buttonsHaveVariables = (components || []).some((component) => String(component?.type || "").toUpperCase() === "BUTTONS"
    && (component.buttons || []).some((button) => /\{\{[^}]+\}\}/.test(String(button?.url || "")) || String(button?.type || "").toUpperCase() === "COPY_CODE" || String(button?.type || "").toUpperCase() === "OTP" || String(button?.type || "").toUpperCase() === "FLOW"));
  if (!unsupportedReason && buttonsHaveVariables) unsupportedReason = "Dynamic URL / copy-code / OTP / flow buttons are not supported yet";
  return {
    preview: text || "Approved WhatsApp template",
    parameterCount,
    parameterFormat: named ? "NAMED" : "POSITIONAL",
    parameterNames,
    headerFormat: headerFormat || "NONE",
    requiresMedia,
    supported: !unsupportedReason,
    unsupportedReason,
  };
}

// Reasonable upper bound so a stored URL can't blow past Firestore/Meta limits.
const MAX_MEDIA_URL_LENGTH = 2048;

/** Validate a sender-supplied media URL for a media-header template. */
export function validateHeaderMediaUrl(url) {
  const value = String(url || "").trim();
  if (!value) return { ok: false, error: "This template needs a media URL for its header" };
  if (value.length > MAX_MEDIA_URL_LENGTH) return { ok: false, error: "Media URL is too long" };
  let parsed;
  try { parsed = new URL(value); } catch { return { ok: false, error: "Enter a valid media URL (https://…)" }; }
  if (parsed.protocol !== "https:") return { ok: false, error: "Media URL must start with https://" };
  return { ok: true, url: value };
}

const HEADER_MEDIA_KEY = { IMAGE: "image", VIDEO: "video", DOCUMENT: "document" };

/**
 * Build the Cloud API `components` array for a synced template, covering both
 * the media header (when the template requires one) and body variables.
 * `media` is { url, filename? } and is only used for media-header templates.
 */
export function templateComponents(template, parameters, media = null) {
  const components = [];
  const headerFormat = String(template?.headerFormat || "").toUpperCase();
  const mediaKey = HEADER_MEDIA_KEY[headerFormat];
  if (template?.requiresMedia && mediaKey && media?.url) {
    const payload = { link: media.url };
    if (headerFormat === "DOCUMENT" && media.filename) payload.filename = media.filename;
    components.push({ type: "header", parameters: [{ type: mediaKey, [mediaKey]: payload }] });
  }
  const values = Array.isArray(parameters) ? parameters : [];
  if (values.length) {
    const names = template?.parameterFormat === "NAMED" ? template.parameterNames || [] : null;
    components.push({
      type: "body",
      parameters: values.map((text, index) => (names
        ? { type: "text", parameter_name: names[index], text }
        : { type: "text", text })),
    });
  }
  return components.length ? components : undefined;
}

/** Back-compat wrapper: body-only components. */
export function templateBodyComponents(template, parameters) {
  return templateComponents(template, parameters, null);
}

function renderPreview(template, parameters) {
  const names = template.parameterFormat === "NAMED" ? template.parameterNames || [] : null;
  return String(template.preview || template.name || "WhatsApp template")
    .replace(PLACEHOLDER, (match, token) => {
      const index = names ? names.indexOf(token) : Number(token) - 1;
      return index >= 0 ? parameters[index] || "" : match;
    });
}

function normalizedTemplate(raw) {
  const details = bodyTemplateDetails(raw.components, raw.parameter_format);
  return {
    metaTemplateId: String(raw.id || ""),
    name: String(raw.name || ""),
    language: String(raw.language || "en_US"),
    status: String(raw.status || "").toUpperCase(),
    category: String(raw.category || ""),
    qualityScore: raw.quality_score?.score || raw.quality_score || null,
    components: Array.isArray(raw.components) ? raw.components : [],
    preview: details.preview,
    parameterCount: details.parameterCount,
    parameterFormat: details.parameterFormat,
    parameterNames: details.parameterNames,
    headerFormat: details.headerFormat,
    requiresMedia: details.requiresMedia,
    supported: details.supported,
    unsupportedReason: details.unsupportedReason,
    available: String(raw.status || "").toUpperCase() === "APPROVED" && details.supported,
  };
}

export default function createWhatsAppTemplatesRouter(db, helpers) {
  const router = express.Router();
  const { metaGraphRequest, decryptWhatsAppToken, isWhatsAppCredentialExpired } = helpers;

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

  async function membership(uid, orgId) {
    if (!uid || !orgId) return null;
    const snap = await db.collection("memberships").doc(`${uid}_${orgId}`).get();
    return snap.exists && snap.data().active === true ? snap.data() : null;
  }

  router.post("/sync", requireAuth, async (req, res) => {
    try {
      const orgId = String(req.body?.orgId || "").trim();
      const actor = await membership(req.authUser.uid, orgId);
      const isAdmin = actor?.role === "owner" || actor?.role === "admin";
      if (!isAdmin) return res.status(403).json({ error: "Organization admin access required" });

      const credentialSnap = await db.collection("whatsappCredentials").doc(orgId).get();
      if (!credentialSnap.exists || credentialSnap.data().connectionState !== "connected" || isWhatsAppCredentialExpired(credentialSnap.data())) {
        return res.status(409).json({ error: "Reconnect WhatsApp Business before syncing templates" });
      }
      const credential = credentialSnap.data();
      const providerToken = decryptWhatsAppToken(credential.tokenCiphertext);
      let page = await metaGraphRequest(`${credential.wabaId}/message_templates?limit=250&fields=id,name,language,status,category,components,quality_score,parameter_format`, {
        token: providerToken,
      });
      const rawTemplates = [];
      while (page) {
        rawTemplates.push(...(page.data || []));
        const nextUrl = page.paging?.next;
        if (!nextUrl) break;
        const next = new URL(nextUrl);
        const relativePath = `${next.pathname.replace(/^\/v\d+\.\d+\//, "").replace(/^\//, "")}${next.search}`;
        page = await metaGraphRequest(relativePath, { token: providerToken });
      }
      const templates = rawTemplates.map(normalizedTemplate).filter((template) => template.metaTemplateId && template.name);
      const collection = orgCollection(db, orgId, "whatsappTemplates");
      const existing = await collection.get();
      const nextIds = new Set(templates.map((template) => safeDocId(`${template.metaTemplateId}_${template.language}`)));
      const syncedAt = nowIso();
      const writes = [];
      templates.forEach((template) => {
        const id = safeDocId(`${template.metaTemplateId}_${template.language}`);
        writes.push({ ref: collection.doc(id), data: { ...template, orgId, syncedAt, syncedBy: req.authUser.uid }, options: { merge: true } });
      });
      existing.docs.forEach((template) => {
        if (!nextIds.has(template.id) && template.data().source !== "manual") {
          writes.push({ ref: template.ref, data: { available: false, staleAt: syncedAt }, options: { merge: true } });
        }
      });
      // Firestore permits at most 500 writes per batch. Keep each catalog sync
      // below that limit even when Meta returns multiple pages of templates.
      for (let offset = 0; offset < writes.length; offset += 450) {
        const batch = db.batch();
        writes.slice(offset, offset + 450).forEach((write) => batch.set(write.ref, write.data, write.options));
        await batch.commit();
      }
      await orgCollection(db, orgId, "activity").add({
        text: `WhatsApp templates synced: ${templates.length} found, ${templates.filter((template) => template.available).length} ready to send.`,
        at: syncedAt,
        orgId,
        actorId: req.authUser.uid,
        source: "whatsapp_templates",
      });
      return res.json({ ok: true, total: templates.length, available: templates.filter((template) => template.available).length });
    } catch (error) {
      console.error("WhatsApp template sync failed:", error.message, error.providerCode || "", error.providerMessage || "");
      // Surface Meta's reason (e.g. missing whatsapp_business_management
      // permission, wrong WABA) so admins can act on it instead of a generic error.
      const message = error.providerMessage
        ? `Meta rejected the template sync: ${error.providerMessage}`
        : error.message || "Could not sync WhatsApp templates";
      return res.status(error.status || 500).json({ error: message, providerCode: error.providerCode });
    }
  });

  router.post("/send", requireAuth, async (req, res) => {
    const orgId = String(req.body?.orgId || "").trim();
    const leadId = String(req.body?.leadId || "").trim();
    const templateId = safeDocId(req.body?.templateId || "");
    const clientMessageId = safeDocId(req.body?.clientMessageId || "");
    const parameters = Array.isArray(req.body?.parameters) ? req.body.parameters.map((item) => String(item || "").trim()) : [];
    const headerMediaUrl = String(req.body?.headerMediaUrl || "").trim();
    const headerMediaFilename = String(req.body?.headerMediaFilename || "").trim().slice(0, 240);
    let messageRef = null;
    let intentRef = null;
    let dispatchRef = null;
    let claimed = false;
    let providerDispatchStarted = false;
    let providerAccepted = false;
    try {
      if (!orgId || !leadId || !templateId || !clientMessageId) {
        return res.status(400).json({ error: "Organization, lead, approved template, and message ID are required" });
      }
      if (parameters.some((parameter) => !parameter || parameter.length > MAX_TEMPLATE_PARAMETER_LENGTH)) {
        return res.status(400).json({ error: `Template values must be between 1 and ${MAX_TEMPLATE_PARAMETER_LENGTH} characters` });
      }
      const actor = await membership(req.authUser.uid, orgId);
      if (!actor) return res.status(403).json({ error: "Active organization membership required" });
      const leadRef = orgCollection(db, orgId, "leads").doc(leadId);
      messageRef = leadRef.collection("messages").doc(clientMessageId);
      const templateRef = orgCollection(db, orgId, "whatsappTemplates").doc(templateId);

      const send = await db.runTransaction(async (tx) => {
        const [leadSnap, credentialSnap, templateSnap, existingMessage] = await Promise.all([
          tx.get(leadRef),
          tx.get(db.collection("whatsappCredentials").doc(orgId)),
          tx.get(templateRef),
          tx.get(messageRef),
        ]);
        if (!leadSnap.exists) throw Object.assign(new Error("Lead not found"), { status: 404 });
        const lead = leadSnap.data();
        if (actor.role === "employee" && lead.assignedTo !== req.authUser.uid) {
          throw Object.assign(new Error("This lead is not assigned to you"), { status: 403 });
        }
        if (!credentialSnap.exists || credentialSnap.data().connectionState !== "connected" || isWhatsAppCredentialExpired(credentialSnap.data())) {
          throw Object.assign(new Error("Reconnect WhatsApp Business before sending a template"), { status: 409 });
        }
        if (!templateSnap.exists) throw Object.assign(new Error("Choose an approved WhatsApp template"), { status: 404 });
        const template = templateSnap.data();
        if (template.status !== "APPROVED" || template.available !== true || template.supported !== true) {
          throw Object.assign(new Error("This WhatsApp template is not approved or is not supported yet"), { status: 409 });
        }
        if (parameters.length !== Number(template.parameterCount || 0)) {
          throw Object.assign(new Error(`This template needs ${Number(template.parameterCount || 0)} value(s)`), { status: 400 });
        }
        let media = null;
        if (template.requiresMedia) {
          const check = validateHeaderMediaUrl(headerMediaUrl);
          if (!check.ok) throw Object.assign(new Error(check.error), { status: 400 });
          media = { url: check.url };
          if (String(template.headerFormat).toUpperCase() === "DOCUMENT" && headerMediaFilename) media.filename = headerMediaFilename;
        }
        const recipient = normalizeRecipient(lead.phone);
        if (!recipient) throw Object.assign(new Error("This lead does not have a valid WhatsApp number"), { status: 400 });
        const text = renderPreview(template, parameters);

        if (existingMessage.exists) {
          const prior = existingMessage.data();
          if (prior.direction !== "outbound" || prior.type !== "template" || prior.templateId !== templateId
            || JSON.stringify(prior.templateParameters || []) !== JSON.stringify(parameters)
            || (prior.headerMediaUrl || "") !== headerMediaUrl) {
            throw Object.assign(new Error("Message ID cannot be reused for different template content"), { status: 409 });
          }
          if (prior.status === "sent") return { replay: true, providerMessageId: prior.providerMessageId || null };
          if (prior.status === "indeterminate") throw Object.assign(new Error("Template delivery is being reconciled; do not send it again"), { status: 409, code: "delivery_indeterminate" });
          if (prior.status === "processing") {
            tx.set(messageRef, { status: "indeterminate", indeterminateAt: nowIso(), failure: "Provider delivery outcome requires reconciliation" }, { merge: true });
            return { reconciliation: true };
          }
        }

        const intentId = crypto.createHash("sha256").update(`${orgId}|${leadId}|${recipient}|template|${templateId}|${JSON.stringify(parameters)}|${media?.url || ""}`).digest("hex");
        intentRef = db.collection("whatsappOutboundIntents").doc(intentId);
        const priorIntent = await tx.get(intentRef);
        if (priorIntent.exists) {
          const data = priorIntent.data();
          if (data.status === "indeterminate") throw Object.assign(new Error("An equivalent template has an unresolved delivery outcome"), { status: 409, code: "delivery_indeterminate" });
          if (data.status === "processing" && data.clientMessageId !== clientMessageId) throw Object.assign(new Error("An equivalent WhatsApp template is already being sent"), { status: 409 });
        }
        dispatchRef = db.collection("whatsappOutboundDispatches").doc(clientMessageId);
        tx.set(intentRef, { orgId, leadId, recipient, text, clientMessageId, templateId, parameters, headerMedia: media, kind: "template", status: "processing", processingStartedAt: nowIso(), processingStartedAtMs: Date.now() }, { merge: true });
        tx.set(dispatchRef, { orgId, leadId, recipient, text, intentId, clientMessageId, templateId, parameters, headerMedia: media, kind: "template", status: "processing", createdAt: nowIso(), createdAtMs: Date.now() }, { merge: true });
        tx.set(messageRef, {
          direction: "outbound",
          type: "template",
          text,
          recipient,
          templateId,
          templateName: template.name,
          templateLanguage: template.language,
          templateParameters: parameters,
          headerMediaUrl: media?.url || null,
          headerMediaFilename: media?.filename || null,
          status: "processing",
          at: nowIso(),
          atMs: Date.now(),
          processingStartedAt: nowIso(),
          processingStartedAtMs: Date.now(),
          senderUid: req.authUser.uid,
          senderName: req.authUser.name || req.authUser.phone_number || "CRM user",
        }, { merge: true });
        return { credential: credentialSnap.data(), template, recipient, media, replay: false };
      });
      if (send.reconciliation) return res.status(409).json({ error: "Template delivery is being reconciled; do not send it again", code: "delivery_indeterminate" });
      if (send.replay) return res.json({ ok: true, replay: true, messageId: clientMessageId, providerMessageId: send.providerMessageId });
      claimed = true;
      providerDispatchStarted = true;
      const templateBody = {
        messaging_product: "whatsapp",
        to: send.recipient,
        type: "template",
        template: {
          name: send.template.name,
          language: { code: send.template.language },
          ...(templateComponents(send.template, parameters, send.media) ? { components: templateComponents(send.template, parameters, send.media) } : {}),
        },
        biz_opaque_callback_data: clientMessageId,
      };
      const provider = await metaGraphRequest(`${send.credential.phoneNumberId}/messages`, {
        method: "POST",
        token: decryptWhatsAppToken(send.credential.tokenCiphertext),
        body: templateBody,
      });
      providerAccepted = true;
      const providerMessageId = provider.messages?.[0]?.id || null;
      await db.runTransaction(async (tx) => {
        tx.set(messageRef, { status: "sent", providerMessageId, sentAt: nowIso(), sentAtMs: Date.now(), failure: null }, { merge: true });
        tx.set(dispatchRef, { status: "sent", providerMessageId, finalizedAt: nowIso() }, { merge: true });
        tx.update(leadRef, { lastWhatsAppOutboundAt: nowIso(), lastWhatsAppOutboundAtMs: Date.now(), lastUpdated: nowIso() });
        tx.delete(intentRef);
      });
      return res.json({ ok: true, messageId: clientMessageId, providerMessageId });
    } catch (error) {
      if (messageRef && claimed) {
        const outcomeUnknown = providerAccepted || (providerDispatchStarted && error.deliveryUnknown !== false);
        await db.runTransaction(async (tx) => {
          tx.set(messageRef, outcomeUnknown ? { status: "indeterminate", indeterminateAt: nowIso(), failure: "Provider delivery outcome requires reconciliation" } : { status: "failed", failedAt: nowIso(), failure: "WhatsApp provider delivery request failed" }, { merge: true });
          if (intentRef) tx.set(intentRef, outcomeUnknown ? { status: "indeterminate", indeterminateAt: nowIso() } : { status: "failed", failedAt: nowIso() }, { merge: true });
          if (dispatchRef) tx.set(dispatchRef, outcomeUnknown ? { status: "reconciling", reconcileAt: nowIso() } : { status: "failed", failedAt: nowIso() }, { merge: true });
        }).catch(() => {});
      }
      console.error("WhatsApp template send failed:", error.message);
      return res.status(error.status || 500).json({ error: error.message || "Could not send WhatsApp template", code: error.code });
    }
  });

  return router;
}
