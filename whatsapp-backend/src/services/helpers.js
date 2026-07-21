/**
 * Shared utility helpers used across services.
 *
 * ARCHITECTURAL DECISION: These small, stateless functions were duplicated
 * in server.js, billing.js, and route modules. Centralizing them:
 * 1. Eliminates subtle divergence (e.g., different safeDocId max lengths).
 * 2. Makes behavior changes propagate everywhere automatically.
 * 3. Creates a testable surface for critical security functions (safeEqual).
 */

import crypto from "crypto";

export const nowIso = () => new Date().toISOString();

export const safeDocId = (value) =>
  String(value || "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 140);

export const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const orgCollection = (db, orgId, name) =>
  db.collection("organizations").doc(orgId).collection(name);
