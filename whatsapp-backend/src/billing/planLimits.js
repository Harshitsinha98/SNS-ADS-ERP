/**
 * Plan Limits & Feature Entitlements.
 *
 * ARCHITECTURAL DECISION: All plan limits and feature gates are defined in
 * one place. The billing system, org provisioning, and quota enforcement
 * all reference this file. Platform owner can override any value via
 * platformConfig/global.plans in Firestore.
 *
 * Add-ons are stackable: an org can purchase multiple add-ons that increase
 * their limits beyond the base plan. Add-on state is stored on the
 * organization document as `addOns: { ai_messages: { quantity: 1 }, ... }`.
 */

// ─── Base Plan Definitions ──────────────────────────────────────────

export const PLAN_LIMITS = {
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPrice: 599,
    yearlyPrice: 5999,

    // Team
    seatsIncluded: 3,
    extraSeatPrice: 199,

    // Leads
    leadsPerMonth: 1000,
    extraLeadPackSize: 1000,
    extraLeadPackPrice: 199,

    // WhatsApp
    whatsappCapture: true,
    whatsappTemplates: true,
    whatsappFreeForm: true,

    // CRM
    assignmentModes: ["round_robin"],
    callTracking: true,
    goalsAndPerformance: false,
    activityLog: "basic", // "basic" | "full"

    // AI Customer Care
    aiEnabled: true,
    // 100/month worked out to ~3 replies/day, which reads as a broken feature
    // rather than a starter allowance. 250 is genuinely usable while still
    // leaving clear headroom to upsell Growth.
    aiMessagesPerMonth: 250,
    aiKnowledgeBaseLimit: 5,
    aiTestPlayground: false,
    aiAnalytics: false,
    humanTakeover: false,
    smartNotifications: false,

    // Catalogue
    catalogueEnabled: false,
    catalogueProducts: 0,
    catalogueImagesPerMonth: 0,

    // Automation
    workflowsLimit: 0,
    followUpReminders: "basic", // "basic" | "advanced"
    slaEscalation: false,

    // Integrations
    websiteLeadForms: 1,
    adLeadIntegrations: false,
    apiAccess: false,
    webhooks: false,

    // Support
    supportTier: "email", // "email" | "priority_email" | "priority_chat" | "dedicated"
    onboarding: "self_serve", // "self_serve" | "guided" | "priority" | "white_glove"

    // Trial
    trial: true,
  },

  growth: {
    id: "growth",
    name: "Growth",
    monthlyPrice: 1499,
    yearlyPrice: 14999,

    seatsIncluded: 10,
    extraSeatPrice: 149,

    leadsPerMonth: 10000,
    extraLeadPackSize: 5000,
    extraLeadPackPrice: 149,

    whatsappCapture: true,
    whatsappTemplates: true,
    whatsappFreeForm: true,

    assignmentModes: ["round_robin", "workload"],
    callTracking: true,
    goalsAndPerformance: true,
    activityLog: "full",

    aiEnabled: true,
    aiMessagesPerMonth: 2000,
    aiKnowledgeBaseLimit: 30,
    aiTestPlayground: true,
    aiAnalytics: true,
    humanTakeover: true,
    smartNotifications: true,

    catalogueEnabled: true,
    catalogueProducts: 50,
    catalogueImagesPerMonth: 500,

    workflowsLimit: 5,
    followUpReminders: "advanced",
    slaEscalation: true,

    websiteLeadForms: 5,
    adLeadIntegrations: true,
    apiAccess: false,
    webhooks: false,

    supportTier: "priority_email",
    onboarding: "guided",

    trial: false,
  },

  enterprise: {
    id: "enterprise",
    name: "Scale",
    monthlyPrice: 3499,
    yearlyPrice: 34999,

    seatsIncluded: 25,
    extraSeatPrice: 99,

    leadsPerMonth: 50000,
    extraLeadPackSize: 5000,
    extraLeadPackPrice: 99,

    whatsappCapture: true,
    whatsappTemplates: true,
    whatsappFreeForm: true,

    assignmentModes: ["round_robin", "workload", "manual"],
    callTracking: true,
    goalsAndPerformance: true,
    activityLog: "full",

    aiEnabled: true,
    aiMessagesPerMonth: 10000,
    aiKnowledgeBaseLimit: 100,
    aiTestPlayground: true,
    aiAnalytics: true,
    humanTakeover: true,
    smartNotifications: true,

    catalogueEnabled: true,
    catalogueProducts: 200,
    catalogueImagesPerMonth: 2000,

    workflowsLimit: 25,
    followUpReminders: "advanced",
    slaEscalation: true,

    websiteLeadForms: -1, // -1 = unlimited
    adLeadIntegrations: true,
    apiAccess: true,
    webhooks: true,

    supportTier: "priority_chat",
    onboarding: "priority",

    trial: false,
  },

  enterprise_plus: {
    id: "enterprise_plus",
    name: "Enterprise",
    monthlyPrice: 7999,
    yearlyPrice: 79999,

    seatsIncluded: -1, // unlimited
    extraSeatPrice: 0,

    leadsPerMonth: -1, // unlimited
    extraLeadPackSize: 0,
    extraLeadPackPrice: 0,

    whatsappCapture: true,
    whatsappTemplates: true,
    whatsappFreeForm: true,

    assignmentModes: ["round_robin", "workload", "manual"],
    callTracking: true,
    goalsAndPerformance: true,
    activityLog: "full",

    aiEnabled: true,
    // Fair-use cap rather than truly unlimited. Every AI reply costs real
    // tokens, so an uncapped tenant could consume more in LLM spend than the
    // plan collects. 50,000/month is effectively unlimited for real usage
    // while bounding worst-case cost.
    aiMessagesPerMonth: 50000,
    aiKnowledgeBaseLimit: 100,
    aiTestPlayground: true,
    aiAnalytics: true,
    humanTakeover: true,
    smartNotifications: true,

    catalogueEnabled: true,
    catalogueProducts: 500,
    catalogueImagesPerMonth: -1, // unlimited

    workflowsLimit: -1, // unlimited
    followUpReminders: "advanced",
    slaEscalation: true,

    websiteLeadForms: -1,
    adLeadIntegrations: true,
    apiAccess: true,
    webhooks: true,

    supportTier: "dedicated",
    onboarding: "white_glove",

    trial: false,
  },
};

