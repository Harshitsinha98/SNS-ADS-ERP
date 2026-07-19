import { useEffect, useRef } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { useData } from "../context/DataContext";
import { useAuth } from "../context/AuthContext";

const CallTracker = registerPlugin("CallTracker");
const last10 = (number) => String(number || "").replace(/\D/g, "").slice(-10);
const STORAGE_KEY = "codeskate_processed_call_ids";

function readProcessedIds() {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")); }
  catch { return new Set(); }
}

function saveProcessedIds(ids) {
  const newest = Array.from(ids).slice(-200);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newest));
}

// Android-only optional helper. It never replaces the reliable in-app
// call/outcome workflow: Android/OEM background restrictions can still stop a
// process while the app is closed. Stable call-log IDs prevent duplicate notes
// when the bridge remounts or an event is delivered twice.
export function useCallTracker() {
  const { user } = useAuth();
  const { leads, addNote } = useData();
  const leadsRef = useRef(leads);
  const processedIdsRef = useRef(readProcessedIds());
  const inFlightCallIdsRef = useRef(new Set());
  leadsRef.current = leads;

  useEffect(() => {
    if (!user || user.activeOrgRole !== "employee" || !Capacitor.isNativePlatform()) return undefined;
    let disposed = false;
    let listenerHandle;

    const processCall = async (event) => {
      const callId = event?.id;
      if (!callId || event.duration <= 0 || processedIdsRef.current.has(callId) || inFlightCallIdsRef.current.has(callId)) return;
      const matchedLead = leadsRef.current.find((lead) => last10(lead.phone) === last10(event.number));
      if (!matchedLead) {
        // Personal/unmatched calls never enter the CRM, but must still advance
        // the native cursor so they do not block later completed calls.
        await CallTracker.markCallProcessed({ id: callId }).catch(() => {});
        return;
      }

      inFlightCallIdsRef.current.add(callId);
      try {
        const saved = await addNote(
          matchedLead.id,
          `${event.type === "outgoing" ? "Outgoing" : "Incoming"} call logged from Android dialer.`,
          "call",
          {
            callLogId: callId,
            callStartedAt: event.date || null,
            duration: event.duration,
            authorId: user.uid,
            authorName: user.displayName || "Employee",
            authorRole: user.activeOrgRole,
            visibility: "team",
          }
        );
        if (!saved) return;
        await CallTracker.markCallProcessed({ id: callId });
        processedIdsRef.current.add(callId);
        saveProcessedIds(processedIdsRef.current);
      } catch (error) {
        console.warn("Call activity was not persisted; it will be retried:", error?.message || error);
      } finally {
        inFlightCallIdsRef.current.delete(callId);
      }
    };

    const start = async () => {
      try {
        listenerHandle = await CallTracker.addListener("callEnded", processCall);
        if (disposed) {
          await listenerHandle.remove();
          return;
        }
        await CallTracker.startListening();
        const pendingCall = await CallTracker.getLastCall();
        if (pendingCall?.found) await processCall(pendingCall);
      } catch (error) {
        console.warn("Call tracker is unavailable:", error?.message || error);
      }
    };
    start();

    return () => {
      disposed = true;
      Promise.resolve(listenerHandle?.remove?.()).catch(() => {});
      CallTracker.stopListening().catch(() => {});
    };
  }, [user?.uid, user?.activeOrgRole]);
}
