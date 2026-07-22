/**
 * WhatsApp connection & messaging controller.
 *
 * ARCHITECTURAL DECISION: Controllers are thin HTTP adapters. They:
 * 1. Extract and validate request parameters.
 * 2. Call service functions for business logic.
 * 3. Format the HTTP response.
 *
 * They do NOT contain business rules, Firestore queries, or complex branching.
 * This separation means the same business logic can be invoked from cron jobs,
 * queue workers, or future GraphQL resolvers without HTTP coupling.
 */

import crypto from "crypto";
import { db } from "../bootstrap/firebase.js";
import { WHATSAPP_SERVICE_WINDOW_MS, MAX_WHATSAPP_TEXT_LENGTH } from "../config/constants.js";
import { isOrgAdmin, getActiveMembership } from "../middleware/auth.js";
import {
  metaGraphRequest,
  exchangeMetaAuthorizationCode,
  encryptWhatsAppToken,
  decryptWhatsAppToken,
  requireMetaConfiguration,
  validMetaId,
  normalizeWhatsAppRecipient,
  isWhatsAppCredentialExpired,
  nowIso,
  safeDocId,
  orgCollection,
  withLease,
  processPendingQueue,
} from "../services/index.js";

// ─── Connect WhatsApp Business ──────────────────────────────────────

