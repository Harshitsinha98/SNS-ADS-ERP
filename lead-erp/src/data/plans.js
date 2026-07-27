/**
 * Plan definitions for CodeSkate CRM — single source of truth for pricing.
 *
 * Used by: Pricing page, Signup, Billing, Platform dashboard.
 * Platform owner can override via platformConfig/global in Firestore.
 */

export const PLANS = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For small teams getting started",
    monthlyPrice: 599,
    yearlyPrice: 5999,
    includedSeats: 3,
    leadsLimit: 1000,
    pricePerSeat: 199,
    trial: true,
    features: [
      { text: "3 team members", included: true },
      { text: "1,000 leads / month", included: true },
      { text: "WhatsApp lead capture", included: true },
      { text: "Round-robin assignment", included: true },
      { text: "Call tracking (Android)", included: true },
      { text: "1 website lead form", included: true },
      { text: "AI Customer Care", included: false },
      { text: "Workflow automation", included: false },
      { text: "Product catalogue", included: false },
    ],
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "For teams that want AI power",
    monthlyPrice: 1499,
    yearlyPrice: 14999,
    includedSeats: 10,
    leadsLimit: 10000,
    pricePerSeat: 149,
    popular: true,
    trial: true,
    features: [
      { text: "10 team members", included: true },
      { text: "10,000 leads / month", included: true },
      { text: "Everything in Starter", included: true },
      { text: "AI auto-reply (2,000/mo)", included: true },
      { text: "30 knowledge base articles", included: true },
      { text: "5 workflow rules", included: true },
      { text: "50 products in catalogue", included: true },
      { text: "Goals & performance", included: true },
      { text: "Meta & Google Ad leads", included: true },
      { text: "Priority email support", included: true },
      { text: "API access", included: false },
    ],
  },
  {
    id: "enterprise",
    name: "Scale",
    tagline: "For sales operations at full speed",
    monthlyPrice: 3499,
    yearlyPrice: 34999,
    includedSeats: 25,
    leadsLimit: 50000,
    pricePerSeat: 99,
    features: [
      { text: "25 team members", included: true },
      { text: "50,000 leads / month", included: true },
      { text: "Everything in Growth", included: true },
      { text: "AI auto-reply (10,000/mo)", included: true },
      { text: "100 knowledge base articles", included: true },
      { text: "25 workflow rules", included: true },
      { text: "200 products in catalogue", included: true },
      { text: "API access & webhooks", included: true },
      { text: "Unlimited website forms", included: true },
      { text: "Priority chat support", included: true },
    ],
  },
  {
    id: "enterprise_plus",
    name: "Enterprise",
    tagline: "Unlimited everything for large teams",
    monthlyPrice: 7999,
    yearlyPrice: 79999,
    includedSeats: -1,
    leadsLimit: -1,
    pricePerSeat: 0,
    features: [
      { text: "Unlimited team members", included: true },
      { text: "Unlimited leads", included: true },
      { text: "Everything in Scale", included: true },
      { text: "Unlimited AI auto-replies", included: true },
      { text: "500 products + unlimited images", included: true },
      { text: "Unlimited workflows", included: true },
      { text: "Full API & webhooks", included: true },
      { text: "Dedicated account manager", included: true },
      { text: "White-glove onboarding", included: true },
      { text: "Custom integrations", included: true },
    ],
  },
];

export const ADD_ONS = [
  { id: "ai_messages", name: "Extra AI Messages", price: 499, unit: "5,000 msgs/mo", description: "5,000 additional AI auto-replies per month" },
  { id: "extra_seats", name: "Extra Team Seats", price: 499, unit: "5 seats", description: "5 additional team members" },
  { id: "extra_leads", name: "Extra Leads Pack", price: 399, unit: "5,000 leads/mo", description: "5,000 additional leads per month" },
  { id: "catalogue_pro", name: "Catalogue Pro", price: 499, unit: "500 products", description: "500 products + 5,000 image messages/month" },
  { id: "workflow_unlimited", name: "Unlimited Workflows", price: 299, unit: "unlimited", description: "Unlimited workflow automation rules" },
  { id: "api_access", name: "API & Webhooks", price: 999, unit: "full access", description: "REST API + real-time webhook access" },
];

// Default free-trial length (days).
export const TRIAL_DAYS = 7;

export const planHasTrial = (planId) => getPlanById(planId)?.trial === true;

export const getPlanById = (id) => PLANS.find((p) => p.id === id) || PLANS[1];

export const planFromName = (name) =>
  PLANS.find((p) => p.name?.toLowerCase() === String(name || "").toLowerCase()) || PLANS[0];

export const PLAN_ORDER = ["starter", "growth", "enterprise", "enterprise_plus"];

export const isUpgrade = (fromId, toId) =>
  PLAN_ORDER.indexOf(toId) > PLAN_ORDER.indexOf(fromId);

export function mergePlansWithConfig(config) {
  const trialDays =
    config && Number.isFinite(config.trialDays) ? config.trialDays : TRIAL_DAYS;
  const overrides = (config && config.plans) || {};
  const plans = PLANS.map((p) => ({ ...p, ...(overrides[p.id] || {}) }));
  return { plans, trialDays };
}

export function limitsForPlan(planId, config) {
  const { plans } = mergePlansWithConfig(config);
  const plan = plans.find((p) => p.id === planId) || plans[1];
  return {
    planId: plan.id,
    planName: plan.name,
    seatsLimit: plan.includedSeats,
    leadsLimit: plan.leadsLimit,
  };
}
