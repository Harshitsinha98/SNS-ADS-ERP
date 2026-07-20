import "dotenv/config";
import express from "express";
import cors from "cors";
import cron from "node-cron";
import fs from "fs";
import crypto from "crypto";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getNextEmployeeRoundRobin, getNextEmployeeByWorkload } from "./utils/assignLead.js";
import createBillingRouter from "./billing.js";
import createLeadIntakeRouter from "./leadIntake.js";
import { getMergedPlans } from "./plans.js";

function loadServiceAccount() {
  const value = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (value) {
    const raw = value.trim().startsWith("{") ? value : Buffer.from(value, "base64").toString("utf8");
    return JSON.parse(raw);
  }
  return JSON.parse(fs.readFileSync("./serviceAccountKey.json", "utf8"));
}

initializeApp({ credential: cert(loadServiceAccount()) });
const db = getFirestore();
const app = express();
// Render/Vercel-style deployments terminate TLS at one trusted proxy. This
// makes req.ip usable for rate limits without manually trusting user headers.
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3001;
const isProductionDeployment = process.env.NODE_ENV === "production" || Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
const publicBackendUrl = process.env.PUBLIC_BACKEND_URL || (isProductionDeployment ? "" : `http://localhost:${PORT}`);
const publicFrontendUrl = process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || (isProductionDeployment ? "" : "http://localhost:5173");
const PLATFORM_OWNER_PHONE = process.env.PLATFORM_OWNER_PHONE || "+919653043939";
const INSTANCE_ID = `${process.env.RENDER_INSTANCE_ID || process.env.HOSTNAME || "local"}-${process.pid}`;
const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_DAYS = 3;
const META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || "v22.0";
const META_GRAPH_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;
const WHATSAPP_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_WHATSAPP_TEXT_LENGTH = 4096;

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const nowIso = () => new Date().toISOString();
const safeDocId = (value) => String(value).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 140);
const orgCollection = (orgId, name) => db.collection("organizations").doc(orgId).collection(name);

