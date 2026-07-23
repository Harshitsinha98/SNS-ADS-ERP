/**
 * AI Configuration & Knowledge Base Management Service.
 *
 * ARCHITECTURAL DECISION: AI configuration is org-scoped so each customer
 * can independently control their AI behavior without affecting others.
 * The knowledge base uses a simple document-per-article model that scales
 * to hundreds of articles per org without requiring vector embeddings
 * (the LLM context window handles relevance via priority ordering).
 *
 * Schema:
 *   organizations/{orgId}/aiConfig/settings — single config document
 *   organizations/{orgId}/aiKnowledgeBase/{articleId} — knowledge articles
 *   organizations/{orgId}/aiUsage/{date} — daily usage aggregates
 */

import { db } from "../../bootstrap/firebase.js";
import { nowIso, safeDocId, orgCollection } from "../helpers.js";
import { logger } from "../../middleware/logger.js";

// ─── Default Configuration ──────────────────────────────────────────

const DEFAULT_AI_CONFIG = {
  enabled: false,
  businessName: "",
  businessDescription: "",
  tone: "friendly", // friendly | formal | sales
  confidenceThreshold: 0.7,
  dailyLimit: 500,
  maxAutoRepliesPerLead: 10,
  workingHoursOnly: false,
  workingHoursStart: 9,
  workingHoursEnd: 18,
  excludedIntents: ["human_request"],
  escalationKeywords: [],
  welcomeMessage: "",
  fallbackMessage: "I'll connect you with a team member who can help you better. Please wait a moment.",
  autoReplyEnabled: true,
};

// ─── AI Config CRUD ─────────────────────────────────────────────────

/**
 * Get AI configuration for an organization. Returns defaults if not yet configured.
 */
export async function getAIConfig(orgId) {
  const ref = orgCollection(db, orgId, "aiConfig").doc("settings");
  const snap = await ref.get();
  if (!snap.exists) return { ...DEFAULT_AI_CONFIG, orgId, configured: false };
  return { ...DEFAULT_AI_CONFIG, ...snap.data(), orgId, configured: true };
}

/**
 * Update AI configuration. Merges with existing config.
 */
export async function updateAIConfig(orgId, updates, updatedBy) {
  const ref = orgCollection(db, orgId, "aiConfig").doc("settings");

  // Validate allowed fields
  const allowedFields = [
    "enabled", "businessName", "businessDescription", "tone",
    "confidenceThreshold", "dailyLimit", "maxAutoRepliesPerLead",
    "workingHoursOnly", "workingHoursStart", "workingHoursEnd",
    "excludedIntents", "escalationKeywords", "welcomeMessage",
    "fallbackMessage", "autoReplyEnabled",
  ];

  const sanitized = {};
  for (const key of allowedFields) {
    if (key in updates) sanitized[key] = updates[key];
  }

  // Type validation
  if ("enabled" in sanitized && typeof sanitized.enabled !== "boolean") {
    throw new Error("enabled must be a boolean");
  }
  if ("confidenceThreshold" in sanitized) {
    const threshold = Number(sanitized.confidenceThreshold);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      throw new Error("confidenceThreshold must be between 0 and 1");
    }
    sanitized.confidenceThreshold = threshold;
  }
  if ("dailyLimit" in sanitized) {
    const limit = Number(sanitized.dailyLimit);
    if (!Number.isFinite(limit) || limit < 1 || limit > 50000) {
      throw new Error("dailyLimit must be between 1 and 50000");
    }
    sanitized.dailyLimit = limit;
  }
  if ("tone" in sanitized && !["friendly", "formal", "sales"].includes(sanitized.tone)) {
    throw new Error("tone must be one of: friendly, formal, sales");
  }

  sanitized.updatedAt = nowIso();
  sanitized.updatedBy = updatedBy || "system";

  await ref.set(sanitized, { merge: true });

  // Log the config change in org activity
  await orgCollection(db, orgId, "activity").add({
    text: `AI Customer Care configuration updated${sanitized.enabled === true ? " (enabled)" : sanitized.enabled === false ? " (disabled)" : ""}`,
    at: nowIso(),
    orgId,
    source: "ai_config",
    actor: updatedBy || "system",
  });

  logger.info({ orgId, fields: Object.keys(sanitized) }, "AI config updated");
  return getAIConfig(orgId);
}

// ─── Knowledge Base CRUD ────────────────────────────────────────────

/**
 * List all knowledge base articles for an org.
 */
