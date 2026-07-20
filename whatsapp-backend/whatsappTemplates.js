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

function bodyTemplateDetails(components) {
  const body = (components || []).find((component) => String(component?.type || "").toUpperCase() === "BODY") || {};
  const header = (components || []).find((component) => String(component?.type || "").toUpperCase() === "HEADER") || {};
  const text = String(body.text || "");
  const placeholders = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  const parameterCount = placeholders.length ? Math.max(...placeholders) : 0;
  const ordered = placeholders.every((item, index) => item === index + 1);
  const headerHasVariables = /\{\{\d+\}\}/.test(String(header.text || "")) || Boolean(header.format && header.format !== "TEXT");
  const buttonsHaveVariables = (components || []).some((component) => String(component?.type || "").toUpperCase() === "BUTTONS" && /\{\{\d+\}\}/.test(JSON.stringify(component)));
  return {
    preview: text || "Approved WhatsApp template",
    parameterCount,
    supported: ordered && !headerHasVariables && !buttonsHaveVariables,
  };
}

function renderPreview(template, parameters) {
  return String(template.preview || template.name || "WhatsApp template")
    .replace(/\{\{(\d+)\}\}/g, (_, index) => parameters[Number(index) - 1] || "");
}

function normalizedTemplate(raw) {
  const details = bodyTemplateDetails(raw.components);
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
    supported: details.supported,
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
      let page = await metaGraphRequest(`${credential.wabaId}/message_templates?limit=250&fields=id,name,language,status,category,components,quality_score`, {
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
      console.error("WhatsApp template sync failed:", error.message);
      return res.status(error.status || 500).json({ error: error.message || "Could not sync WhatsApp templates" });
    }
  });

  router.post("/send", requireAuth, async (req, res) => {
    const orgId = String(req.body?.orgId || "").trim();
    const leadId = String(req.body?.leadId || "").trim();
    const templateId = safeDocId(req.body?.templateId || "");
    const clientMessageId = safeDocId(req.body?.clientMessageId || "");
    const parameters = Array.isArray(req.body?.parameters) ? req.body.parameters.map((item) => String(item || "").trim()) : [];
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
        const recipient = normalizeRecipient(lead.phone);
        if (!recipient) throw Object.assign(new Error("This lead does not have a valid WhatsApp number"), { status: 400 });
        const text = renderPreview(template, parameters);

        if (existingMessage.exists) {
          const prior = existingMessage.data();
          if (prior.direction !== "outbound" || prior.type !== "template" || prior.templateId !== templateId || JSON.stringify(prior.templateParameters || []) !== JSON.stringify(parameters)) {
            throw Object.assign(new Error("Message ID cannot be reused for different template content"), { status: 409 });
          }
          if (prior.status === "sent") return { replay: true, providerMessageId: prior.providerMessageId || null };
          if (prior.status === "indeterminate") throw Object.assign(new Error("Template delivery is being reconciled; do not send it again"), { status: 409, code: "delivery_indeterminate" });
          if (prior.status === "processing") {
            tx.set(messageRef, { status: "indeterminate", indeterminateAt: nowIso(), failure: "Provider delivery outcome requires reconciliation" }, { merge: true });
            return { reconciliation: true };
          }
        }

        const intentId = crypto.createHash("sha256").update(`${orgId}|${leadId}|${recipient}|template|${templateId}|${JSON.stringify(parameters)}`).digest("hex");
        intentRef = db.collection("whatsappOutboundIntents").doc(intentId);
        const priorIntent = await tx.get(intentRef);
        if (priorIntent.exists) {
          const data = priorIntent.data();
          if (data.status === "indeterminate") throw Object.assign(new Error("An equivalent template has an unresolved delivery outcome"), { status: 409, code: "delivery_indeterminate" });
          if (data.status === "processing" && data.clientMessageId !== clientMessageId) throw Object.assign(new Error("An equivalent WhatsApp template is already being sent"), { status: 409 });
        }
        dispatchRef = db.collection("whatsappOutboundDispatches").doc(clientMessageId);
        tx.set(intentRef, { orgId, leadId, recipient, text, clientMessageId, templateId, parameters, kind: "template", status: "processing", processingStartedAt: nowIso(), processingStartedAtMs: Date.now() }, { merge: true });
        tx.set(dispatchRef, { orgId, leadId, recipient, text, intentId, clientMessageId, templateId, parameters, kind: "template", status: "processing", createdAt: nowIso(), createdAtMs: Date.now() }, { merge: true });
        tx.set(messageRef, {
          direction: "outbound",
          type: "template",
          text,
          recipient,
          templateId,
          templateName: template.name,
          templateLanguage: template.language,
          templateParameters: parameters,
          status: "processing",
          at: nowIso(),
          atMs: Date.now(),
          processingStartedAt: nowIso(),
          processingStartedAtMs: Date.now(),
          senderUid: req.authUser.uid,
          senderName: req.authUser.name || req.authUser.phone_number || "CRM user",
        }, { merge: true });
        return { credential: credentialSnap.data(), template, recipient, replay: false };
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
          ...(parameters.length ? { components: [{ type: "body", parameters: parameters.map((text) => ({ type: "text", text })) }] } : {}),
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
