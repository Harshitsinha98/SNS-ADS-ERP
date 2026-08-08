import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { initiateBridgeCall, watchBridgeCall } from "../utils/bridgeCallApi";

export function useBridgeCall() {
  const { user } = useAuth();
  const [bridgeState, setBridgeState] = useState("idle");
  const [bridgeError, setBridgeError] = useState("");
  const [bridgeCallId, setBridgeCallId] = useState(null);
  const [bridgeDuration, setBridgeDuration] = useState(0);
  const [bridgeRecording, setBridgeRecording] = useState(null);
  const [bridgeElapsed, setBridgeElapsed] = useState(0);
  const [bridgeDetails, setBridgeDetails] = useState(null); // { agentSeconds, customerSeconds, billedMinutes, costInr }
  const stopWatchRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  // Live timer during in-progress state
  useEffect(() => {
    if (bridgeState === "in-progress") {
      startTimeRef.current = Date.now();
      setBridgeElapsed(0);
      timerRef.current = setInterval(() => {
        setBridgeElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [bridgeState]);

  const startBridgeCall = useCallback(async (lead) => {
    if (!user?.activeOrgId || !lead?.phone) return;
    setBridgeState("initiating"); setBridgeError(""); setBridgeCallId(null);
    setBridgeDuration(0); setBridgeRecording(null); setBridgeElapsed(0); setBridgeDetails(null);

    const result = await initiateBridgeCall({
      orgId: user.activeOrgId, leadId: lead.id, leadPhone: lead.phone, leadName: lead.name || "",
    });

    if (!result.ok) {
      if (result.code === "plan_upgrade_required" || result.code === "wallet_empty") {
        setBridgeState("idle"); setBridgeError(result.error);
        return { fallback: false, error: result.error, code: result.code };
      }
      setBridgeState("failed"); setBridgeError(result.error || "Could not connect.");
      return { fallback: true, error: result.error };
    }

    setBridgeState("ringing"); setBridgeCallId(result.callId);
    const stop = watchBridgeCall(result.callId, (s) => {
      if (s.status === "ringing") setBridgeState("ringing");
      else if (s.status === "in-progress") setBridgeState("in-progress");
      else if (s.status === "completed" || s.status === "wallet-deducted") {
        setBridgeState("completed"); setBridgeDuration(s.durationSeconds || 0);
        setBridgeRecording(s.recordingUrl || null);
        setBridgeDetails({ agentSeconds: s.agentSeconds || 0, customerSeconds: s.customerSeconds || 0, billedMinutes: s.billedMinutes || 0, costInr: s.costInr || 0 });
      } else if (s.status === "failed" || s.status === "no-answer" || s.status === "agent_no_confirm" || s.status === "customer_voicemail") {
        setBridgeState("failed");
        const msgs = { "no-answer": "Lead did not answer.", "agent_no_confirm": "Agent didn't confirm — customer was not dialed.", "customer_voicemail": "Customer voicemail detected — no charge." };
        setBridgeError(msgs[s.status] || "Call failed.");
      }
    });
    stopWatchRef.current = stop;
    return { fallback: false, callId: result.callId };
  }, [user?.activeOrgId]);

  const resetBridgeCall = useCallback(() => {
    if (stopWatchRef.current) stopWatchRef.current();
    setBridgeState("idle"); setBridgeError(""); setBridgeCallId(null);
    setBridgeDuration(0); setBridgeRecording(null); setBridgeElapsed(0); setBridgeDetails(null);
  }, []);

  return { bridgeState, bridgeError, bridgeCallId, bridgeDuration, bridgeRecording, bridgeElapsed, bridgeDetails, startBridgeCall, resetBridgeCall };
}
