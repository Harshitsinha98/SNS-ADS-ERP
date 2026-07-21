/**
 * Notifications & Activity Context.
 *
 * ARCHITECTURAL DECISION: Notifications and activity logs are read-heavy,
 * write-light state that updates frequently (real-time Firestore listeners).
 * Separating them prevents notification badge updates from re-rendering the
 * leads table or team roster.
 */

import { createContext, useContext, useState, useEffect } from "react";
import {
  collection, doc, query, where, orderBy, limit, onSnapshot,
  addDoc, writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";

const NotificationsContext = createContext();
export const useNotifications = () => useContext(NotificationsContext);

const orgCollection = (orgId, collectionName) =>
  collection(db, "organizations", orgId, collectionName);
const orgDoc = (orgId, collectionName, docId) =>
  doc(db, "organizations", orgId, collectionName, docId);

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    if (!user || !user.activeOrgId) {
      setNotifications([]); setActivity([]);
      return;
    }
    const orgId = user.activeOrgId;
    const isAdmin = user.activeOrgRole === "admin" || user.activeOrgRole === "owner";

    const unsubNotifs = onSnapshot(
      query(orgCollection(orgId, "notifications"), where("userId", "==", user.uid)),
      (snap) => setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("Notifications listener error:", err)
    );

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

    return () => { unsubNotifs(); unsubActivity(); };
  }, [user]);

  const pushNotif = async (userId, text) => {
    if (!user?.activeOrgId) return;
    try {
      await addDoc(orgCollection(user.activeOrgId, "notifications"), {
        userId, text, read: false, at: new Date().toISOString(), orgId: user.activeOrgId,
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

  // Audit records are server-authored (kept as no-op for compatibility)
  const logActivity = async () => {};

  return (
    <NotificationsContext.Provider value={{
      notifications, activity, pushNotif, markRead, logActivity,
    }}>
      {children}
    </NotificationsContext.Provider>
  );
}