const allowedOrigins = new Set(
  [
    process.env.ALLOWED_ORIGINS,
    process.env.FRONTEND_URL,
    process.env.PUBLIC_FRONTEND_URL,
    "http://localhost:5173",
  ]
    .filter(Boolean)
    .join(",")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Meta and Razorpay signatures must be computed over the untouched body.
app.use("/webhook", express.raw({ type: "application/json" }));
app.use("/api/billing/webhook", express.raw({ type: "*/*" }));
app.use(express.json({ limit: "1mb" }));
app.use("/api/billing", createBillingRouter(db));
app.use("/api/leads", createLeadIntakeRouter(db, {
  publicBackendUrl,
  publicFrontendUrl,
  turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || "",
  turnstileSecret: process.env.TURNSTILE_SECRET_KEY || "",
  requireHttpsPublicUrls: isProductionDeployment,
}));

if (!process.env.WHATSAPP_APP_SECRET) {
  console.warn("⚠️ WHATSAPP_APP_SECRET is not set. Meta webhook ingestion will reject requests until it is configured.");
}
if (process.env.RAZORPAY_KEY_ID && !process.env.RAZORPAY_WEBHOOK_SECRET) {
  console.error("❌ RAZORPAY_WEBHOOK_SECRET is required whenever Razorpay is enabled. Recurring webhooks will be rejected.");
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

async function isOrgAdmin(uid, orgId) {
  if (!uid || !orgId) return false;
  const member = await db.collection("memberships").doc(`${uid}_${orgId}`).get();
  const data = member.data();
  return Boolean(member.exists && data.active && (data.role === "owner" || data.role === "admin"));
}

async function getActiveMembership(uid, orgId) {
  if (!uid || !orgId) return null;
  const member = await db.collection("memberships").doc(`${uid}_${orgId}`).get();
  return member.exists && member.data().active ? member.data() : null;
}

function requireMetaConfiguration() {
  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET || !process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY) {
    throw Object.assign(new Error("WhatsApp Embedded Signup is not configured on the server"), { status: 503 });
  }
}

function whatsappTokenKey() {
  const key = Buffer.from(process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32) {
    throw Object.assign(new Error("WHATSAPP_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key"), { status: 503 });
  }
  return key;
}

function encryptWhatsAppToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", whatsappTokenKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(token), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}

function decryptWhatsAppToken(value) {
  const [ivValue, tagValue, ciphertextValue] = String(value || "").split(".");
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error("Stored WhatsApp credential is invalid");
  const decipher = crypto.createDecipheriv("aes-256-gcm", whatsappTokenKey(), Buffer.from(ivValue, "base64"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64")), decipher.final()]).toString("utf8");
}

async function metaGraphRequest(path, { method = "GET", token = null, body = null } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(`${META_GRAPH_URL}/${String(path).replace(/^\//, "")}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    const transportCode = cause?.cause?.code || cause?.code || null;
    const definitelyUnsent = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT"]);
    const error = Object.assign(new Error("WhatsApp provider connection failed"), { status: 502, transportCode });
    error.deliveryUnknown = !definitelyUnsent.has(transportCode);
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.warn("Meta Graph API request failed:", response.status, data?.error?.code || "unknown");
    throw Object.assign(new Error("WhatsApp provider request failed"), {
      status: 502,
      providerCode: data?.error?.code,
      // A provider 5xx may be emitted after side effects were accepted;
      // callers must reconcile instead of rolling back durable routing.
      deliveryUnknown: response.status >= 500,
    });
  }
  return data;
}

async function exchangeMetaAuthorizationCode(code) {
  requireMetaConfiguration();
  const response = await fetch(`${META_GRAPH_URL}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      code,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    console.warn("Meta authorization-code exchange failed:", response.status, data?.error?.code || "unknown");
    throw Object.assign(new Error("Could not verify the WhatsApp connection with Meta"), { status: 502 });
  }
  return data;
}

function validMetaId(value) {
  return /^\d{6,32}$/.test(String(value || ""));
}

function normalizeWhatsAppRecipient(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return /^\d{7,15}$/.test(digits) ? digits : null;
}

function isWhatsAppCredentialExpired(credential) {
  const expiresAtMs = Number(credential?.tokenExpiresAtMs || 0);
  return expiresAtMs > 0 && expiresAtMs <= Date.now() + 60 * 1000;
}

async function isPlatformAdmin(authUser) {
  if (!authUser?.uid) return false;
  if (authUser.phone_number === PLATFORM_OWNER_PHONE) return true;
  return (await db.collection("platformAdmins").doc(authUser.uid).get()).exists;
}

async function withLease(name, ttlMs, work) {
  const ref = db.collection("systemLocks").doc(name);
  // A process can run more than one cron/manual invocation. The holder must be
  // unique per invocation, not merely per instance, to serialize both cases.
  const holder = `${INSTANCE_ID}:${crypto.randomUUID()}`;
  const acquired = await db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    const now = Date.now();
    if (current.exists && current.data().expiresAtMs > now) return false;
    tx.set(ref, { holder, acquiredAt: nowIso(), expiresAtMs: now + ttlMs }, { merge: true });
    return true;
  });
  if (!acquired) return null;

  const renew = () => db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (current.exists && current.data().holder === holder) {
      tx.update(ref, { expiresAtMs: Date.now() + ttlMs, renewedAt: nowIso() });
    }
  });
  const renewalTimer = setInterval(() => {
    renew().catch((error) => console.warn(`Could not renew ${name} lease:`, error.message));
  }, Math.max(1000, Math.floor(ttlMs / 2)));

  try {
    return await work();
  } finally {
    clearInterval(renewalTimer);
    await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (current.exists && current.data().holder === holder) tx.update(ref, { expiresAtMs: 0, releasedAt: nowIso() });
    }).catch((error) => console.warn(`Could not release ${name} lease:`, error.message));
  }
}

// Unknown phone-number IDs intentionally return null. Multi-tenant WhatsApp
// traffic must never fall back into an arbitrary/default organization.
async function resolveOrgId(phoneNumberId) {
  if (!phoneNumberId) return null;
  try {
    const config = await db.collection("whatsappConfigs").doc(String(phoneNumberId)).get();
    return config.exists && config.data().active === true && config.data().orgId ? config.data().orgId : null;
  } catch (error) {
    // Routing-store failures must be retried by Meta; treating them as an
    // unknown number would silently acknowledge and lose a signed message.
    console.error("WhatsApp routing lookup failed:", error.message);
    throw error;
  }
}

function subscriptionAllowsLeads(org) {
  if (org.subscriptionStatus === "active") return true;
  return org.subscriptionStatus === "trialing" && (!org.trialEndsAtMs || org.trialEndsAtMs > Date.now());
}

