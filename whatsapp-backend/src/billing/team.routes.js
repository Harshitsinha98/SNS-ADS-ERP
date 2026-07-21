/**
 * Team management routes (invite, activate/deactivate, role change, claim).
 *
 * ARCHITECTURAL DECISION: Team management is separated from payment routes
 * because they serve different actors (org admins vs. billing admins) and have
 * different failure modes. This split:
 * 1. Makes team capacity (seat limits) logic auditable in isolation.
 * 2. Reduces cognitive load when reviewing payment-related PRs.
 * 3. Enables future team-specific rate limiting without affecting billing.
 */

import { Router } from "express";
import { TEAM_ROLES } from "../config/constants.js";
import { nowIso, phoneKey, httpError, safeDocId } from "./helpers.js";

export function createTeamRoutes(db, { requireAuth, requireOrgAdmin }) {
  const router = Router();

  router.post("/claim-invites", requireAuth, async (req, res) => {
    try {
      const phone = req.authUser.phone_number;
      if (!phone) throw httpError(400, "A verified phone number is required");
      const invites = await db.collection("invites").where("phone", "==", phone).where("active", "==", true).get();
      const claimed = [];
      for (const inviteSnap of invites.docs) {
        const invite = inviteSnap.data();
        const membershipRef = db.collection("memberships").doc(`${req.authUser.uid}_${invite.orgId}`);
        const orgRef = db.collection("organizations").doc(invite.orgId);
        const result = await db.runTransaction(async (tx) => {
          const [freshInvite, existingMembership, orgSnap] = await Promise.all([
            tx.get(inviteSnap.ref), tx.get(membershipRef), tx.get(orgRef),
          ]);
          if (!freshInvite.exists || !freshInvite.data().active || !orgSnap.exists) return false;
          if (!existingMembership.exists) {
            tx.create(membershipRef, {
              uid: req.authUser.uid, orgId: invite.orgId,
              role: invite.role === "admin" ? "admin" : "employee",
              displayName: invite.displayName || "Member", email: invite.email || "",
              phone, active: true, invitedBy: invite.invitedBy || null,
              joinedAt: nowIso(), lastActiveAt: nowIso(),
            });
          } else if (!existingMembership.data().active) {
            tx.update(membershipRef, { active: true, lastActiveAt: nowIso() });
          } else {
            const org = orgSnap.data();
            tx.update(orgRef, { seatsUsed: Math.max(1, Number(org.seatsUsed || 1) - 1) });
          }
          tx.update(inviteSnap.ref, { active: false, claimed: true, claimedByUid: req.authUser.uid, claimedAt: nowIso() });
          tx.set(db.collection("users").doc(req.authUser.uid), {
            phone, displayName: invite.displayName || "Member",
            defaultOrgId: invite.orgId, lastLoginAt: nowIso(),
          }, { merge: true });
          return true;
        });
        if (result) claimed.push(invite.orgId);
      }
      res.json({ ok: true, claimedOrgIds: claimed });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Could not claim invitations" });
    }
  });

  router.post("/invite", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      const orgId = req.body.orgId;
      const phone = `+91${phoneKey(req.body.phone).slice(-10)}`;
      const displayName = String(req.body.name || "").trim();
      const role = TEAM_ROLES.has(req.body.role) ? req.body.role : "employee";
      if (phone.length !== 13 || !displayName) throw httpError(400, "A name and valid 10-digit phone number are required");
      const orgRef = db.collection("organizations").doc(orgId);
      const inviteRef = db.collection("invites").doc(`${phone}_${orgId}`);
      await db.runTransaction(async (tx) => {
        const [orgSnap, inviteSnap] = await Promise.all([tx.get(orgRef), tx.get(inviteRef)]);
        if (!orgSnap.exists) throw httpError(404, "Organization not found");
        const org = orgSnap.data();
        const trialValid = org.subscriptionStatus === "trialing" && (!org.trialEndsAtMs || org.trialEndsAtMs > Date.now());
        if (org.subscriptionStatus !== "active" && !trialValid) throw httpError(403, "Your subscription is not active");
        if (Number(org.seatsUsed || 0) >= Number(org.seatsLimit || 0)) throw httpError(409, "Seat limit reached");
        if (inviteSnap.exists && inviteSnap.data().active) throw httpError(409, "This number is already invited");
        tx.set(inviteRef, {
          phone, orgId, displayName, email: String(req.body.email || "").trim(),
          role, active: true, claimed: false, invitedBy: req.authUser.uid, createdAt: nowIso(),
        });
        tx.update(orgRef, { seatsUsed: Number(org.seatsUsed || 0) + 1 });
      });
      await db.collection("organizations").doc(orgId).collection("activity").add({
        text: `Team member invited: ${displayName} (${role})`, at: nowIso(), orgId, actorId: req.authUser.uid,
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Could not invite team member" });
    }
  });

  router.post("/member-status", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      const { orgId, uid, active } = req.body;
      const orgRef = db.collection("organizations").doc(orgId);
      const memberRef = db.collection("memberships").doc(`${uid}_${orgId}`);
      await db.runTransaction(async (tx) => {
        const [orgSnap, memberSnap] = await Promise.all([tx.get(orgRef), tx.get(memberRef)]);
        if (!orgSnap.exists || !memberSnap.exists) throw httpError(404, "Team member not found");
        const member = memberSnap.data();
        const org = orgSnap.data();
        if (member.role === "owner") throw httpError(403, "An owner cannot be changed from this action");
        if (member.active === Boolean(active)) return;
        if (active && Number(org.seatsUsed || 0) >= Number(org.seatsLimit || 0)) throw httpError(409, "Seat limit reached");
        tx.update(memberRef, { active: Boolean(active), lastActiveAt: nowIso() });
        tx.update(orgRef, { seatsUsed: Math.max(1, Number(org.seatsUsed || 1) + (active ? 1 : -1)) });
      });
      await db.collection("organizations").doc(orgId).collection("activity").add({
        text: `Team member ${active ? "activated" : "deactivated"}`, at: nowIso(), orgId, actorId: req.authUser.uid, targetUid: uid,
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Could not update team member" });
    }
  });

  router.post("/member-role", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      const { orgId, uid, role } = req.body;
      if (!TEAM_ROLES.has(role)) throw httpError(400, "Invalid team role");
      const memberRef = db.collection("memberships").doc(`${uid}_${orgId}`);
      const member = await memberRef.get();
      if (!member.exists || member.data().role === "owner") throw httpError(403, "This member role cannot be changed");
      await memberRef.update({ role });
      await db.collection("organizations").doc(orgId).collection("activity").add({
        text: `Team member role changed to ${role}`, at: nowIso(), orgId, actorId: req.authUser.uid, targetUid: uid,
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Could not change team member role" });
    }
  });

  return router;
}