// ─── Add-On Definitions ─────────────────────────────────────────────

export const ADD_ONS = {
  ai_messages: {
    id: "ai_messages",
    name: "Extra AI Replies",
    description: "2,500 additional AI auto-replies per month",
    // At ~2,500 tokens per reply (intent classification + generation), each
    // reply costs roughly Rs 0.07-0.08 in LLM spend. 2,500 replies for Rs 499
    // is Rs 0.20/reply, leaving a workable margin even if token prices rise
    // or knowledge bases grow (longer prompts = more tokens per reply).
    monthlyPrice: 499,
    unit: 2500,
    field: "aiMessagesPerMonth", // which limit it increases
    maxQuantity: 20, // max 20 packs = 50,000 extra
    availableOn: ["starter", "growth", "enterprise"], // which plans can buy
  },
  extra_seats: {
    id: "extra_seats",
    name: "Extra Team Seats",
    description: "5 additional team members",
    monthlyPrice: 499,
    unit: 5,
    field: "seatsIncluded",
    maxQuantity: 20,
    availableOn: ["starter", "growth", "enterprise"],
  },
  extra_leads: {
    id: "extra_leads",
    name: "Extra Leads Pack",
    description: "5,000 additional leads per month",
    monthlyPrice: 399,
    unit: 5000,
    field: "leadsPerMonth",
    maxQuantity: 20,
    availableOn: ["starter", "growth", "enterprise"],
  },
  catalogue_pro: {
    id: "catalogue_pro",
    name: "Product Catalogue Pro",
    description: "500 products + 5,000 image messages per month",
    monthlyPrice: 499,
    unit: 1,
    fields: { catalogueProducts: 500, catalogueImagesPerMonth: 5000, catalogueEnabled: true },
    maxQuantity: 1,
    availableOn: ["starter", "growth", "enterprise"],
  },
  workflow_unlimited: {
    id: "workflow_unlimited",
    name: "Unlimited Workflows",
    description: "Unlimited workflow automation rules",
    monthlyPrice: 299,
    unit: 1,
    fields: { workflowsLimit: -1 },
    maxQuantity: 1,
    availableOn: ["starter", "growth", "enterprise"],
  },
  api_access: {
    id: "api_access",
    name: "API & Webhook Access",
    description: "Full REST API + real-time webhooks",
    monthlyPrice: 999,
    unit: 1,
    fields: { apiAccess: true, webhooks: true },
    maxQuantity: 1,
    availableOn: ["starter", "growth"],
  },
};

// ─── Limit Resolution ───────────────────────────────────────────────

/**
 * Get the effective limits for an organization, considering base plan + add-ons.
 *
 * @param {string} planId - The org's base plan
 * @param {object} addOns - The org's active add-ons { ai_messages: { quantity: 2 }, ... }
 * @param {object} platformOverrides - Optional platform config overrides
 * @returns {object} Resolved limits
 */