async function reserveLeadCapacity(orgId, count = 1) {
  const orgRef = db.collection("organizations").doc(orgId);
  return db.runTransaction(async (tx) => {
    const orgSnap = await tx.get(orgRef);
    if (!orgSnap.exists) return false;
    const org = orgSnap.data();
    if (!subscriptionAllowsLeads(org)) return false;
    const limit = Number(org.leadsLimit || 0);
    const used = Number(org.leadsUsed || 0);
    if (limit > 0 && used + count > limit) return false;
    tx.update(orgRef, { leadsUsed: used + count });
    return true;
  });
}

async function releaseLeadCapacity(orgId, count = 1) {
  const orgRef = db.collection("organizations").doc(orgId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(orgRef);
    if (!snap.exists) return;
    tx.update(orgRef, { leadsUsed: Math.max(0, Number(snap.data().leadsUsed || 0) - count) });
  });
}

async function queuePendingWhatsAppMessage({ orgId, phone, name, requirement, providerMessageId, messageType, messageTimestampMs }) {
  // Keep every provider message as an independent durable work item. This
  // avoids parent/subcollection deletion races while a queue drain runs.
  await db.collection("whatsappPendingMessages").doc(safeDocId(providerMessageId)).set({
    orgId,
    phone,
    name,
    requirement,
    providerMessageId,
    messageType,
    messageTimestampMs,
    queuedAt: nowIso(),
  }, { merge: true });
}

async function importWhatsAppLead(args) {
  const { orgId, phone, name, requirement, messageId = null, messageType = "text", messageTimestampMs = Date.now() } = args;
  if (!orgId) return { status: "error", reason: "org_not_resolved" };
  const locked = await withLease(`whatsappLead_${safeDocId(`${orgId}_${phone}`)}`, 2 * 60 * 1000,
    () => importWhatsAppLeadUnlocked({ orgId, phone, name, requirement, messageId, messageType, messageTimestampMs }));
  if (locked !== null) return locked;
  // Another inbound or backlog worker is creating this phone's lead. Preserve
  // the message as an independent work item and retry it after the short lock.
  await queuePendingWhatsAppMessage({
    orgId, phone, name, requirement,
    providerMessageId: messageId || crypto.randomUUID(), messageType, messageTimestampMs,
  });
  return { status: "queued", reason: "lead_creation_in_progress" };
}

