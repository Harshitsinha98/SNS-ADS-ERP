import { createContext, useContext, useState, useEffect } from "react";
import {
  collection, collectionGroup, doc, onSnapshot, addDoc, updateDoc, setDoc,
  query, where, orderBy, limit, writeBatch
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";

const DataContext = createContext();
export const useData = () => useContext(DataContext);

const DEFAULT_SETTINGS = {
  statuses: ["New", "Ringing", "Meeting Fixed", "Negotiation", "Follow-up", "Closed-Won", "Lost"],
  autoAssign: "round-robin",
};

export function DataProvider({ children }) {
  const { user } = useAuth();

  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [notifications, setNotifications] = useState([]);
  const [activity, setActivity] = useState([]);
  const [goals, setGoals] = useState({});
  const [financials, setFinancials] = useState({});

  useEffect(() => {
    if (!user) {
      setLeads([]); setUsers([]); setNotifications([]); setActivity([]); setGoals({}); setFinancials({});
      return;
    }

    const leadsQuery = user.role === "admin"
      ? collection(db, "leads")
      : query(collection(db, "leads"), where("assignedTo", "==", user.id));

    const unsubLeads = onSnapshot(
      leadsQuery,
      (snap) => setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("Leads listener error:", err)
    );

    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snap) => setUsers(snap.docs.map((d) => ({ id: d.id, phone: d.id.replace("+91", ""), ...d.data() }))),
      (err) => console.error("Users listener error:", err)
    );

    const unsubSettings = onSnapshot(doc(db, "settings", "config"), (d) => {
      if (d.exists()) setSettings(d.data());
    }, (err) => console.error("Settings listener error:", err));

    const unsubNotifs = onSnapshot(
      query(collection(db, "notifications"), where("userId", "==", user.id)),
      (snap) => setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("Notifications listener error:", err)
    );

    let unsubActivity = () => {};
    if (user.role === "admin") {
      unsubActivity = onSnapshot(
        query(collection(db, "activity"), orderBy("at", "desc"), limit(100)),
        (snap) => setActivity(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => console.error("Activity listener error:", err)
      );
    } else {
      setActivity([]);
    }

    let unsubGoals = () => {};
    if (user.role === "admin") {
      unsubGoals = onSnapshot(doc(db, "goals", "config"), (d) => {
        if (d.exists()) setGoals(d.data());
      }, (err) => console.error("Goals listener error:", err));
    } else {
      setGoals({});
    }

    let unsubFinancials = () => {};
    if (user.role === "admin") {
      unsubFinancials = onSnapshot(collectionGroup(db, "private"), (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          const leadId = d.ref.parent.parent.id;
          map[leadId] = d.data();
        });
        setFinancials(map);
      }, (err) => console.error("Financials listener error:", err));
    } else {
      setFinancials({});
    }

    return () => { unsubLeads(); unsubUsers(); unsubSettings(); unsubNotifs(); unsubActivity(); unsubGoals(); unsubFinancials(); };
  }, [user]);


  const logActivity = async (text) => {
    try {
      await addDoc(collection(db, "activity"), { text, at: new Date().toISOString() });
    } catch (e) { console.error("Error logging activity:", e); }
  };


  const writeNote = async (leadId, noteData) => {
    try {
      await addDoc(collection(db, "leads", leadId, "notes"), {
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
    try { await updateDoc(doc(db, "leads", id), patch); } catch (e) { console.error(e); }
  };

  const addWorknote = (id, text, user, extra = {}) => {
    const visibility = user?.role === "admin" ? (extra.visibility || "admin_only") : "team";
    addNote(id, text, "worknote", {
      authorId: user?.id || user?.uid || null,
      authorName: user?.name || "Unknown",
      authorRole: user?.role || "employee",
      visibility,
    });
    logActivity(`Worknote added on lead ${id} by ${user?.name || "Unknown"}`);
  };

  const updateLead = async (id, patch, user) => {
    try {
      await updateDoc(doc(db, "leads", id), { ...patch, lastUpdated: new Date().toISOString() });
      if (patch.status) {
        await writeNote(id, {
          type: "status",
          text: `Status changed to "${patch.status}"${user?.name ? ` by ${user.name}` : ""}`,
          visibility: "team",
          authorName: user?.name || "System",
        });
        logActivity(`Lead ${id} status changed to "${patch.status}"`);
      }
    } catch (e) { console.error("Error updating lead:", e); }
  };

  const updateLeadStatus = (id, status, user) => updateLead(id, { status }, user);

  const updatePriority = async (id, priority, user) => {
    try {
      await updateDoc(doc(db, "leads", id), { priority, lastUpdated: new Date().toISOString() });
      await writeNote(id, {
        type: "system",
        text: `Priority changed to "${priority}"${user?.name ? ` by ${user.name}` : ""}`,
        visibility: "team",
        authorName: user?.name || "System",
      });
    } catch (e) { console.error("Error updating priority:", e); }
  };

  const updateFollowUpDate = async (id, date, user) => {
    try {
      await updateDoc(doc(db, "leads", id), { followUp: date, lastUpdated: new Date().toISOString() });
      await writeNote(id, {
        type: "system",
        text: `Follow-up date updated${user?.name ? ` by ${user.name}` : ""}`,
        visibility: "team",
        authorName: user?.name || "System",
      });
    } catch (e) { console.error("Error updating follow-up date:", e); }
  };

  const updateLeadRevenue = async (id, revenue, user) => {
    try {
      await setDoc(doc(db, "leads", id, "private", "data"), {
        revenue: Number(revenue) || 0,
        revenueUpdatedBy: user?.name || "Unknown",
        revenueUpdatedAt: new Date().toISOString(),
      }, { merge: true });
      logActivity(`Revenue updated on lead ${id} → ₹${revenue} by ${user?.name || "Unknown"}`);
    } catch (e) { console.error("Error updating revenue:", e); }
  };

  const reassignLead = async (id, employeeId, employeeName, user) => {
    await updateLead(id, { assignedTo: employeeId, assignedToName: employeeName || null });
    await writeNote(id, {
      type: "assignment",
      text: `Reassigned to ${employeeName || employeeId}${user?.name ? ` by ${user.name}` : ""}`,
      visibility: "team",
      authorName: user?.name || "System",
    });
    pushNotif(employeeId, `New lead assigned to you (${id})`);
    logActivity(`Lead ${id} reassigned to ${employeeName || employeeId}`);
  };

  // NEW: deactivate/delete hone wale employee ki saari OPEN leads (Closed-Won/Lost
  // ke alawa) ek saath kisi aur employee ko move karne ke liye — taaki koi lead
  // orphan na ho jaaye (jisko koi bhi employee apni "My Leads" mein na dekh paaye).
  const reassignAllLeads = async (fromEmployeeId, toEmployeeId, toEmployeeName, user) => {
    try {
      const openLeads = leads.filter(
        (l) => l.assignedTo === fromEmployeeId && !["Closed-Won", "Lost"].includes(l.status)
      );
      if (openLeads.length === 0) return 0;

      const batch = writeBatch(db);
      openLeads.forEach((l) => {
        batch.update(doc(db, "leads", l.id), {
          assignedTo: toEmployeeId,
          assignedToName: toEmployeeName || null,
          lastUpdated: new Date().toISOString(),
        });
      });
      await batch.commit();

      await Promise.all(openLeads.map((l) =>
        writeNote(l.id, {
          type: "assignment",
          text: `Bulk-reassigned to ${toEmployeeName || toEmployeeId}${user?.name ? ` by ${user.name}` : ""} (previous employee deactivated)`,
          visibility: "team",
          authorName: user?.name || "System",
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


  const addBulkLeads = async (rows, assigner) => {
    try {
      const emps = users.filter((u) => u.role === "employee");
      if (emps.length === 0) {
        alert("No employees available to assign leads.");
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

        const newLeadRef = doc(collection(db, "leads"));
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


  const addUser = async (u) => {
    try {
      await setDoc(doc(db, "users", "+91" + u.phone), { name: u.name, role: u.role, active: true });
    } catch (e) { console.error("Add user error:", e); }
  };

  const updateUser = async (id, patch) => {
    try { await updateDoc(doc(db, "users", id), patch); }
    catch (e) { console.error("Update user error:", e); }
  };

  const deactivateUser = (id) => updateUser(id, { active: false });


  const pushNotif = async (userId, text) => {
    try {
      await addDoc(collection(db, "notifications"), { userId, text, read: false, at: new Date().toISOString() });
    } catch (e) { console.error("Push notif error:", e); }
  };

  const markRead = async (userId) => {
    try {
      const mine = notifications.filter((n) => n.userId === userId && !n.read);
      if (mine.length === 0) return;
      const batch = writeBatch(db);
      mine.forEach((n) => batch.update(doc(db, "notifications", n.id), { read: true }));
      await batch.commit();
    } catch (e) { console.error("Mark read error:", e); }
  };


  const setMyGoal = async (empId, target) => {
    try { await setDoc(doc(db, "goals", "config"), { ...goals, [empId]: Number(target) || 0 }, { merge: true }); }
    catch (e) { console.error("Set goal error:", e); }
  };

  const setSettingsValue = async (s) => {
    try { await setDoc(doc(db, "settings", "config"), s, { merge: true }); }
    catch (e) { console.error("Set settings error:", e); }
  };

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
      addBulkLeads, addUser, updateUser, deactivateUser, pushNotif, markRead, logActivity, setMyGoal,
      triggerWhatsAppSync,
    }}>
      {children}
    </DataContext.Provider>
  );
}