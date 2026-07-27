/**
 * Add-On Management Service.
 *
 * Handles purchasing, cancelling, and querying add-ons for organizations.
 * Add-on state is stored directly on the organization document.
 */

import { db } from "../bootstrap/firebase.js";
import { ADD_ONS, getEffectiveLimits } from "./planLimits.js";
import { nowIso } from "../services/helpers.js";
import { logger } from "../middleware/logger.js";

/**
 * Purchase an add-on for an organization.
 */
export async function purchaseAddOn(orgId, addOnId, quantity = 1) {
  const addOn = ADD_ONS[addOnId];
  if (!addOn) throw new Error(`Unknown add-on: ${addOnId}`);

  // Validate quantity
  if (quantity < 1 || quantity > addOn.maxQuantity) {
    throw new Error(`Quantity must be between 1 and ${addOn.maxQuantity}`);
  }

  // Check if plan supports this add-on
  const orgSnap = await db.collection("organizations").doc(orgId).get();
  if (!orgSnap.exists) throw new Error("Organization not found");
  const org = orgSnap.data();
  const planId = org.planId || "starter";

  if (!addOn.availableOn.includes(planId)) {
    throw new Error(`This add-on is not available on the ${planId} plan`);
  }

  // Update org document
  const addOnState = {
    active: true,
    quantity,
    purchasedAt: nowIso(),
    monthlyPrice: addOn.monthlyPrice * quantity,
    addOnId,
    addOnName: addOn.name,
  };

  await db.collection("organizations").doc(orgId).update({
    [`addOns.${addOnId}`]: addOnState,
  });

  logger.info({ orgId, addOnId, quantity }, "Add-on purchased");
  return { success: true, addOn: addOnState };
}

/**
 * Cancel an add-on.
 */
export async function cancelAddOn(orgId, addOnId) {
  const orgSnap = await db.collection("organizations").doc(orgId).get();
  if (!orgSnap.exists) throw new Error("Organization not found");
  const org = orgSnap.data();

  if (!org.addOns?.[addOnId]?.active) {
    throw new Error("This add-on is not active");
  }

  await db.collection("organizations").doc(orgId).update({
    [`addOns.${addOnId}`]: {
      ...org.addOns[addOnId],
      active: false,
      cancelledAt: nowIso(),
    },
  });

  logger.info({ orgId, addOnId }, "Add-on cancelled");
  return { success: true, cancelled: true };
}

/**
 * List available add-ons for an org based on their plan.
 */
export async function listAvailableAddOns(orgId) {
  const orgSnap = await db.collection("organizations").doc(orgId).get();
  if (!orgSnap.exists) throw new Error("Organization not found");
  const org = orgSnap.data();
  const planId = org.planId || "starter";
  const currentAddOns = org.addOns || {};

  return Object.values(ADD_ONS)
    .filter((addOn) => addOn.availableOn.includes(planId))
    .map((addOn) => ({
      ...addOn,
      currentState: currentAddOns[addOn.id] || null,
      active: Boolean(currentAddOns[addOn.id]?.active),
      currentQuantity: currentAddOns[addOn.id]?.quantity || 0,
    }));
}

/**
 * Get the total monthly add-on cost for an org.
 */
export function calculateAddOnCost(addOns = {}) {
  let total = 0;
  for (const [id, state] of Object.entries(addOns)) {
    if (!state?.active) continue;
    const def = ADD_ONS[id];
    if (!def) continue;
    total += def.monthlyPrice * (state.quantity || 1);
  }
  return total;
}