async function importWhatsAppLeadUnlocked({ phone, name, requirement, orgId, messageId = null, messageType = "text", messageTimestampMs = Date.now() }) {
  if (!orgId) return { status: "error", reason: "org_not_resolved" };
  const leadsRef = orgCollection(orgId, "leads");
  const inboundAtMs = Number(messageTimestampMs);
  if (!Number.isFinite(inboundAtMs) || inboundAtMs <= 0) throw new Error("Invalid WhatsApp provider timestamp");
  const inboundAt = new Date(inboundAtMs).toISOString();
  const receivedAt = nowIso();
  const providerMessageId = messageId || crypto.randomUUID();
  const inboundMessage = {
    direction: "inbound",
    text: requirement,
    type: messageType,
    providerMessageId,
    status: "received",
    at: inboundAt,
    atMs: inboundAtMs,
    receivedAt,
    receivedAtMs: Date.now(),
  };
  const existing = await leadsRef.where("phone", "==", phone).limit(1).get();
  if (!existing.empty) {
    const leadRef = existing.docs[0].ref;
    await db.runTransaction(async (tx) => {
      const currentLead = await tx.get(leadRef);
      if (!currentLead.exists) throw new Error("Lead disappeared while processing WhatsApp message");
      const priorTimestampMs = Number(currentLead.data().lastWhatsAppInboundAtMs || 0);
      const latestTimestampMs = Math.max(priorTimestampMs, inboundAtMs);
      tx.set(leadRef.collection("messages").doc(safeDocId(providerMessageId)), inboundMessage, { merge: true });
      tx.set(leadRef.collection("notes").doc(), {
        type: "whatsapp",
        text: `New WhatsApp message: ${requirement}`,
        authorId: "system",
        authorName: "WhatsApp Sync",
        visibility: "admin_only",
        sourceMessageId: providerMessageId,
        at: receivedAt,
      });
      tx.update(leadRef, {
        lastUpdated: receivedAt,
        lastWhatsAppInboundAt: new Date(latestTimestampMs).toISOString(),
        lastWhatsAppInboundAtMs: latestTimestampMs,
      });
    });
    return { status: "duplicate", leadId: leadRef.id };
  }

  const settings = await orgCollection(orgId, "settings").doc("config").get();
  let assignedTo = null;
  let assignedToName = null;
  const autoAssign = settings.exists ? settings.data().autoAssign : "round-robin";
  const employee = autoAssign === "workload"
    ? await getNextEmployeeByWorkload(db, orgId)
    : await getNextEmployeeRoundRobin(db, orgId);
  if (employee) {
    assignedTo = employee.id;
    assignedToName = employee.name || null;
  }

  if (!assignedTo) {
    // Keep every inbound provider message while this phone waits for an active
    // employee. A single pending lead may receive several messages before it
    // can be assigned, and each must appear in the eventual conversation.
    await queuePendingWhatsAppMessage({
      orgId, phone, name, requirement, providerMessageId, messageType, messageTimestampMs: inboundAtMs,
    });
    return { status: "queued", reason: "no_active_employees" };
  }

  const capacityReserved = await reserveLeadCapacity(orgId);
  if (!capacityReserved) {
    // A verified inbound message must not be lost when subscription access or
    // lead capacity is temporarily unavailable; retry it from the backlog.
    await queuePendingWhatsAppMessage({
      orgId, phone, name, requirement, providerMessageId, messageType, messageTimestampMs: inboundAtMs,
    });
    return { status: "queued", reason: "subscription_or_lead_limit" };
  }
  try {
    const leadRef = leadsRef.doc();
    const createdAt = nowIso();
    const batch = db.batch();
    batch.create(leadRef, {
      name: name || "WhatsApp Lead",
      phone,
      email: "",
      source: "WhatsApp",
      requirement: requirement || "",
      status: "New",
      assignedTo,
      assignedToName,
      blacklisted: false,
      priority: "Warm",
      createdAt,
      lastUpdated: createdAt,
      lastWhatsAppInboundAt: inboundAt,
      lastWhatsAppInboundAtMs: inboundAtMs,
      followUp: null,
      lastContactedAt: null,
      orgId,
    });
    batch.create(leadRef.collection("messages").doc(safeDocId(providerMessageId)), inboundMessage);
    batch.create(leadRef.collection("notes").doc("created"), {
      type: "system",
      text: "Lead created via WhatsApp",
      authorId: "system",
      authorName: "System",
      visibility: "team",
      sourceMessageId: messageId,
      at: createdAt,
    });
    batch.create(orgCollection(orgId, "notifications").doc(), {
      userId: assignedTo,
      text: `New WhatsApp lead: ${name || "WhatsApp Lead"} (${leadRef.id})`,
      read: false,
      at: createdAt,
      orgId,
    });
    batch.create(orgCollection(orgId, "activity").doc(), {
      text: `📲 WhatsApp lead auto-imported: ${name || "WhatsApp Lead"} → ${assignedToName || assignedTo}`,
      at: createdAt,
      orgId,
    });
    await batch.commit();
    return { status: "created", leadId: leadRef.id };
  } catch (error) {
    await releaseLeadCapacity(orgId).catch(() => {});
    throw error;
  }
}

async function claimInboundMessage(messageId, details) {
  const ref = db.collection("whatsappMessageEvents").doc(safeDocId(messageId));
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    const now = Date.now();
    if (existing.exists) {
      const prior = existing.data();
      const stillProcessing = prior.status === "processing"
        && Number(prior.processingStartedAtMs || 0) > now - 5 * 60 * 1000;
      if (prior.status === "completed") return "completed";
      if (stillProcessing) return "processing";
      // Meta retries failures. Reclaim a failed or stale processing record so
      // a transient database failure cannot permanently lose a lead.
      tx.set(ref, {
        ...details,
        status: "processing",
        processingStartedAtMs: now,
        retryCount: Number(prior.retryCount || 0) + 1,
        retriedAt: nowIso(),
        failure: null,
      }, { merge: true });
      return true;
    }
    tx.create(ref, {
      ...details,
      status: "processing",
      receivedAt: nowIso(),
      processingStartedAtMs: now,
      retryCount: 0,
    });
    return true;
  });
}