export async function connectWhatsApp(req, res) {
  try {
    const orgId = String(req.body?.orgId || "").trim();
    const code = String(req.body?.code || "").trim();
    const wabaId = String(req.body?.wabaId || "").trim();
    const phoneNumberId = String(req.body?.phoneNumberId || "").trim();
    const registrationPin = String(req.body?.registrationPin || "").trim();

    if (!orgId || !code || !validMetaId(wabaId) || !validMetaId(phoneNumberId)) {
      return res.status(400).json({ error: "Complete WhatsApp Business connection details are required" });
    }
    if (!/^\d{6}$/.test(registrationPin)) {
      return res.status(400).json({ error: "Enter a six-digit WhatsApp registration PIN" });
    }
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }

    const exchange = await exchangeMetaAuthorizationCode(code);
    const accessToken = exchange.access_token;
    const phoneNumbers = await metaGraphRequest(`${wabaId}/phone_numbers`, { token: accessToken });
    if (!(phoneNumbers.data || []).some((number) => String(number.id) === phoneNumberId)) {
      return res.status(400).json({ error: "The selected phone number is not part of this WhatsApp Business Account" });
    }

    const credentialRef = db.collection("whatsappCredentials").doc(orgId);
    const configRef = db.collection("whatsappConfigs").doc(phoneNumberId);
    const settingsRef = orgCollection(db, orgId, "settings").doc("whatsapp");
    const connectedAt = nowIso();
    const tokenExpiresAtMs = Number(exchange.expires_in) > 0 ? Date.now() + Number(exchange.expires_in) * 1000 : null;

    const persistedConnection = await db.runTransaction(async (tx) => {
      const [existingConfig, previousCredential] = await Promise.all([tx.get(configRef), tx.get(credentialRef)]);
      if (existingConfig.exists && existingConfig.data().orgId !== orgId) {
        throw Object.assign(new Error("This WhatsApp number is already connected to another workspace"), { status: 409 });
      }
      const previousPhoneNumberId = String(previousCredential.data()?.phoneNumberId || "");
      if (previousPhoneNumberId && previousPhoneNumberId !== phoneNumberId) {
        throw Object.assign(new Error("Disconnect the current WhatsApp number before connecting a different one"), { status: 409 });
      }
      tx.set(configRef, { orgId, phoneNumberId, wabaId, active: true, connectedAt, connectedBy: req.authUser.uid });
      tx.set(credentialRef, {
        orgId, phoneNumberId, wabaId,
        tokenCiphertext: encryptWhatsAppToken(accessToken),
        tokenExpiresAtMs,
        connectionState: "connecting",
        connectedAt,
        connectedBy: req.authUser.uid,
      });
      tx.set(settingsRef, { phoneNumberId, wabaId, connected: false, connectionState: "connecting", connectedAt }, { merge: true });
      return {
        previousCredential: previousCredential.exists ? previousCredential.data() : null,
        previousConfig: existingConfig.exists ? existingConfig.data() : null,
      };
    });

    try {
      try {
        await metaGraphRequest(`${phoneNumberId}/register`, {
          method: "POST",
          token: accessToken,
          body: { messaging_product: "whatsapp", pin: registrationPin },
        });
      } catch (error) {
        throw Object.assign(new Error("Meta could not register this phone number. Confirm the six-digit WhatsApp registration PIN and try again."), {
          status: error.status || 502,
          deliveryUnknown: error.deliveryUnknown,
        });
      }
      await metaGraphRequest(`${wabaId}/subscribed_apps`, { method: "POST", token: accessToken });
      await Promise.all([
        credentialRef.set({ connectionState: "connected" }, { merge: true }),
        settingsRef.set({ connected: true, connectionState: "connected", connectedAt }, { merge: true }),
        db.collection("whatsappConnectionHealth").doc(orgId).set({
          orgId,
          status: "healthy",
          updatedAt: connectedAt,
          lastSuccessAt: connectedAt,
          lastError: null,
        }, { merge: true }),
      ]);
      // Operational telemetry only: failure to write this activity must never
      // invalidate an already-successful provider connection.
      await Promise.all([
        orgCollection(db, orgId, "activity").add({
          text: "WhatsApp Business connected",
          at: connectedAt,
          orgId,
        }),
        db.collection("organizations").doc(orgId).set({
          lastActivityAt: connectedAt,
          lastActivityAtMs: Date.now(),
        }, { merge: true }),
      ]).catch((activityError) => (req.log || console).warn("WhatsApp activity telemetry failed:", activityError.message));
    } catch (subscriptionError) {
      if (subscriptionError.deliveryUnknown) {
        await Promise.all([
          credentialRef.set({ connectionState: "reconciling", subscriptionReconcileAt: nowIso() }, { merge: true }),
          settingsRef.set({ connected: false, connectionState: "reconciling", connectionErrorAt: nowIso() }, { merge: true }),
          db.collection("whatsappConnectionHealth").doc(orgId).set({
            orgId,
            status: "reconciling",
            updatedAt: nowIso(),
            lastError: subscriptionError.message,
          }, { merge: true }),
        ]).catch((recordError) => (req.log || console).error("WhatsApp subscription reconciliation record failed:", recordError.message));
        throw subscriptionError;
      }
      await db.runTransaction(async (tx) => {
        const [credential, config] = await Promise.all([tx.get(credentialRef), tx.get(configRef)]);
        if (credential.exists && credential.data().connectedAt === connectedAt) {
          if (persistedConnection.previousCredential) tx.set(credentialRef, persistedConnection.previousCredential);
          else tx.delete(credentialRef);
        }
        if (config.exists && config.data().orgId === orgId && config.data().connectedAt === connectedAt) {
          if (persistedConnection.previousConfig) tx.set(configRef, persistedConnection.previousConfig);
          else tx.delete(configRef);
        }
        tx.set(settingsRef, {
          connected: Boolean(persistedConnection.previousCredential?.connectionState === "connected"),
          connectionState: persistedConnection.previousCredential?.connectionState || "failed",
          connectionErrorAt: nowIso(),
        }, { merge: true });
      }).catch((rollbackError) => (req.log || console).error("WhatsApp connection rollback failed:", rollbackError.message));
      await db.collection("whatsappConnectionHealth").doc(orgId).set({
        orgId,
        status: "failed",
        updatedAt: nowIso(),
        lastError: subscriptionError.message,
      }, { merge: true }).catch((healthError) =>
        (req.log || console).warn("WhatsApp connection health telemetry failed:", healthError.message)
      );
      throw subscriptionError;
    }
    return res.json({ ok: true, connection: { connected: true, phoneNumberId, wabaId, connectedAt } });
  } catch (error) {
    (req.log || console).error("WhatsApp connection failed:", error.message);
    return res.status(error.status || 500).json({ error: error.message || "Could not connect WhatsApp Business" });
  }
}