export async function listKnowledgeBase(orgId) {
  const snapshot = await orgCollection(db, orgId, "aiKnowledgeBase")
    .orderBy("priority", "desc")
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

/**
 * Get a single knowledge base article.
 */
export async function getKnowledgeArticle(orgId, articleId) {
  const snap = await orgCollection(db, orgId, "aiKnowledgeBase").doc(articleId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Create a new knowledge base article.
 */
export async function createKnowledgeArticle(orgId, { title, content, category, priority }, createdBy) {
  if (!title || !content) throw new Error("title and content are required");
  if (title.length > 200) throw new Error("title must be under 200 characters");
  if (content.length > 10000) throw new Error("content must be under 10,000 characters");

  // Check article limit per org (prevent abuse)
  const countSnap = await orgCollection(db, orgId, "aiKnowledgeBase").count().get();
  const currentCount = countSnap.data()?.count || 0;
  if (currentCount >= 100) {
    throw new Error("Maximum 100 knowledge base articles per organization");
  }

  const article = {
    title: title.trim(),
    content: content.trim(),
    category: category || "general",
    priority: Number(priority) || 0,
    active: true,
    createdAt: nowIso(),
    createdBy: createdBy || "system",
    updatedAt: nowIso(),
    charCount: content.trim().length,
    estimatedTokens: Math.ceil(content.trim().length / 4),
  };

  const ref = await orgCollection(db, orgId, "aiKnowledgeBase").add(article);
  logger.info({ orgId, articleId: ref.id, title }, "Knowledge base article created");
  return { id: ref.id, ...article };
}

/**
 * Update an existing knowledge base article.
 */
export async function updateKnowledgeArticle(orgId, articleId, updates, updatedBy) {
  const ref = orgCollection(db, orgId, "aiKnowledgeBase").doc(articleId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Article not found");

  const allowedFields = ["title", "content", "category", "priority", "active"];
  const sanitized = {};
  for (const key of allowedFields) {
    if (key in updates) sanitized[key] = updates[key];
  }

  if (sanitized.title && sanitized.title.length > 200) throw new Error("title must be under 200 characters");
  if (sanitized.content && sanitized.content.length > 10000) throw new Error("content must be under 10,000 characters");

  if (sanitized.content) {
    sanitized.charCount = sanitized.content.trim().length;
    sanitized.estimatedTokens = Math.ceil(sanitized.content.trim().length / 4);
  }

  sanitized.updatedAt = nowIso();
  sanitized.updatedBy = updatedBy || "system";

  await ref.update(sanitized);
  return { id: articleId, ...snap.data(), ...sanitized };
}

/**
 * Delete a knowledge base article.
 */
export async function deleteKnowledgeArticle(orgId, articleId) {
  const ref = orgCollection(db, orgId, "aiKnowledgeBase").doc(articleId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Article not found");
  await ref.delete();
  logger.info({ orgId, articleId }, "Knowledge base article deleted");
  return { deleted: true, id: articleId };
}

/**
 * Bulk import knowledge base articles (for initial setup).
 */
export async function bulkImportKnowledgeBase(orgId, articles, createdBy) {
  if (!Array.isArray(articles) || articles.length === 0) {
    throw new Error("articles must be a non-empty array");
  }
  if (articles.length > 50) {
    throw new Error("Maximum 50 articles per bulk import");
  }

  const countSnap = await orgCollection(db, orgId, "aiKnowledgeBase").count().get();
  const currentCount = countSnap.data()?.count || 0;
  if (currentCount + articles.length > 100) {
    throw new Error(`Cannot import ${articles.length} articles — limit is 100 total, currently have ${currentCount}`);
  }

  const batch = db.batch();
  const results = [];

  for (const article of articles) {
    if (!article.title || !article.content) continue;
    const ref = orgCollection(db, orgId, "aiKnowledgeBase").doc();
    const data = {
      title: String(article.title).trim().slice(0, 200),
      content: String(article.content).trim().slice(0, 10000),
      category: article.category || "general",
      priority: Number(article.priority) || 0,
      active: true,
      createdAt: nowIso(),
      createdBy: createdBy || "system",
      updatedAt: nowIso(),
      charCount: String(article.content).trim().length,
      estimatedTokens: Math.ceil(String(article.content).trim().length / 4),
    };
    batch.set(ref, data);
    results.push({ id: ref.id, title: data.title });
  }

  await batch.commit();
  logger.info({ orgId, count: results.length }, "Knowledge base bulk import completed");
  return { imported: results.length, articles: results };
}

/**
 * Get knowledge base statistics for an org.
 */
export async function getKnowledgeBaseStats(orgId) {
  const snapshot = await orgCollection(db, orgId, "aiKnowledgeBase").get();
  const articles = snapshot.docs.map((doc) => doc.data());

  const totalArticles = articles.length;
  const activeArticles = articles.filter((a) => a.active).length;
  const totalChars = articles.reduce((sum, a) => sum + (a.charCount || 0), 0);
  const estimatedTokens = articles.reduce((sum, a) => sum + (a.estimatedTokens || 0), 0);
  const categories = [...new Set(articles.map((a) => a.category))];

  return {
    totalArticles,
    activeArticles,
    inactiveArticles: totalArticles - activeArticles,
    totalChars,
    estimatedTokens,
    categories,
    limit: 100,
    remaining: 100 - totalArticles,
  };
}