async function processInboundMessage({ orgId, message, contact }) {
  const messageId = message.id;
  const providerTimestampMs = Number(message.timestamp) * 1000;
  if (!messageId) return { status: "ignored", reason: "missing_message_id" };
  if (!Number.isFinite(providerTimestampMs) || providerTimestampMs <= 0 || providerTimestampMs > Date.now() + 5 * 60 * 1000) {
    return { status: "ignored", reason: "invalid_provider_timestamp" };
  }
  const claimed = await claimInboundMessage(messageId, { orgId, from: message.from, type: message.type || "unknown" });
  if (claimed === "completed") return { status: "duplicate_event" };
  if (claimed === "processing") {
    throw new Error("WhatsApp message is still being processed; retry delivery");
  }
  const ref = db.collection("whatsappMessageEvents").doc(safeDocId(messageId));
  try {
    const result = await importWhatsAppLead({
      orgId,
      phone: message.from,
      name: contact?.profile?.name || "WhatsApp Lead",
      requirement: message.text?.body || `[${message.type || "Unsupported"} message]`,
      messageId,
      messageType: message.type || "unknown",
      messageTimestampMs: providerTimestampMs,
    });
    await ref.update({ status: "completed", completedAt: nowIso(), result });
    return result;
  } catch (error) {
    await ref.update({ status: "failed", failedAt: nowIso(), failure: error.message });
    throw error;
  }
}

async function migrateLegacyPendingQueue(orgId) {
  const legacyItems = await orgCollection(orgId, "pending_leads").get();
  for (const legacyItem of legacyItems.docs) {
    const data = legacyItem.data();
    const children = await legacyItem.ref.collection("messages").get();
    const messages = children.empty
      ? [{ data: () => ({
        name: data.name,
        requirement: data.requirement,
        messageId: data.messageId || crypto.randomUUID(),
        messageType: "text",
        messageTimestampMs: Date.parse(data.queuedAt || "") || Date.now(),
      }) }]
      : children.docs;
    for (const child of messages) {
      const message = child.data();
      await queuePendingWhatsAppMessage({
        orgId,
        phone: data.phone,
        name: message.name || data.name,
        requirement: message.requirement,
        providerMessageId: message.messageId,
        messageType: message.messageType || "text",
        messageTimestampMs: message.messageTimestampMs,
      });
    }
    const batch = db.batch();
    children.docs.forEach((child) => batch.delete(child.ref));
    batch.delete(legacyItem.ref);
    await batch.commit();
  }
}

async function processPendingQueue(orgId = null) {
  const organizations = orgId
    ? [await db.collection("organizations").doc(orgId).get()]
    : (await db.collection("organizations").get()).docs;
  for (const orgSnap of organizations) {
    if (orgSnap?.exists) await migrateLegacyPendingQueue(orgSnap.id);
  }

  const pending = orgId
    ? await db.collection("whatsappPendingMessages").where("orgId", "==", orgId).get()
    : await db.collection("whatsappPendingMessages").get();
  let processed = 0;
  for (const pendingSnap of pending.docs) {
    const message = pendingSnap.data();
    const result = await importWhatsAppLead({
      orgId: message.orgId,
      phone: message.phone,
      name: message.name,
      requirement: message.requirement,
      messageId: message.providerMessageId,
      messageType: message.messageType || "text",
      messageTimestampMs: message.messageTimestampMs,
    });
    // A message is removed only after importWhatsAppLead has durably created
    // its transcript. Any still-queued state remains as its own work item.
    if (result.status !== "queued") {
      await pendingSnap.ref.delete();
      processed += 1;
    }
  }
  return processed;
}

