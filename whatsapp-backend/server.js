import "dotenv/config";
import express from "express";
import cors from "cors";
import cron from "node-cron";
import fs from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(fs.readFileSync("./serviceAccountKey.json", "utf-8"));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================
// CORE: WhatsApp lead ko Firestore mein import karna (dedup + auto-assign)
// ============================================================
async function importWhatsAppLead({ phone, name, requirement }) {
  const existing = await db.collection("leads").where("phone", "==", phone).limit(1).get();
  if (!existing.empty) {
    await existing.docs[0].ref.update({
      notes: FieldValue.arrayUnion({
        type: "whatsapp",
        text: `New WhatsApp message: ${requirement}`,
        at: new Date().toISOString(),
      }),
      lastUpdated: new Date().toISOString(),
    });
    return { status: "duplicate", leadId: existing.docs[0].id };
  }

  const settingsDoc = await db.collection("settings").doc("config").get();
  const settings = settingsDoc.exists ? settingsDoc.data() : { autoAssign: "round-robin" };

  const usersSnap = await db
    .collection("users")
    .where("role", "==", "employee")
    .where("active", "==", true)
    .get();
  const emps = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (!emps.length) {
  const existingPending = await db.collection("pending_whatsapp").where("phone", "==", phone).limit(1).get();
  if (existingPending.empty) {
    await db.collection("pending_whatsapp").add({ phone, name, requirement, queuedAt: new Date().toISOString() });
  }
  return { status: "queued", reason: "no_active_employees" };
}

  let assignedTo;
  if (settings.autoAssign === "workload") {
    const counts = {};
    for (const e of emps) {
      const c = await db.collection("leads").where("assignedTo", "==", e.id).get();
      counts[e.id] = c.size;
    }
    assignedTo = emps.sort((a, b) => counts[a.id] - counts[b.id])[0].id;
  } else {
    const counterRef = db.collection("settings").doc("waCounter");
    const counterDoc = await counterRef.get();
    const idx = (counterDoc.exists ? counterDoc.data().idx : 0) % emps.length;
    assignedTo = emps[idx].id;
    await counterRef.set({ idx: idx + 1 });
  }

  const leadData = {
    name: name || "WhatsApp Lead",
    phone,
    email: "",
    source: "WhatsApp",
    requirement: requirement || "",
    status: "New",
    assignedTo,
    blacklisted: false,
    value: 0,
    priority: "Warm",
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    followUp: null,
    notes: [],
  };

  const ref = await db.collection("leads").add(leadData);

  await db.collection("notifications").add({
    userId: assignedTo,
    text: `New WhatsApp lead: ${leadData.name} (${ref.id})`,
    read: false,
    at: new Date().toISOString(),
  });
  await db.collection("activity").add({
    text: `📲 WhatsApp lead auto-imported: ${leadData.name} → ${assignedTo}`,
    at: new Date().toISOString(),
  });

  return { status: "created", leadId: ref.id };
}

async function processPendingQueue() {
  const snap = await db.collection("pending_whatsapp").get();
  let processed = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const result = await importWhatsAppLead({ phone: data.phone, name: data.name, requirement: data.requirement });
    if (result.status !== "queued") {
      await docSnap.ref.delete();
      processed++;
    }
  }
  return processed;
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

    if (message) {
      const phone = message.from;
      const name = contact?.profile?.name || "WhatsApp Lead";
      const requirement = message.text?.body || "[Non-text message]";
      const result = await importWhatsAppLead({ phone, name, requirement });
      console.log("Webhook processed:", result);
    }
    res.sendStatus(200);
  } catch (e) {
    console.error("Webhook error:", e);
    res.sendStatus(200);
  }
});

// ============================================================
// Manual "Sync WhatsApp now" button
// ============================================================
app.post("/api/whatsapp/sync-now", async (req, res) => {
  try {
    const imported = await processPendingQueue();
    res.json({ success: true, imported });
  } catch (e) {
    console.error("Manual sync error:", e);
    res.status(500).json({ success: false, error: "Sync failed" });
  }
});

// ============================================================
// 5-minute safety-net cron
// ============================================================
cron.schedule("*/5 * * * *", async () => {
  try {
    const imported = await processPendingQueue();
    if (imported > 0) console.log(`⏱ 5-min sync: ${imported} pending lead(s) processed`);
  } catch (e) {
    console.error("5-min cron error:", e);
  }
});

// ============================================================
app.get("/", (req, res) => res.send("SNS ADS ERP backend is running ✅"));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));