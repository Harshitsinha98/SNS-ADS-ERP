/**
 * AI Customer Care routes (v1).
 *
 * ARCHITECTURAL DECISION: AI routes are org-admin-gated (each controller
 * validates orgId + admin membership). They are mounted at /api/v1/ai/*
 * and provide:
 * - Configuration management (enable/disable, tone, thresholds)
 * - Knowledge base CRUD (articles that train the AI)
 * - Test playground (try AI responses before going live)
 * - Usage analytics (tokens, costs, resolution rates)
 */

import { Router } from "express";
import { requireAuth } from "../../middleware/index.js";
import {
  getConfig,
  saveConfig,
  listArticles,
  getArticle,
  createArticle,
  editArticle,
  removeArticle,
  bulkImport,
  knowledgeStats,
  testPlayground,
  getUsageStats,
  getPlatformAIStats,
  listCatalogueProducts,
  getCatalogueProduct,
  createCatalogueProduct,
  updateCatalogueProduct,
  deleteCatalogueProduct,
  catalogueStats,
} from "../../controllers/ai.controller.js";

export function createAIRoutes() {
  const router = Router();

  // All AI routes require authentication
  router.use(requireAuth);

  // ── Configuration ──
  router.get("/config", getConfig);
  router.patch("/config", saveConfig);

  // ── Knowledge Base ──
  router.get("/knowledge-base", listArticles);
  router.get("/knowledge-base/stats", knowledgeStats);
  router.get("/knowledge-base/:articleId", getArticle);
  router.post("/knowledge-base", createArticle);
  router.patch("/knowledge-base/:articleId", editArticle);
  router.delete("/knowledge-base/:articleId", removeArticle);
  router.post("/knowledge-base/bulk-import", bulkImport);

  // ── Test Playground ──
  router.post("/test", testPlayground);

  // ── Usage Analytics ──
  router.get("/usage", getUsageStats);

  // ── Platform-level AI stats (platform admin only) ──
  router.get("/platform-usage", getPlatformAIStats);

  // ── Product Catalogue ──
  router.get("/catalogue", listCatalogueProducts);
  router.get("/catalogue/stats", catalogueStats);
  router.get("/catalogue/:productId", getCatalogueProduct);
  router.post("/catalogue", createCatalogueProduct);
  router.patch("/catalogue/:productId", updateCatalogueProduct);
  router.delete("/catalogue/:productId", deleteCatalogueProduct);

  return router;
}