// ─── Connection Status ──────────────────────────────────────────────

export async function getWhatsAppStatus(req, res) {
  try {
    const orgId = String(req.body?.orgId || "").trim();
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) return res.status(403).json({ error: "Organization admin access required" });
    const credential = await db.collection("whatsappCredentials").doc(orgId).get();
    if (!credential.exists) return res.json({ connected: false });
    const data = credential.data();
    const expired = isWhatsAppCredentialExpired(data);
    const connecting = data.connectionState !== "connected";
    return res.json({
      connected: !expired && !connecting,
      connecting,
      reauthorizationRequired: expired,
      phoneNumberId: data.phoneNumberId,
      wabaId: data.wabaId,
      connectedAt: data.connectedAt || null,
      tokenExpiresAtMs: data.tokenExpiresAtMs || null,
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: "Could not load WhatsApp connection" });
  }
}

// ─── Repair Webhook ─────────────────────────────────────────────────

export async function repairWebhook(req, res) {
  try {
    const orgId = String(req.body?.orgId || "").trim();
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) return res.status(403).json({ error: "Organization admin access required" });
    const credential = await db.collection("whatsappCredentials").doc(orgId).get();
    if (!credential.exists) return res.status(409).json({ error: "Connect WhatsApp Business before repairing webhook delivery" });
    const data = credential.data();
    if (data.connectionState !== "connected" || isWhatsAppCredentialExpired(data)) {
      return res.status(409).json({ error: "Reconnect WhatsApp Business before repairing webhook delivery" });
    }
    await metaGraphRequest(`${data.wabaId}/subscribed_apps`, {
      method: "POST",
      token: decryptWhatsAppToken(data.tokenCiphertext),
    });
    (req.log || console).info("WhatsApp webhook subscription refreshed", { orgId, phoneNumberId: data.phoneNumberId });
    return res.json({ ok: true, phoneNumberId: data.phoneNumberId });
  } catch (error) {
    (req.log || console).error("WhatsApp webhook repair failed:", error.message);
    return res.status(error.status || 500).json({ error: error.message || "Could not refresh WhatsApp webhook delivery" });
  }
}

// ─── Disconnect ─────────────────────────────────────────────────────

export async function disconnectWhatsApp(req, res) {
  try {
    const orgId = String(req.body?.orgId || "").trim();
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) return res.status(403).json({ error: "Organization admin access required" });
    const credentialRef = db.collection("whatsappCredentials").doc(orgId);
    const settingsRef = orgCollection(db, orgId, "settings").doc("whatsapp");
    await db.runTransaction(async (tx) => {
      const credential = await tx.get(credentialRef);
      const phoneNumberId = String(credential.data()?.phoneNumberId || "");
      if (phoneNumberId) {
        const configRef = db.collection("whatsappConfigs").doc(phoneNumberId);
        const config = await tx.get(configRef);
        if (config.exists && config.data().orgId === orgId) tx.delete(configRef);
      }
      tx.delete(credentialRef);
      tx.set(settingsRef, { connected: false, disconnectedAt: nowIso() }, { merge: true });
    });
    return res.json({ ok: true });
  } catch (error) {
    (req.log || console).error("WhatsApp disconnect failed:", error.message);
    return res.status(error.status || 500).json({ error: "Could not disconnect WhatsApp Business" });
  }
}

// ─── Send Message ───────────────────────────────────────────────────