// ----- tenant-owned WhatsApp Business connections and replies -----
// Each connection is verified with Meta before a server-owned routing record is
// written. Browser clients never receive or write provider credentials.
app.post("/api/whatsapp/connect", requireAuth, async (req, res) => {
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
    const settingsRef = orgCollection(orgId, "settings").doc("whatsapp");
    const connectedAt = nowIso();
    const tokenExpiresAtMs = Number(exchange.expires_in) > 0 ? Date.now() + Number(exchange.expires_in) * 1000 : null;
    const persistedConnection = await db.runTransaction(async (tx) => {
      const [existingConfig, previousCredential] = await Promise.all([tx.get(configRef), tx.get(credentialRef)]);
      if (existingConfig.exists && existingConfig.data().orgId !== orgId) {
        throw Object.assign(new Error("This WhatsApp number is already connected to another workspace"), { status: 409 });
      }
      const previousPhoneNumberId = String(previousCredential.data()?.phoneNumberId || "");
      // Replacing an active number requires an explicit disconnect first. It
      // keeps the existing route live if a new Meta subscription cannot finish.
      if (previousPhoneNumberId && previousPhoneNumberId !== phoneNumberId) {
        throw Object.assign(new Error("Disconnect the current WhatsApp number before connecting a different one"), { status: 409 });
      }
      tx.set(configRef, { orgId, phoneNumberId, wabaId, active: true, connectedAt, connectedBy: req.authUser.uid });
      tx.set(credentialRef, {
        orgId,
        phoneNumberId,
        wabaId,
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
      // Register the selected Cloud API phone before treating the workspace as
      // connected. Meta leaves a newly-added number in Pending state until this
      // server-side call supplies the tenant's six-digit two-step PIN.
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
      // Activate durable routing before subscribing. If Meta emits an event as
      // soon as it accepts the subscription, it can be routed safely.
      await metaGraphRequest(`${wabaId}/subscribed_apps`, { method: "POST", token: accessToken });
      await Promise.all([
        credentialRef.set({ connectionState: "connected" }, { merge: true }),
        settingsRef.set({ connected: true, connectionState: "connected", connectedAt }, { merge: true }),
      ]);
    } catch (subscriptionError) {
      if (subscriptionError.deliveryUnknown) {
        // Meta may already have accepted the subscription. Retain server-owned
        // routing and reconcile on the next connection attempt instead of
        // dropping legitimate inbound traffic as an unknown number.
        await Promise.all([
          credentialRef.set({ connectionState: "reconciling", subscriptionReconcileAt: nowIso() }, { merge: true }),
          settingsRef.set({ connected: false, connectionState: "reconciling", connectionErrorAt: nowIso() }, { merge: true }),
        ]).catch((recordError) => console.error("WhatsApp subscription reconciliation record failed:", recordError.message));
        throw subscriptionError;
      }
      // Roll back only this connection attempt; do not remove a newer
      // concurrent reconnection for the same workspace.
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
      }).catch((rollbackError) => console.error("WhatsApp connection rollback failed:", rollbackError.message));
      throw subscriptionError;
    }
    return res.json({ ok: true, connection: { connected: true, phoneNumberId, wabaId, connectedAt } });
  } catch (error) {
    console.error("WhatsApp connection failed:", error.message);
    return res.status(error.status || 500).json({ error: error.message || "Could not connect WhatsApp Business" });
  }
});

app.post("/api/whatsapp/status", requireAuth, async (req, res) => {
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
});

app.post("/api/whatsapp/repair-webhook", requireAuth, async (req, res) => {
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
    console.info("WhatsApp webhook subscription refreshed", { orgId, phoneNumberId: data.phoneNumberId });
    return res.json({ ok: true, phoneNumberId: data.phoneNumberId });
  } catch (error) {
    console.error("WhatsApp webhook repair failed:", error.message);
    return res.status(error.status || 500).json({ error: error.message || "Could not refresh WhatsApp webhook delivery" });
  }
});

app.post("/api/whatsapp/disconnect", requireAuth, async (req, res) => {
  try {
    const orgId = String(req.body?.orgId || "").trim();
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) return res.status(403).json({ error: "Organization admin access required" });
    const credentialRef = db.collection("whatsappCredentials").doc(orgId);
    const settingsRef = orgCollection(orgId, "settings").doc("whatsapp");
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
    console.error("WhatsApp disconnect failed:", error.message);
    return res.status(error.status || 500).json({ error: "Could not disconnect WhatsApp Business" });
  }
});

app.post("/api/whatsapp/messages", requireAuth, async (req, res) => {
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
    const leadRef = orgCollection(orgId, "leads").doc(leadId);
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
          // A process may have reached Meta and then died before saving the
          // response. Treat every lingering claim as ambiguous, never resend.
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
        direction: "outbound",
        text,
        recipient,
        status: "processing",
        at: nowIso(),
        atMs: Date.now(),
        processingStartedAtMs: Date.now(),
        processingStartedAt: nowIso(),
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
          if (outcomeUnknown) {
            tx.set(outboundIntentRef, { status: "indeterminate", indeterminateAt: nowIso() }, { merge: true });
          } else {
            tx.delete(outboundIntentRef);
          }
        }
        if (outboundDispatchRef) {
          tx.set(outboundDispatchRef, outcomeUnknown
            ? { status: "reconciling", reconcileAt: nowIso() }
            : { status: "failed", failedAt: nowIso() }, { merge: true });
        }
      }).catch(() => {});
    }
    console.error("WhatsApp send failed:", error.message);
    return res.status(error.status || 500).json({ error: error.message || "Could not send WhatsApp message", code: error.code });
  }
});

