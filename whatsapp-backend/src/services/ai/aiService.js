/**
 * AI Customer Care Service.
 *
 * ARCHITECTURAL DECISION: This service is the single integration surface for
 * AI-powered customer interactions. It:
 * 1. Fetches org-scoped AI configuration and knowledge base.
 * 2. Classifies customer intent from their message.
 * 3. Generates contextual responses using RAG (knowledge base + conversation history).
 * 4. Tracks token usage for billing and the platform AI dashboard.
 * 5. Decides whether to auto-reply or escalate to a human agent.
 *
 * The service is provider-agnostic at the interface level but currently
 * implements OpenAI as the default (cheapest cost per interaction). Adding
 * Anthropic or Google providers requires only a new transport in callLLM().
 */

import { aiConfig } from "../../config/env.js";
import { db } from "../../bootstrap/firebase.js";
import { nowIso, orgCollection } from "../helpers.js";
import { logger } from "../../middleware/logger.js";

// ─── LLM Transport ──────────────────────────────────────────────────

/**
 * Resolve provider credentials based on the requested provider.
 * Supports "openai" and "gemini" with automatic fallback.
 */
function resolveProvider(provider) {
  if (provider === "gemini" && aiConfig.geminiApiKey) {
    return {
      apiKey: aiConfig.geminiApiKey,
      baseUrl: aiConfig.geminiBaseUrl,
      model: aiConfig.geminiModel,
    };
  }
  if (provider === "openai" && aiConfig.openaiApiKey) {
    return {
      apiKey: aiConfig.openaiApiKey,
      baseUrl: aiConfig.openaiBaseUrl,
      model: aiConfig.openaiModel,
    };
  }
  // Fallback: use whichever is available
  if (aiConfig.geminiApiKey) {
    return { apiKey: aiConfig.geminiApiKey, baseUrl: aiConfig.geminiBaseUrl, model: aiConfig.geminiModel };
  }
  if (aiConfig.openaiApiKey) {
    return { apiKey: aiConfig.openaiApiKey, baseUrl: aiConfig.openaiBaseUrl, model: aiConfig.openaiModel };
  }
  return null;
}

/**
 * Make a chat completion request to the specified LLM provider.
 * Returns { content, usage: { promptTokens, completionTokens, totalTokens } }
 *
 * @param {Array} messages - Chat messages array
 * @param {Object} options - { model, temperature, maxTokens, responseFormat, provider }
 */