export async function sendMessage(req, res) {
  const orgId = String(req.body?.orgId || "").trim();
  const leadId = String(req.body?.leadId || "").trim();
  const text = String(req.body?.text || "").trim();
  const clientMessageId = safeDocId(req.body?.clientMessageId || "");
  let messageRef = null;
  let outboundIntentRef = null;
  let outboundDispatchRef = null;
  let messageClaimed = false;
  let providerDispatchStarted = false;
  let providerAccepted = false;

  try {
    if (!orgId || !leadId || !clientMessageId || !text || text.length > MAX_WHATSAPP_TEXT_LENGTH) {
      return res.status(400).json({ error: `Provide a message up to ${MAX_WHATSAPP_TEXT_LENGTH} characters` });
    }
    const membership = await getActiveMembership(req.authUser.uid, orgId);
    if (!membership) return res.status(403).json({ error: "Active organization membership required" });
    const leadRef = orgCollection(db, orgId, "leads").doc(leadId);
    messageRef = leadRef.collection("messages").doc(clientMessageId);

    const claimed = await db.runTransaction(async (tx) => {
      const [leadSnap, credentialSnap, existingMessage] = await Promise.all([
        tx.get(leadRef),
        tx.get(db.collection("whatsappCredentials").doc(orgId)),
        tx.get(messageRef),
      ]);
      if (!leadSnap.exists) throw Object.assign(new Error("Lead not found"), { status: 404 });
      const lead = leadSnap.data();
      if (membership.role === "employee" && lead.assignedTo !== req.authUser.uid) {
        throw Object.assign(new Error("This lead is not assigned to you"), { status: 403 });
      }
      if (!credentialSnap.exists) throw Object.assign(new Error("Connect WhatsApp Business before sending a reply"), { status: 409 });
      const credential = credentialSnap.data();
      if (credential.connectionState !== "connected") {
        throw Object.assign(new Error("WhatsApp Business connection is still being activated; try again shortly"), { status: 409, code: "connection_pending" });
      }
      if (isWhatsAppCredentialExpired(credential)) {
        throw Object.assign(new Error("Reconnect WhatsApp Business before sending replies"), { status: 409, code: "reauthorization_required" });
      }
      const recipient = normalizeWhatsAppRecipient(lead.phone);
      if (!recipient) throw Object.assign(new Error("This lead does not have a valid WhatsApp number"), { status: 400 });
      if (Number(lead.lastWhatsAppInboundAtMs || 0) < Date.now() - WHATSAPP_SERVICE_WINDOW_MS) {
        throw Object.assign(new Error("The 24-hour WhatsApp reply window has closed; send an approved template instead"), { status: 409, code: "template_required" });
      }
      if (existingMessage.exists) {
        const previous = existingMessage.data();
        if (previous.direction !== "outbound" || previous.text !== text || previous.recipient !== recipient) {
          throw Object.assign(new Error("Message ID cannot be reused for different content"), { status: 409 });
        }
        if (previous.status === "sent") return { replay: true, providerMessageId: previous.providerMessageId || null };
        if (previous.status === "indeterminate") {
          throw Object.assign(new Error("The provider delivery outcome is being reconciled; do not send this reply again"), { status: 409, code: "delivery_indeterminate" });
        }
        if (previous.status === "processing") {
          tx.set(messageRef, { status: "indeterminate", indeterminateAt: nowIso(), failure: "Provider delivery outcome requires reconciliation" }, { merge: true });
          return { reconciliation: true };
        }
      }
      const intentId = crypto.createHash("sha256").update(`${orgId}|${leadId}|${recipient}|${text}`).digest("hex");
      outboundIntentRef = db.collection("whatsappOutboundIntents").doc(intentId);
      const existingIntent = await tx.get(outboundIntentRef);
      if (existingIntent.exists) {
        const intent = existingIntent.data();
        if (intent.status === "indeterminate") {
          throw Object.assign(new Error("An equivalent WhatsApp reply has an unresolved delivery outcome; do not send it again"), { status: 409, code: "delivery_indeterminate" });
        }
        if (intent.status === "processing" && intent.clientMessageId !== clientMessageId) {
          throw Object.assign(new Error("An equivalent WhatsApp reply is already being sent"), { status: 409 });
        }
      }
      tx.set(outboundIntentRef, {
        orgId, leadId, recipient, text, clientMessageId,
        status: "processing", processingStartedAt: nowIso(), processingStartedAtMs: Date.now(),
      }, { merge: true });
      outboundDispatchRef = db.collection("whatsappOutboundDispatches").doc(clientMessageId);
      tx.set(outboundDispatchRef, {
        orgId, leadId, recipient, text, intentId, clientMessageId,
        status: "processing", createdAt: nowIso(), createdAtMs: Date.now(),
      }, { merge: true });
      tx.set(messageRef, {
        direction: "outbound", text, recipient,
        status: "processing", at: nowIso(), atMs: Date.now(),
        processingStartedAtMs: Date.now(), processingStartedAt: nowIso(),
        senderUid: req.authUser.uid,
        senderName: req.authUser.name || req.authUser.phone_number || "CRM user",
        retryCount: Number(existingMessage.data()?.retryCount || 0) + (existingMessage.exists ? 1 : 0),
      }, { merge: true });
      return { credential, recipient, replay: false };
    });

    if (claimed.reconciliation) {
      return res.status(409).json({ error: "The provider delivery outcome is being reconciled; do not send this reply again", code: "delivery_indeterminate" });
    }
    if (claimed.replay) return res.json({ ok: true, replay: true, messageId: clientMessageId, providerMessageId: claimed.providerMessageId });
    messageClaimed = true;

    const providerToken = decryptWhatsAppToken(claimed.credential.tokenCiphertext);
    providerDispatchStarted = true;
    const provider = await metaGraphRequest(`${claimed.credential.phoneNumberId}/messages`, {
      method: "POST",
      token: providerToken,
      body: {
        messaging_product: "whatsapp",
        to: claimed.recipient,
        type: "text",
        text: { body: text },
        biz_opaque_callback_data: clientMessageId,
      },
    });
    providerAccepted = true;
    const providerMessageId = provider.messages?.[0]?.id || null;

    await db.runTransaction(async (tx) => {
      tx.set(messageRef, { status: "sent", providerMessageId, sentAt: nowIso(), sentAtMs: Date.now(), failure: null }, { merge: true });
      tx.set(outboundDispatchRef, { status: "sent", providerMessageId, finalizedAt: nowIso() }, { merge: true });
      tx.update(leadRef, { lastWhatsAppOutboundAt: nowIso(), lastWhatsAppOutboundAtMs: Date.now(), lastUpdated: nowIso() });
      tx.delete(outboundIntentRef);
    });
    return res.json({ ok: true, messageId: clientMessageId, providerMessageId });
  } catch (error) {
    if (messageRef && messageClaimed) {
      const outcomeUnknown = providerAccepted || (providerDispatchStarted && error.deliveryUnknown !== false);
      await db.runTransaction(async (tx) => {
        tx.set(messageRef, outcomeUnknown
          ? { status: "indeterminate", indeterminateAt: nowIso(), failure: "Provider delivery outcome requires reconciliation" }
          : { status: "failed", failedAt: nowIso(), failure: "WhatsApp provider delivery request failed" }, { merge: true });
        if (outboundIntentRef) {
          if (outcomeUnknown) tx.set(outboundIntentRef, { status: "indeterminate", indeterminateAt: nowIso() }, { merge: true });
          else tx.delete(outboundIntentRef);
        }
        if (outboundDispatchRef) {
          tx.set(outboundDispatchRef, outcomeUnknown
            ? { status: "reconciling", reconcileAt: nowIso() }
            : { status: "failed", failedAt: nowIso() }, { merge: true });
        }
      }).catch(() => {});
    }
    (req.log || console).error("WhatsApp send failed:", error.message);
    return res.status(error.status || 500).json({ error: error.message || "Could not send WhatsApp message", code: error.code });
  }
}

// ─── Sync Now (manual queue drain) ──────────────────────────────────

export async function syncNow(req, res) {
  try {
    const orgId = req.body?.orgId;
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) return res.status(403).json({ error: "Organization admin access required" });
    const imported = await withLease("pendingQueue", 4 * 60 * 1000, () => processPendingQueue(orgId));
    res.json({ success: true, imported: imported ?? 0, orgId });
  } catch (error) {
    (req.log || console).error("Manual WhatsApp sync error:", error.message);
    res.status(500).json({ success: false, error: "Sync failed" });
  }
}
