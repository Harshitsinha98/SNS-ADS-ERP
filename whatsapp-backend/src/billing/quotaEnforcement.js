/**
 * Quota Enforcement Service.
 *
 * ARCHITECTURAL DECISION: Every resource-consuming action in the system calls
 * this service before proceeding. It reads the org's current plan + add-ons,
 * resolves effective limits, checks current usage, and returns allow/deny.
 *
 * Enforcement points:
 * - Lead creation (leadsPerMonth)
 * - Member invite (seatsIncluded)
 * - AI message send (aiMessagesPerMonth)
 * - Knowledge base article create (aiKnowledgeBaseLimit)
 * - Product create (catalogueProducts)
 * - Image message send (catalogueImagesPerMonth)
 * - Workflow create (workflowsLimit)
 * - Website form create (websiteLeadForms)
 *
 * All checks are O(1) — they read the org document (cached per request)
 * and compare against pre-computed limits. No collection scans.
 */

import { db } from "../bootstrap/firebase.js";
import { getEffectiveLimits, hasFeature } from "./planLimits.js";
import { logger } from "../middleware/logger.js";

/**
 * Get org's plan, add-ons, and current usage counters.
 */
async function getOrgBillingState(orgId) {
  const orgSnap = await db.collection("organizations").doc(orgId).get();
  if (!orgSnap.exists) throw new Error("Organization not found");
  const org = orgSnap.data();

  return {
    planId: org.planId || "starter",
    addOns: org.addOns || {},
    usage: {
      seatsUsed: Number(org.seatsUsed || 0),
      leadsUsed: Number(org.leadsUsed || 0),
      aiMessagesUsed: Number(org.aiMessagesUsedThisMonth || 0),
      productsCount: Number(org.productsCount || 0),
      catalogueImagesSent: Number(org.catalogueImagesSentThisMonth || 0),
      workflowsCount: Number(org.workflowsCount || 0),
      websiteFormsCount: Number(org.websiteFormsCount || 0),
      knowledgeBaseCount: Number(org.knowledgeBaseCount || 0),
    },
  };
}

/**
 * Check if an action is allowed for the given org.
 *
 * @param {string} orgId
 * @param {string} action - One of the defined quota actions
 * @returns {{ allowed: boolean, reason?: string, limit?: number, used?: number, remaining?: number }}
 */
export async function checkQuota(orgId, action) {
  try {
    const { planId, addOns, usage } = await getOrgBillingState(orgId);
    const limits = getEffectiveLimits(planId, addOns);

    switch (action) {
      case "create_lead": {
        const limit = limits.leadsPerMonth;
        if (limit === -1) return { allowed: true };
        if (usage.leadsUsed >= limit) return { allowed: false, reason: "lead_limit_reached", limit, used: usage.leadsUsed, remaining: 0 };
        return { allowed: true, limit, used: usage.leadsUsed, remaining: limit - usage.leadsUsed };
      }

      case "invite_member": {
        const limit = limits.seatsIncluded;
        if (limit === -1) return { allowed: true };
        if (usage.seatsUsed >= limit) return { allowed: false, reason: "seat_limit_reached", limit, used: usage.seatsUsed, remaining: 0 };
        return { allowed: true, limit, used: usage.seatsUsed, remaining: limit - usage.seatsUsed };
      }

      case "ai_message": {
        if (!limits.aiEnabled) return { allowed: false, reason: "ai_not_available_on_plan" };
        const limit = limits.aiMessagesPerMonth;
        if (limit === -1) return { allowed: true };
        if (usage.aiMessagesUsed >= limit) return { allowed: false, reason: "ai_message_limit_reached", limit, used: usage.aiMessagesUsed, remaining: 0 };
        return { allowed: true, limit, used: usage.aiMessagesUsed, remaining: limit - usage.aiMessagesUsed };
      }

      case "create_knowledge_article": {
        if (!limits.aiEnabled) return { allowed: false, reason: "ai_not_available_on_plan" };
        const limit = limits.aiKnowledgeBaseLimit;
        if (limit === -1) return { allowed: true };
        if (usage.knowledgeBaseCount >= limit) return { allowed: false, reason: "knowledge_base_limit_reached", limit, used: usage.knowledgeBaseCount, remaining: 0 };
        return { allowed: true, limit, used: usage.knowledgeBaseCount, remaining: limit - usage.knowledgeBaseCount };
      }

      case "create_product": {
        if (!limits.catalogueEnabled) return { allowed: false, reason: "catalogue_not_available_on_plan" };
        const limit = limits.catalogueProducts;
        if (limit === -1) return { allowed: true };
        if (usage.productsCount >= limit) return { allowed: false, reason: "product_limit_reached", limit, used: usage.productsCount, remaining: 0 };
        return { allowed: true, limit, used: usage.productsCount, remaining: limit - usage.productsCount };
      }

      case "send_catalogue_image": {
        if (!limits.catalogueEnabled) return { allowed: false, reason: "catalogue_not_available_on_plan" };
        const limit = limits.catalogueImagesPerMonth;
        if (limit === -1) return { allowed: true };
        if (usage.catalogueImagesSent >= limit) return { allowed: false, reason: "image_limit_reached", limit, used: usage.catalogueImagesSent, remaining: 0 };
        return { allowed: true, limit, used: usage.catalogueImagesSent, remaining: limit - usage.catalogueImagesSent };
      }

      case "create_workflow": {
        const limit = limits.workflowsLimit;
        if (limit === 0) return { allowed: false, reason: "workflows_not_available_on_plan" };
        if (limit === -1) return { allowed: true };
        if (usage.workflowsCount >= limit) return { allowed: false, reason: "workflow_limit_reached", limit, used: usage.workflowsCount, remaining: 0 };
        return { allowed: true, limit, used: usage.workflowsCount, remaining: limit - usage.workflowsCount };
      }

      case "create_website_form": {
        const limit = limits.websiteLeadForms;
        if (limit === -1) return { allowed: true };
        if (usage.websiteFormsCount >= limit) return { allowed: false, reason: "form_limit_reached", limit, used: usage.websiteFormsCount, remaining: 0 };
        return { allowed: true, limit, used: usage.websiteFormsCount, remaining: limit - usage.websiteFormsCount };
      }

      case "use_api": {
        if (!limits.apiAccess) return { allowed: false, reason: "api_access_not_available_on_plan" };
        return { allowed: true };
      }

      case "use_ad_leads": {
        if (!limits.adLeadIntegrations) return { allowed: false, reason: "ad_leads_not_available_on_plan" };
        return { allowed: true };
      }

      default:
        return { allowed: true };
    }
  } catch (error) {
    logger.error({ orgId, action, error: error.message }, "Quota check failed");
    // Fail open: if quota check itself fails, allow the action
    // (better to serve the customer than to block due to a billing bug)
    return { allowed: true, error: error.message };
  }
}

