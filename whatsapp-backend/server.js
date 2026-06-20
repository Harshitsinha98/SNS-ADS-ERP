import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const LEADS_FILE = "./leads.json";

// ---- Simple file-based lead store (baad mein real DB se replace karo) ----
const readLeads = () => {
  try {
    return JSON.parse(fs.readFileSync(LEADS_FILE, "utf-8"));
  } catch {
    return [];
  }
};
const writeLeads = (leads) => fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));

// =====================================================================
// 1. WEBHOOK VERIFICATION (Meta is GET request se webhook verify karta hai)
// =====================================================================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified by Meta");
    return res.status(200).send(challenge); // Meta ko challenge wapas bhejo
  }
  return res.sendStatus(403);
});

// =====================================================================
// 2. INCOMING MESSAGES (Meta POST request se naye message bhejta hai)
// =====================================================================
app.post("/webhook", (req, res) => {
  const body = req.body;
  
  // NAYI LINE: Ye jo bhi request aayegi, sab print kar dega!
  console.log("📥 META NE KUCH BHEJA:", JSON.stringify(body, null, 2));

  if (body.object === "whatsapp_business_account") {
// ... baaki ka purana code ...
    body.entry?.forEach((entry) => {
      entry.changes?.forEach((change) => {
        const value = change.value;
        const message = value?.messages?.[0];
        const contact = value?.contacts?.[0];

        // Sirf incoming user messages process karo (status updates ignore)
        if (message && contact) {
          const newLead = {
            id: "WA" + Date.now(),
            name: contact.profile?.name || "WhatsApp User",
            phone: message.from, // wa_id (country code ke saath)
            email: "",
            source: "WhatsApp",
            requirement:
              message.type === "text"
                ? message.text.body
                : `[${message.type} message received]`,
            status: "New",
            assignedTo: null, // ERP auto-assign isko pick karega
            blacklisted: false,
            createdAt: new Date(Number(message.timestamp) * 1000).toISOString(),
            lastUpdated: new Date().toISOString(),
            followUp: null,
            notes: [{ text: `First WhatsApp msg: "${message.text?.body || message.type}"`, at: new Date().toISOString() }],
            waMessageId: message.id,
          };

          const leads = readLeads();
          // Duplicate phone check — same number dobara aaye to note add karo, naya lead nahi
          const existing = leads.find((l) => l.phone === newLead.phone);
          if (existing) {
            existing.notes.push({ text: `New WhatsApp msg: "${message.text?.body || message.type}"`, at: new Date().toISOString() });
            existing.lastUpdated = new Date().toISOString();
          } else {
            leads.unshift(newLead);
            console.log("🆕 New WhatsApp lead:", newLead.name, newLead.phone);
          }
          writeLeads(leads);
        }
      });
    });
  }
  // Meta ko hamesha 200 turant do, warna woh retry karta rahega
  res.sendStatus(200);
});

// =====================================================================
// 3. ERP ke liye API — React frontend yahan se WhatsApp leads fetch karega
// =====================================================================
app.get("/api/whatsapp-leads", (req, res) => {
  res.json(readLeads());
});

// =====================================================================
// OTP-BASED LOGIN SYSTEM (Admin + Employee)
// =====================================================================
const otpStore = {}; // { "9876543210": { otp: "123456", expiresAt: 1234567890 } }

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Step 1: OTP generate + send
app.post("/api/auth/send-otp", async (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.length !== 10) {
    return res.status(400).json({ success: false, error: "Valid 10-digit phone number bhejo" });
  }

  const otp = generateOtp();
  otpStore[phone] = { otp, expiresAt: Date.now() + 5 * 60 * 1000 }; // 5 min valid

  console.log(`📲 OTP for ${phone}: ${otp}`); // terminal mein dikhega — dev/testing ke liye

  // -----------------------------------------------------------------
  // PRODUCTION: yahan apna real SMS provider plug karo, jaise:
  //
  // await fetch("https://your-sms-provider.com/send", {
  //   method: "POST",
  //   headers: { Authorization: `Bearer ${process.env.SMS_API_KEY}` },
  //   body: JSON.stringify({ to: phone, message: `Your ERP login OTP is ${otp}` }),
  // });
  // -----------------------------------------------------------------

  const isDev = process.env.NODE_ENV !== "production";
  res.json({ success: true, message: "OTP sent", ...(isDev && { devOtp: otp }) });
});

// Step 2: OTP verify
app.post("/api/auth/verify-otp", (req, res) => {
  const { phone, otp } = req.body;
  const record = otpStore[phone];

  if (!record) return res.status(400).json({ success: false, error: "Pehle OTP request karo" });
  if (Date.now() > record.expiresAt) {
    delete otpStore[phone];
    return res.status(400).json({ success: false, error: "OTP expire ho gaya, dobara try karo" });
  }
  if (record.otp !== otp) {
    return res.status(400).json({ success: false, error: "Galat OTP" });
  }

  delete otpStore[phone]; // one-time use
  res.json({ success: true });
});


app.listen(PORT, () => console.log(`🚀 WhatsApp backend running on port ${PORT}`));
