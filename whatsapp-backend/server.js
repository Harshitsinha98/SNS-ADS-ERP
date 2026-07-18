import "dotenv/config";
import express from "express";
import cors from "cors";
import cron from "node-cron";
import fs from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getNextEmployeeRoundRobin, getNextEmployeeByWorkload } from "./utils/assignLead.js";
import createBillingRouter from "./billing.js";
import { getMergedPlans } from "./plans.js";

// 1. Firebase Initialization
// Deploy-friendly: prefer the FIREBASE_SERVICE_ACCOUNT env var (raw JSON or
// base64-encoded JSON) so no file upload is needed on cloud hosts. Falls back
// to a local serviceAccountKey.json file for local development.
function loadServiceAccount() {
  const envVal = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (envVal) {
    const raw = envVal.trim().startsWith("{")
      ? envVal
      : Buffer.from(envVal, "base64").toString("utf-8");
    return JSON.parse(raw);
  }
  return JSON.parse(fs.readFileSync("./serviceAccountKey.json", "utf-8"));
}

initializeApp({ credential: cert(loadServiceAccount()) });
const db = getFirestore();

// Multi-tenant configuration
// For Phase 1, use a default organization ID from environment variable
const DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID;

if (!DEFAULT_ORG_ID) {
  console.warn("⚠️  WARNING: DEFAULT_ORG_ID not set in environment. WhatsApp leads will not be imported.");
}

const app = express();
app.use(cors());

// Razorpay recurring webhook needs the RAW body for signature verification —
// register it BEFORE express.json() so the body isn't parsed first.
app.use("/api/billing/webhook", express.raw({ type: "*/*" }));

app.use(express.json());

// Billing / payments (Razorpay + PayU).
app.use("/api/billing", createBillingRouter(db));

// ============================================================
// HELPER: Get org-scoped collection reference
// ============================================================
const orgCollection = (orgId, collectionName) => 
  db.collection('organizations').doc(orgId).collection(collectionName);

// Resolve which org a WhatsApp message belongs to, using the incoming
// phone_number_id → whatsappConfigs/{phoneNumberId} → orgId mapping.
// Falls back to DEFAULT_ORG_ID (single-tenant legacy) if no mapping.
async function resolveOrgId(phoneNumberId) {
  if (phoneNumberId) {
    try {
      const snap = await db.collection("whatsappConfigs").doc(String(phoneNumberId)).get();
      if (snap.exists && snap.data().orgId) return snap.data().orgId;
    } catch (e) {
      console.warn("whatsappConfigs lookup failed:", e?.message);
    }
  }
  return DEFAULT_ORG_ID || null;
}

// ============================================================
// CORE: WhatsApp lead ko Firestore mein import karna (dedup + auto-assign)
// Multi-tenant version - writes to org-scoped collections
// ============================================================
async function importWhatsAppLead({ phone, name, requirement, orgId }) {
  if (!orgId) {
    console.error("❌ Cannot import lead: no org resolved for this WhatsApp number");
    return { status: "error", reason: "org_not_resolved" };
  }

  try {
    // 1. Duplicate Check - org-scoped leads
    const existing = await orgCollection(orgId, "leads")
      .where("phone", "==", phone)
      .limit(1)
      .get();

    if (!existing.empty) {
      const leadId = existing.docs[0].id;
      
      // Add note to existing lead
      await orgCollection(orgId, "leads")
        .doc(leadId)
        .collection("notes")
        .add({
          type: "whatsapp",
          text: `New WhatsApp message: ${requirement}`,
          authorName: "WhatsApp Sync",
          visibility: "admin_only",
          at: new Date().toISOString(),
        });
      
      // Update lastUpdated timestamp
      await orgCollection(orgId, "leads")
        .doc(leadId)
        .update({
          lastUpdated: new Date().toISOString(),
        });
      
      return { status: "duplicate", leadId };
    }

    // 2. Settings Check - org-scoped settings
    const settingsDoc = await orgCollection(orgId, "settings")
      .doc("config")
      .get();
    
    const settings = settingsDoc.exists 
      ? settingsDoc.data() 
      : { autoAssign: "round-robin" };

    let assignedTo = null;
    let assignedToName = null;

    // 3. Lead Assignment Logic - using org-scoped functions
    if (settings.autoAssign === "workload") {
      const employee = await getNextEmployeeByWorkload(db, orgId);
      if (employee) {
        assignedTo = employee.id;
        assignedToName = employee.name || null;
      }
    } else {
      // Round Robin (default)
      const employee = await getNextEmployeeRoundRobin(db, orgId);
      if (employee) {
        assignedTo = employee.id;
        assignedToName = employee.name || null;
      }
    }

    // 4. Fallback: No active employees - add to pending queue (org-scoped)
    if (!assignedTo) {
      const existingPending = await orgCollection(orgId, "pending_leads")
        .where("phone", "==", phone)
        .limit(1)
        .get();
      
      if (existingPending.empty) {
        await orgCollection(orgId, "pending_leads").add({
          phone,
          name,
          requirement,
          orgId,
          queuedAt: new Date().toISOString()
        });
      }
      return { status: "queued", reason: "no_active_employees" };
    }

    // 5. Create new lead - org-scoped
    const leadData = {
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
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      followUp: null,
      lastContactedAt: null,
      orgId,
    };

    const leadsCollection = orgCollection(orgId, "leads");
    const ref = await leadsCollection.add(leadData);

    // Initial note - Timeline not empty on lead open
    await ref.collection("notes").add({
      type: "system",
      text: "Lead created via WhatsApp",
      visibility: "team",
      authorName: "System",
      at: new Date().toISOString(),
    });

    // 6. Notifications & Activity Log - org-scoped
    await orgCollection(orgId, "notifications").add({
      userId: assignedTo,
      text: `New WhatsApp lead: ${leadData.name} (${ref.id})`,
      read: false,
      at: new Date().toISOString(),
      orgId,
    });

    await orgCollection(orgId, "activity").add({
      text: `📲 WhatsApp lead auto-imported: ${leadData.name} → ${assignedTo}`,
      at: new Date().toISOString(),
      orgId,
    });

    return { status: "created", leadId: ref.id };
  } catch (error) {
    console.error("Error importing WhatsApp lead:", error);
    throw error;
  }
}

