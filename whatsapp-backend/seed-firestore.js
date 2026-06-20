const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json"); // Step 1.6 wali downloaded file, isi folder mein rakho

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

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