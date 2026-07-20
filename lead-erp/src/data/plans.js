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
    monthlyPrice: 599,
    yearlyPrice: 5999,
    includedSeats: 3,
    leadsLimit: 1000,
    pricePerSeat: 199,
    trial: true, // only Starter offers a free trial
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
    tagline: "For growing sales teams",
    monthlyPrice: 1499,
    yearlyPrice: 14999,
    includedSeats: 10,
    leadsLimit: 10000,
    pricePerSeat: 149,
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
    // Keep this stable ID so existing subscriptions and plan overrides stay valid.
    id: "enterprise",
    name: "Scale",
    tagline: "For larger sales operations",
    monthlyPrice: 3499,
    yearlyPrice: 34999,
    includedSeats: 25,
    leadsLimit: 50000,
    pricePerSeat: 99,
    features: [
      { text: "Up to 50,000 leads / month", included: true },
      { text: "Everything in Growth", included: true },
      { text: "Priority onboarding", included: true },
      { text: "Priority support", included: true },
      { text: "API access & webhooks", included: false },
      { text: "Custom integrations", included: false },
    ],
  },
];

// Default free-trial length (days). Overridable by the platform owner via
// platformConfig/global.trialDays. Only the Starter plan gets a trial.
export const TRIAL_DAYS = 7;

// Does this plan offer a free trial? (Only Starter.)
export const planHasTrial = (planId) => getPlanById(planId)?.trial === true;

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
