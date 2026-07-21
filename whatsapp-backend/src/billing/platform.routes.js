/**
 * Platform administration routes.
 *
 * ARCHITECTURAL DECISION: Platform-owner actions (org activation, trial grants,
 * workspace join, signup session recovery) are isolated because:
 * 1. They require platform-admin auth (not org-admin) — different trust level.
 * 2. They modify system-level state (cross-org) which is dangerous to mix with
 *    org-scoped billing flows.
 * 3. They have unique audit requirements (immutable trail of owner actions).
 * 4. Access patterns differ: these are used by support staff, not end users.
 */

import crypto from "crypto";
import { Router } from "express";
import { getAuth } from "firebase-admin/auth";
import { nowIso, httpError, getPlan, safeDocId } from "./helpers.js";
import { DAY_MS } from "../config/constants.js";

export function createPlatformRoutes(db, { requireAuth, requirePlatformAdmin, getTrialDays }) {
  const router = Router();

  router.post("/org-action", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const { orgId, action } = req.body;
      const orgRef = db.collection("organizations").doc(orgId);
      const orgSnap = await orgRef.get();
      if (!orgSnap.exists) throw httpError(404, "Organization not found");
      const org = orgSnap.data();

      if (action === "activate") {
        const { plan } = await getPlan(db, org.planId || "growth", "monthly");
        const endMs = Date.now() + 30 * DAY_MS;
        await orgRef.update({
          planId: plan.id, planName: plan.name, seatsLimit: plan.includedSeats,
          leadsLimit: plan.leadsLimit, subscriptionStatus: "active", billingCycle: "monthly",
          trialEndsAt: null, trialEndsAtMs: 0, currentPeriodEndMs: endMs,
          manualEntitlement: { reason: "platform_owner_activation", grantedBy: req.authUser.uid, grantedAt: nowIso() },
        });
        await orgRef.collection("activity").add({ text: `Platform owner granted a 30-day ${plan.name} entitlement`, at: nowIso(), orgId, actorId: req.authUser.uid });
        return res.json({ ok: true, message: `${plan.name} active until ${new Date(endMs).toLocaleDateString("en-IN")}` });
      }

      if (action === "trial") {
        const trialDays = await getTrialDays();
        const { plan } = await getPlan(db, org.planId || "starter", "monthly");
        const endMs = Date.now() + trialDays * DAY_MS;
        await orgRef.update({
          planId: plan.id, planName: plan.name, seatsLimit: plan.includedSeats,
          leadsLimit: plan.leadsLimit, subscriptionStatus: "trialing",
          trialEndsAt: new Date(endMs).toISOString(), trialEndsAtMs: endMs,
          currentPeriodEndMs: 0,
          manualEntitlement: { reason: "platform_owner_trial", grantedBy: req.authUser.uid, grantedAt: nowIso() },
        });
        await orgRef.collection("activity").add({ text: `Platform owner started a ${trialDays}-day trial`, at: nowIso(), orgId, actorId: req.authUser.uid });
        return res.json({ ok: true, message: `${trialDays}-day trial started` });
      }

      if (action === "join") {
        const membershipRef = db.collection("memberships").doc(`${req.authUser.uid}_${orgId}`);
        const userRecord = await getAuth().getUser(req.authUser.uid);
        await membershipRef.set({
          uid: req.authUser.uid, orgId, role: "owner",
          displayName: userRecord.displayName || "Platform Owner",
          phone: userRecord.phoneNumber || null, active: true,
          invitedBy: req.authUser.uid, joinedAt: nowIso(), lastActiveAt: nowIso(),
          platformGranted: true,
        }, { merge: true });
        await db.collection("users").doc(req.authUser.uid).set({ defaultOrgId: orgId, lastLoginAt: nowIso() }, { merge: true });
        await orgRef.collection("activity").add({ text: "Platform owner joined workspace", at: nowIso(), orgId, actorId: req.authUser.uid });
        return res.json({ ok: true, message: "Owner access granted" });
      }

      throw httpError(400, "Unsupported platform action");
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Platform action failed" });
    }
  });

  router.post("/signup-session/recover", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const uid = String(req.body?.uid || "").trim();
      if (!uid) throw httpError(400, "A user ID is required");
      if (req.body?.confirmedNoProviderPayment !== true) {
        throw httpError(400, "Confirm that no provider payment or usable checkout exists before releasing this session");
      }
      const sessionRef = db.collection("signupSessions").doc(uid);
      const recoveryRef = db.collection("signupSessionRecoveries").doc(crypto.randomUUID());
      await db.runTransaction(async (tx) => {
        const session = await tx.get(sessionRef);
        if (!session.exists || session.data().status !== "creating") {
          throw httpError(404, "No interrupted signup checkout was found");
        }
        if (Number(session.data().createdAtMs || 0) > Date.now() - 5 * 60 * 1000) {
          throw httpError(409, "Wait five minutes before recovering a checkout that may still be running");
        }
        tx.create(recoveryRef, {
          uid, recoveredBy: req.authUser.uid, recoveredAt: nowIso(),
          reason: "provider_reconciled_no_payment", previousSession: session.data(),
        });
        tx.delete(sessionRef);
      });
      res.json({ ok: true, message: "Interrupted checkout released after provider reconciliation" });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Could not recover the signup checkout" });
    }
  });

  return router;
}