// ============================================================
// QUEUE PROCESSOR: Pending leads ko assign karna
// ============================================================
async function processPendingQueue() {
  if (!DEFAULT_ORG_ID) {
    console.error("❌ Cannot process queue: DEFAULT_ORG_ID not configured");
    return 0;
  }

  try {
    const snap = await orgCollection(DEFAULT_ORG_ID, "pending_leads").get();
    let processed = 0;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const result = await importWhatsAppLead({
        phone: data.phone,
        name: data.name,
        requirement: data.requirement,
        orgId: data.orgId || DEFAULT_ORG_ID,
      });

      if (result.status !== "queued") {
        await docSnap.ref.delete();
        processed++;
      }
    }
    return processed;
  } catch (error) {
    console.error("Error processing pending queue:", error);
    return 0;
  }
}

// ============================================================
// WhatsApp Webhook (Meta) — real-time
// ============================================================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  try {
    const change = req.body?.entry?.[0]?.changes?.[0]?.value;
    const message = change?.messages?.[0];
    const contact = change?.contacts?.[0];
    const phoneNumberId = change?.metadata?.phone_number_id;

    if (message) {
      const orgId = await resolveOrgId(phoneNumberId);
      if (!orgId) {
        console.warn("⚠️  No org mapped for phone_number_id:", phoneNumberId, "- lead dropped");
        return res.sendStatus(200);
      }
      const phone = message.from;
      const name = contact?.profile?.name || "WhatsApp Lead";
      const requirement = message.text?.body || "[Non-text message]";

      const result = await importWhatsAppLead({ phone, name, requirement, orgId });
      console.log(`Webhook processed for org ${orgId}:`, result);
    }

    res.sendStatus(200);
  } catch (e) {
    console.error("Webhook error:", e);
    res.sendStatus(200);
  }
});

// ============================================================
// API: Manual "Sync WhatsApp now" button
// ============================================================
app.post("/api/whatsapp/sync-now", async (req, res) => {
  try {
    const imported = await processPendingQueue();
    res.json({ success: true, imported, orgId: DEFAULT_ORG_ID });
  } catch (e) {
    console.error("Manual sync error:", e);
    res.status(500).json({ success: false, error: "Sync failed" });
  }
});

// ============================================================
// CRON: 5-minute safety-net (Pending leads check)
// ============================================================
cron.schedule("*/5 * * * *", async () => {
  try {
    const imported = await processPendingQueue();
    if (imported > 0) {
      console.log(`⏱ 5-min sync: ${imported} pending lead(s) successfully processed for org ${DEFAULT_ORG_ID}`);
    }
  } catch (e) {
    console.error("5-min cron error:", e);
  }
});

// ============================================================
// SUBSCRIPTION LIFECYCLE (Option B renewal engine)
// Daily: renewal reminders, past_due/expired transitions, apply downgrades.
// ============================================================
const DAY_MS = 86400000;
const GRACE_DAYS = 3;

