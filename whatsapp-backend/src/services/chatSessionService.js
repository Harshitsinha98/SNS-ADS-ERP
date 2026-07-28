/**
 * Chat Session Service.
 *
 * Manages session-based conversation visibility for employees.
 * Each session represents a time window during which an employee
 * can see and respond to a customer's messages.
 *
 * Schema:
 *   organizations/{orgId}/leads/{leadId}/chatSessions/{sessionId}
 *
 * Rules:
 * - Employee sees messages ONLY within their active session timeframe
 * - Owner/Admin sees ALL messages regardless of sessions
 * - AI generates a brief at session start so employee has context
 * - Session ends on resolve, reassign, or AI re-enable
 */

import { db } from "../bootstrap/firebase.js";
import { nowIso, orgCollection } from "./helpers.js";
import { aiConfig } from "../config/env.js";
import { logger } from "../middleware/logger.js";

// ─── Session CRUD ───────────────────────────────────────────────────

/**
 * Create a new chat session (human takeover).
 * Disables AI for this lead and assigns conversation to the employee.
 */
export async function createChatSession(orgId, leadId, { employeeId, employeeName, reason }) {
  // End any existing active session for this lead
  const existingActive = await getActiveSession(orgId, leadId);
  if (existingActive) {
    await endSession(orgId, leadId, existingActive.id, "reassigned");
  }

  const now = nowIso();
  const nowMs = Date.now();

  // Generate AI brief from recent conversation
  const brief = await generateSessionBrief(orgId, leadId);

  const sessionData = {
    employeeId,
    employeeName: employeeName || "Agent",
    startedAt: now,
    startedAtMs: nowMs,
    endedAt: null,
    endedAtMs: null,
    status: "active",
    reason: reason || "human_takeover",
    brief,
    summary: null,
    messagesCount: 0,
  };

  const ref = await orgCollection(db, orgId, "leads").doc(leadId)
    .collection("chatSessions").add(sessionData);

  // Disable AI for this lead
  await orgCollection(db, orgId, "leads").doc(leadId).update({
    aiEnabled: false,
    aiDisabledAt: now,
    aiDisabledReason: reason || "human_takeover",
    activeChatSessionId: ref.id,
    activeChatSessionEmployee: employeeId,
  });

  // ── Notify the assigned employee about the new chat ──
  try {
    const leadSnap = await orgCollection(db, orgId, "leads").doc(leadId).get();
    const leadName = leadSnap.exists ? (leadSnap.data().name || leadSnap.data().phone || "Customer") : "Customer";
    await orgCollection(db, orgId, "notifications").add({
      userId: employeeId,
      type: "chat_assigned",
      title: "New Chat Assigned",
      text: `Chat with ${leadName} has been assigned to you. Customer requested human assistance.`,
      leadId,
      sessionId: ref.id,
      read: false,
      at: now,
      atMs: nowMs,
      orgId,
    });
    logger.info({ orgId, leadId, employeeId }, "Employee notification created for chat assignment");
  } catch (notifErr) {
    logger.warn({ orgId, leadId, err: notifErr.message }, "Failed to create employee notification");
  }

  logger.info({ orgId, leadId, sessionId: ref.id, employeeId }, "Chat session created");
  return { id: ref.id, ...sessionData };
}

/**
 * End an active chat session.
 */
export async function endSession(orgId, leadId, sessionId, resolution = "resolved", summary = null) {
  const now = nowIso();
  const nowMs = Date.now();

  const sessionRef = orgCollection(db, orgId, "leads").doc(leadId)
    .collection("chatSessions").doc(sessionId);

  const snap = await sessionRef.get();
  if (!snap.exists) throw new Error("Session not found");
  if (snap.data().status !== "active") throw new Error("Session is already ended");

  await sessionRef.update({
    endedAt: now,
    endedAtMs: nowMs,
    status: resolution,
    summary: summary || null,
  });

  // Clear active session from lead (but keep aiEnabled = false until explicitly re-enabled)
  await orgCollection(db, orgId, "leads").doc(leadId).update({
    activeChatSessionId: null,
    activeChatSessionEmployee: null,
  });

  logger.info({ orgId, leadId, sessionId, resolution }, "Chat session ended");
  return { ended: true, sessionId, resolution };
}

/**
 * Re-enable AI for a lead (after human session is done).
 */
