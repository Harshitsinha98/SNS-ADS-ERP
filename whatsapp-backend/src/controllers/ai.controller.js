/**
 * AI Customer Care Controller.
 *
 * ARCHITECTURAL DECISION: AI routes are separated from platform routes
 * because they serve two different audiences:
 * - Org admin routes: /api/v1/ai/* — org admins configure their AI settings
 * - Platform routes: /api/v1/platform/ai/* — platform owner views cross-org usage
 *
 * Both reuse the same underlying services (aiService.js, aiConfigService.js)
 * but with different authorization gates and data scopes.
 */

import { isOrgAdmin, isPlatformAdmin } from "../middleware/auth.js";
import {
  getAIConfig,
  updateAIConfig,
  listKnowledgeBase,
  getKnowledgeArticle,
  createKnowledgeArticle,
  updateKnowledgeArticle,
  deleteKnowledgeArticle,
  bulkImportKnowledgeBase,
  getKnowledgeBaseStats,
} from "../services/ai/aiConfigService.js";
import {
  testAIResponse,
  getAIUsageStats,
  getPlatformAIUsage,
} from "../services/ai/aiService.js";
import { logger } from "../middleware/logger.js";

// ─── Org Admin: AI Configuration ────────────────────────────────────

export async function getConfig(req, res) {
  try {
    const { orgId } = req.query;
    if (!orgId) return res.status(400).json({ error: "orgId is required" });
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    const config = await getAIConfig(orgId);
    return res.json(config);
  } catch (error) {
    logger.error({ error: error.message }, "getConfig failed");
    return res.status(500).json({ error: "Failed to fetch AI config" });
  }
}

export async function saveConfig(req, res) {
  try {
    const { orgId, ...updates } = req.body;
    if (!orgId) return res.status(400).json({ error: "orgId is required" });
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    const config = await updateAIConfig(orgId, updates, req.authUser.uid);
    return res.json(config);
  } catch (error) {
    logger.error({ error: error.message }, "saveConfig failed");
    return res.status(400).json({ error: error.message });
  }
}

// ─── Org Admin: Knowledge Base ──────────────────────────────────────

export async function listArticles(req, res) {
  try {
    const { orgId } = req.query;
    if (!orgId) return res.status(400).json({ error: "orgId is required" });
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    const articles = await listKnowledgeBase(orgId);
    return res.json({ articles });
  } catch (error) {
    logger.error({ error: error.message }, "listArticles failed");
    return res.status(500).json({ error: "Failed to list knowledge base" });
  }
}

export async function getArticle(req, res) {
  try {
    const { orgId } = req.query;
    const { articleId } = req.params;
    if (!orgId) return res.status(400).json({ error: "orgId is required" });
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    const article = await getKnowledgeArticle(orgId, articleId);
    if (!article) return res.status(404).json({ error: "Article not found" });
    return res.json(article);
  } catch (error) {
    logger.error({ error: error.message }, "getArticle failed");
    return res.status(500).json({ error: "Failed to fetch article" });
  }
}

export async function createArticle(req, res) {
  try {
    const { orgId, title, content, category, priority } = req.body;
    if (!orgId) return res.status(400).json({ error: "orgId is required" });
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    const article = await createKnowledgeArticle(orgId, { title, content, category, priority }, req.authUser.uid);
    return res.status(201).json(article);
  } catch (error) {
    logger.error({ error: error.message }, "createArticle failed");
    return res.status(400).json({ error: error.message });
  }
}

export async function editArticle(req, res) {
  try {
    const { orgId, ...updates } = req.body;
    const { articleId } = req.params;
    if (!orgId) return res.status(400).json({ error: "orgId is required" });
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    const article = await updateKnowledgeArticle(orgId, articleId, updates, req.authUser.uid);
    return res.json(article);
  } catch (error) {
    logger.error({ error: error.message }, "editArticle failed");
    return res.status(400).json({ error: error.message });
  }
}

export async function removeArticle(req, res) {
  try {
    const { orgId } = req.query;
    const { articleId } = req.params;
    if (!orgId) return res.status(400).json({ error: "orgId is required" });
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    const result = await deleteKnowledgeArticle(orgId, articleId);
    return res.json(result);
  } catch (error) {
    logger.error({ error: error.message }, "removeArticle failed");
    return res.status(400).json({ error: error.message });
  }
}

export async function bulkImport(req, res) {
  try {
    const { orgId, articles } = req.body;
    if (!orgId) return res.status(400).json({ error: "orgId is required" });
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    const result = await bulkImportKnowledgeBase(orgId, articles, req.authUser.uid);
    return res.status(201).json(result);
  } catch (error) {
    logger.error({ error: error.message }, "bulkImport failed");
    return res.status(400).json({ error: error.message });
  }
}

export async function knowledgeStats(req, res) {
  try {
    const { orgId } = req.query;
    if (!orgId) return res.status(400).json({ error: "orgId is required" });
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    const stats = await getKnowledgeBaseStats(orgId);
    return res.json(stats);
  } catch (error) {
    logger.error({ error: error.message }, "knowledgeStats failed");
    return res.status(500).json({ error: "Failed to fetch knowledge base stats" });
  }
}

// ─── Org Admin: Test Playground ─────────────────────────────────────

export async function testPlayground(req, res) {
  try {
    const { orgId, message } = req.body;
    if (!orgId) return res.status(400).json({ error: "orgId is required" });
    if (!message) return res.status(400).json({ error: "message is required" });
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    const result = await testAIResponse({ orgId, message });
    return res.json(result);
  } catch (error) {
    logger.error({ error: error.message }, "testPlayground failed");
    return res.status(500).json({ error: "AI test failed" });
  }
}

// ─── Org Admin: Usage Stats ─────────────────────────────────────────

export async function getUsageStats(req, res) {
  try {
    const { orgId, days } = req.query;
    if (!orgId) return res.status(400).json({ error: "orgId is required" });
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    const stats = await getAIUsageStats(orgId, Number(days) || 30);
    return res.json(stats);
  } catch (error) {
    logger.error({ error: error.message }, "getUsageStats failed");
    return res.status(500).json({ error: "Failed to fetch usage stats" });
  }
}

// ─── Platform Owner: Cross-Org AI Usage ─────────────────────────────

export async function getPlatformAIStats(req, res) {
  try {
    if (!(await isPlatformAdmin(req.authUser))) {
      return res.status(403).json({ error: "Platform admin access required" });
    }
    const { days } = req.query;
    const stats = await getPlatformAIUsage(Number(days) || 30);
    return res.json(stats);
  } catch (error) {
    logger.error({ error: error.message }, "getPlatformAIStats failed");
    return res.status(500).json({ error: "Failed to fetch platform AI stats" });
  }
}
