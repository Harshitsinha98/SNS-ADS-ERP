/**
 * Platform Monitoring Alerts — Telegram notifications for critical events.
 *
 * Runs every 15 minutes via cron. Checks key business/infra parameters and
 * sends Telegram alerts to the platform owner when thresholds are crossed.
 *
 * Cost: ₹0 (Firestore reads + free Telegram Bot API).
 * No AI/LLM — pure rule-based math (if-else + averages).
 *
 * Duplicate suppression: each alert type is tracked with a cooldown (won't
 * re-fire the same alert within its cooldown window even if the condition
 * persists). This prevents spam.
 */

import { db } from "../bootstrap/firebase.js";
import { logger } from "../middleware/logger.js";

// ── Config ──────────────────────────────────────────────────────────────────
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8723408383:AAGfvSxO3bFmC9JzTVLFXW2wHmzb0Hn_yvM";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_ALERT_CHAT_ID || "8831961350";
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour between same alert type

// In-memory cooldown tracker (resets on PM2 restart — acceptable for alerts)
const lastAlerted = new Map();

function shouldAlert(key) {
  const last = lastAlerted.get(key) || 0;
  if (Date.now() - last < ALERT_COOLDOWN_MS) return false;
  lastAlerted.set(key, Date.now());
  return true;
}

async function sendTelegram(message) {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    logger.warn({ err: e.message }, "Telegram alert send failed");
  }
}

// ── Alert Checks ────────────────────────────────────────────────────────────

/**
 * Check for orgs that just expired or went past_due.
 */
async function checkChurn() {
  const alerts = [];
  const snap = await db.collection("organizations")
    .where("subscriptionStatus", "in", ["past_due", "expired"])
    .get();

  for (const doc of snap.docs) {
    const org = doc.data();
    const key = `churn_${doc.id}`;
    if (shouldAlert(key)) {
      alerts.push(`🔴 <b>${org.organizationName || doc.id}</b> — ${org.subscriptionStatus} (${org.planName || org.planId})`);
    }
  }
  return alerts;
}

/**
 * Check for critically low voice wallets (< ₹50 = calls will fail soon).
 */
async function checkLowWallets() {
  const alerts = [];
  const snap = await db.collection("voiceWallets").get();

  for (const doc of snap.docs) {
    const wallet = doc.data();
    const balanceInr = Number(wallet.balanceInr || 0);
    if (balanceInr > 0 && balanceInr < 50) {
      const key = `low_wallet_${doc.id}`;
      if (shouldAlert(key)) {
        alerts.push(`💰 Wallet critical: <b>${doc.id}</b> — ₹${Math.round(balanceInr)} (calls will fail)`);
      }
    }
  }
  return alerts;
}

/**
 * Check for WhatsApp disconnections.
 */
async function checkWhatsAppDisconnections() {
  const alerts = [];
  const snap = await db.collection("whatsappCredentials")
    .where("connectionState", "!=", "connected")
    .get();

  for (const doc of snap.docs) {
    const cred = doc.data();
    if (cred.connectionState === "connecting") continue; // in-progress, not an issue
    const key = `wa_disconnect_${doc.id}`;
    if (shouldAlert(key)) {
      alerts.push(`📱 WhatsApp disconnected: <b>${doc.id}</b> (${cred.connectionState || "unknown"})`);
    }
  }
  return alerts;
}

/**
 * Check for suspended voice numbers (rent failure).
 */
async function checkSuspendedNumbers() {
  const alerts = [];
  const snap = await db.collection("voiceNumbers")
    .where("status", "==", "suspended")
    .get();

  for (const doc of snap.docs) {
    const num = doc.data();
    const key = `suspended_num_${doc.id}`;
    if (shouldAlert(key)) {
      alerts.push(`🔕 Number suspended: <b>${num.displayNumber || num.phoneNumber}</b> (org: ${num.orgId}) — rent unpaid`);
    }
  }
  return alerts;
}

/**
 * Check for recent bridge call failure spikes (>50% failure in last hour).
 */
