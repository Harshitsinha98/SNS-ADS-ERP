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
const PLATFORM_OWNER_PHONE = process.env.PLATFORM_OWNER_PHONE || "+919653043939";
const INSTANCE_ID = `${process.env.RENDER_INSTANCE_ID || process.env.HOSTNAME || "local"}-${process.pid}`;
const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_DAYS = 3;

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const nowIso = () => new Date().toISOString();
const safeDocId = (value) => String(value).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 140);
const orgCollection = (orgId, name) => db.collection("organizations").doc(orgId).collection(name);

const allowedOrigins = new Set(
  String(process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || "http://localhost:5173")
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
    return config.exists && config.data().orgId ? config.data().orgId : null;
  } catch (error) {
    console.warn("WhatsApp routing lookup failed:", error.message);
    return null;
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

async function importWhatsAppLead({ phone, name, requirement, orgId, messageId = null }) {
  if (!orgId) return { status: "error", reason: "org_not_resolved" };
  const leadsRef = orgCollection(orgId, "leads");
  const existing = await leadsRef.where("phone", "==", phone).limit(1).get();
  if (!existing.empty) {
    const leadRef = existing.docs[0].ref;
    await leadRef.collection("notes").add({
      type: "whatsapp",
      text: `New WhatsApp message: ${requirement}`,
      authorId: "system",
      authorName: "WhatsApp Sync",
      visibility: "admin_only",
      sourceMessageId: messageId,
      at: nowIso(),
    });
    await leadRef.update({ lastUpdated: nowIso() });
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
    const pending = await orgCollection(orgId, "pending_leads").where("phone", "==", phone).limit(1).get();
    if (pending.empty) {
      await orgCollection(orgId, "pending_leads").add({ phone, name, requirement, orgId, messageId, queuedAt: nowIso() });
    }
    return { status: "queued", reason: "no_active_employees" };
  }

  const capacityReserved = await reserveLeadCapacity(orgId);
  if (!capacityReserved) return { status: "rejected", reason: "subscription_or_lead_limit" };
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
      followUp: null,
      lastContactedAt: null,
      orgId,
    });
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
      if (prior.status === "completed" || stillProcessing) return false;
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
  if (!messageId) return { status: "ignored", reason: "missing_message_id" };
  const claimed = await claimInboundMessage(messageId, { orgId, from: message.from, type: message.type || "unknown" });
  if (!claimed) return { status: "duplicate_event" };
  const ref = db.collection("whatsappMessageEvents").doc(safeDocId(messageId));
  try {
    const result = await importWhatsAppLead({
      orgId,
      phone: message.from,
      name: contact?.profile?.name || "WhatsApp Lead",
      requirement: message.text?.body || `[${message.type || "Unsupported"} message]`,
      messageId,
    });
    await ref.update({ status: "completed", completedAt: nowIso(), result });
    return result;
  } catch (error) {
    await ref.update({ status: "failed", failedAt: nowIso(), failure: error.message });
    throw error;
  }
}

async function processPendingQueue(orgId = null) {
  const organizations = orgId
    ? [await db.collection("organizations").doc(orgId).get()]
    : (await db.collection("organizations").get()).docs;
  let processed = 0;
  for (const orgSnap of organizations) {
    if (!orgSnap?.exists) continue;
    const pending = await orgSnap.ref.collection("pending_leads").get();
    for (const pendingSnap of pending.docs) {
      const data = pendingSnap.data();
      const result = await importWhatsAppLead({
        phone: data.phone,
        name: data.name,
        requirement: data.requirement,
        orgId: orgSnap.id,
        messageId: data.messageId || null,
      });
      if (result.status !== "queued") {
        await pendingSnap.ref.delete();
        processed += 1;
      }
    }
  }
  return processed;
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
