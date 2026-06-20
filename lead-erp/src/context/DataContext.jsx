import { createContext, useContext, useState, useEffect } from "react";
import { seedLeads, seedUsers, seedSettings } from "../data/seed";
import { fetchWhatsAppLeads } from "../utils/whatsapp";

const DataContext = createContext();
export const useData = () => useContext(DataContext);

const load = (key, fallback) => {
  const s = localStorage.getItem(key);
  return s ? JSON.parse(s) : fallback;
};

const loadUsers = (seedUsers) => {
  const s = localStorage.getItem("erp_users");
  if (!s) return seedUsers;
  try {
    const parsed = JSON.parse(s);
    const isValid = Array.isArray(parsed) && parsed.length > 0 && parsed.every((u) => u.phone);
    return isValid ? parsed : seedUsers;
  } catch {
    return seedUsers;
  }
};

export function DataProvider({ children }) {
  const [leads, setLeads] = useState(() => load("erp_leads", seedLeads));
  const [users, setUsers] = useState(() => loadUsers(seedUsers));
  const [settings, setSettings] = useState(() => load("erp_settings", seedSettings));
  const [notifications, setNotifications] = useState(() => load("erp_notifs", []));
  const [activity, setActivity] = useState(() => load("erp_activity", []));
  const [goals, setGoals] = useState(() => load("erp_goals", {}));

  useEffect(() => localStorage.setItem("erp_leads", JSON.stringify(leads)), [leads]);
  useEffect(() => localStorage.setItem("erp_users", JSON.stringify(users)), [users]);
  useEffect(() => localStorage.setItem("erp_settings", JSON.stringify(settings)), [settings]);
  useEffect(() => localStorage.setItem("erp_notifs", JSON.stringify(notifications)), [notifications]);
  useEffect(() => localStorage.setItem("erp_activity", JSON.stringify(activity)), [activity]);
  useEffect(() => localStorage.setItem("erp_goals", JSON.stringify(goals)), [goals]);

  const logActivity = (text) =>
    setActivity((prev) => [{ id: Date.now(), text, at: new Date().toISOString() }, ...prev].slice(0, 100));

  // type: "note" | "call" | "whatsapp" | "status"   extra: { duration, by }
  const addNote = (id, text, type = "note", extra = {}) =>
    setLeads((prev) =>
      prev.map((l) =>
        l.id === id
          ? { ...l, notes: [...l.notes, { type, text, at: new Date().toISOString(), ...extra }], lastUpdated: new Date().toISOString() }
          : l
      )
    );

  const updateLead = (id, patch) => {
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, ...patch, lastUpdated: new Date().toISOString() };
        if (patch.status && patch.status !== l.status) {
          updated.notes = [...l.notes, { type: "status", text: `Status changed to "${patch.status}"`, at: new Date().toISOString() }];
        }
        return updated;
      })
    );
    if (patch.status) logActivity(`Lead ${id} status changed to "${patch.status}"`);
  };

  const reassignLead = (id, employeeId) => {
    updateLead(id, { assignedTo: employeeId });
    pushNotif(employeeId, `New lead assigned to you (${id})`);
    logActivity(`Lead ${id} reassigned to ${employeeId}`);
  };

  const blacklistLead = (id) => {
    updateLead(id, { blacklisted: true, status: "Lost" });
    logActivity(`Lead ${id} blacklisted`);
  };

  const addBulkLeads = (rows, assigner) => {
    const emps = users.filter((u) => u.role === "employee");
    let rr = 0;
    const mapped = rows.map((r) => {
      const assignedTo = assigner === "workload" ? leastLoaded(emps) : emps[(rr++) % emps.length]?.id;
      return {
        id: "L" + Math.floor(10000 + Math.random() * 89999),
        name: r.name || r.Name || "Unknown",
        phone: r.phone || r.Phone || "",
        email: r.email || r.Email || "",
        source: r.source || r.Source || "Import",
        requirement: r.requirement || r.Requirement || "",
        status: "New", assignedTo, blacklisted: false, value: 0, priority: "Warm",
        createdAt: new Date().toISOString(), lastUpdated: new Date().toISOString(),
        followUp: null, notes: [],
      };
    });
    setLeads((prev) => [...mapped, ...prev]);
    return mapped.length;
  };

  const leastLoaded = (emps) => {
    const counts = {};
    emps.forEach((e) => (counts[e.id] = leads.filter((l) => l.assignedTo === e.id).length));
    return emps.sort((a, b) => counts[a.id] - counts[b.id])[0]?.id;
  };

  const addUser = (u) => setUsers((prev) => [...prev, { ...u, id: "emp" + (prev.length + 1) }]);
  const updateUser = (id, patch) => setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  const deactivateUser = (id) => updateUser(id, { active: false });

  const pushNotif = (userId, text) =>
    setNotifications((prev) => [{ id: Date.now(), userId, text, read: false, at: new Date().toISOString() }, ...prev]);
  const markRead = (userId) =>
    setNotifications((prev) => prev.map((n) => (n.userId === userId ? { ...n, read: true } : n)));

  const mergeWhatsAppLeads = async () => {
    const waLeads = await fetchWhatsAppLeads();
    if (!waLeads.length) return 0;

    const emps = users.filter((u) => u.role === "employee" && u.active !== false);
    if (!emps.length) return 0;

    let rr = 0;
    let added = 0;
    const newlyAdded = [];

    setLeads((prev) => {
      const existingPhones = new Set(prev.map((l) => l.phone));
      const counts = {};
      emps.forEach((e) => (counts[e.id] = prev.filter((l) => l.assignedTo === e.id).length));

      const fresh = waLeads
        .filter((w) => !existingPhones.has(w.phone))
        .map((w) => {
          let assignedTo;
          if (settings.autoAssign === "workload") {
            assignedTo = emps.sort((a, b) => counts[a.id] - counts[b.id])[0]?.id;
            counts[assignedTo] = (counts[assignedTo] || 0) + 1;
          } else {
            assignedTo = emps[rr % emps.length]?.id;
            rr++;
          }
          added++;
          const lead = { ...w, assignedTo, priority: w.priority || "Warm", value: w.value || 0, notes: w.notes || [] };
          newlyAdded.push(lead);
          return lead;
        });

      return [...fresh, ...prev];
    });

    newlyAdded.forEach((lead) => {
      pushNotif(lead.assignedTo, `New WhatsApp lead: ${lead.name} (${lead.id})`);
      logActivity(`📲 WhatsApp lead auto-imported: ${lead.name} → ${lead.assignedTo}`);
    });

    return added;
  };

  useEffect(() => {
    const interval = setInterval(() => { mergeWhatsAppLeads(); }, 20000);
    return () => clearInterval(interval);
  }, [users, settings]);

  const setMyGoal = (empId, target) => setGoals((prev) => ({ ...prev, [empId]: Number(target) || 0 }));

  return (
    <DataContext.Provider
      value={{
        leads, users, settings, notifications, activity, goals,
        setSettings, updateLead, addNote, reassignLead, blacklistLead,
        addBulkLeads, addUser, updateUser, deactivateUser, pushNotif, markRead,
        mergeWhatsAppLeads, logActivity, setMyGoal,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}