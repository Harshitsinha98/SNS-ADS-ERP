/**
 * Billing-specific helpers and shared utilities.
 *
 * ARCHITECTURAL DECISION: These helpers are billing-domain-specific (phone
 * normalization for Indian numbers, slug generation, HTTP error factory) and
 * don't belong in the generic services/helpers.js. Keeping them scoped to
 * billing/ prevents the general helpers from growing into a "utils" grab bag.
 */

import crypto from "crypto";
import { getAuth } from "firebase-admin/auth";
import { getMergedPlans, amountForPlan } from "../../plans.js";

export { amountForPlan };

export const nowIso = () => new Date().toISOString();
export const phoneKey = (phone) => String(phone || "").replace(/\D/g, "");
export const safeDocId = (value) => String(value).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 140);

export const same = (left, right) => {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const normalizeCycle = (cycle) => (cycle === "yearly" ? "yearly" : "monthly");

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function slugify(name) {
  return String(name || "workspace")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "workspace";
}

export async function getPlan(db, planId, cycle) {
  const plans = await getMergedPlans(db);
  const plan = plans[planId];
  if (!plan) throw httpError(400, "Invalid plan");
  return { plan, cycle: normalizeCycle(cycle) };
}

export { getMergedPlans };
