/**
 * Module 12: Support Center — real ticket management.
 * Shows all support tickets raised by customers, with reply + status management.
 */
import { useState, useEffect } from "react";
import PlatformShell from "./components/PlatformShell";
import SectionCard from "./components/SectionCard";
import { auth } from "../../firebase";
import {
  HelpCircle, Loader2, MessageSquare, CheckCircle2, Clock, AlertCircle,
  Send, ChevronDown, ChevronUp, User, Building2,
} from "lucide-react";

const BASE = import.meta.env.VITE_BACKEND_URL || "https://api.codeskate.com";

async function platformGet(path) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function platformPost(path, body) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({}));
}

const fmtDate = (ts) => {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

const STATUS_BADGE = {
  open: { bg: "bg-orange-100 text-orange-700", icon: AlertCircle, label: "Open" },
  in_progress: { bg: "bg-blue-100 text-blue-700", icon: Clock, label: "In Progress" },
  resolved: { bg: "bg-green-100 text-green-700", icon: CheckCircle2, label: "Resolved" },
  closed: { bg: "bg-gray-100 text-gray-500", icon: CheckCircle2, label: "Closed" },
};

function TicketCard({ ticket, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const badge = STATUS_BADGE[ticket.status] || STATUS_BADGE.open;
  const BadgeIcon = badge.icon;

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setReplying(true);
    await platformPost(`/api/v1/platform/support-tickets/${ticket.id}/reply`, { text: replyText });
    setReplyText("");
    setReplying(false);
    onUpdate();
  };

  const handleStatusChange = async (status) => {
    await platformPost(`/api/v1/platform/support-tickets/${ticket.id}/status`, { status });
    onUpdate();
  };

  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-cream-50" onClick={() => setExpanded(!expanded)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-medium text-sm text-ink truncate">{ticket.ticketNumber ? `${ticket.ticketNumber} — ` : ""}{ticket.subject}</p>
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${badge.bg}`}>
              <BadgeIcon size={10} /> {badge.label}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-ink-muted">
            <span className="flex items-center gap-1"><User size={10} /> {ticket.userName}</span>
            {ticket.orgName && <span className="flex items-center gap-1"><Building2 size={10} /> {ticket.orgName}</span>}
            <span>{fmtDate(ticket.createdAt)}</span>
            <span className="capitalize">{ticket.priority}</span>
          </div>
        </div>
        {expanded ? <ChevronUp size={16} className="text-ink-muted" /> : <ChevronDown size={16} className="text-ink-muted" />}
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="border-t px-5 py-4 space-y-3">
          {/* Description */}
          {ticket.description && (
            <div className="bg-cream-50 rounded-lg p-3 text-sm text-ink">{ticket.description}</div>
          )}

          {/* AI conversation history */}
          {ticket.conversationHistory?.length > 0 && (
            <div>
              <p className="text-[10px] uppercase font-semibold text-ink-muted mb-1.5">AI Chat (before escalation)</p>
              <div className="bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto space-y-1.5">
                {ticket.conversationHistory.map((m, i) => (
                  <p key={i} className={`text-xs ${m.role === "user" ? "text-ink font-medium" : "text-ink-muted"}`}>
                    <span className="text-[10px] text-ink-muted">{m.role === "user" ? "User:" : "AI:"}</span> {m.text}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Replies */}
          {ticket.replies?.length > 0 && (
            <div>
              <p className="text-[10px] uppercase font-semibold text-ink-muted mb-1.5">Replies</p>
              <div className="space-y-2">
                {ticket.replies.map((r, i) => (
                  <div key={i} className={`rounded-lg p-2.5 text-xs ${r.from === "platform_admin" ? "bg-blue-50 text-blue-800" : "bg-cream-100 text-ink"}`}>
                    <span className="font-medium">{r.from === "platform_admin" ? "You" : "Customer"}:</span> {r.text}
                    <span className="text-[10px] text-ink-muted ml-2">{fmtDate(r.at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reply input + status actions */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleReply()}
              placeholder="Type a reply..."
              className="flex-1 text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-300"
            />
            <button onClick={handleReply} disabled={!replyText.trim() || replying}
              className="w-8 h-8 rounded-lg bg-orange-500 text-white flex items-center justify-center disabled:opacity-40">
              {replying ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            </button>
            {ticket.status === "open" && (
              <button onClick={() => handleStatusChange("in_progress")} className="text-[10px] bg-blue-50 text-blue-700 px-2 py-1 rounded font-medium">Mark In Progress</button>
            )}
            {(ticket.status === "open" || ticket.status === "in_progress") && (
              <button onClick={() => handleStatusChange("resolved")} className="text-[10px] bg-green-50 text-green-700 px-2 py-1 rounded font-medium">Resolve</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SupportPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState(""); // "" = all, "open", "resolved"

  const load = async () => {
    setLoading(true);
    try {
      const qs = filter ? `?status=${filter}` : "";
      const d = await platformGet(`/api/v1/platform/support-tickets${qs}`);
      setTickets(d.tickets || []);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);

  const openCount = tickets.filter((t) => t.status === "open").length;

  return (
    <PlatformShell title="Support Center">
      <div className="space-y-5">
        {/* Stats */}
        <div className="flex items-center gap-4">
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5">
            <p className="text-2xl font-bold text-orange-600">{openCount}</p>
            <p className="text-[10px] text-orange-700 font-medium">Open tickets</p>
          </div>
          <div className="bg-cream-100 border border-cream-200 rounded-xl px-4 py-2.5">
            <p className="text-2xl font-bold text-ink">{tickets.length}</p>
            <p className="text-[10px] text-ink-muted font-medium">Total</p>
          </div>
          <div className="flex gap-1 ml-auto">
            {["", "open", "in_progress", "resolved"].map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium ${filter === f ? "bg-orange-500 text-white" : "bg-cream-100 text-ink-muted hover:bg-cream-200"}`}>
                {f || "All"}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {loading && (
          <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-orange-500" /></div>
        )}

        {!loading && tickets.length === 0 && (
          <div className="text-center py-16">
            <HelpCircle size={48} className="text-cream-300 mx-auto mb-4" />
            <h3 className="font-semibold text-ink mb-2">No tickets{filter ? ` (${filter})` : ""}</h3>
            <p className="text-sm text-ink-muted">When customers raise support tickets, they'll appear here.</p>
          </div>
        )}

        {!loading && tickets.length > 0 && (
          <div className="space-y-3">
            {tickets.map((t) => <TicketCard key={t.id} ticket={t} onUpdate={load} />)}
          </div>
        )}
      </div>
    </PlatformShell>
  );
}
