/**
 * Mobile push notifications (Firebase Cloud Messaging) for the Flutter app.
 *
 * Design:
 *  - Devices register through POST /api/v1/devices/register. Tokens are
 *    stored server-side at users/{uid}/devices/{sha256(token)}; Firestore
 *    rules keep users/* client-read-only, so this is the only write path.
 *  - Every backend code path already writes an in-app notification doc to
 *    organizations/{orgId}/notifications with { userId, text, title?, type?,
 *    leadId?, at }. Instead of touching each of those ~12 call sites, a single
 *    collection-group listener forwards NEW docs (at >= process start) to FCM.
 *  - Exactly-once across multiple backend instances: each delivery is claimed
 *    with tx.create() on pushDeliveries/{hash(docPath)}. Losers skip.
 *  - Invalid / unregistered tokens are pruned automatically.
 */

import crypto from "crypto";
import { getMessaging } from "firebase-admin/messaging";
import { db } from "../bootstrap/firebase.js";
import { logger } from "../middleware/logger.js";

const MAX_DEVICES_PER_USER = 10;
const ANDROID_CHANNEL_ID = "crm_default";

const tokenId = (token) => crypto.createHash("sha256").update(String(token)).digest("hex").slice(0, 40);
const pathId = (path) => crypto.createHash("sha256").update(String(path)).digest("hex").slice(0, 40);

function devicesRef(uid) {
  return db.collection("users").doc(uid).collection("devices");
}

export async function registerDevice({ uid, token, platform, appVersion, orgId }) {
  const cleanToken = String(token || "").trim();
  if (!cleanToken || cleanToken.length > 4096) {
    throw Object.assign(new Error("A valid device token is required."), { status: 400 });
  }
  const now = new Date().toISOString();
  await devicesRef(uid).doc(tokenId(cleanToken)).set({
    token: cleanToken,
    platform: ["android", "ios", "web"].includes(platform) ? platform : "unknown",
    appVersion: appVersion ? String(appVersion).slice(0, 40) : null,
    lastOrgId: orgId ? String(orgId).slice(0, 128) : null,
    updatedAt: now,
    updatedAtMs: Date.now(),
  }, { merge: true });

  // Keep the most recent N devices only.
  const all = await devicesRef(uid).orderBy("updatedAtMs", "desc").get();
  const stale = all.docs.slice(MAX_DEVICES_PER_USER);
  if (stale.length) {
    const batch = db.batch();
    stale.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return { ok: true };
}

export async function unregisterDevice({ uid, token }) {
  const cleanToken = String(token || "").trim();
  if (!cleanToken) return { ok: true };
  await devicesRef(uid).doc(tokenId(cleanToken)).delete().catch(() => {});
  return { ok: true };
}

const TITLES = {
  chat_assigned: "New chat assigned",
  escalation_alert: "Response overdue",
  follow_up_reminder: "Follow-up reminder",
  follow_up_overdue: "Follow-up overdue",
  workflow_escalation: "Workflow alert",
  ai_escalation: "AI needs a human",
  new_lead: "New lead",
};

function titleFor(data) {
  if (data.title) return String(data.title).slice(0, 80);
  if (data.type && TITLES[data.type]) return TITLES[data.type];
  if (/lead/i.test(String(data.text || ""))) return "New lead";
  return "Codeskate CRM";
}

async function claimDelivery(docPath) {
  const ref = db.collection("pushDeliveries").doc(pathId(docPath));
  try {
    await ref.create({ path: docPath, claimedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 864e5) });
    return true;
  } catch {
    return false; // already claimed by another instance / earlier run
  }
}

export async function sendPushForNotification(docPath, data) {
  const uid = data?.userId;
  if (!uid || data.read === true) return { sent: 0 };
  if (!(await claimDelivery(docPath))) return { sent: 0, skipped: "claimed" };

  const devices = await devicesRef(uid).get();
  if (devices.empty) return { sent: 0 };

  const tokens = devices.docs.map((d) => d.data().token).filter(Boolean);
  const orgId = data.orgId || docPath.split("/")[1] || "";
  const payload = {
    tokens,
    notification: {
      title: titleFor(data),
      body: String(data.text || "").slice(0, 240),
    },
    data: {
      orgId: String(orgId),
      leadId: data.leadId ? String(data.leadId) : "",
      type: data.type ? String(data.type) : "general",
      notificationId: docPath.split("/").pop(),
    },
    android: {
      priority: "high",
      notification: { channelId: ANDROID_CHANNEL_ID, color: "#FF6B1A", sound: "default" },
    },
    apns: {
      payload: { aps: { sound: "default", "mutable-content": 1 } },
    },
  };

  const res = await getMessaging().sendEachForMulticast(payload);
  const prune = [];
  res.responses.forEach((r, i) => {
    const code = r.error?.code || "";
    if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token" || code === "messaging/invalid-argument") {
      prune.push(devices.docs[i].ref);
    }
  });
  if (prune.length) {
    const batch = db.batch();
    prune.forEach((ref) => batch.delete(ref));
    await batch.commit().catch(() => {});
  }
  return { sent: res.successCount, failed: res.failureCount };
}

let unsubscribe = null;

/**
 * Starts the realtime dispatcher. Safe to call once per process. Only
 * notifications created after start are pushed (no backlog spam on deploy).
 */
export function startPushDispatcher() {
  if (unsubscribe) return;
  if (process.env.PUSH_NOTIFICATIONS_ENABLED === "false") {
    logger.info("Push dispatcher disabled via PUSH_NOTIFICATIONS_ENABLED=false");
    return;
  }
  const startIso = new Date().toISOString();
  let primed = false;

  const subscribe = () => {
    unsubscribe = db
      .collectionGroup("notifications")
      .where("at", ">=", startIso)
      .onSnapshot((snap) => {
        const changes = snap.docChanges().filter((c) => c.type === "added");
        // The first snapshot only contains docs created in the tiny window
        // between start and listen; they are still new, so process them too.
        primed = true;
        for (const change of changes) {
          const path = change.doc.ref.path;
          if (!path.startsWith("organizations/")) continue;
          sendPushForNotification(path, change.doc.data()).catch((err) =>
            logger.warn({ err: err.message, path }, "Push send failed"));
        }
      }, (err) => {
        logger.error({ err: err.message, primed }, "Push dispatcher listener error — retrying in 30s");
        unsubscribe = null;
        setTimeout(subscribe, 30_000);
      });
  };
  subscribe();
  logger.info({ since: startIso }, "Push notification dispatcher started");
}
