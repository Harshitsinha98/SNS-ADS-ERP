/**
 * Public AI Chat Controller.
 *
 * Powers the homepage floating chat widget. No authentication required.
 * Uses OpenAI with a fixed system prompt containing product knowledge.
 * Rate-limited by IP to prevent abuse.
 *
 * Supports any language — AI auto-detects and responds in the same
 * language the visitor uses.
 */

import { aiConfig } from "../config/env.js";
import { logger } from "../middleware/logger.js";

// ─── Rate Limiting (in-memory, per IP) ──────────────────────────────

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 messages per minute per IP

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// ─── System Prompt with Product Knowledge ───────────────────────────

const SYSTEM_PROMPT = `You are the AI sales assistant for Codeskate CRM — India's first AI-powered sales and lead management platform.

YOUR ROLE:
- Help website visitors understand Codeskate CRM's features, pricing, and benefits.
- Answer questions in ANY language the visitor uses. Detect their language and respond in the same language.
- Be concise (under 150 words), friendly, and persuasive.
- Guide visitors toward signing up for the free trial.
- If you don't know something specific, suggest they start a free trial or contact hello@codeskate.com.

PRODUCT KNOWLEDGE:

About Codeskate CRM:
- AI-powered CRM that captures WhatsApp leads, auto-assigns them, and replies using AI within 3 seconds.
- Replaces 5 tools: CRM + WhatsApp tool + calling + automation + analytics.
- Built specifically for Indian sales teams (real estate, coaching, e-commerce, services).

Pricing Plans:
- Starter: ₹599/month — 3 users, 1,000 leads, WhatsApp capture, auto-assignment, mobile app, call tracking.
- Growth (Most Popular): ₹1,499/month — 10 users, 10,000 leads, AI Auto-Reply (2,000 msgs/mo), workflow automation, goals & performance, priority support.
- Scale: ₹3,499/month — 25 users, 50,000 leads, unlimited AI replies, auto-dialer (coming soon), API access, dedicated account manager.
- All plans: 7-day free trial, no credit card required. 20% off on yearly billing.

Key Features:
1. AI Customer Care — Auto-replies to WhatsApp messages in 3 seconds, 24/7. Trains on your knowledge base (FAQs, pricing, policies). 70% queries auto-resolved without human intervention.
2. WhatsApp Business API — Every enquiry becomes a lead instantly. Template messages, free-form replies, delivery tracking.
3. Smart Auto-Assignment — Round-robin or workload-based. Right lead → right rep, instantly.
4. Workflow Automation — If-this-then-that rules: auto-assign, escalate, remind, send templates, update status.
5. Native Call Tracking — Android app logs every call automatically. No manual data entry.
6. SLA Escalation — Idle leads trigger automatic alerts to managers.
7. Follow-Up Automation — Server-side reminders + overdue escalation.
8. Live Analytics — Pipeline value, conversion rates, source performance, team leaderboards.
9. Multi-Org Support — Multiple branches with isolated data, managed from one login.
10. Auto-Dialer (Coming Soon) — System dials, agent talks. No manual dialing.
11. Enterprise Security — Bank-level encryption, role-based access, data isolation.

Competitive Advantages (what others DON'T have):
- Built-in AI auto-reply (others charge extra or don't offer it)
- WhatsApp Business API included (others need a separate tool)
- Workflow automation engine (others have basic rules only)
- Native call tracking (others need third-party integration)
- Auto-dialer coming soon (others charge ₹5,000-10,000/mo extra)

Free Trial:
- 7 days free on Starter plan
- No credit card required
- 2-minute setup with phone number
- Cancel anytime

RULES:
- Never make up features that don't exist.
- Never share internal technical details or code architecture.
- Always be positive about the product.
- If asked about competitors specifically, focus on Codeskate's strengths rather than attacking others.
- End responses with a soft CTA when appropriate (e.g., "Would you like to try it free?").
- Keep responses under 150 words for chat readability.`;

// ─── OpenAI Call ─────────────────────────────────────────────────────

async function callOpenAI(messages) {
  const response = await fetch(`${aiConfig.openaiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${aiConfig.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: aiConfig.openaiModel,
      messages,
      temperature: 0.4,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "unknown");
    throw new Error(`OpenAI API error ${response.status}: ${err.slice(0, 100)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// ─── Controller ─────────────────────────────────────────────────────

export async function publicChatMessage(req, res) {
  try {
    // Rate limit check
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    if (isRateLimited(ip)) {
      return res.status(429).json({
        error: "Too many messages. Please wait a moment before trying again.",
        reply: "You're sending messages too quickly. Please wait a minute and try again.",
      });
    }

    const { message, history } = req.body;
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "message is required" });
    }
    if (message.length > 500) {
      return res.status(400).json({ error: "Message too long (max 500 characters)" });
    }

    // Check if OpenAI is configured
    if (!aiConfig.enabled) {
      // Fallback to basic keyword matching if OpenAI not configured
      return res.json({ reply: getFallbackAnswer(message), source: "fallback" });
    }

    // Build conversation for OpenAI
    const conversationMessages = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    // Include last 6 messages of history for context
    if (Array.isArray(history)) {
      const recentHistory = history.slice(-6);
      for (const msg of recentHistory) {
        if (msg.role === "user" || msg.role === "assistant") {
          conversationMessages.push({
            role: msg.role,
            content: String(msg.text || msg.content || "").slice(0, 500),
          });
        }
      }
    }

    // Add current message
    conversationMessages.push({ role: "user", content: message.trim() });

    const reply = await callOpenAI(conversationMessages);

    return res.json({ reply, source: "openai" });
  } catch (error) {
    logger.error({ error: error.message }, "Public chat AI failed");
    // Return a graceful fallback
    return res.json({
      reply: "I'm having a small technical issue right now. You can start a free trial at codeskate.com/signup or email us at hello@codeskate.com for any questions!",
      source: "error_fallback",
    });
  }
}

// ─── Fallback (when OpenAI not configured) ──────────────────────────

function getFallbackAnswer(message) {
  const lower = message.toLowerCase().trim();
  if (lower.includes("price") || lower.includes("cost") || lower.includes("plan")) {
    return "We have 3 plans: Starter at ₹599/mo, Growth at ₹1,499/mo (most popular, includes AI), and Scale at ₹3,499/mo. All include a 7-day free trial with no credit card required.";
  }
  if (lower.includes("trial") || lower.includes("free")) {
    return "Yes! Our Starter plan comes with a 7-day free trial. No credit card required. Set up your workspace in under 2 minutes.";
  }
  if (lower.includes("ai") || lower.includes("auto") || lower.includes("reply")) {
    return "Our AI reads WhatsApp messages, classifies intent, and replies within 3 seconds using your uploaded knowledge base. 70% of queries are resolved without human intervention.";
  }
  if (lower.includes("whatsapp")) {
    return "We connect directly to WhatsApp Business API. Every message becomes a lead instantly. AI can auto-reply or your team can respond manually — all from one dashboard.";
  }
  return "Codeskate CRM is an AI-powered sales platform with WhatsApp integration, AI auto-reply, workflow automation, and more — starting at ₹599/month. Would you like to try it free for 7 days?";
}
