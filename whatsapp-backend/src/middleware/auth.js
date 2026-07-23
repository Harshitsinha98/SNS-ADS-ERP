/**
 * Authentication & authorization middleware.
 *
 * ARCHITECTURAL DECISION: Auth was duplicated in server.js, billing.js,
 * leadIntake.js, followUpTasks.js, and whatsappTemplates.js — each defining
 * their own `requireAuth` function. Consolidating into one module:
 * 1. Guarantees consistent token verification behavior.
 * 2. Makes it trivial to add token caching or rate-limiting later.
 * 3. Removes ~30 lines of duplicated code per route file.
 *
 * Each route module's local `requireAuth` is replaced by importing from here.
 * The existing API contract (Bearer token in Authorization header) is unchanged.
 */

import { adminAuth } from "../bootstrap/firebase.js";
import { db } from "../bootstrap/firebase.js";
import { platformConfig } from "../config/env.js";

/**
 * Verify Firebase ID token and attach decoded user to req.authUser.
 * Returns 401 on missing/invalid token — identical to the original behavior.
 */
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing auth token" });
    req.authUser = await adminAuth.verifyIdToken(token);
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid auth token" });
  }
}

/**
 * Check if uid holds an admin/owner membership in orgId.
 */
export async function isOrgAdmin(uid, orgId) {
  if (!uid || !orgId) return false;
  const member = await db.collection("memberships").doc(`${uid}_${orgId}`).get();
  const data = member.data();
  const active = Boolean(member.exists && data.active && (!data.expiresAtMs || Number(data.expiresAtMs) > Date.now()));
  return Boolean(active && (data.role === "owner" || data.role === "admin"));
}

/**
 * Check if uid has any active membership in orgId.
 */
export async function getActiveMembership(uid, orgId) {
  if (!uid || !orgId) return null;
  const member = await db.collection("memberships").doc(`${uid}_${orgId}`).get();
  const data = member.data();
  return member.exists && data.active && (!data.expiresAtMs || Number(data.expiresAtMs) > Date.now()) ? data : null;
}

/**
 * Middleware: require org admin role. Reads orgId from req.body.orgId.
 */
export function requireOrgAdmin(req, res, next) {
  const orgId = req.body?.orgId;
  return isOrgAdmin(req.authUser.uid, orgId).then((isAdmin) => {
    if (!isAdmin) return res.status(403).json({ error: "Organization admin access required" });
    return next();
  }).catch(() => res.status(403).json({ error: "Organization admin access required" }));
}

/**
 * Check if the authenticated user is a platform-level admin.
 */
export async function isPlatformAdmin(authUser) {
  if (!authUser?.uid) return false;
  if (authUser.phone_number === platformConfig.ownerPhone) return true;
  return (await db.collection("platformAdmins").doc(authUser.uid).get()).exists;
}

/**
 * Middleware: require platform admin.
 */
export async function requirePlatformAdmin(req, res, next) {
  try {
    if (!(await isPlatformAdmin(req.authUser))) {
      return res.status(403).json({ error: "Platform owner access required" });
    }
    return next();
  } catch {
    return res.status(403).json({ error: "Platform owner access required" });
  }
}
