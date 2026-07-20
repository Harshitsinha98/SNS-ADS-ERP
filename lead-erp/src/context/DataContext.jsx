import { createContext, useContext, useState, useEffect, useMemo } from "react";
import {
  collection, collectionGroup, doc, onSnapshot, addDoc, updateDoc, setDoc, getDoc,
  query, where, orderBy, limit, writeBatch
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";
import {
  inviteTeamMember, setTeamMemberStatus, setTeamMemberRole, schedulePlanDowngrade, cancelPlanDowngrade,
  importBulkLeads, createManualLead, rotateWebsiteLeadIntakeKey, reassignBulkLeads, triggerWhatsAppSync as requestWhatsAppSync,
} from "../utils/billingApi";

const DataContext = createContext();
export const useData = () => useContext(DataContext);

const DEFAULT_SETTINGS = {
  statuses: ["New", "Ringing", "Meeting Fixed", "Negotiation", "Follow-up", "Closed-Won", "Lost"],
  autoAssign: "round-robin",
};

// ============================================================
// HELPER FUNCTIONS for org-scoped paths
// ============================================================

/**
 * Get a collection reference scoped to the active organization
 * @param {string} orgId - Organization ID
 * @param {string} collectionName - Collection name (e.g., "leads", "activity")
 * @returns Firestore collection reference
 */
const orgCollection = (orgId, collectionName) => 
  collection(db, "organizations", orgId, collectionName);

/**
 * Get a document reference scoped to the active organization
 * @param {string} orgId - Organization ID
 * @param {string} collectionName - Collection name
 * @param {string} docId - Document ID
 * @returns Firestore document reference
 */
const orgDoc = (orgId, collectionName, docId) => 
  doc(db, "organizations", orgId, collectionName, docId);

/**
 * Get a subcollection reference under an org-scoped document
 * @param {string} orgId - Organization ID
 * @param {string} parentCollection - Parent collection name
 * @param {string} parentId - Parent document ID
 * @param {string} subcollectionName - Subcollection name
 * @returns Firestore collection reference
 */
const orgSubcollection = (orgId, parentCollection, parentId, subcollectionName) =>
  collection(db, "organizations", orgId, parentCollection, parentId, subcollectionName);

export function DataProvider({ children }) {
  const { user } = useAuth();

  const [leads, setLeads] = useState([]);
  const [members, setMembers] = useState([]);       // claimed memberships (real UID)
  const [pendingInvites, setPendingInvites] = useState([]); // invited but not yet logged in
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  // Team = claimed members + pending invites (deduped by phone; member wins).
  const users = useMemo(() => {
    const memberPhones = new Set(members.map((m) => m.phone).filter(Boolean));
    const pend = pendingInvites
      .filter((i) => !memberPhones.has(i.phone))
      .map((i) => ({
        id: i.id,
        inviteId: i.id,
        uid: null,
        phone: i.phone,
        name: i.displayName,
        email: i.email || "",
        role: i.role,
        active: true,
        pending: true,
      }));
    return [...members, ...pend];
  }, [members, pendingInvites]);
  const [notifications, setNotifications] = useState([]);
  const [activity, setActivity] = useState([]);
  const [goals, setGoals] = useState({});
  const [financials, setFinancials] = useState({});

  useEffect(() => {
    if (!user || !user.activeOrgId) {
      setLeads([]); setMembers([]); setPendingInvites([]); setNotifications([]); setActivity([]); setGoals({}); setFinancials({});
      return;
    }

    const orgId = user.activeOrgId;
    const isAdmin = user.activeOrgRole === "admin" || user.activeOrgRole === "owner";

    // ============================================================
    // LEADS - org-scoped
    // ============================================================
    const leadsQuery = isAdmin
      ? orgCollection(orgId, "leads")
      : query(orgCollection(orgId, "leads"), where("assignedTo", "==", user.uid));

    const unsubLeads = onSnapshot(
      leadsQuery,
      (snap) => setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("Leads listener error:", err)
    );

    // ============================================================
    // USERS - now query memberships for this org
    // ============================================================
    const usersQuery = query(
      collection(db, "memberships"),
      where("orgId", "==", orgId),
      where("active", "==", true)
    );

    const unsubUsers = onSnapshot(
      usersQuery,
      (snap) => setMembers(snap.docs.map((d) => ({ 
        id: d.data().uid, // Use uid as id for compatibility
        uid: d.data().uid,
        phone: d.data().phone,
        name: d.data().displayName,
        email: d.data().email || "",
        role: d.data().role,
        active: d.data().active,
        pending: false,
        ...d.data() 
      }))),
      (err) => console.error("Members listener error:", err)
    );

    // ============================================================
    // PENDING INVITES - employees added by admin, not yet logged in
    // ============================================================
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

    // ============================================================
    // SETTINGS - org-scoped
    // ============================================================
    const unsubSettings = onSnapshot(orgDoc(orgId, "settings", "config"), (d) => {
      if (d.exists()) setSettings(d.data());
    }, (err) => console.error("Settings listener error:", err));

    // ============================================================
    // NOTIFICATIONS - org-scoped
    // ============================================================
    const unsubNotifs = onSnapshot(
      query(orgCollection(orgId, "notifications"), where("userId", "==", user.uid)),
      (snap) => setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("Notifications listener error:", err)
    );

    // ============================================================
    // ACTIVITY - org-scoped, admin only
    // ============================================================
    let unsubActivity = () => {};
    if (isAdmin) {
      unsubActivity = onSnapshot(
        query(orgCollection(orgId, "activity"), orderBy("at", "desc"), limit(100)),
        (snap) => setActivity(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => console.error("Activity listener error:", err)
      );
    } else {
      setActivity([]);
    }

    // ============================================================
    // GOALS - org-scoped, admin only
    // ============================================================
    let unsubGoals = () => {};
    if (isAdmin) {
      unsubGoals = onSnapshot(orgDoc(orgId, "goals", "config"), (d) => {
        if (d.exists()) setGoals(d.data());
      }, (err) => console.error("Goals listener error:", err));
    } else {
      setGoals({});
    }

    // ============================================================
    // FINANCIALS - admin only, use collectionGroup but filter by orgId client-side
    // ============================================================
    let unsubFinancials = () => {};
    if (isAdmin) {
      unsubFinancials = onSnapshot(collectionGroup(db, "private"), (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          // Check if this private doc belongs to our org
          // Path: organizations/{orgId}/leads/{leadId}/private/{docId}
          const pathSegments = d.ref.path.split('/');
          const docOrgId = pathSegments[1];
          if (docOrgId === orgId) {
            const leadId = d.ref.parent.parent.id;
            map[leadId] = d.data();
          }
        });
        setFinancials(map);
      }, (err) => console.error("Financials listener error:", err));
    } else {
      setFinancials({});
    }

    return () => { 
      unsubLeads(); 
      unsubUsers(); 
      unsubInvites();
      unsubSettings(); 
      unsubNotifs(); 
      unsubActivity(); 
      unsubGoals(); 
      unsubFinancials(); 
    };
  }, [user]);

  // ============================================================
  // ACTIVITY LOGGING - org-scoped
  // ============================================================

  // Audit records are server-authored so the browser cannot forge an immutable
  // event. Privileged backend operations already create audit entries.
  const logActivity = async () => {};

  // ============================================================
  // NOTES - org-scoped subcollection
  // ============================================================

  const writeNote = async (leadId, noteData) => {
    if (!user?.activeOrgId || !user?.uid) return false;
    const payload = {
      ...noteData,
      authorId: noteData.authorId || user.uid,
      authorName: noteData.authorName || user.displayName || "Team member",
      at: new Date().toISOString(),
    };
    try {
      const notesRef = orgSubcollection(user.activeOrgId, "leads", leadId, "notes");
      if (noteData.callLogId) {
        // A stable native call-log ID lets a retry recover a failed lead update
        // without creating another CRM note. Rules keep existing notes immutable.
        const noteRef = doc(notesRef, `call_${String(noteData.callLogId).replace(/[^A-Za-z0-9_-]/g, "_")}`);
        const existing = await getDoc(noteRef);
        if (!existing.exists()) await setDoc(noteRef, payload);
      } else {
        await addDoc(notesRef, payload);
      }
      return true;
    } catch (error) {
      console.error("Error writing note:", error);
      return false;
    }
  };

  const addNote = async (id, text, type = "note", extra = {}) => {
    const noteWritten = await writeNote(id, {
      type, text,
      visibility: extra.visibility || "team",
      authorId: extra.authorId || null,
      authorName: extra.authorName || extra.by || "System",
      authorRole: extra.authorRole || null,
      ...extra,
    });
    if (!noteWritten) return false;
    const patch = { lastUpdated: new Date().toISOString() };
    if (type === "call" || type === "worknote") {
      patch.lastContactedAt = new Date().toISOString();
    }
    try {
      await updateDoc(orgDoc(user.activeOrgId, "leads", id), patch);
      return true;
    } catch (error) {
      console.error("Error updating lead activity:", error);
      return false;
    }
  };

  const addWorknote = (id, text, currentUser, extra = {}) => {
    const isAdmin = currentUser?.activeOrgRole === "admin" || currentUser?.activeOrgRole === "owner";
    const visibility = isAdmin ? (extra.visibility || "admin_only") : "team";
    addNote(id, text, "worknote", {
      authorId: currentUser?.uid || currentUser?.id || null,
      authorName: currentUser?.displayName || currentUser?.name || "Unknown",
      authorRole: currentUser?.activeOrgRole || currentUser?.role || "employee",
      visibility,
    });
    logActivity(`Worknote added on lead ${id} by ${currentUser?.displayName || currentUser?.name || "Unknown"}`);
  };

  // ============================================================
  // LEAD OPERATIONS - org-scoped
  // ============================================================

  const updateLead = async (id, patch, currentUser) => {
    if (!user?.activeOrgId) return;
    try {
      await updateDoc(orgDoc(user.activeOrgId, "leads", id), { 
        ...patch, 
        lastUpdated: new Date().toISOString() 
      });
      if (patch.status) {
        await writeNote(id, {
          type: "status",
          text: `Status changed to "${patch.status}"${currentUser?.displayName || currentUser?.name ? ` by ${currentUser?.displayName || currentUser?.name}` : ""}`,
          visibility: "team",
          authorName: currentUser?.displayName || currentUser?.name || "System",
        });
        logActivity(`Lead ${id} status changed to "${patch.status}"`);
      }
    } catch (e) { console.error("Error updating lead:", e); }
  };

  const updateLeadStatus = (id, status, currentUser) => updateLead(id, { status }, currentUser);

  const updatePriority = async (id, priority, currentUser) => {
    if (!user?.activeOrgId) return;
    try {
      await updateDoc(orgDoc(user.activeOrgId, "leads", id), { 
        priority, 
        lastUpdated: new Date().toISOString() 
      });
      await writeNote(id, {
        type: "system",
        text: `Priority changed to "${priority}"${currentUser?.displayName || currentUser?.name ? ` by ${currentUser?.displayName || currentUser?.name}` : ""}`,
        visibility: "team",
        authorName: currentUser?.displayName || currentUser?.name || "System",
      });
    } catch (e) { console.error("Error updating priority:", e); }
  };

  const updateFollowUpDate = async (id, date, currentUser) => {
    if (!user?.activeOrgId) return;
    try {
      await updateDoc(orgDoc(user.activeOrgId, "leads", id), { 
        followUp: date, 
        lastUpdated: new Date().toISOString() 
      });
      await writeNote(id, {
        type: "system",
        text: `Follow-up date updated${currentUser?.displayName || currentUser?.name ? ` by ${currentUser?.displayName || currentUser?.name}` : ""}`,
        visibility: "team",
        authorName: currentUser?.displayName || currentUser?.name || "System",
      });
    } catch (e) { console.error("Error updating follow-up date:", e); }
  };

  const updateLeadRevenue = async (id, revenue, currentUser) => {
    if (!user?.activeOrgId) throw new Error("No active organization selected");
    try {
      await setDoc(doc(db, "organizations", user.activeOrgId, "leads", id, "private", "data"), {
        revenue: Number(revenue) || 0,
        revenueUpdatedBy: currentUser?.displayName || currentUser?.name || "Unknown",
        revenueUpdatedAt: new Date().toISOString(),
      }, { merge: true });
      logActivity(`Revenue updated on lead ${id} → ₹${revenue} by ${currentUser?.displayName || currentUser?.name || "Unknown"}`);
      return true;
    } catch (e) {
      console.error("Error updating revenue:", e);
      throw e;
    }
  };

  const reassignLead = async (id, employeeId, employeeName, currentUser) => {
    await updateLead(id, { assignedTo: employeeId, assignedToName: employeeName || null });
    await writeNote(id, {
      type: "assignment",
      text: `Reassigned to ${employeeName || employeeId}${currentUser?.displayName || currentUser?.name ? ` by ${currentUser?.displayName || currentUser?.name}` : ""}`,
      visibility: "team",
      authorName: currentUser?.displayName || currentUser?.name || "System",
    });
    pushNotif(employeeId, `New lead assigned to you (${id})`);
    logActivity(`Lead ${id} reassigned to ${employeeName || employeeId}`);
  };

  const reassignAllLeads = async (fromEmployeeId, toEmployeeId, toEmployeeName) => {
    if (!user?.activeOrgId) return 0;
    try {
      const result = await reassignBulkLeads({
        orgId: user.activeOrgId,
        fromEmployeeId,
        toEmployeeId,
        toEmployeeName: toEmployeeName || null,
      });
      return result.count || 0;
    } catch (e) {
      console.error("Bulk reassign error:", e);
      return 0;
    }
  };

  const blacklistLead = (id) => {
    updateLead(id, { blacklisted: true, status: "Lost" });
    logActivity(`Lead ${id} blacklisted`);
  };

  // ============================================================
  // BULK LEADS - org-scoped
  // ============================================================

  const addBulkLeads = async (rows, assigner, importId) => {
    if (!user?.activeOrgId) return 0;
    try {
      const result = await importBulkLeads({
        orgId: user.activeOrgId,
        rows,
        importId,
        assigner: assigner === "workload" ? "workload" : "round-robin",
      });
      return result.imported || 0;
    } catch (e) {
      console.error("Bulk import error:", e);
      throw e;
    }
  };

  const addManualLead = async (lead) => {
    if (!user?.activeOrgId) throw new Error("No active organization selected");
    return createManualLead({ orgId: user.activeOrgId, ...lead });
  };

  const createWebsiteLeadIntakeKey = async () => {
    if (!user?.activeOrgId) throw new Error("No active organization selected");
    return rotateWebsiteLeadIntakeKey({ orgId: user.activeOrgId });
  };

  // ============================================================
  // USER MANAGEMENT - memberships-based
  // ============================================================

  // Add a team member with SEAT-LIMIT enforcement.
  // Runs in a transaction: reads the org, blocks if seatsUsed >= seatsLimit,
  // otherwise creates the membership and atomically increments seatsUsed.
  // Returns { ok, error } so the UI can show a precise message.
  // Invite a team member. Creates an INVITE keyed by phone (invites/{E164}_{orgId})
  // and reserves a seat. When that person logs in with OTP, AuthContext claims
  // the invite into a real-UID membership (so their login works — no org prompt).
  // u = { name, phone (10-digit), email?, role }
  const addUser = async (u) => {
    if (!user?.activeOrgId) return { ok: false, error: "No active organization" };
    try {
      await inviteTeamMember({
        orgId: user.activeOrgId,
        name: u.name,
        phone: u.phone,
        email: u.email || "",
        role: u.role || "employee",
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || "Could not invite team member" };
    }
  };

  const updateUser = async (uid, patch) => {
    if (!user?.activeOrgId) return { ok: false, error: "No active organization" };
    try {
      if (patch.role) {
        await setTeamMemberRole({ orgId: user.activeOrgId, uid, role: patch.role });
        return { ok: true };
      }
      return { ok: false, error: "Mobile-number changes require a new verified invitation." };
    } catch (e) {
      return { ok: false, error: e.message || "Could not update team member" };
    }
  };

  const deactivateUser = async (target) => {
    if (!user?.activeOrgId || target?.pending) return { ok: false, error: "Pending invitations can be managed after they are claimed." };
    try {
      await setTeamMemberStatus({ orgId: user.activeOrgId, uid: target?.uid || target?.id || target, active: false });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || "Could not deactivate team member" };
    }
  };

  const activateUser = async (uid) => {
    if (!user?.activeOrgId) return { ok: false, error: "No active organization" };
    try {
      await setTeamMemberStatus({ orgId: user.activeOrgId, uid, active: true });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || "Could not activate team member" };
    }
  };

  // Entitlements are payment-backend only. Keep this compatibility method so
  // older callers receive a safe message instead of mutating Firestore.
  const changePlan = async () => ({ ok: false, error: "Choose a payment method to activate or upgrade a plan." });

  const scheduleDowngrade = async (toPlanId, cycle = "monthly") => {
    if (!user?.activeOrgId) return { ok: false, error: "No active organization" };
    try {
      await schedulePlanDowngrade({ orgId: user.activeOrgId, toPlanId, cycle });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || "Could not schedule downgrade." };
    }
  };

  const cancelDowngrade = async () => {
    if (!user?.activeOrgId) return { ok: false, error: "No active organization" };
    try {
      await cancelPlanDowngrade({ orgId: user.activeOrgId });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || "Could not cancel downgrade." };
    }
  };

  // ============================================================
  // NOTIFICATIONS - org-scoped
  // ============================================================

  const pushNotif = async (userId, text) => {
    if (!user?.activeOrgId) return;
    try {
      await addDoc(orgCollection(user.activeOrgId, "notifications"), { 
        userId, 
        text, 
        read: false, 
        at: new Date().toISOString(),
        orgId: user.activeOrgId,
      });
    } catch (e) { console.error("Push notif error:", e); }
  };

  const markRead = async (userId) => {
    if (!user?.activeOrgId) return;
    try {
      const mine = notifications.filter((n) => n.userId === userId && !n.read);
      if (mine.length === 0) return;
      const batch = writeBatch(db);
      mine.forEach((n) => batch.update(orgDoc(user.activeOrgId, "notifications", n.id), { read: true }));
      await batch.commit();
    } catch (e) { console.error("Mark read error:", e); }
  };

  // ============================================================
  // GOALS & SETTINGS - org-scoped
  // ============================================================

  const setMyGoal = async (empId, target) => {
    if (!user?.activeOrgId) return;
    try { 
      await setDoc(orgDoc(user.activeOrgId, "goals", "config"), { 
        ...goals, 
        [empId]: Number(target) || 0,
        orgId: user.activeOrgId,
      }, { merge: true }); 
    } catch (e) { console.error("Set goal error:", e); }
  };

  const setSettingsValue = async (s) => {
    if (!user?.activeOrgId) return;
    try { 
      await setDoc(orgDoc(user.activeOrgId, "settings", "config"), s, { merge: true }); 
    } catch (e) { console.error("Set settings error:", e); }
  };

  // ============================================================
  // WHATSAPP SYNC
  // ============================================================

  const triggerWhatsAppSync = async () => {
    if (!user?.activeOrgId) return { success: false, error: "No active organization" };
    try {
      return await requestWhatsAppSync({ orgId: user.activeOrgId });
    } catch (e) {
      console.error("WhatsApp sync error:", e);
      return { success: false, error: e.message };
    }
  };

  return (
    <DataContext.Provider value={{
      leads, users, settings, notifications, activity, goals, financials,
      setSettings: setSettingsValue, updateLead, addNote, addWorknote,
      updateLeadStatus, updatePriority, updateFollowUpDate, updateLeadRevenue,
      reassignLead, reassignAllLeads, blacklistLead,
      addBulkLeads, addManualLead, createWebsiteLeadIntakeKey,
      addUser, updateUser, deactivateUser, activateUser, pushNotif, markRead, logActivity, setMyGoal,
      triggerWhatsAppSync, changePlan, scheduleDowngrade, cancelDowngrade,
    }}>
      {children}
    </DataContext.Provider>
  );
}
