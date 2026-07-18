import { createContext, useContext, useState, useEffect, useMemo } from "react";
import {
  collection, collectionGroup, doc, onSnapshot, addDoc, updateDoc, setDoc, deleteDoc,
  query, where, orderBy, limit, writeBatch, runTransaction, increment, getDoc
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";

const toE164 = (phone) => "+91" + String(phone).replace(/\D/g, "").slice(-10);

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

  const logActivity = async (text) => {
    if (!user?.activeOrgId) return;
    try {
      await addDoc(orgCollection(user.activeOrgId, "activity"), { 
        text, 
        at: new Date().toISOString(),
        orgId: user.activeOrgId,
      });
    } catch (e) { console.error("Error logging activity:", e); }
  };

  // ============================================================
  // NOTES - org-scoped subcollection
  // ============================================================

  const writeNote = async (leadId, noteData) => {
    if (!user?.activeOrgId) return;
    try {
      await addDoc(orgSubcollection(user.activeOrgId, "leads", leadId, "notes"), {
        ...noteData,
        at: new Date().toISOString(),
      });
    } catch (e) { console.error("Error writing note:", e); }
  };

  const addNote = async (id, text, type = "note", extra = {}) => {
    await writeNote(id, {
      type, text,
      visibility: extra.visibility || "team",
      authorId: extra.authorId || null,
      authorName: extra.authorName || extra.by || "System",
      authorRole: extra.authorRole || null,
      ...extra,
    });
    const patch = { lastUpdated: new Date().toISOString() };
    if (type === "call" || type === "worknote") {
      patch.lastContactedAt = new Date().toISOString();
    }
    try { 
      await updateDoc(orgDoc(user.activeOrgId, "leads", id), patch); 
    } catch (e) { console.error(e); }
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
    if (!user?.activeOrgId) return;
    try {
      await setDoc(doc(db, "organizations", user.activeOrgId, "leads", id, "private", "data"), {
        revenue: Number(revenue) || 0,
        revenueUpdatedBy: currentUser?.displayName || currentUser?.name || "Unknown",
        revenueUpdatedAt: new Date().toISOString(),
      }, { merge: true });
      logActivity(`Revenue updated on lead ${id} → ₹${revenue} by ${currentUser?.displayName || currentUser?.name || "Unknown"}`);
    } catch (e) { console.error("Error updating revenue:", e); }
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

  const reassignAllLeads = async (fromEmployeeId, toEmployeeId, toEmployeeName, currentUser) => {
    if (!user?.activeOrgId) return 0;
    try {
      const openLeads = leads.filter(
        (l) => l.assignedTo === fromEmployeeId && !["Closed-Won", "Lost"].includes(l.status)
      );
      if (openLeads.length === 0) return 0;

      const batch = writeBatch(db);
      openLeads.forEach((l) => {
        batch.update(orgDoc(user.activeOrgId, "leads", l.id), {
          assignedTo: toEmployeeId,
          assignedToName: toEmployeeName || null,
          lastUpdated: new Date().toISOString(),
        });
      });
      await batch.commit();

      await Promise.all(openLeads.map((l) =>
        writeNote(l.id, {
          type: "assignment",
          text: `Bulk-reassigned to ${toEmployeeName || toEmployeeId}${currentUser?.displayName || currentUser?.name ? ` by ${currentUser?.displayName || currentUser?.name}` : ""} (previous employee deactivated)`,
          visibility: "team",
          authorName: currentUser?.displayName || currentUser?.name || "System",
        })
      ));

      pushNotif(toEmployeeId, `${openLeads.length} lead(s) reassigned to you from a deactivated employee`);
      logActivity(`${openLeads.length} lead(s) bulk-reassigned from ${fromEmployeeId} to ${toEmployeeName || toEmployeeId}`);
      return openLeads.length;
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

  const addBulkLeads = async (rows, assigner) => {
    if (!user?.activeOrgId) return 0;
    try {
      // Only claimed members (real UID, logged in at least once) can receive leads.
      const emps = users.filter((u) => u.role === "employee" && !u.pending && u.uid);
      if (emps.length === 0) {
        alert("No active (logged-in) employees available to assign leads. Pending invitees can't receive leads until they log in.");
        return 0;
      }

      const batch = writeBatch(db);
      let rr = 0;
      let count = 0;

      const currentWorkloads = {};
      if (assigner === "workload") {
        emps.forEach(e => {
          currentWorkloads[e.id] = leads.filter(l => l.assignedTo === e.id).length;
        });
      }

      for (const r of rows) {
        let assignedTo;
        if (assigner === "workload") {
          assignedTo = Object.keys(currentWorkloads).reduce((a, b) => currentWorkloads[a] < currentWorkloads[b] ? a : b);
          currentWorkloads[assignedTo]++;
        } else {
          assignedTo = emps[(rr++) % emps.length]?.id;
        }

        const newLeadRef = doc(orgCollection(user.activeOrgId, "leads"));
        batch.set(newLeadRef, {
          name: r.name || r.Name || "Unknown",
          phone: r.phone || r.Phone || "",
          email: r.email || r.Email || "",
          source: r.source || r.Source || "Import",
          requirement: r.requirement || r.Requirement || "",
          status: "New",
          assignedTo,
          blacklisted: false,
          priority: "Warm",
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          followUp: null,
          lastContactedAt: null,
          orgId: user.activeOrgId,
        });
        count++;

        if (count % 450 === 0) await batch.commit();
      }

      await batch.commit();
      return count;
    } catch (e) {
      console.error("Bulk Import Error:", e);
      return 0;
    }
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

    const orgId = user.activeOrgId;
    const phoneE164 = toE164(u.phone);
    const orgRef = doc(db, "organizations", orgId);
    const inviteRef = doc(db, "invites", `${phoneE164}_${orgId}`);
    const claimedMemRef = doc(db, "memberships", `${phoneE164}_${orgId}`); // legacy placeholder id

    try {
      await runTransaction(db, async (tx) => {
        const orgSnap = await tx.get(orgRef);
        if (!orgSnap.exists()) throw Object.assign(new Error("org missing"), { code: "no-org" });

        const org = orgSnap.data();
        const seatsUsed = org.seatsUsed ?? 1;
        const seatsLimit = org.seatsLimit ?? 1;
        if (org.subscriptionStatus === "expired")
          throw Object.assign(new Error("expired"), { code: "expired" });
        if (seatsUsed >= seatsLimit)
          throw Object.assign(new Error("seat limit"), { code: "seat-limit" });

        const invSnap = await tx.get(inviteRef);
        if (invSnap.exists() && invSnap.data().active)
          throw Object.assign(new Error("exists"), { code: "exists" });

        tx.set(inviteRef, {
          phone: phoneE164,
          orgId,
          displayName: u.name,
          email: u.email || "",
          role: u.role || "employee",
          active: true,
          claimed: false,
          invitedBy: user.uid,
          invitedByName: user.displayName || user.name || "Admin",
          createdAt: new Date().toISOString(),
        });
        tx.update(orgRef, { seatsUsed: increment(1) });
      });

      logActivity(`Team member invited: ${u.name} (${u.role}) — ${phoneE164}`);
      return { ok: true };
    } catch (e) {
      if (e.code === "seat-limit")
        return { ok: false, error: "Seat limit reached. Upgrade your plan to add more team members." };
      if (e.code === "expired")
        return { ok: false, error: "Trial/subscription khatam. Billing page se plan activate/upgrade karo." };
      if (e.code === "exists")
        return { ok: false, error: "Ye number already invite/add ho chuka hai." };
      if (e.code === "permission-denied")
        return { ok: false, error: "Permission denied — subscription expired ya rules publish nahi hui. Billing page check karo." };
      console.error("Add user error:", e?.code, e?.message);
      return { ok: false, error: `Member add nahi hua (${e?.code || "error"}). Dobara try karo.` };
    }
  };

  const updateUser = async (uid, patch) => {
    if (!user?.activeOrgId) return;
    try { 
      await updateDoc(doc(db, "memberships", `${uid}_${user.activeOrgId}`), patch); 
    } catch (e) { console.error("Update user error:", e); }
  };

  // Deactivate a team member (works for both claimed members and pending invites)
  // and free up their seat. `target` is the user object from the team list.
  const deactivateUser = async (target) => {
    if (!user?.activeOrgId) return { ok: false };
    const orgId = user.activeOrgId;
    const orgRef = doc(db, "organizations", orgId);

    // Pending invite (not yet claimed) → deactivate the invite
    if (target && target.pending && target.inviteId) {
      try {
        await runTransaction(db, async (tx) => {
          const invRef = doc(db, "invites", target.inviteId);
          const invSnap = await tx.get(invRef);
          if (!invSnap.exists() || invSnap.data().active === false) return;
          const orgSnap = await tx.get(orgRef);
          tx.update(invRef, { active: false });
          if (orgSnap.exists()) {
            const used = orgSnap.data().seatsUsed ?? 1;
            tx.update(orgRef, { seatsUsed: Math.max(0, used - 1) });
          }
        });
        logActivity(`Pending invite removed (${target.phone})`);
        return { ok: true };
      } catch (e) {
        console.error("Deactivate invite error:", e?.code, e?.message);
        return { ok: false, error: "Remove nahi hua." };
      }
    }

    // Claimed member → deactivate membership by uid
    const uid = typeof target === "string" ? target : target?.uid || target?.id;
    const memRef = doc(db, "memberships", `${uid}_${orgId}`);
    try {
      await runTransaction(db, async (tx) => {
        const memSnap = await tx.get(memRef);
        if (!memSnap.exists() || memSnap.data().active === false) return;
        const orgSnap = await tx.get(orgRef);
        tx.update(memRef, { active: false });
        if (orgSnap.exists()) {
          const used = orgSnap.data().seatsUsed ?? 1;
          tx.update(orgRef, { seatsUsed: Math.max(0, used - 1) });
        }
      });
      logActivity(`Team member deactivated (${uid})`);
      return { ok: true };
    } catch (e) {
      console.error("Deactivate user error:", e?.code, e?.message);
      return { ok: false, error: "Deactivate nahi hua." };
    }
  };

  // Re-activate a member — consumes a seat, so it's blocked when the plan is
  // full or the subscription/trial has expired.
  const activateUser = async (uid) => {
    if (!user?.activeOrgId) return { ok: false, error: "No active organization" };
    const orgRef = doc(db, "organizations", user.activeOrgId);
    const memRef = doc(db, "memberships", `${uid}_${user.activeOrgId}`);
    try {
      await runTransaction(db, async (tx) => {
        const memSnap = await tx.get(memRef);
        if (!memSnap.exists()) throw Object.assign(new Error("missing"), { code: "missing" });
        if (memSnap.data().active === true) return; // already active
        const orgSnap = await tx.get(orgRef);
        const org = orgSnap.exists() ? orgSnap.data() : {};
        if (org.subscriptionStatus === "expired")
          throw Object.assign(new Error("expired"), { code: "expired" });
        if ((org.seatsUsed ?? 0) >= (org.seatsLimit ?? 0))
          throw Object.assign(new Error("seat"), { code: "seat-limit" });
        tx.update(memRef, { active: true });
        tx.update(orgRef, { seatsUsed: increment(1) });
      });
      logActivity(`Team member re-activated (${uid})`);
      return { ok: true };
    } catch (e) {
      if (e.code === "seat-limit")
        return { ok: false, error: "Seat limit reached. Upgrade your plan to re-activate this member." };
      if (e.code === "expired")
        return { ok: false, error: "Subscription/trial expired. Upgrade to re-activate members." };
      console.error("Activate user error:", e?.code, e?.message);
      return { ok: false, error: "Activate nahi hua." };
    }
  };

  // In-app plan upgrade/downgrade. Updates the org's plan and RAISES the
  // seat & lead limits to the new plan immediately (concern #4).
  // NOTE: with no payment gateway wired yet this is a trusted owner action;
  // when Razorpay is added, gate this behind a verified payment.
  const changePlan = async (limits) => {
    if (!user?.activeOrgId) return { ok: false, error: "No active organization" };
    try {
      await updateDoc(doc(db, "organizations", user.activeOrgId), {
        planId: limits.planId,
        planName: limits.planName,
        seatsLimit: limits.seatsLimit,
        leadsLimit: limits.leadsLimit,
        subscriptionStatus: "active",
        trialEndsAt: null,
      });
      logActivity(`Plan changed to ${limits.planName} (seats: ${limits.seatsLimit})`);
      return { ok: true };
    } catch (e) {
      console.error("Change plan error:", e?.code, e?.message);
      return { ok: false, error: "Plan change nahi hua. Dobara try karo." };
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
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/whatsapp/sync-now`, { method: "POST" });
      return await res.json();
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
      addBulkLeads, addUser, updateUser, deactivateUser, activateUser, pushNotif, markRead, logActivity, setMyGoal,
      triggerWhatsAppSync, changePlan,
    }}>
      {children}
    </DataContext.Provider>
  );
}
