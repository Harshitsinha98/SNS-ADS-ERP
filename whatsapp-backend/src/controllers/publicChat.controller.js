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
(Keep in sync with lead-erp/src/data/plans.js and whatsapp-backend/src/billing/planLimits.js.
The product has not launched yet: there are no customer counts, testimonials or usage results to quote.)

About Codeskate CRM:
- AI-powered CRM that captures WhatsApp leads, auto-assigns them to your team, and replies using AI that answers from your own knowledge base.
- Brings CRM, WhatsApp, AI replies, calling and automation into one place.
- Built for Indian sales teams (real estate, coaching, e-commerce, services).

Pricing Plans (monthly; yearly billing saves about 17%):
- Starter: ₹599/month — 3 users, 1,000 leads/month, WhatsApp capture, round-robin auto-assignment, AI auto-reply (250/month), 5 knowledge base articles, Android call tracking, 1 website lead form. Includes a 7-day free trial.
- Growth (Most Popular): ₹1,499/month — 10 users, 10,000 leads/month, AI auto-reply (2,000/month), human takeover + smart notifications, bridge calling (masked + recorded), 5 workflow rules, goals & performance, Meta & Google ad leads, priority email support.
- Scale: ₹3,499/month — 25 users, 50,000 leads/month, AI auto-reply (10,000/month), 25 workflow rules, API access & webhooks, unlimited website forms, priority chat support.
- Enterprise: ₹7,999/month — unlimited users and leads, AI auto-reply (50,000/month), unlimited workflows, dedicated account manager, white-glove onboarding.
- Only the Starter plan has a free trial (7 days, no credit card). The other plans are paid from day one.
- Extra AI replies: ₹499 for 2,500 more replies per month.

Key Features:
1. AI Customer Care — Auto-replies to WhatsApp messages 24/7 using your knowledge base (FAQs, pricing, policies). Hands over to a human agent when needed.
2. WhatsApp Business API — Every enquiry becomes a lead. Template messages, free-form replies, delivery tracking.
3. Smart Auto-Assignment — Round-robin or workload-based.
4. Workflow Automation — If-this-then-that rules: auto-assign, escalate, remind, send templates, update status.
5. Native Call Tracking — The Android app logs calls on the lead timeline.
6. Escalation — If an assigned agent doesn't reply within 3 minutes, admins are alerted.
7. Follow-Up Automation — Server-side reminders and overdue alerts.
8. Live Analytics — Pipeline value, conversion rates, source performance, team leaderboards.
9. Multi-Org Support — Multiple branches with isolated data, managed from one login.
10. Bridge Calling (Growth and up) — Agent and lead are connected through a virtual number and the call is recorded. Billed from a prepaid voice wallet (top-ups from ₹100) per connected minute.
11. Security — Role-based access, OTP sign-in, and per-organisation data isolation.

Coming soon (say clearly that these are not available yet):
- AI Voice Bot — AI that calls and qualifies leads in Hindi and English.
- Auto-Dialer.

Free Trial:
- 7 days free on the Starter plan only
- No credit card required
- Sign up with your phone number

RULES:
- Never make up features that don't exist.
- Never state customer counts, testimonials, case studies, success rates, response-time figures or other performance statistics. None exist yet. If asked, say the product is new and offer the free trial instead.
- Never claim Codeskate is cheaper or better than a named competitor, and never quote competitor prices.
- Never share internal technical details or code architecture.
- Always be positive about the product.
- If asked about competitors specifically, focus on Codeskate's strengths rather than attacking others.
- End responses with a soft CTA when appropriate (e.g., "Would you like to try it free?").
- Keep responses under 150 words for chat readability.`;

// ─── Homepage Chat LLM Call (uses OpenAI/GPT specifically) ──────────

async function callHomepageLLM(messages) {
  // Homepage always uses the configured homepage provider (default: OpenAI)
  const provider = aiConfig.homepageChatProvider;
  let apiKey, baseUrl, model;

  if (provider === "gemini" && aiConfig.geminiApiKey) {
    apiKey = aiConfig.geminiApiKey;
    baseUrl = aiConfig.geminiBaseUrl;
    model = aiConfig.geminiModel;
  } else if (aiConfig.openaiApiKey) {
    apiKey = aiConfig.openaiApiKey;
    baseUrl = aiConfig.openaiBaseUrl;
    model = aiConfig.openaiModel;
  } else if (aiConfig.geminiApiKey) {
    apiKey = aiConfig.geminiApiKey;
    baseUrl = aiConfig.geminiBaseUrl;
    model = aiConfig.geminiModel;
  } else {
    throw new Error("No AI provider configured");
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
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

    const reply = await callHomepageLLM(conversationMessages);

    return res.json({ reply, source: aiConfig.homepageChatProvider });
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
    return "We have 4 plans: Starter at ₹599/mo, Growth at ₹1,499/mo (most popular), Scale at ₹3,499/mo and Enterprise at ₹7,999/mo. Starter comes with a 7-day free trial, no credit card required.";
  }
  if (lower.includes("trial") || lower.includes("free")) {
    return "Yes! Our Starter plan comes with a 7-day free trial. No credit card required — you sign up with your phone number.";
  }
  if (lower.includes("ai") || lower.includes("auto") || lower.includes("reply")) {
    return "Our AI reads WhatsApp messages, classifies intent, and replies using the knowledge base you upload. When a conversation needs a person, it hands over to your team.";
  }
  if (lower.includes("whatsapp")) {
    return "We connect directly to WhatsApp Business API. Every message becomes a lead instantly. AI can auto-reply or your team can respond manually — all from one dashboard.";
  }
  return "Codeskate CRM is an AI-powered sales platform with WhatsApp integration, AI auto-reply, workflow automation, and more — starting at ₹599/month. Would you like to try it free for 7 days?";
}
