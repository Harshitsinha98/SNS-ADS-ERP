import { createContext, useContext, useState, useEffect } from "react";
import {
  collection, doc, onSnapshot, addDoc, updateDoc, setDoc,
  query, orderBy, limit, arrayUnion, writeBatch // NAYA: writeBatch import kiya
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
  
  // States
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [notifications, setNotifications] = useState([]);
  const [activity, setActivity] = useState([]);
  const [goals, setGoals] = useState({});

  // ==========================================
  // 1. FIREBASE REALTIME LISTENERS
  // ==========================================
  useEffect(() => {
    // Login hone se pehle listener mat lagao — warna permission-denied aayega
    if (!user) {
      setLeads([]); setUsers([]); setNotifications([]); setActivity([]); setGoals({});
      return;
    }

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
  }, [user]);


  // ==========================================
  // 2. ACTIVITY & LOGGING
  // ==========================================
  const logActivity = async (text) => {
    try {
      await addDoc(collection(db, "activity"), { text, at: new Date().toISOString() });
    } catch (e) { console.error("Error logging activity:", e); }
  };


  // ==========================================
  // 3. LEAD OPERATIONS
  // ==========================================
  const addNote = async (id, text, type = "note", extra = {}) => {
    try {
      await updateDoc(doc(db, "leads", id), {
        notes: arrayUnion({ type, text, at: new Date().toISOString(), ...extra }),
        lastUpdated: new Date().toISOString(),
      });
    } catch (e) { console.error("Error adding note:", e); }
  };

  const updateLead = async (id, patch) => {
    try {
      const payload = { ...patch, lastUpdated: new Date().toISOString() };
      
      if (patch.status) {
        payload.notes = arrayUnion({ 
          type: "status", 
          text: `Status changed to "${patch.status}"`, 
          at: new Date().toISOString() 
        });
        logActivity(`Lead ${id} status changed to "${patch.status}"`);
      }
      await updateDoc(doc(db, "leads", id), payload);
    } catch (e) { console.error("Error updating lead:", e); }
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


  // ==========================================
  // 4. BULK IMPORT & ASSIGNMENT (OPTIMIZED)
  // ==========================================
  const addBulkLeads = async (rows, assigner) => {
    try {
      const emps = users.filter((u) => u.role === "employee");
      if (emps.length === 0) {
        alert("No employees available to assign leads.");
        return 0;
      }

      const batch = writeBatch(db); // 🔥 BATCH WRITER: Super fast upload
      let rr = 0;
      let count = 0;
      
      // Workload optimization (Loop ke bahar ek baar calculate karo)
      const currentWorkloads = {};
      if (assigner === "workload") {
        emps.forEach(e => {
          currentWorkloads[e.id] = leads.filter(l => l.assignedTo === e.id).length;
        });
      }

      for (const r of rows) {
        let assignedTo;
        
        if (assigner === "workload") {
          // Find employee with minimum leads locally
          assignedTo = Object.keys(currentWorkloads).reduce((a, b) => currentWorkloads[a] < currentWorkloads[b] ? a : b);
          currentWorkloads[assignedTo]++; // Naya lead milne par count badha do
        } else {
          assignedTo = emps[(rr++) % emps.length]?.id;
        }

        const newLeadRef = doc(collection(db, "leads")); // Naya document reference
        batch.set(newLeadRef, {
          name: r.name || r.Name || "Unknown",
          phone: r.phone || r.Phone || "",
          email: r.email || r.Email || "",
          source: r.source || r.Source || "Import",
          requirement: r.requirement || r.Requirement || "",
          status: "New", 
          assignedTo, 
          blacklisted: false, 
          value: 0, 
          priority: "Warm",
          createdAt: new Date().toISOString(), 
          lastUpdated: new Date().toISOString(),
          followUp: null, 
          notes: [],
        });
        count++;

        // Firebase 1 batch mein max 500 allow karta hai. 
        if (count % 450 === 0) {
          await batch.commit(); // Pehle 450 upload karo
        }
      }
      
      await batch.commit(); // Baaki bache hue upload karo
      return count;
    } catch (e) {
      console.error("Bulk Import Error:", e);
      return 0;
    }
  };


  // ==========================================
  // 5. USER OPERATIONS
  // ==========================================
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


  // ==========================================
  // 6. NOTIFICATIONS
  // ==========================================
  const pushNotif = async (userId, text) => {
    try {
      await addDoc(collection(db, "notifications"), { userId, text, read: false, at: new Date().toISOString() });
    } catch (e) { console.error("Push notif error:", e); }
  };

  const markRead = async (userId) => {
    try {
      const mine = notifications.filter((n) => n.userId === userId && !n.read);
      if (mine.length === 0) return;

      const batch = writeBatch(db); // 🔥 BATCH WRITER: Ek sath sab mark read honge
      mine.forEach((n) => {
        batch.update(doc(db, "notifications", n.id), { read: true });
      });
      await batch.commit();
    } catch (e) { console.error("Mark read error:", e); }
  };


  // ==========================================
  // 7. SETTINGS & SYNC
  // ==========================================
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
      leads, users, settings, notifications, activity, goals,
      setSettings: setSettingsValue, updateLead, addNote, reassignLead, blacklistLead,
      addBulkLeads, addUser, updateUser, deactivateUser, pushNotif, markRead, logActivity, setMyGoal,
      triggerWhatsAppSync,
    }}>
      {children}
    </DataContext.Provider>
  );
}