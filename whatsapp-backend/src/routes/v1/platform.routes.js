/**
 * Platform Console routes (v1).
 *
 * ARCHITECTURAL DECISION: Every route here is gated by requirePlatformAdmin.
 * These routes are completely separate from org-level routes — they give
 * the platform owner cross-tenant visibility and control without touching
 * any org-admin functionality.
 */

import { Router } from "express";
import { requireAuth, requirePlatformAdmin } from "../../middleware/index.js";
import {
  getPlatformStats, getRevenueTimeline, getMissionControl,
  listOrganizations, getOrganizationDetail, performOrgAction,
  getBillingOverview,
  getCustomerSuccess,
  getInfrastructureHealth,
  getWhatsAppOverview,
  listAuditLogs,
  listFeatureFlags, toggleFeatureFlag, createFeatureFlag,
  getPlatformSettings, updatePlatformSettings,
} from "../../controllers/platform.controller.js";

export function createPlatformRoutes() {
  const router = Router();

  // All routes require platform admin
  router.use(requireAuth);
  router.use(requirePlatformAdmin);

  // Executive Dashboard
  router.get("/stats", getPlatformStats);
  router.get("/revenue", getRevenueTimeline);
  router.get("/mission-control", getMissionControl);

  // Organization Management
  router.get("/organizations", listOrganizations);
  router.get("/organizations/:orgId", getOrganizationDetail);
  router.post("/organizations/:orgId/action", performOrgAction);

  // Billing
  router.get("/billing/overview", getBillingOverview);

  // Customer Success
  router.get("/customer-success/scores", getCustomerSuccess);

  // Infrastructure
  router.get("/infrastructure/health", getInfrastructureHealth);

  // WhatsApp Operations
  router.get("/whatsapp/overview", getWhatsAppOverview);

  // Audit Logs
  router.get("/audit-logs", listAuditLogs);

  // Feature Flags
  router.get("/feature-flags", listFeatureFlags);
  router.patch("/feature-flags/:flagId", toggleFeatureFlag);
  router.post("/feature-flags", createFeatureFlag);

  // Platform Settings
  router.get("/settings", getPlatformSettings);
  router.patch("/settings", updatePlatformSettings);

  return router;
}
