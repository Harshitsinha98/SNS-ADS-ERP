// Plan definitions for CodeSkate — used by Pricing and Signup flows.
// Mirrors the Phase 2 billing spec (Starter / Growth / Enterprise).

export const PLANS = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For small teams getting started",
    monthlyPrice: 999,
    yearlyPrice: 9999,
    includedSeats: 3,
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

export const TRIAL_DAYS = 14;
