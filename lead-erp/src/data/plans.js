// Plan definitions for CodeSkate — the single source of truth for pricing,
// seat limits, and lead limits. Used by Pricing, Signup, Billing, and the
// Platform (super-admin) dashboard.
//
// The platform owner can override trialDays and per-plan limits/prices at
// runtime via `platformConfig/global` in Firestore. `mergePlansWithConfig`
// applies those overrides on top of these defaults.

export const PLANS = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For small teams getting started",
    monthlyPrice: 999,
    yearlyPrice: 9999,
    includedSeats: 3,
    leadsLimit: 1000,
    pricePerSeat: 299,
    features: [
      { text: "Up to 1,000 leads / month", included: true },
      { text: "WhatsApp lead capture", included: true },
      { text: "Round-robin auto-assignment", included: true },
      { text: "Mobile app (Android)", included: true },
      { text: "Goals & activity logs", included: false },
      { text: "Priority support", included: false },
    ],
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "For scaling sales teams",
    monthlyPrice: 2499,
    yearlyPrice: 24999,
    includedSeats: 10,
    leadsLimit: 10000,
    pricePerSeat: 199,
    popular: true,
    features: [
      { text: "Up to 10,000 leads / month", included: true },
      { text: "Everything in Starter", included: true },
      { text: "Goals & performance tracking", included: true },
      { text: "Full activity audit log", included: true },
      { text: "Priority email support", included: true },
      { text: "API access", included: false },
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "For large organizations",
    monthlyPrice: 4999,
    yearlyPrice: 49999,
    includedSeats: 50,
    leadsLimit: 1000000, // effectively unlimited
    pricePerSeat: 99,
    features: [
      { text: "Unlimited leads", included: true },
      { text: "Everything in Growth", included: true },
      { text: "Custom roles & permissions", included: true },
      { text: "API access & webhooks", included: true },
      { text: "Dedicated account manager", included: true },
      { text: "99.9% uptime SLA", included: true },
    ],
  },
];

// Default free-trial length (days). Overridable by the platform owner via
// platformConfig/global.trialDays.
export const TRIAL_DAYS = 14;

// ---- Helpers -------------------------------------------------------------

export const getPlanById = (id) => PLANS.find((p) => p.id === id) || PLANS[1];

export const planFromName = (name) =>
  PLANS.find((p) => p.name?.toLowerCase() === String(name || "").toLowerCase()) || PLANS[0];

// The tier order used to decide whether a change is an upgrade or downgrade.
export const PLAN_ORDER = ["starter", "growth", "enterprise"];

export const isUpgrade = (fromId, toId) =>
  PLAN_ORDER.indexOf(toId) > PLAN_ORDER.indexOf(fromId);

/**
 * Apply platform-owner overrides (from platformConfig/global) on top of the
 * built-in PLANS. Returns { plans, trialDays }.
 *
 * config shape (all optional):
 *   { trialDays: number, plans: { starter: { monthlyPrice, includedSeats, leadsLimit, ... }, ... } }
 */
export function mergePlansWithConfig(config) {
  const trialDays =
    config && Number.isFinite(config.trialDays) ? config.trialDays : TRIAL_DAYS;

  const overrides = (config && config.plans) || {};
  const plans = PLANS.map((p) => ({ ...p, ...(overrides[p.id] || {}) }));

  return { plans, trialDays };
}

// Convenience: given a plan id + config, return the enforced limits for an org.
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
