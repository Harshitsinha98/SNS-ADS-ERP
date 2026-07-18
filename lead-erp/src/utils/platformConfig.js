// Helpers to read/write the global platform configuration document
// (platformConfig/global). This is where the platform OWNER controls
// things like the free-trial length and per-plan limits/prices, so that
// what they set is reflected on the website AND enforced in the backend
// (via the org documents created from these values).

import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

export const PLATFORM_CONFIG_PATH = ["platformConfig", "global"];

const configRef = () => doc(db, PLATFORM_CONFIG_PATH[0], PLATFORM_CONFIG_PATH[1]);

// One-shot read (used by public pages like Pricing / Signup).
export async function fetchPlatformConfig() {
  try {
    const snap = await getDoc(configRef());
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    // Public read may be denied before the doc exists — fall back to defaults.
    console.warn("platformConfig read failed:", e?.code || e?.message);
    return null;
  }
}

// Live subscription (used by the platform dashboard).
export function subscribePlatformConfig(cb) {
  return onSnapshot(
    configRef(),
    (snap) => cb(snap.exists() ? snap.data() : null),
    (err) => {
      console.warn("platformConfig listener error:", err?.code || err?.message);
      cb(null);
    }
  );
}

// Platform owner writes config (trialDays, plan overrides).
export async function savePlatformConfig(patch, uid) {
  await setDoc(
    configRef(),
    { ...patch, updatedAt: serverTimestamp(), updatedBy: uid || null },
    { merge: true }
  );
}
