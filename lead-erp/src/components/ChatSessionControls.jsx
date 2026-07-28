/**
 * Chat Session Controls.
 *
 * Displayed on the Lead Detail page (admin view). Shows:
 * - Current AI status (active/paused) for the lead
 * - Take Over button (admin takes over from AI)
 * - Re-enable AI button (give control back to AI)
 * - Active session info (who's handling, when started)
 */

import { useState } from "react";
import { Brain, UserCheck, Loader2, RotateCcw, AlertCircle } from "lucide-react";
import { takeOverLead, reEnableAI } from "../utils/chatSessionApi";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";

export default function ChatSessionControls({ lead, orgId, onUpdate }) {
  const { user } = useAuth();
  const { users } = useData();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const aiActive = lead?.aiEnabled !== false;
  const hasActiveSession = Boolean(lead?.activeChatSessionId);

  const handleTakeOver = async () => {
    setLoading(true); setError("");
    try {
      await takeOverLead(orgId, lead.id, "manual_takeover");
      if (onUpdate) onUpdate();
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleReEnableAI = async () => {
    setLoading(true); setError("");
    try {
      await reEnableAI(orgId, lead.id);
      if (onUpdate) onUpdate();
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div className="bg-white rounded-xl shadow border p-5">
      <div className="flex items-center gap-2 mb-3">
        <Brain size={18} className={aiActive ? "text-purple-600" : "text-red-500"} />
        <h3 className="font-semibold text-sm">AI Status</h3>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600 mb-3">
          <AlertCircle size={12} /> {error}
        </div>
      )}

      {aiActive ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm text-emerald-700 font-medium">AI is active — auto-replying to messages</span>
          </div>
          <button onClick={handleTakeOver} disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-orange-200 bg-orange-50 text-orange-700 text-sm font-medium hover:bg-orange-100 transition-colors disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
            Take Over (Disable AI for this lead)
          </button>
          <p className="text-[11px] text-ink-muted">AI will stop replying. You or your team will handle this customer manually.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-sm text-red-700 font-medium">AI paused — human handling</span>
          </div>
          {hasActiveSession && (
            <div className="text-xs text-ink-muted bg-cream-50 rounded-lg p-2.5">
              <p><strong>Session:</strong> {lead.activeChatSessionEmployee === user?.uid ? "You" : (users.find((u) => u.uid === lead.activeChatSessionEmployee || u.id === lead.activeChatSessionEmployee)?.name || "Agent")} handling this conversation.</p>
              {lead.aiDisabledAt && <p className="mt-1">Since: {new Date(lead.aiDisabledAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</p>}
            </div>
          )}
          <button onClick={handleReEnableAI} disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            Re-enable AI for this lead
          </button>
          <p className="text-[11px] text-ink-muted">AI will resume auto-replying to new messages from this customer.</p>
        </div>
      )}
    </div>
  );
}
