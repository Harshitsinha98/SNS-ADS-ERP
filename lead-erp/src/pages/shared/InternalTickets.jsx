/**
 * Internal Tickets — shared page for admin + employee.
 * Employees raise tickets, admins see all + resolve. Auto-delete 24hr after resolved.
 */

import { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { auth } from "../../firebase";
import {
  TicketPlus, Loader2, CheckCircle2, Clock, AlertCircle, Send, ChevronDown, ChevronUp, Plus,
} from "lucide-react";

const BASE = import.meta.env.VITE_BACKEND_URL || "";

async function authedGet(path) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed");
  return data;
}

async function authedPost(path, body) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed");
  return data;
}

const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

const STATUS_CONFIG = {
  open: { bg: "bg-orange-100 text-orange-700", icon: AlertCircle, label: "Open" },
  in_progress: { bg: "bg-blue-100 text-blue-700", icon: Clock, label: "In Progress" },
  resolved: { bg: "bg-green-100 text-green-700", icon: CheckCircle2, label: "Resolved" },
};

function TicketCard({ ticket, orgId, isAdmin, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const badge = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
  const BadgeIcon = badge.icon;

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setReplying(true);
    await authedPost(`/api/v1/org-tickets/${ticket.id}/reply`, { orgId, text: replyText });
    setReplyText("");
    setReplying(false);
    onUpdate();
  };

  const handleStatus = async (status) => {
    await authedPost(`/api/v1/org-tickets/${ticket.id}/status`, { orgId, status });
    onUpdate();
  };

  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-cream-50" onClick={() => setExpanded(!expanded)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-mono text-ink-muted">{ticket.ticketNumber}</span>
            <p className="font-medium text-sm text-ink truncate">{ticket.subject}</p>
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badge.bg}`}>
              <BadgeIcon size={9} /> {badge.label}
            </span>
          </div>
          <p className="text-xs text-ink-muted">
            {ticket.raisedByName} · {fmtDate(ticket.createdAt)} · {ticket.priority}
          </p>
        </div>
        {expanded ? <ChevronUp size={15} className="text-ink-muted" /> : <ChevronDown size={15} className="text-ink-muted" />}
      </div>

      {expanded && (
        <div className="border-t px-4 py-3 space-y-3">
          {ticket.description && <p className="text-sm text-ink bg-cream-50 rounded-lg p-3">{ticket.description}</p>}

          {ticket.replies?.length > 0 && (
            <div className="space-y-2">
              {ticket.replies.map((r, i) => (
                <div key={i} className="bg-blue-50 rounded-lg px-3 py-2 text-xs">
                  <span className="font-medium">{r.fromName || "Team"}:</span> {r.text}
                  <span className="text-ink-muted ml-2">{fmtDate(r.at)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 border-t">
            <input value={replyText} onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleReply()}
              placeholder="Reply..." className="flex-1 text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-300" />
            <button onClick={handleReply} disabled={!replyText.trim() || replying}
              className="w-8 h-8 rounded-lg bg-orange-500 text-white flex items-center justify-center disabled:opacity-40">
              {replying ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            </button>
            {isAdmin && ticket.status === "open" && (
              <button onClick={() => handleStatus("in_progress")} className="text-[10px] bg-blue-50 text-blue-700 px-2 py-1 rounded font-medium whitespace-nowrap">In Progress</button>
            )}
            {isAdmin && ticket.status !== "resolved" && (
              <button onClick={() => handleStatus("resolved")} className="text-[10px] bg-green-50 text-green-700 px-2 py-1 rounded font-medium whitespace-nowrap">Resolve</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function InternalTickets() {
  const { user } = useAuth();
  const orgId = user?.activeOrgId;
  const isAdmin = user?.role === "admin" || user?.role === "owner";
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const d = await authedGet(`/api/v1/org-tickets/list?orgId=${orgId}`);
      setTickets(d.tickets || []);
      setError(null);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [orgId]);

  const handleCreate = async () => {
    if (!subject.trim()) return;
    setCreating(true);
    try {
      await authedPost("/api/v1/org-tickets/create", { orgId, subject, description });
      setSubject(""); setDescription(""); setShowCreate(false);
      load();
    } catch (e) { setError(e.message); }
    finally { setCreating(false); }
  };

  const openCount = tickets.filter((t) => t.status !== "resolved").length;

  return (
    <Layout title="Internal Tickets">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <TicketPlus size={20} className="text-orange-500" />
            <h1 className="text-lg font-bold text-ink">Internal Tickets</h1>
            {openCount > 0 && <span className="bg-orange-100 text-orange-700 text-xs font-medium px-2 py-0.5 rounded-full">{openCount} open</span>}
          </div>
          <button onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-1 bg-orange-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-orange-600">
            <Plus size={14} /> New Ticket
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="bg-white border rounded-xl p-4 mb-4 space-y-3">
            <input value={subject} onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject (e.g., Lead assignment issue)" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-300" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue..." rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-orange-300" />
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={!subject.trim() || creating}
                className="bg-orange-500 text-white text-sm px-4 py-1.5 rounded-lg font-medium disabled:opacity-50 flex items-center gap-1">
                {creating ? <Loader2 size={13} className="animate-spin" /> : <TicketPlus size={13} />}
                {creating ? "Creating..." : "Submit Ticket"}
              </button>
              <button onClick={() => setShowCreate(false)} className="text-sm text-ink-muted px-3">Cancel</button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        {loading && <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-orange-500" /></div>}

        {!loading && tickets.length === 0 && (
          <div className="text-center py-16 text-ink-muted">
            <TicketPlus size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No tickets yet.</p>
            <p className="text-xs mt-1">Raise a ticket if you're facing any issue — {isAdmin ? "your team's tickets will appear here." : "your admin will respond."}</p>
          </div>
        )}

        {!loading && tickets.length > 0 && (
          <div className="space-y-2">
            {tickets.map((t) => <TicketCard key={t.id} ticket={t} orgId={orgId} isAdmin={isAdmin} onUpdate={load} />)}
          </div>
        )}

        <p className="text-[10px] text-ink-muted mt-6 text-center">Resolved tickets are automatically removed after 24 hours.</p>
      </div>
    </Layout>
  );
}