async function callLLM(messages, options = {}) {
  const providerName = options.provider || aiConfig.customerCareProvider;
  const credentials = resolveProvider(providerName);
  if (!credentials) throw new Error("No AI provider configured (set OPENAI_API_KEY or GEMINI_API_KEY)");

  const model = options.model || credentials.model;
  const temperature = options.temperature ?? 0.3;
  const maxTokens = options.maxTokens || 500;

  const response = await fetch(`${credentials.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${credentials.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown");
    throw new Error(`LLM API error ${response.status}: ${errorBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  return {
    content: choice?.message?.content || "",
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
    model: data.model || model,
    finishReason: choice?.finish_reason || "stop",
  };
}

// ─── Knowledge Base ─────────────────────────────────────────────────

/**
 * Retrieve the active knowledge base articles for an org, formatted as
 * context for the LLM system prompt.
 */
async function getKnowledgeBaseContext(orgId, maxTokenEstimate = aiConfig.maxKnowledgeBaseTokens) {
  const snapshot = await orgCollection(db, orgId, "aiKnowledgeBase")
    .where("active", "==", true)
    .orderBy("priority", "desc")
    .limit(20)
    .get();

  if (snapshot.empty) return "";

  let totalChars = 0;
  const maxChars = maxTokenEstimate * 4; // ~4 chars per token estimate
  const articles = [];

  for (const doc of snapshot.docs) {
    const article = doc.data();
    const entry = `### ${article.title}\n${article.content}`;
    if (totalChars + entry.length > maxChars) break;
    totalChars += entry.length;
    articles.push(entry);
  }

  return articles.join("\n\n");
}

/**
 * Get the last N messages from a lead's conversation for context.
 */
async function getConversationHistory(orgId, leadId, limit = aiConfig.maxContextMessages) {
  const messagesRef = orgCollection(db, orgId, "leads").doc(leadId).collection("messages");
  const snapshot = await messagesRef
    .orderBy("at", "desc")
    .limit(limit)
    .get();

  return snapshot.docs
    .map((doc) => doc.data())
    .reverse()
    .map((msg) => ({
      role: msg.direction === "inbound" ? "user" : "assistant",
      content: msg.text || msg.type || "",
    }));
}

// ─── Intent Classification ──────────────────────────────────────────

const INTENT_CATEGORIES = [
  "greeting",
  "pricing_inquiry",
  "product_inquiry",
  "support_request",
  "complaint",
  "booking_appointment",
  "order_status",
  "general_faq",
  "human_request",
  "other",
];

/**
 * Classify the customer's message intent and confidence score.
 */
async function classifyIntent(message, orgConfig) {
  const systemPrompt = `You are an intent classifier for a business customer care system.
Classify the customer message into one of these categories: ${INTENT_CATEGORIES.join(", ")}.
Also assign a confidence score between 0.0 and 1.0.

Business context: ${orgConfig.businessDescription || "General business"}
Language: Respond in the same language as the customer message.

Respond ONLY in this JSON format:
{"intent": "category_name", "confidence": 0.85, "language": "detected_language_code"}`;

  try {
    const result = await callLLM(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      { temperature: 0.1, maxTokens: 100, responseFormat: { type: "json_object" } }
    );

    const parsed = JSON.parse(result.content);
    return {
      intent: INTENT_CATEGORIES.includes(parsed.intent) ? parsed.intent : "other",
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
      language: parsed.language || "en",
      usage: result.usage,
    };
  } catch (error) {
    logger.warn({ error: error.message }, "Intent classification failed, defaulting");
    return { intent: "other", confidence: 0.3, language: "en", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
  }
}

// ─── Response Generation ────────────────────────────────────────────

/**
 * Generate a contextual AI response using the org's knowledge base and
 * conversation history.
 */
async function generateResponse({ message, orgConfig, knowledgeBase, conversationHistory, classification }) {
  const tone = orgConfig.tone || "friendly";
  const businessName = orgConfig.businessName || "our team";
  const language = classification.language || "en";

  const systemPrompt = `You are an AI customer care assistant for "${businessName}".

YOUR ROLE:
- Answer customer queries helpfully, accurately, and concisely.
- Use the knowledge base below to provide accurate information.
- If you don't have enough information to answer confidently, say so and offer to connect them with a human agent.
- Never make up pricing, availability, or policy information not in the knowledge base.
- Keep responses under 300 words.
- Match the customer's language (detected: ${language}).

TONE: ${tone}
${tone === "formal" ? "Use professional language, avoid slang." : ""}
${tone === "friendly" ? "Be warm and approachable, use casual but professional language." : ""}
${tone === "sales" ? "Be enthusiastic, highlight benefits, guide toward conversion." : ""}

KNOWLEDGE BASE:
${knowledgeBase || "No specific knowledge base configured. Provide general helpful responses."}

RULES:
- Do NOT mention that you are an AI unless directly asked.
- Do NOT share internal system details or pricing structures not in the knowledge base.
- If the customer asks to speak to a human, acknowledge their request and let them know a team member will follow up.
- For complaints or frustrated customers, show empathy first, then offer solutions.
- Always end with a helpful question or next step when appropriate.`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-6), // Last 6 messages for immediate context
    { role: "user", content: message },
  ];

  const result = await callLLM(messages, {
    temperature: tone === "sales" ? 0.5 : 0.3,
    maxTokens: 400,
  });

  return {
    text: result.content.trim(),
    usage: result.usage,
    model: result.model,
  };
}

// ─── Usage Tracking ─────────────────────────────────────────────────

/**
 * Record AI token usage for billing and analytics.
 */
async function recordUsage(orgId, { promptTokens, completionTokens, totalTokens, model, intent, action }) {
  const today = new Date().toISOString().slice(0, 10);
  const usageRef = orgCollection(db, orgId, "aiUsage").doc(today);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(usageRef);
      const current = snap.exists ? snap.data() : {
        date: today,
        orgId,
        totalCalls: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        autoReplies: 0,
        escalations: 0,
        intents: {},
      };

      current.totalCalls += 1;
      current.totalPromptTokens += promptTokens;
      current.totalCompletionTokens += completionTokens;
      current.totalTokens += totalTokens;
      if (action === "auto_reply") current.autoReplies += 1;
      if (action === "escalate") current.escalations += 1;
      current.intents[intent] = (current.intents[intent] || 0) + 1;
      current.lastModel = model;
      current.updatedAt = nowIso();

      tx.set(usageRef, current, { merge: true });
    });
  } catch (error) {
    // Usage tracking is non-critical — never fail the customer interaction
    logger.warn({ orgId, error: error.message }, "AI usage tracking failed");
  }

  // Also update platform-wide aggregate (fire-and-forget)
  const platformRef = db.collection("platformAnalytics").doc(`ai_usage_${today}`);
  platformRef.set({
    date: today,
    type: "ai_daily_usage",
    [`orgs.${orgId}.calls`]: (await platformRef.get().then((s) => s.data()?.orgs?.[orgId]?.calls || 0).catch(() => 0)) + 1,
    [`orgs.${orgId}.tokens`]: (await platformRef.get().then((s) => s.data()?.orgs?.[orgId]?.tokens || 0).catch(() => 0)) + totalTokens,
    updatedAt: nowIso(),
  }, { merge: true }).catch((e) => logger.warn({ error: e.message }, "Platform AI usage update failed"));
}

