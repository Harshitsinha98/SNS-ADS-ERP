// Server-side plan definitions (mirror of the frontend src/data/plans.js).
// The platform owner can override prices/limits via platformConfig/global,
// which getMergedPlans() layers on top of these defaults.

export const PLANS = {
  starter: { id: "starter", name: "Starter", monthlyPrice: 999, yearlyPrice: 9999, includedSeats: 3, leadsLimit: 1000, trial: true },
  growth: { id: "growth", name: "Growth", monthlyPrice: 2499, yearlyPrice: 24999, includedSeats: 10, leadsLimit: 10000 },
  enterprise: { id: "enterprise", name: "Enterprise", monthlyPrice: 4999, yearlyPrice: 49999, includedSeats: 50, leadsLimit: 1000000 },
};

// Merge platform-owner overrides (platformConfig/global.plans) on top of defaults.
export async function getMergedPlans(db) {
  let overrides = {};
  try {
    const snap = await db.collection("platformConfig").doc("global").get();
    if (snap.exists) overrides = snap.data().plans || {};
  } catch (e) {
    console.warn("platformConfig read failed:", e?.message);
  }
  const merged = {};
  for (const [id, p] of Object.entries(PLANS)) {
    merged[id] = { ...p, ...(overrides[id] || {}) };
  }
  return merged;
}

export function amountForPlan(plan, cycle) {
  return cycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
}
