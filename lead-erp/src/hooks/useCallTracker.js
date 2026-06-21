import { useEffect, useRef } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { useData } from "../context/DataContext";
import { useAuth } from "../context/AuthContext";

const CallTracker = registerPlugin("CallTracker");

// Indian numbers phone me +91987.., 0987.., ya 987.. aate hain. DB me 91987.. hote hain.
// Isliye 'aakhiri 10 digit' ka match sabse solid trick hai.
const last10 = (num) => (num || "").replace(/\D/g, "").slice(-10);

export function useCallTracker() {
  const { user } = useAuth();
  const { leads, addNote } = useData();
  
  const leadsRef = useRef(leads);
  leadsRef.current = leads;

  useEffect(() => {
    // Agar web browser hai ya admin hai, toh chup raho
    if (!user || user.role !== "employee" || !Capacitor.isNativePlatform()) return;

    CallTracker.startListening().catch((e) => console.error("Call Tracker start failed:", e));

    const listener = CallTracker.addListener("callEnded", (event) => {
      if (event.duration <= 0) return; // Missed call ya 0 sec cut ko ignore maaro

      const calledNumber = last10(event.number);
      const matchedLead = leadsRef.current.find((l) => last10(l.phone) === calledNumber);

      if (!matchedLead) return; // Number ERP me nahi mila matlab personal call tha, skip karo

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