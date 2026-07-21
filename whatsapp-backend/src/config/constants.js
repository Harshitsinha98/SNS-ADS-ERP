/**
 * Application-wide constants.
 *
 * ARCHITECTURAL DECISION: Constants that were scattered across server.js,
 * billing.js, and other modules are now centralized. This eliminates hidden
 * coupling where two files define the same value with different names.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const GRACE_DAYS = 3;
export const WHATSAPP_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_WHATSAPP_TEXT_LENGTH = 4096;

export const DEFAULT_STATUSES = [
  "New", "Ringing", "Meeting Fixed", "Negotiation",
  "Follow-up", "Closed-Won", "Lost",
];

export const TEAM_ROLES = new Set(["employee", "admin"]);

export const CLOSED_STATUSES = new Set(["Closed-Won", "Lost"]);
