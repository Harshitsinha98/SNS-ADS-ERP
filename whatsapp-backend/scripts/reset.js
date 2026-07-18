// CodeSkate fresh-reset — deletes ALL tenant data for a clean start.
// Keeps platformConfig + platformAdmins. The platform owner (+919653043939)
// has access by phone (hardcoded), so no owner data needs preserving.
//
// Run:  node scripts/reset.js
// (uses FIREBASE_SERVICE_ACCOUNT env, or ./serviceAccountKey.json)

import "dotenv/config";
import fs from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function loadServiceAccount() {
  const envVal = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (envVal) {
    const raw = envVal.trim().startsWith("{") ? envVal : Buffer.from(envVal, "base64").toString("utf-8");
    return JSON.parse(raw);
  }
  return JSON.parse(fs.readFileSync("./serviceAccountKey.json", "utf-8"));
}

initializeApp({ credential: cert(loadServiceAccount()) });
const db = getFirestore();

// Collections wiped on reset. `organizations` is deleted recursively so all
// per-org subcollections (leads, notes, settings, activity, invoices…) go too.
const COLLECTIONS = [
  "organizations",
  "memberships",
  "invites",
  "trialsUsed",
  "whatsappConfigs",
  "pendingSignups",
  "users",
];

async function wipe(name) {
  const snap = await db.collection(name).get();
  let n = 0;
  for (const docSnap of snap.docs) {
    await db.recursiveDelete(docSnap.ref);
    n++;
  }
  console.log(`  • ${name}: deleted ${n} document(s)`);
}

async function run() {
  console.log("🧹 CodeSkate fresh reset — wiping tenant data (keeping platformConfig + platformAdmins)…\n");
  for (const c of COLLECTIONS) {
    try { await wipe(c); }
    catch (e) { console.warn(`  • ${c}: skipped (${e?.message})`); }
  }
  console.log("\n✅ Reset complete. Ab fresh signup se sab test kar sakte ho.");
  console.log("   Owner (+919653043939) ko phone se /platform access milta rahega.");
  process.exit(0);
}

run().catch((e) => { console.error("Reset failed:", e); process.exit(1); });