async function checkBridgeFailures() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const snap = await db.collection("bridgeCalls")
    .where("initiatedAtMs", ">", oneHourAgo)
    .get();

  if (snap.size < 5) return []; // too few calls to judge

  let failed = 0;
  for (const doc of snap.docs) {
    const call = doc.data();
    if (["failed", "no-answer", "customer_voicemail", "agent_no_confirm"].includes(call.status)) {
      failed++;
    }
  }

  const failRate = failed / snap.size;
  if (failRate > 0.6 && shouldAlert("bridge_failure_spike")) {
    return [`📞 Bridge failure spike: ${Math.round(failRate * 100)}% failed (${failed}/${snap.size} in last hour)`];
  }
  return [];
}

/**
 * Check for new signups (last 15 min).
 */
async function checkNewSignups() {
  const alerts = [];
  const fifteenMinAgo = Date.now() - 16 * 60 * 1000; // slight overlap to not miss
  const snap = await db.collection("organizations")
    .where("createdAtMs", ">", fifteenMinAgo)
    .get();

  for (const doc of snap.docs) {
    const org = doc.data();
    const key = `new_signup_${doc.id}`;
    if (shouldAlert(key)) {
      alerts.push(`🎉 New signup: <b>${org.organizationName || "Unnamed"}</b> (${org.planName || org.planId || "starter"})`);
    }
  }
  return alerts;
}

/**
 * Check for high-value payments (last 15 min, > ₹2000).
 */
async function checkHighValuePayments() {
  const alerts = [];
  const fifteenMinAgo = new Date(Date.now() - 16 * 60 * 1000).toISOString();
  const snap = await db.collection("billingEvents")
    .where("appliedAt", ">", fifteenMinAgo)
    .get();

  for (const doc of snap.docs) {
    const event = doc.data();
    const amount = Number(event.result?.amountCharged || 0);
    if (amount >= 2000) {
      const key = `payment_${doc.id}`;
      if (shouldAlert(key)) {
        alerts.push(`💳 Payment ₹${Math.round(amount)}: org <b>${event.orgId}</b> (${event.result?.planName || "plan upgrade"})`);
      }
    }
  }
  return alerts;
}

/**
 * Check for pending voice number requests (awaiting your action).
 */
async function checkPendingVoiceRequests() {
  const snap = await db.collection("voiceNumbers")
    .where("status", "==", "pending_review")
    .get();

  if (snap.size > 0 && shouldAlert("pending_voice_requests")) {
    return [`📋 ${snap.size} voice number request(s) awaiting your review → /platform/voice-requests`];
  }
  return [];
}

// ── Main Runner ─────────────────────────────────────────────────────────────

/**
 * Run all alert checks and send a single consolidated Telegram message
 * (if any alerts fired). Called by the 15-min cron.
 */
export async function runPlatformAlerts() {
  try {
    const allAlerts = [];

    const results = await Promise.allSettled([
      checkChurn(),
      checkLowWallets(),
      checkWhatsAppDisconnections(),
      checkSuspendedNumbers(),
      checkBridgeFailures(),
      checkNewSignups(),
      checkHighValuePayments(),
      checkPendingVoiceRequests(),
    ]);

    for (const r of results) {
      if (r.status === "fulfilled" && r.value.length > 0) {
        allAlerts.push(...r.value);
      }
    }

    if (allAlerts.length === 0) return { alerts: 0 };

    // Build consolidated message
    const header = `🚨 <b>CodeSkate Platform Alert</b>\n${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}\n`;
    const body = allAlerts.map((a, i) => `${i + 1}. ${a}`).join("\n");
    const message = `${header}\n${body}`;

    await sendTelegram(message);
    logger.info({ count: allAlerts.length }, "Platform alerts sent to Telegram");
    return { alerts: allAlerts.length };
  } catch (e) {
    logger.error({ err: e.message }, "Platform alerts runner failed");
    return { alerts: 0, error: e.message };
  }
}