export async function reEnableAI(orgId, leadId) {
  // End any active session first
  const active = await getActiveSession(orgId, leadId);
  if (active) {
    await endSession(orgId, leadId, active.id, "ai_resumed");
  }

  await orgCollection(db, orgId, "leads").doc(leadId).update({
    aiEnabled: true,
    aiDisabledAt: null,
    aiDisabledReason: null,
    activeChatSessionId: null,
    activeChatSessionEmployee: null,
  });

  logger.info({ orgId, leadId }, "AI re-enabled for lead");
  return { aiEnabled: true };
}

/**
 * Get the currently active session for a lead (if any).
 */
export async function getActiveSession(orgId, leadId) {
  const snapshot = await orgCollection(db, orgId, "leads").doc(leadId)
    .collection("chatSessions")
    .where("status", "==", "active")
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Get all sessions for a lead (admin/owner view).
 */
export async function listSessions(orgId, leadId) {
  const snapshot = await orgCollection(db, orgId, "leads").doc(leadId)
    .collection("chatSessions")
    .orderBy("startedAtMs", "desc")
    .limit(20)
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get session-bounded messages for an employee.
 * Returns only messages that occurred during the session timeframe.
 */
export async function getSessionMessages(orgId, leadId, sessionId) {
  const sessionSnap = await orgCollection(db, orgId, "leads").doc(leadId)
    .collection("chatSessions").doc(sessionId).get();

  if (!sessionSnap.exists) throw new Error("Session not found");
  const session = sessionSnap.data();

  const startMs = session.startedAtMs;
  const endMs = session.endedAtMs || Date.now();

  const messagesSnap = await orgCollection(db, orgId, "leads").doc(leadId)
    .collection("messages")
    .where("atMs", ">=", startMs)
    .where("atMs", "<=", endMs)
    .orderBy("atMs", "asc")
    .get();

  return messagesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

// ─── AI Session Brief ───────────────────────────────────────────────

/**
 * Generate a 2-3 line summary of the recent conversation for the employee.
 * Gives context without exposing the full message history.
 */
async function generateSessionBrief(orgId, leadId) {
  try {
    // Get last 10 messages for context
    const messagesSnap = await orgCollection(db, orgId, "leads").doc(leadId)
      .collection("messages")
      .orderBy("atMs", "desc")
      .limit(10)
      .get();

    if (messagesSnap.empty) return "New conversation — no prior messages.";

    const messages = messagesSnap.docs
      .map((doc) => doc.data())
      .reverse()
      .map((m) => `${m.direction === "inbound" ? "Customer" : "AI"}: ${m.text || "[media]"}`)
      .join("\n");

    // Get lead info
    const leadSnap = await orgCollection(db, orgId, "leads").doc(leadId).get();
    const lead = leadSnap.exists ? leadSnap.data() : {};

    // If AI is not configured, return a simple brief
    if (!aiConfig.enabled) {
      const lastMsg = messagesSnap.docs[0]?.data();
      return `Customer: ${lead.name || "Unknown"} | Last message: "${(lastMsg?.text || "").slice(0, 100)}"`;
    }

    // Use AI to generate a brief
    const provider = aiConfig.customerCareProvider || "openai";
    let apiKey, baseUrl, model;
    if (provider === "gemini" && aiConfig.geminiApiKey) {
      apiKey = aiConfig.geminiApiKey;
      baseUrl = aiConfig.geminiBaseUrl;
      model = aiConfig.geminiModel;
    } else {
      apiKey = aiConfig.openaiApiKey;
      baseUrl = aiConfig.openaiBaseUrl;
      model = aiConfig.openaiModel;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Summarize this customer conversation in 2-3 lines for a support agent taking over. Include: what the customer wants, their mood, and any key details (budget, product, timeline). Be concise." },
          { role: "user", content: `Customer name: ${lead.name || "Unknown"}\nPhone: ${lead.phone || "N/A"}\n\nConversation:\n${messages}` },
        ],
        temperature: 0.2,
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      return `Customer: ${lead.name || "Unknown"} | Recent topic: ${messagesSnap.docs[0]?.data()?.text?.slice(0, 80) || "N/A"}`;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || `Customer: ${lead.name || "Unknown"}`;
  } catch (error) {
    logger.warn({ orgId, leadId, error: error.message }, "Session brief generation failed");
    return "Context unavailable — check lead details for background.";
  }
}

/**
 * Check if AI should reply to a lead (used by aiWhatsAppBridge).
 * Returns false if a human session is active or AI is disabled.
 */
export async function isAIActiveForLead(orgId, leadId) {
  const leadSnap = await orgCollection(db, orgId, "leads").doc(leadId).get();
  if (!leadSnap.exists) return true; // New lead, AI can reply
  const lead = leadSnap.data();
  return lead.aiEnabled !== false;
}
