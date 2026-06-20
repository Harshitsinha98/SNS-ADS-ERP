import fs from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(fs.readFileSync("./serviceAccountKey.json", "utf-8"));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function seed() {
  await db.collection("users").doc("+919653043939").set({ name: "Super Admin", role: "admin", active: true });
  await db.collection("users").doc("+919628701394").set({ name: "Rahul Verma", role: "employee", active: true });
  await db.collection("settings").doc("config").set({
    statuses: ["New", "Ringing", "Meeting Fixed", "Negotiation", "Follow-up", "Closed-Won", "Lost"],
    autoAssign: "round-robin",
  });
  console.log("✅ Seed complete — admin aur employee dono Firestore mein registered ho gaye");
  process.exit(0);
}
seed();