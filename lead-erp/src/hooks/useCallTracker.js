import { useEffect, useRef } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { useData } from "../context/DataContext";
import { useAuth } from "../context/AuthContext";

const CallTracker = registerPlugin("CallTracker");

// Indian numbers arrive as +91987.., 0987.., or 987.. on the phone. In the DB they're stored as 91987...
// So matching on the 'last 10 digits' is the most reliable trick.
const last10 = (num) => (num || "").replace(/\D/g, "").slice(-10);

export function useCallTracker() {
  const { user } = useAuth();
  const { leads, addNote } = useData();
  
  const leadsRef = useRef(leads);
  leadsRef.current = leads;

  useEffect(() => {
    // If it's a web browser or an admin, stay idle
    if (!user || user.role !== "employee" || !Capacitor.isNativePlatform()) return;

    CallTracker.startListening().catch((e) => console.error("Call Tracker start failed:", e));

    const listener = CallTracker.addListener("callEnded", (event) => {
      if (event.duration <= 0) return; // Ignore missed calls or 0-second cuts

      const calledNumber = last10(event.number);
      const matchedLead = leadsRef.current.find((l) => last10(l.phone) === calledNumber);

      if (!matchedLead) return; // Number not found in the ERP means it was a personal call, skip it

      addNote(
        matchedLead.id,
        `${event.type === "outgoing" ? "Outgoing" : "Incoming"} call — auto-logged from Android dialer.`,
        "call",
        {
          duration: event.duration,
          authorId: user.id,
          authorName: user.name,
          authorRole: user.role,
          visibility: "team",
        }
      );
    });

    return () => {
      listener.remove();
      CallTracker.stopListening().catch(() => {});
    };
  }, [user]);
}