/**
 * Increment a usage counter after a successful action.
 */
export async function incrementUsage(orgId, field, amount = 1) {
  try {
    const { FieldValue } = await import("firebase-admin/firestore");
    await db.collection("organizations").doc(orgId).update({
      [field]: FieldValue.increment(amount),
    });
  } catch (error) {
    logger.warn({ orgId, field, error: error.message }, "Usage increment failed");
  }
}

/**
 * Reset monthly counters (called by subscription lifecycle cron on renewal).
 */
export async function resetMonthlyCounters(orgId) {
  await db.collection("organizations").doc(orgId).update({
    leadsUsed: 0,
    aiMessagesUsedThisMonth: 0,
    catalogueImagesSentThisMonth: 0,
    monthlyResetAt: new Date().toISOString(),
  });
}

/**
 * Get the full quota status for an org (used by admin billing page).
 */
export async function getQuotaStatus(orgId) {
  const { planId, addOns, usage } = await getOrgBillingState(orgId);
  const limits = getEffectiveLimits(planId, addOns);

  return {
    planId,
    planName: limits.name,
    addOns,
    quotas: {
      seats: { limit: limits.seatsIncluded, used: usage.seatsUsed, unlimited: limits.seatsIncluded === -1 },
      leads: { limit: limits.leadsPerMonth, used: usage.leadsUsed, unlimited: limits.leadsPerMonth === -1 },
      aiMessages: { limit: limits.aiMessagesPerMonth, used: usage.aiMessagesUsed, unlimited: limits.aiMessagesPerMonth === -1 },
      products: { limit: limits.catalogueProducts, used: usage.productsCount, unlimited: limits.catalogueProducts === -1 },
      catalogueImages: { limit: limits.catalogueImagesPerMonth, used: usage.catalogueImagesSent, unlimited: limits.catalogueImagesPerMonth === -1 },
      workflows: { limit: limits.workflowsLimit, used: usage.workflowsCount, unlimited: limits.workflowsLimit === -1 },
      websiteForms: { limit: limits.websiteLeadForms, used: usage.websiteFormsCount, unlimited: limits.websiteLeadForms === -1 },
      knowledgeBase: { limit: limits.aiKnowledgeBaseLimit, used: usage.knowledgeBaseCount, unlimited: limits.aiKnowledgeBaseLimit === -1 },
    },
    features: {
      aiEnabled: limits.aiEnabled,
      catalogueEnabled: limits.catalogueEnabled,
      apiAccess: limits.apiAccess,
      webhooks: limits.webhooks,
      adLeadIntegrations: limits.adLeadIntegrations,
      slaEscalation: limits.slaEscalation,
      goalsAndPerformance: limits.goalsAndPerformance,
    },
  };
}