// ─── Main Entry Point ───────────────────────────────────────────────

/**
 * Process an inbound customer message through the AI pipeline.
 *
 * Returns:
 *   { action: "auto_reply", response: "...", intent, confidence }
 *   { action: "escalate", reason: "...", intent, confidence, suggestedResponse? }
 *   { action: "disabled", reason: "AI not configured" }
 *
 * This function NEVER throws — failures degrade to escalation.
 */
export async function processWithAI({ orgId, leadId, message, customerName, customerPhone }) {
  // 1. Check if AI is globally enabled
  if (!aiConfig.enabled) {
    return { action: "disabled", reason: "AI API key not configured on platform" };
  }

  // 2. Get org-level AI configuration
  const configSnap = await orgCollection(db, orgId, "aiConfig").doc("settings").get();
  if (!configSnap.exists || !configSnap.data().enabled) {
    return { action: "disabled", reason: "AI not enabled for this organization" };
  }
  const orgAiConfig = configSnap.data();

  // 3. Check quota limits
  const today = new Date().toISOString().slice(0, 10);
  const usageSnap = await orgCollection(db, orgId, "aiUsage").doc(today).get();
  const todayUsage = usageSnap.exists ? usageSnap.data() : { totalCalls: 0 };
  const dailyLimit = orgAiConfig.dailyLimit || 500;
  if (todayUsage.totalCalls >= dailyLimit) {
    return { action: "escalate", reason: "daily_ai_limit_reached", intent: "unknown", confidence: 0 };
  }

  // 4. Check working hours (if configured)
  if (orgAiConfig.workingHoursOnly) {
    const now = new Date();
    const hour = now.getHours();
    const startHour = orgAiConfig.workingHoursStart ?? 9;
    const endHour = orgAiConfig.workingHoursEnd ?? 18;
    // If within working hours, skip AI (human agents are available)
    if (hour >= startHour && hour < endHour) {
      return { action: "skip", reason: "within_working_hours" };
    }
  }

  // 5. Check per-lead auto-reply limit
  if (orgAiConfig.maxAutoRepliesPerLead) {
    const aiRepliesSnap = await orgCollection(db, orgId, "leads").doc(leadId)
      .collection("messages")
      .where("source", "==", "ai_customer_care")
      .count()
      .get();
    const aiRepliesSent = aiRepliesSnap.data()?.count || 0;
    if (aiRepliesSent >= orgAiConfig.maxAutoRepliesPerLead) {
      return { action: "escalate", reason: "max_ai_replies_per_lead_reached", intent: "unknown", confidence: 0 };
    }
  }

  try {
    // 6. Classify intent
    const classification = await classifyIntent(message, orgAiConfig);

    // 7. Immediate escalation for certain intents
    if (classification.intent === "human_request") {
      await recordUsage(orgId, { ...classification.usage, model: aiConfig.openaiModel, intent: classification.intent, action: "escalate" });
      return {
        action: "escalate",
        reason: "customer_requested_human",
        intent: classification.intent,
        confidence: classification.confidence,
      };
    }

    // Check excluded intents
    const excludedIntents = orgAiConfig.excludedIntents || [];
    if (excludedIntents.includes(classification.intent)) {
      await recordUsage(orgId, { ...classification.usage, model: aiConfig.openaiModel, intent: classification.intent, action: "escalate" });
      return {
        action: "escalate",
        reason: "intent_excluded_by_config",
        intent: classification.intent,
        confidence: classification.confidence,
      };
    }

    // 8. Check confidence threshold
    const threshold = orgAiConfig.confidenceThreshold ?? aiConfig.defaultConfidenceThreshold;
    if (classification.confidence < threshold) {
      await recordUsage(orgId, { ...classification.usage, model: aiConfig.openaiModel, intent: classification.intent, action: "escalate" });
      return {
        action: "escalate",
        reason: "low_confidence",
        intent: classification.intent,
        confidence: classification.confidence,
      };
    }

    // 9. Get knowledge base and conversation history
    const [knowledgeBase, conversationHistory] = await Promise.all([
      getKnowledgeBaseContext(orgId),
      leadId ? getConversationHistory(orgId, leadId) : Promise.resolve([]),
    ]);

    // 10. Generate response
    const response = await generateResponse({
      message,
      orgConfig: orgAiConfig,
      knowledgeBase,
      conversationHistory,
      classification,
    });

    // 11. Record usage (classification + generation combined)
    const totalUsage = {
      promptTokens: (classification.usage?.promptTokens || 0) + (response.usage?.promptTokens || 0),
      completionTokens: (classification.usage?.completionTokens || 0) + (response.usage?.completionTokens || 0),
      totalTokens: (classification.usage?.totalTokens || 0) + (response.usage?.totalTokens || 0),
      model: response.model,
      intent: classification.intent,
      action: "auto_reply",
    };
    await recordUsage(orgId, totalUsage);

    return {
      action: "auto_reply",
      response: response.text,
      intent: classification.intent,
      confidence: classification.confidence,
      language: classification.language,
      tokensUsed: totalUsage.totalTokens,
    };
  } catch (error) {
    logger.error({ orgId, leadId, error: error.message }, "AI processing failed, escalating");
    return {
      action: "escalate",
      reason: "ai_processing_error",
      intent: "unknown",
      confidence: 0,
      error: error.message,
    };
  }
}