async function reconcileOutboundWhatsAppStatus(orgId, status) {
  const clientMessageId = safeDocId(status?.biz_opaque_callback_data || "");
  if (!clientMessageId) return { status: "ignored", reason: "missing_callback_data" };
  const dispatchRef = db.collection("whatsappOutboundDispatches").doc(clientMessageId);
  await db.runTransaction(async (tx) => {
    const dispatchSnap = await tx.get(dispatchRef);
    if (!dispatchSnap.exists || dispatchSnap.data().orgId !== orgId) return;
    const dispatch = dispatchSnap.data();
    const providerStatus = String(status.status || "");
    const messageRef = orgCollection(orgId, "leads").doc(dispatch.leadId).collection("messages").doc(clientMessageId);
    const intentRef = db.collection("whatsappOutboundIntents").doc(dispatch.intentId);
    if (["sent", "delivered", "read"].includes(providerStatus)) {
      tx.set(messageRef, {
        status: "sent",
        providerMessageId: status.id || null,
        providerStatus,
        sentAt: nowIso(),
        sentAtMs: Date.now(),
        failure: null,
      }, { merge: true });
      tx.set(dispatchRef, { status: "sent", providerMessageId: status.id || null, providerStatus, finalizedAt: nowIso() }, { merge: true });
      tx.delete(intentRef);
    } else if (providerStatus === "failed") {
      tx.set(messageRef, { status: "failed", providerStatus, failedAt: nowIso(), failure: "WhatsApp provider rejected delivery" }, { merge: true });
      tx.set(dispatchRef, { status: "failed", providerStatus, finalizedAt: nowIso() }, { merge: true });
      tx.delete(intentRef);
    }
  });
  return { status: "reconciled" };
}

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && process.env.WHATSAPP_VERIFY_TOKEN && safeEqual(token, process.env.WHATSAPP_VERIFY_TOKEN)) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  const secret = process.env.WHATSAPP_APP_SECRET;
  const signature = req.headers["x-hub-signature-256"];
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  if (!secret || !signature) return res.status(503).json({ error: "Webhook signature verification is not configured" });
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
  if (!safeEqual(expected, signature)) return res.status(401).json({ error: "Invalid webhook signature" });

  try {
    const payload = JSON.parse(raw.toString("utf8") || "{}");
    const entryCount = Array.isArray(payload.entry) ? payload.entry.length : 0;
    const changeCount = (payload.entry || []).reduce((count, entry) => count + (entry.changes || []).length, 0);
    console.info("WhatsApp webhook received", { entryCount, changeCount });
    const results = [];
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const orgId = await resolveOrgId(value.metadata?.phone_number_id);
        if (!orgId) {
          console.warn("Dropped WhatsApp event for unknown phone_number_id:", value.metadata?.phone_number_id || "missing");
          continue;
        }
        const contactsById = new Map((value.contacts || []).map((contact) => [contact.wa_id, contact]));
        for (const message of value.messages || []) {
          const contact = contactsById.get(message.from) || value.contacts?.[0];
          results.push(await processInboundMessage({ orgId, message, contact }));
        }
        for (const status of value.statuses || []) {
          results.push(await reconcileOutboundWhatsAppStatus(orgId, status));
        }
      }
    }
    return res.status(200).json({ ok: true, processed: results.length });
  } catch (error) {
    console.error("WhatsApp webhook error:", error.message);
    // Meta retries 5xx responses; all processing is idempotent by message ID.
    return res.status(500).json({ error: "Temporary webhook processing failure" });
  }
});

app.post("/api/whatsapp/sync-now", requireAuth, async (req, res) => {
  try {
    const orgId = req.body?.orgId;
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) return res.status(403).json({ error: "Organization admin access required" });
    const imported = await withLease("pendingQueue", 4 * 60 * 1000, () => processPendingQueue(orgId));
    res.json({ success: true, imported: imported ?? 0, orgId });
  } catch (error) {
    console.error("Manual WhatsApp sync error:", error.message);
    res.status(500).json({ success: false, error: "Sync failed" });
  }
});

cron.schedule("*/5 * * * *", () => {
  withLease("pendingQueue", 4 * 60 * 1000, async () => {
    const imported = await processPendingQueue();
    if (imported) console.log(`⏱ pending WhatsApp queue: ${imported} lead(s) assigned`);
  }).catch((error) => console.error("Pending queue cron error:", error.message));
});

