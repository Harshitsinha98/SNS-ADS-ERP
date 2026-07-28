/**
 * Employee Conversations Page.
 *
 * Shows ONLY leads where AI has escalated to this employee (aiEnabled=false).
 * Employee sees session-bounded messages, can reply, and resolve/close the session.
 * Includes notification popup on new assignment and 3-min auto-escalation timer.
 */

import { useEffect, useState, useRef } from "react";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import {
  MessageCircle, Send, Loader2, CheckCircle2,
  Brain, Phone, AlertTriangle, Clock, X,
} from "lucide-react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../firebase";
import { sendWhatsAppMessage } from "../../utils/billingApi";
import { resolveSession, reEnableAI } from "../../utils/chatSessionApi";

const formatTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
};

export default function Conversations() {
  const { user, authLoading } = useAuth();
  const orgId = user?.activeOrgId;
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notification, setNotification] = useState(null);
  const [escalationTimers, setEscalationTimers] = useState({});
  const prevLeadIds = useRef(new Set());
  const messagesEndRef = useRef(null);

  // Listen for leads where AI is disabled AND assigned to this employee
  // These are the leads where human takeover happened
  useEffect(() => {
    if (authLoading) return;
    if (!orgId || !user?.uid) { setLoading(false); return; }
    const leadsRef = collection(db, "organizations", orgId, "leads");
    const q = query(leadsRef,
      where("assignedTo", "==", user.uid),
      where("aiEnabled", "==", false)
    );
    const unsub = onSnapshot(q, (snap) => {
      const newLeads = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Detect newly assigned leads → show notification popup
      const newIds = new Set(newLeads.map((l) => l.id));
      const freshlyAssigned = newLeads.filter((l) => !prevLeadIds.current.has(l.id));
      if (freshlyAssigned.length > 0 && prevLeadIds.current.size > 0) {
        const newest = freshlyAssigned[0];
        setNotification({
          lead: newest,
          message: `New chat assigned: ${newest.name || newest.phone}`,
          time: Date.now(),
        });
        // Auto-dismiss notification after 10 seconds
        setTimeout(() => setNotification(null), 10000);
      }
      prevLeadIds.current = newIds;

      // Sort by AI disabled time (most recent first)
      newLeads.sort((a, b) => {
        const aTime = a.aiDisabledAt ? new Date(a.aiDisabledAt).getTime() : 0;
        const bTime = b.aiDisabledAt ? new Date(b.aiDisabledAt).getTime() : 0;
        return bTime - aTime;
      });
      setLeads(newLeads);
      setLoading(false);
    }, (err) => {
      console.warn("Conversations listener error:", err?.code || err?.message);
      setLoading(false);
    });
    return unsub;
  }, [orgId, user?.uid, authLoading]);

  // 3-minute auto-escalation timer for each lead
  useEffect(() => {
    const timers = {};
    leads.forEach((lead) => {
      if (escalationTimers[lead.id]) return; // already has a timer
      const disabledAt = lead.aiDisabledAt ? new Date(lead.aiDisabledAt).getTime() : Date.now();
      const threeMinMs = 3 * 60 * 1000;
      const elapsed = Date.now() - disabledAt;
      const remaining = threeMinMs - elapsed;

      if (remaining <= 0) {
        // Already past 3 minutes — mark as escalated
        timers[lead.id] = "escalated";
      } else {
        // Set timer to escalate
        const timer = setTimeout(() => {
          setEscalationTimers((prev) => ({ ...prev, [lead.id]: "escalated" }));
          // TODO: Backend will handle the actual admin notification via cron
        }, remaining);
        timers[lead.id] = timer;
      }
    });
    setEscalationTimers((prev) => ({ ...prev, ...timers }));
    return () => {
      Object.values(timers).forEach((t) => { if (typeof t === "number") clearTimeout(t); });
    };
  }, [leads.length]);

  // Real-time listener for messages — session-bounded (from aiDisabledAt onwards)
  useEffect(() => {
    if (!selectedLead?.id || !orgId) { setMessages([]); return; }
    const messagesRef = collection(db, "organizations", orgId, "leads", selectedLead.id, "messages");
    const q = query(messagesRef, orderBy("atMs", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const allMsgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Show messages from when AI was disabled (session start)
      const sessionStart = selectedLead.aiDisabledAt
        ? new Date(selectedLead.aiDisabledAt).getTime()
        : 0;
      const filtered = sessionStart > 0
        ? allMsgs.filter((m) => (m.atMs || 0) >= sessionStart)
        : allMsgs;
      setMessages(filtered);
    }, (err) => {
      console.warn("Messages listener error:", err?.code || err?.message);
    });
    return unsub;
  }, [orgId, selectedLead?.id, selectedLead?.aiDisabledAt]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectLead = (lead) => {
    setSelectedLead(lead);
    setError("");
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending || !selectedLead) return;
    setSending(true); setError("");
    try {
      await sendWhatsAppMessage({ orgId, leadId: selectedLead.id, text: text.trim(), clientMessageId: `sess_${Date.now()}_${Math.random().toString(36).slice(2)}` });
      setText("");
    } catch (err) {
      setError(err.code === "template_required"
        ? "24-hour reply window expired. Use an approved template."
        : err.message || "Could not send message");
    }
    setSending(false);
  };

  const handleResolve = async () => {
    if (!selectedLead) return;
    setResolving(true); setError("");
    try {
      await reEnableAI(orgId, selectedLead.id);
      setSelectedLead(null);
      setMessages([]);
    } catch (err) { setError(err.message); }
    setResolving(false);
  };

  if (loading) {
    return <Layout><div className="flex items-center justify-center py-24"><Loader2 size={24} className="animate-spin text-orange-500" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto relative">
        {/* Notification Popup */}
        {notification && (
          <div className="fixed top-4 right-4 z-50 animate-slide-in-right">
            <div className="bg-white rounded-2xl shadow-xl border border-orange-200 p-4 w-80 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                <MessageCircle size={18} className="text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink">New Chat Assigned</p>
                <p className="text-xs text-ink-muted mt-0.5 truncate">{notification.lead?.name || "Customer"} needs your help</p>
                <button onClick={() => { selectLead(notification.lead); setNotification(null); }}
                  className="text-xs font-semibold text-orange-600 mt-1.5 hover:underline">Open conversation</button>
              </div>
              <button onClick={() => setNotification(null)} className="text-ink-muted hover:text-ink shrink-0">
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 mb-6">
          <MessageCircle size={24} className="text-teal-600" />
          <div>
            <h1 className="text-xl font-display font-bold text-ink">My Conversations</h1>
            <p className="text-sm text-ink-muted">Chats escalated from AI that need your attention</p>
          </div>
        </div>

        {error && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

        <div className="flex gap-4 h-[calc(100vh-12rem)]">
          {/* Left: Conversation List */}
          <div className="w-80 shrink-0 bg-white rounded-2xl border border-cream-200 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-cream-100">
              <p className="text-sm font-semibold text-ink">{leads.length} active {leads.length === 1 ? "chat" : "chats"}</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {leads.length === 0 ? (
                <div className="p-6 text-center">
                  <CheckCircle2 size={32} className="mx-auto text-emerald-400 mb-2" />
                  <p className="text-sm text-ink-muted">No escalated conversations right now.</p>
                  <p className="text-xs text-ink-muted/60 mt-1">AI is handling all chats. You'll be notified when a customer needs you.</p>
                </div>
              ) : leads.map((lead) => (
                <button key={lead.id} onClick={() => selectLead(lead)}
                  className={`w-full text-left p-4 border-b border-cream-50 hover:bg-cream-50 transition-colors ${selectedLead?.id === lead.id ? "bg-orange-50 border-l-4 border-l-orange-400" : ""}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center text-xs font-bold text-teal-700">
                      {(lead.name || "?")[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink truncate">{lead.name || "Unknown"}</p>
                      <p className="text-[11px] text-ink-muted truncate">{lead.phone || ""}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                      {escalationTimers[lead.id] === "escalated" && (
                        <span className="text-[9px] text-red-600 font-bold">3m+</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right: Chat Area */}
          <div className="flex-1 bg-white rounded-2xl border border-cream-200 flex flex-col overflow-hidden">
            {!selectedLead ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <MessageCircle size={40} className="mx-auto text-cream-300 mb-3" />
                  <p className="text-ink-muted">Select a conversation to start chatting</p>
                  <p className="text-xs text-ink-muted/60 mt-1">Only escalated chats appear here</p>
                </div>
              </div>
            ) : (
              <>
                {/* Chat Header */}
                <div className="p-4 border-b border-cream-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center text-xs font-bold text-teal-700">
                      {(selectedLead.name || "?")[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink">{selectedLead.name}</p>
                      <p className="text-[11px] text-ink-muted flex items-center gap-1"><Phone size={10} /> {selectedLead.phone}</p>
                    </div>
                  </div>
                  <button onClick={handleResolve} disabled={resolving}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-50">
                    {resolving ? "Closing..." : "Resolve & Close Chat"}
                  </button>
                </div>

                {/* Session Brief */}
                <div className="px-4 py-3 bg-purple-50 border-b border-purple-100">
                  <div className="flex items-start gap-2">
                    <Brain size={14} className="text-purple-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[11px] font-bold text-purple-700">Session Info</p>
                      <p className="text-xs text-purple-800 mt-0.5">Customer requested human assistance. Reply below — messages are sent from the business number.</p>
                    </div>
                  </div>
                  {escalationTimers[selectedLead.id] === "escalated" && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-red-600 font-medium">
                      <AlertTriangle size={12} /> Response overdue (3+ minutes). Admin has been notified.
                    </div>
                  )}
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-cream-50/30">
                  {messages.length === 0 ? (
                    <div className="text-center py-8">
                      <Clock size={24} className="mx-auto text-cream-300 mb-2" />
                      <p className="text-sm text-ink-muted">No messages yet in this session.</p>
                      <p className="text-xs text-ink-muted/60">Customer's next message will appear here instantly.</p>
                    </div>
                  ) : messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                        msg.direction === "outbound"
                          ? msg.source === "ai_customer_care" ? "bg-purple-100 text-purple-900 rounded-tr-md" : "bg-teal-600 text-white rounded-tr-md"
                          : "bg-white border border-cream-200 text-ink rounded-tl-md shadow-sm"
                      }`}>
                        <p className="whitespace-pre-wrap break-words">{msg.text || `[${msg.type || "message"}]`}</p>
                        <p className={`mt-1 text-[10px] ${msg.direction === "outbound" ? (msg.source === "ai_customer_care" ? "text-purple-500" : "text-teal-100") : "text-ink-muted"}`}>
                          {msg.direction === "outbound" ? (msg.source === "ai_customer_care" ? "AI" : "You") : "Customer"} · {formatTime(msg.at || msg.sentAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply Input */}
                <form onSubmit={handleSend} className="p-4 border-t border-cream-100 flex gap-2">
                  <input type="text" value={text} onChange={(e) => setText(e.target.value)}
                    placeholder="Reply from business number..."
                    className="flex-1 rounded-xl border border-cream-200 px-4 py-2.5 text-sm focus:border-teal-300 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                    disabled={sending} />
                  <button type="submit" disabled={sending || !text.trim()}
                    className="w-10 h-10 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-cream-200 flex items-center justify-center transition-colors shadow-sm">
                    {sending ? <Loader2 size={16} className="text-white animate-spin" /> : <Send size={16} className="text-white" />}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