export function getEffectiveLimits(planId, addOns = {}, platformOverrides = {}) {
  const basePlan = { ...(PLAN_LIMITS[planId] || PLAN_LIMITS.growth), ...(platformOverrides[planId] || {}) };
  const limits = { ...basePlan };

  // Apply add-ons
  for (const [addOnId, addOnState] of Object.entries(addOns)) {
    if (!addOnState?.active) continue;
    const addOnDef = ADD_ONS[addOnId];
    if (!addOnDef) continue;
    const qty = Number(addOnState.quantity) || 1;

    if (addOnDef.field) {
      // Single field increment
      const current = limits[addOnDef.field];
      if (current === -1) continue; // already unlimited
      limits[addOnDef.field] = current + (addOnDef.unit * qty);
    }

    if (addOnDef.fields) {
      // Multiple fields set
      for (const [field, value] of Object.entries(addOnDef.fields)) {
        if (typeof value === "boolean") limits[field] = value;
        else if (value === -1) limits[field] = -1;
        else {
          const current = limits[field];
          if (current === -1) continue;
          limits[field] = Math.max(current, value);
        }
      }
    }
  }

  return limits;
}

/**
 * Check if a specific feature is available for the given plan + add-ons.
 */
export function hasFeature(planId, featureName, addOns = {}) {
  const limits = getEffectiveLimits(planId, addOns);
  return Boolean(limits[featureName]);
}

/**
 * Check if a numeric limit has been reached.
 * Returns { allowed: boolean, limit: number, used: number, remaining: number }
 */
export function checkLimit(planId, limitField, currentUsage, addOns = {}) {
  const limits = getEffectiveLimits(planId, addOns);
  const limit = limits[limitField];

  if (limit === -1) return { allowed: true, limit: -1, used: currentUsage, remaining: -1 };
  if (limit === 0) return { allowed: false, limit: 0, used: currentUsage, remaining: 0 };

  const remaining = Math.max(0, limit - currentUsage);
  return { allowed: currentUsage < limit, limit, used: currentUsage, remaining };
}

/**
 * Get the complete feature matrix for the pricing page.
 */
export function getPricingMatrix() {
  return {
    plans: Object.values(PLAN_LIMITS),
    addOns: Object.values(ADD_ONS),
    categories: [
      {
        name: "Team & Leads",
        features: [
          { key: "seatsIncluded", label: "Users included", type: "number", unlimitedText: "Unlimited" },
          { key: "extraSeatPrice", label: "Extra seat price", type: "price", prefix: "₹", suffix: "/seat/mo" },
          { key: "leadsPerMonth", label: "Leads per month", type: "number", unlimitedText: "Unlimited" },
        ],
      },
      {
        name: "WhatsApp",
        features: [
          { key: "whatsappCapture", label: "Lead capture", type: "boolean" },
          { key: "whatsappTemplates", label: "Template messages", type: "boolean" },
          { key: "whatsappFreeForm", label: "Free-form replies", type: "boolean" },
        ],
      },
      {
        name: "CRM",
        features: [
          { key: "callTracking", label: "Native call tracking", type: "boolean" },
          { key: "goalsAndPerformance", label: "Goals & performance", type: "boolean" },
          { key: "activityLog", label: "Activity audit log", type: "text" },
          { key: "slaEscalation", label: "SLA escalation", type: "boolean" },
        ],
      },
      {
        name: "AI Customer Care",
        features: [
          { key: "aiEnabled", label: "AI auto-reply", type: "boolean" },
          { key: "aiMessagesPerMonth", label: "AI messages/month", type: "number", unlimitedText: "Unlimited" },
          { key: "aiKnowledgeBaseLimit", label: "Knowledge base articles", type: "number" },
          { key: "aiTestPlayground", label: "Test playground", type: "boolean" },
        ],
      },
      {
        name: "Product Catalogue",
        features: [
          { key: "catalogueEnabled", label: "Catalogue feature", type: "boolean" },
          { key: "catalogueProducts", label: "Products allowed", type: "number", unlimitedText: "Unlimited" },
          { key: "catalogueImagesPerMonth", label: "Image messages/month", type: "number", unlimitedText: "Unlimited" },
        ],
      },
      {
        name: "Automation",
        features: [
          { key: "workflowsLimit", label: "Workflow rules", type: "number", unlimitedText: "Unlimited" },
          { key: "followUpReminders", label: "Follow-up reminders", type: "text" },
        ],
      },
      {
        name: "Integrations",
        features: [
          { key: "websiteLeadForms", label: "Website lead forms", type: "number", unlimitedText: "Unlimited" },
          { key: "adLeadIntegrations", label: "Meta & Google Ad leads", type: "boolean" },
          { key: "apiAccess", label: "API access", type: "boolean" },
          { key: "webhooks", label: "Webhooks", type: "boolean" },
        ],
      },
      {
        name: "Support",
        features: [
          { key: "supportTier", label: "Support level", type: "text" },
          { key: "onboarding", label: "Onboarding", type: "text" },
        ],
      },
    ],
  };
}
