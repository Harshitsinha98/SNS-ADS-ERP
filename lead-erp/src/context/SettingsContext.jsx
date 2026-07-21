/**
 * Settings & Goals Context.
 *
 * ARCHITECTURAL DECISION: Settings and goals are org-level configuration that
 * changes rarely (admin actions only). Separating them:
 * 1. Prevents settings updates from re-rendering all lead/team components.
 * 2. Co-locates the default settings constant with its consumer.
 * 3. Makes it clear which components depend on org configuration.
 */

import { createContext, useContext, useState, useEffect } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";

const SettingsContext = createContext();
export const useSettings = () => useContext(SettingsContext);

const DEFAULT_SETTINGS = {
  statuses: ["New", "Ringing", "Meeting Fixed", "Negotiation", "Follow-up", "Closed-Won", "Lost"],
  autoAssign: "round-robin",
  followUpAutomation: {
    enabled: true,
    reminderMinutesBefore: 30,
    overdueEscalationMinutes: 60,
  },
};

const orgDoc = (orgId, collectionName, docId) =>
  doc(db, "organizations", orgId, collectionName, docId);

export function SettingsProvider({ children }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [goals, setGoals] = useState({});

  useEffect(() => {
    if (!user || !user.activeOrgId) {
      setSettings(DEFAULT_SETTINGS); setGoals({});
      return;
    }
    const orgId = user.activeOrgId;
    const isAdmin = user.activeOrgRole === "admin" || user.activeOrgRole === "owner";

    const unsubSettings = onSnapshot(
      orgDoc(orgId, "settings", "config"),
      (d) => { if (d.exists()) setSettings(d.data()); },
      (err) => console.error("Settings listener error:", err)
    );

    let unsubGoals = () => {};
    if (isAdmin) {
      unsubGoals = onSnapshot(
        orgDoc(orgId, "goals", "config"),
        (d) => { if (d.exists()) setGoals(d.data()); },
        (err) => console.error("Goals listener error:", err)
      );
    } else {
      setGoals({});
    }

    return () => { unsubSettings(); unsubGoals(); };
  }, [user]);

  const setSettingsValue = async (s) => {
    if (!user?.activeOrgId) throw new Error("No active organization selected");
    try {
      await setDoc(orgDoc(user.activeOrgId, "settings", "config"), s, { merge: true });
    } catch (e) { console.error("Set settings error:", e); throw e; }
  };

  const setMyGoal = async (empId, target) => {
    if (!user?.activeOrgId) return;
    try {
      await setDoc(orgDoc(user.activeOrgId, "goals", "config"), {
        ...goals, [empId]: Number(target) || 0, orgId: user.activeOrgId,
      }, { merge: true });
    } catch (e) { console.error("Set goal error:", e); }
  };

  return (
    <SettingsContext.Provider value={{
      settings, goals, setSettings: setSettingsValue, setMyGoal,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}
