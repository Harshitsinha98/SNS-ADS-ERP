import { createContext, useContext, useState, useEffect } from "react";
import {
  collection, doc, onSnapshot, addDoc, updateDoc, setDoc,
  query, orderBy, limit, arrayUnion,
} from "firebase/firestore";
import { db } from "../firebase";

const DataContext = createContext();
export const useData = () => useContext(DataContext);

const DEFAULT_SETTINGS = {
  statuses: ["New", "Ringing", "Meeting Fixed", "Negotiation", "Follow-up", "Closed-Won", "Lost"],
  autoAssign: "round-robin",
};

export function DataProvider({ children }) {
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [notifications, setNotifications] = useState([]);
  const [activity, setActivity] = useState([]);
  const [goals, setGoals] = useState({});

  useEffect(() => {
    const unsubLeads = onSnapshot(collection(db, "leads"), (snap) =>
      setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) =>
      setUsers(snap.docs.map((d) => ({ id: d.id, phone: d.id.replace("+91", ""), ...d.data() })))
    );
    const unsubSettings = onSnapshot(doc(db, "settings", "config"), (d) => {
      if (d.exists()) setSettings(d.data());
    });
    const unsubNotifs = onSnapshot(collection(db, "notifications"), (snap) =>
      setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubActivity = onSnapshot(query(collection(db, "activity"), orderBy("at", "desc"), limit(100)), (snap) =>
      setActivity(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubGoals = onSnapshot(doc(db, "goals", "config"), (d) => {
      if (d.exists()) setGoals(d.data());
    });
    return () => { unsubLeads(); unsubUsers(); unsubSettings(); unsubNotifs(); unsubActivity(); unsubGoals(); };
  }, []);

  const logActivity = (text) => addDoc(collection(db, "activity"), { text, at: new Date().toISOString() });

  const addNote = (id, text, type = "note", extra = {}) =>
    updateDoc(doc(db, "leads", id), {
      notes: arrayUnion({ type, text, at: new Date().toISOString(), ...extra }),
      lastUpdated: new Date().toISOString(),
    });

  const updateLead = async (id, patch) => {
    const payload = { ...patch, lastUpdated: new Date().toISOString() };
    if (patch.status) {
      payload.notes = arrayUnion({ type: "status", text: `Status changed to "${patch.status}"`, at: new Date().toISOString() });
      logActivity(`Lead ${id} status changed to "${patch.status}"`);
    }
    await updateDoc(doc(db, "leads", id), payload);
  };

  const reassignLead = (id, employeeId) => {
    updateLead(id, { assignedTo: employeeId });
    pushNotif(employeeId, `New lead assigned to you (${id})`);
    logActivity(`Lead ${id} reassigned to ${employeeId}`);
  };

  const blacklistLead = (id) => { updateLead(id, { blacklisted: true, status: "Lost" }); logActivity(`Lead ${id} blacklisted`); };

  const leastLoaded = (emps) => {
    const counts = {};
    emps.forEach((e) => (counts[e.id] = leads.filter((l) => l.assignedTo === e.id).length));
    return emps.sort((a, b) => counts[a.id] - counts[b.id])[0]?.id;
  };

  const addBulkLeads = async (rows, assigner) => {
    const emps = users.filter((u) => u.role === "employee");
    let rr = 0, count = 0;
    for (const r of rows) {
      const assignedTo = assigner === "workload" ? leastLoaded(emps) : emps[(rr++) % emps.length]?.id;
      await addDoc(collection(db, "leads"), {
        name: r.name || r.Name || "Unknown",
        phone: r.phone || r.Phone || "",
        email: r.email || r.Email || "",
        source: r.source || r.Source || "Import",
        requirement: r.requirement || r.Requirement || "",
        status: "New", assignedTo, blacklisted: false, value: 0, priority: "Warm",
        createdAt: new Date().toISOString(), lastUpdated: new Date().toISOString(),
        followUp: null, notes: [],
      });
      count++;
    }
    return count;
  };

  const addUser = (u) => setDoc(doc(db, "users", "+91" + u.phone), { name: u.name, role: u.role, active: true });
  const updateUser = (id, patch) => updateDoc(doc(db, "users", id), patch);
  const deactivateUser = (id) => updateUser(id, { active: false });

  const pushNotif = (userId, text) => addDoc(collection(db, "notifications"), { userId, text, read: false, at: new Date().toISOString() });
  const markRead = async (userId) => {
    const mine = notifications.filter((n) => n.userId === userId && !n.read);
    await Promise.all(mine.map((n) => updateDoc(doc(db, "notifications", n.id), { read: true })));
  };

  const setMyGoal = (empId, target) => setDoc(doc(db, "goals", "config"), { ...goals, [empId]: Number(target) || 0 }, { merge: true });
  const setSettingsValue = (s) => setDoc(doc(db, "settings", "config"), s, { merge: true });

  // Manual "Sync now" button — backend ko trigger karta hai, Firestore listener khud refresh ho jayega
  const triggerWhatsAppSync = async () => {
    const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/whatsapp/sync-now`, { method: "POST" });
    return res.json();
  };

  return (
    <DataContext.Provider value={{
      leads, users, settings, notifications, activity, goals,
      setSettings: setSettingsValue, updateLead, addNote, reassignLead, blacklistLead,
      addBulkLeads, addUser, updateUser, deactivateUser, pushNotif, markRead, logActivity, setMyGoal,
      triggerWhatsAppSync,
    }}>
      {children}
    </DataContext.Provider>
  );
}