async function notifyOrgAdmins(orgId, text) {
  try {
    const admins = await db.collection("memberships")
      .where("orgId", "==", orgId).where("active", "==", true).get();
    const batch = db.batch();
    let any = false;
    admins.docs.forEach((m) => {
      const d = m.data();
      if (d.role === "owner" || d.role === "admin") {
        const nref = db.collection("organizations").doc(orgId).collection("notifications").doc();
        batch.set(nref, { userId: d.uid, text, type: "billing", read: false, at: new Date().toISOString(), orgId });
        any = true;
      }
    });
    if (any) await batch.commit();
  } catch (e) { console.warn("notifyOrgAdmins:", e?.message); }
}

async function runSubscriptionLifecycle() {
  const now = Date.now();
  const plans = await getMergedPlans(db);
  const snap = await db.collection("organizations").get();
  let reminded = 0, pastDue = 0, expired = 0, downgraded = 0;

  for (const docSnap of snap.docs) {
    const org = docSnap.data();
    const ref = docSnap.ref;
    const status = org.subscriptionStatus;
    const periodEnd = org.currentPeriodEndMs || 0;

    // 1) Apply a scheduled downgrade once the paid period ends.
    if (org.pendingPlanChange && periodEnd && now >= periodEnd) {
      const target = plans[org.pendingPlanChange.toPlanId] || plans.starter;
      const cycle = org.pendingPlanChange.cycle || "monthly";
      const periodDays = cycle === "yearly" ? 365 : 30;
      await ref.update({
        planId: target.id, planName: target.name,
        seatsLimit: target.includedSeats, leadsLimit: target.leadsLimit,
        billingCycle: cycle,
        currentPeriodEndMs: now + periodDays * DAY_MS,
        subscriptionStatus: "active",
        pendingPlanChange: null,
        renewalRemindedFor: null,
      });
      await ref.collection("activity").add({ text: `⬇️ Plan changed to ${target.name} (scheduled downgrade applied)`, at: new Date().toISOString(), orgId: docSnap.id });
      await notifyOrgAdmins(docSnap.id, `Aapka plan ab ${target.name} hai. Wapas upgrade karke zyada seats & leads paayein!`);
      downgraded++;
      continue;
    }

    if (status === "active" && periodEnd) {
      const daysLeft = Math.ceil((periodEnd - now) / DAY_MS);
      // Renewal reminder for MANUAL payers (autopay auto-charges).
      if (!org.autopay && daysLeft <= 5 && daysLeft >= 0 && org.renewalRemindedFor !== String(periodEnd)) {
        await notifyOrgAdmins(docSnap.id, `⏰ Aapka ${org.planName} plan ${daysLeft} din me expire hoga. Billing page se renew karo.`);
        await ref.update({ renewalRemindedFor: String(periodEnd) });
        reminded++;
      }
      if (now >= periodEnd) {
        await ref.update({ subscriptionStatus: "past_due" });
        await notifyOrgAdmins(docSnap.id, `⚠️ Aapka plan expire ho gaya. ${GRACE_DAYS} din me renew karo warna features lock ho jayenge.`);
        pastDue++;
      }
    } else if (status === "past_due" && periodEnd && now >= periodEnd + GRACE_DAYS * DAY_MS) {
      await ref.update({ subscriptionStatus: "expired" });
      await notifyOrgAdmins(docSnap.id, `🔒 Grace period khatam — features locked. Renew karke wapas activate karo.`);
      expired++;
    }
  }
  console.log(`⏱ subscription lifecycle: reminders=${reminded} pastDue=${pastDue} expired=${expired} downgraded=${downgraded}`);
  return { reminded, pastDue, expired, downgraded };
}

// Run daily at 06:00 IST.
cron.schedule("0 6 * * *", () => { runSubscriptionLifecycle().catch((e) => console.error("lifecycle cron:", e)); }, { timezone: "Asia/Kolkata" });

// Manual trigger (for testing the lifecycle without waiting a day).
app.post("/api/subscription/run-lifecycle", async (req, res) => {
  try { res.json({ ok: true, ...(await runSubscriptionLifecycle()) }); }
  catch (e) { res.status(500).json({ ok: false, error: e?.message }); }
});

// ============================================================
// Health Check Route
// ============================================================
app.get("/", (req, res) => res.send("CodeSkate backend is running ✅\nMulti-tenant mode enabled.\nOrg ID: " + (DEFAULT_ORG_ID || "NOT CONFIGURED")));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`🏢 Multi-tenant mode: ${DEFAULT_ORG_ID ? `Default org = ${DEFAULT_ORG_ID}` : 'NOT CONFIGURED'}`);
});