async function notifyOrgAdmins(orgId, text) {
  const admins = await db.collection("memberships").where("orgId", "==", orgId).where("active", "==", true).get();
  const batch = db.batch();
  let count = 0;
  admins.docs.forEach((member) => {
    const data = member.data();
    if (data.role === "owner" || data.role === "admin") {
      batch.create(orgCollection(orgId, "notifications").doc(), {
        userId: data.uid,
        text,
        type: "billing",
        read: false,
        at: nowIso(),
        orgId,
      });
      count += 1;
    }
  });
  if (count) await batch.commit();
}

async function runSubscriptionLifecycle() {
  const now = Date.now();
  const plans = await getMergedPlans(db);
  const organizations = await db.collection("organizations").get();
  let reminded = 0;
  let pastDue = 0;
  let expired = 0;
  let downgraded = 0;

  for (const orgSnap of organizations.docs) {
    const org = orgSnap.data();
    const ref = orgSnap.ref;
    const periodEnd = Number(org.currentPeriodEndMs || 0);
    if (org.pendingPlanChange && periodEnd && now >= periodEnd) {
      const target = plans[org.pendingPlanChange.toPlanId] || plans.starter;
      const cycle = org.pendingPlanChange.cycle === "yearly" ? "yearly" : "monthly";
      const newEnd = now + (cycle === "yearly" ? 365 : 30) * DAY_MS;
      await ref.update({
        planId: target.id,
        planName: target.name,
        seatsLimit: target.includedSeats,
        leadsLimit: target.leadsLimit,
        billingCycle: cycle,
        currentPeriodEndMs: newEnd,
        subscriptionStatus: "active",
        pendingPlanChange: null,
        renewalRemindedFor: null,
      });
      await ref.collection("activity").add({ text: `⬇️ Plan changed to ${target.name} (scheduled downgrade applied)`, at: nowIso(), orgId: orgSnap.id });
      await notifyOrgAdmins(orgSnap.id, `Your plan is now ${target.name}. Upgrade again to get more seats and leads.`);
      downgraded += 1;
      continue;
    }
    if (org.subscriptionStatus === "active" && periodEnd) {
      const daysLeft = Math.ceil((periodEnd - now) / DAY_MS);
      if (!org.autopay && daysLeft <= 5 && daysLeft >= 0 && org.renewalRemindedFor !== String(periodEnd)) {
        await notifyOrgAdmins(orgSnap.id, `⏰ Your ${org.planName} plan expires in ${daysLeft} day(s). Renew it from the Billing page.`);
        await ref.update({ renewalRemindedFor: String(periodEnd) });
        reminded += 1;
      }
      if (now >= periodEnd) {
        await ref.update({ subscriptionStatus: "past_due" });
        await notifyOrgAdmins(orgSnap.id, `⚠️ Your plan has expired. Renew within ${GRACE_DAYS} day(s) or features will be locked.`);
        pastDue += 1;
      }
    } else if (org.subscriptionStatus === "past_due" && periodEnd && now >= periodEnd + GRACE_DAYS * DAY_MS) {
      await ref.update({ subscriptionStatus: "expired" });
      await notifyOrgAdmins(orgSnap.id, "🔒 Grace period over — features locked. Renew to reactivate your workspace.");
      expired += 1;
    }
  }
  const summary = { reminded, pastDue, expired, downgraded };
  console.log("⏱ subscription lifecycle:", summary);
  return summary;
}

cron.schedule("0 6 * * *", () => {
  withLease("subscriptionLifecycle", 30 * 60 * 1000, runSubscriptionLifecycle)
    .catch((error) => console.error("Subscription lifecycle cron error:", error.message));
}, { timezone: "Asia/Kolkata" });

app.post("/api/subscription/run-lifecycle", requireAuth, async (req, res) => {
  try {
    if (!(await isPlatformAdmin(req.authUser))) return res.status(403).json({ error: "Platform owner access required" });
    const summary = await withLease("subscriptionLifecycle", 30 * 60 * 1000, runSubscriptionLifecycle);
    res.json({ ok: true, ...(summary || {}) });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Could not run lifecycle" });
  }
});

app.get("/", (req, res) => res.type("text").send("CodeSkate backend is running. Multi-tenant mode is enabled."));

app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`🏢 Multi-tenant WhatsApp routing: ${process.env.WHATSAPP_APP_SECRET ? "signature-verified" : "disabled until secret is configured"}`);
});
