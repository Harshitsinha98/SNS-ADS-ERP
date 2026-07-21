/**
 * Team Context — manages team members, invites, and user operations.
 *
 * ARCHITECTURAL DECISION: Team state (members + pending invites) was coupled
 * to lead state in DataContext, causing every team change to trigger a full
 * re-render of all lead components. Separating it:
 * 1. Team roster changes only re-render components that use useTeam().
 * 2. Invite/deactivate flows can be tested without lead state.
 * 3. Seat limit enforcement logic is co-located with team mutations.
 */

import { createContext, useContext, useState, useEffect, useMemo } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";
import {
  inviteTeamMember, setTeamMemberStatus, setTeamMemberRole,
  schedulePlanDowngrade, cancelPlanDowngrade,
} from "../utils/billingApi";

const TeamContext = createContext();
export const useTeam = () => useContext(TeamContext);

export function TeamProvider({ children }) {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);

  // Merge claimed members + pending invites (deduped by phone)
  const users = useMemo(() => {
    const memberPhones = new Set(members.map((m) => m.phone).filter(Boolean));
    const pend = pendingInvites
      .filter((i) => !memberPhones.has(i.phone))
      .map((i) => ({
        id: i.id, inviteId: i.id, uid: null, phone: i.phone,
        name: i.displayName, email: i.email || "", role: i.role,
        active: true, pending: true,
      }));
    return [...members, ...pend];
  }, [members, pendingInvites]);

  useEffect(() => {
    if (!user || !user.activeOrgId) {
      setMembers([]); setPendingInvites([]);
      return;
    }
    const orgId = user.activeOrgId;
    const isAdmin = user.activeOrgRole === "admin" || user.activeOrgRole === "owner";

    const usersQuery = query(
      collection(db, "memberships"),
      where("orgId", "==", orgId),
      where("active", "==", true)
    );
    const unsubUsers = onSnapshot(usersQuery,
      (snap) => setMembers(snap.docs.map((d) => ({
        id: d.data().uid, uid: d.data().uid, phone: d.data().phone,
        name: d.data().displayName, email: d.data().email || "",
        role: d.data().role, active: d.data().active, pending: false,
        ...d.data(),
      }))),
      (err) => console.error("Members listener error:", err)
    );

    let unsubInvites = () => {};
    if (isAdmin) {
      unsubInvites = onSnapshot(
        query(collection(db, "invites"), where("orgId", "==", orgId), where("active", "==", true)),
        (snap) => setPendingInvites(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => console.error("Invites listener error:", err)
      );
    } else {
      setPendingInvites([]);
    }

    return () => { unsubUsers(); unsubInvites(); };
  }, [user]);

  // ── User Management ──
  const addUser = async (u) => {
    if (!user?.activeOrgId) return { ok: false, error: "No active organization" };
    try {
      await inviteTeamMember({
        orgId: user.activeOrgId, name: u.name, phone: u.phone,
        email: u.email || "", role: u.role || "employee",
      });
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message || "Could not invite team member" }; }
  };

  const updateUser = async (uid, patch) => {
    if (!user?.activeOrgId) return { ok: false, error: "No active organization" };
    try {
      if (patch.role) {
        await setTeamMemberRole({ orgId: user.activeOrgId, uid, role: patch.role });
        return { ok: true };
      }
      return { ok: false, error: "Mobile-number changes require a new verified invitation." };
    } catch (e) { return { ok: false, error: e.message || "Could not update team member" }; }
  };

  const deactivateUser = async (target) => {
    if (!user?.activeOrgId || target?.pending) return { ok: false, error: "Pending invitations can be managed after they are claimed." };
    try {
      await setTeamMemberStatus({ orgId: user.activeOrgId, uid: target?.uid || target?.id || target, active: false });
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message || "Could not deactivate team member" }; }
  };

  const activateUser = async (uid) => {
    if (!user?.activeOrgId) return { ok: false, error: "No active organization" };
    try {
      await setTeamMemberStatus({ orgId: user.activeOrgId, uid, active: true });
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message || "Could not activate team member" }; }
  };

  const changePlan = async () => ({ ok: false, error: "Choose a payment method to activate or upgrade a plan." });

  const scheduleDowngrade = async (toPlanId, cycle = "monthly") => {
    if (!user?.activeOrgId) return { ok: false, error: "No active organization" };
    try { await schedulePlanDowngrade({ orgId: user.activeOrgId, toPlanId, cycle }); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message || "Could not schedule downgrade." }; }
  };

  const cancelDowngrade = async () => {
    if (!user?.activeOrgId) return { ok: false, error: "No active organization" };
    try { await cancelPlanDowngrade({ orgId: user.activeOrgId }); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message || "Could not cancel downgrade." }; }
  };

  return (
    <TeamContext.Provider value={{
      users, members, pendingInvites,
      addUser, updateUser, deactivateUser, activateUser,
      changePlan, scheduleDowngrade, cancelDowngrade,
    }}>
      {children}
    </TeamContext.Provider>
  );
}