/**
 * Test the AI response for a given message without sending it.
 * Used by the admin test playground.
 */
export async function testAIResponse({ orgId, message }) {
  if (!aiConfig.enabled) {
    return { success: false, error: "AI API key not configured on platform" };
  }

  const configSnap = await orgCollection(db, orgId, "aiConfig").doc("settings").get();
  const orgAiConfig = configSnap.exists ? configSnap.data() : { businessName: "Test Business", tone: "friendly" };

  try {
    const classification = await classifyIntent(message, orgAiConfig);
    const knowledgeBase = await getKnowledgeBaseContext(orgId);
    const response = await generateResponse({
      message,
      orgConfig: orgAiConfig,
      knowledgeBase,
      conversationHistory: [],
      classification,
    });

    return {
      success: true,
      response: response.text,
      intent: classification.intent,
      confidence: classification.confidence,
      language: classification.language,
      tokensUsed: (classification.usage?.totalTokens || 0) + (response.usage?.totalTokens || 0),
      model: response.model,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get AI usage statistics for an org (for admin dashboard).
 */
export async function getAIUsageStats(orgId, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const snapshot = await orgCollection(db, orgId, "aiUsage")
    .where("date", ">=", startDate)
    .orderBy("date", "desc")
    .limit(days)
    .get();

  const dailyStats = snapshot.docs.map((doc) => doc.data());
  const totals = dailyStats.reduce((acc, day) => ({
    totalCalls: acc.totalCalls + (day.totalCalls || 0),
    totalTokens: acc.totalTokens + (day.totalTokens || 0),
    autoReplies: acc.autoReplies + (day.autoReplies || 0),
    escalations: acc.escalations + (day.escalations || 0),
  }), { totalCalls: 0, totalTokens: 0, autoReplies: 0, escalations: 0 });

  // Estimated cost (GPT-4o-mini: $0.15/1M input + $0.60/1M output ≈ $0.30/1M avg)
  const estimatedCostUsd = (totals.totalTokens / 1_000_000) * 0.30;
  const estimatedCostInr = estimatedCostUsd * 84;

  return {
    period: `${days} days`,
    totals,
    estimatedCost: { usd: Math.round(estimatedCostUsd * 100) / 100, inr: Math.round(estimatedCostInr) },
    resolutionRate: totals.totalCalls > 0 ? Math.round((totals.autoReplies / totals.totalCalls) * 100) : 0,
    dailyStats: dailyStats.reverse(),
  };
}

/**
 * Platform-wide AI usage (for platform owner dashboard).
 */
export async function getPlatformAIUsage(days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const snapshot = await db.collection("platformAnalytics")
    .where("type", "==", "ai_daily_usage")
    .where("date", ">=", startDate)
    .orderBy("date", "desc")
    .limit(days)
    .get();

  const dailyData = snapshot.docs.map((doc) => doc.data());

  // Aggregate across all orgs
  let totalCalls = 0;
  let totalTokens = 0;
  const orgBreakdown = {};

  for (const day of dailyData) {
    if (!day.orgs) continue;
    for (const [orgId, stats] of Object.entries(day.orgs)) {
      totalCalls += stats.calls || 0;
      totalTokens += stats.tokens || 0;
      if (!orgBreakdown[orgId]) orgBreakdown[orgId] = { calls: 0, tokens: 0 };
      orgBreakdown[orgId].calls += stats.calls || 0;
      orgBreakdown[orgId].tokens += stats.tokens || 0;
    }
  }

  const estimatedCostUsd = (totalTokens / 1_000_000) * 0.30;
  const estimatedCostInr = estimatedCostUsd * 84;

  return {
    period: `${days} days`,
    totalCalls,
    totalTokens,
    estimatedCost: { usd: Math.round(estimatedCostUsd * 100) / 100, inr: Math.round(estimatedCostInr) },
    orgBreakdown,
    dailyData: dailyData.reverse(),
    activeOrgs: Object.keys(orgBreakdown).length,
  };
}
