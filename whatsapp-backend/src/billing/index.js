/**
 * Billing module barrel export.
 *
 * ARCHITECTURAL DECISION: The original billing.js (~640 lines) is now split:
 * - helpers.js — shared billing utilities (phone key, slug, plan lookup)
 * - payment.service.js — payment intent lifecycle + plan application
 * - workspace.service.js — workspace provisioning + signup session management
 * - team.routes.js — team invitation, activation, role management
 * - platform.routes.js — platform-owner admin actions
 *
 * The original billing.js remains as the legacy entry point (unchanged API
 * contract) for backward compatibility. These new modules are available for
 * incremental migration and are used by the new v1 route layer.
 */

export { applyPlan, createIntent, beginIntent, finishIntent, failIntent, verifyRazorpayCapturedPayment, verifyRazorpayPayment } from "./payment.service.js";
export { assertNoExistingWorkspace, claimSignupSession, attachSignupSession, abandonCreatingSignupSession, assertSignupSessionOwner, completeSignupSession, provisionWorkspace } from "./workspace.service.js";
export { createTeamRoutes } from "./team.routes.js";
export { createPlatformRoutes } from "./platform.routes.js";
