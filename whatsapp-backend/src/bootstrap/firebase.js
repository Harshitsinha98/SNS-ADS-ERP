/**
 * Firebase Admin SDK initialization.
 *
 * ARCHITECTURAL DECISION: Firebase init is isolated so that:
 * 1. The `db` (Firestore) and `adminAuth` singletons are importable by any
 *    module without depending on server.js load order.
 * 2. Service-account loading supports both JSON env var and local file
 *    (development convenience).
 * 3. Test suites can mock this module at a single seam.
 */

import fs from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function loadServiceAccount() {
  const value = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (value) {
    const raw = value.trim().startsWith("{") ? value : Buffer.from(value, "base64").toString("utf8");
    return JSON.parse(raw);
  }
  return JSON.parse(fs.readFileSync("./serviceAccountKey.json", "utf8"));
}

initializeApp({ credential: cert(loadServiceAccount()) });

export const db = getFirestore();
export const adminAuth = getAuth();
