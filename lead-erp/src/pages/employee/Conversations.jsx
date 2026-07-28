/**
 * Employee Conversations Page.
 *
 * Shows session-bounded WhatsApp conversations assigned to the current employee.
 * Employee can only see messages from their active session — not before or after.
 * Includes: AI brief, session messages, reply input, resolve button.
 */

import { useEffect, useState, useCallback } from "react";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import {
  MessageCircle, Send, Loader2, CheckCircle2, Clock, User,
  AlertTriangle, Brain, Phone, ArrowRight,
} from "lucide-react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../firebase";
import { sendWhatsAppMessage } from "../../utils/billingApi";
import { resolveSession, getSessionMessages } from "../../utils/chatSessionApi";

const formatTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
};

export default function Conversations() {
  const { user } = useAuth();
  const orgId = user?.activeOrgId;
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [messages, setMessages] = useState([]);
  const [session, setSession] = useState(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Listen for leads with active sessions assigned to this employee
  useEffect(() => {
    if (!orgId || !user?.uid) return;
    const leadsRef = collection(db, "organizations", orgId, "leads");
    const q = query(leadsRef,
      where("activeChatSessionEmployee", "==", user.uid),
      orderBy("lastUpdated", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [orgId, user?.uid]);

  // Load session messages when a lead is selected
  const loadMessages = useCallback(async (lead) => {
    if (!lead?.activeChatSessionId) return;
    try {
      const data = await getSessionMessages(orgId, lead.id, lead.activeChatSessionId);
      setMessages(data.messages || []);
    } catch (e) { setError(e.message); }
  }, [orgId]);

  // Real-time listener for new messages during active session
  useEffect(() => {
    if (!selectedLead?.id || !session?.startedAtMs || !orgId) return;
    const messagesRef = collection(db, "organizations", orgId, "leads", selectedLead.id, "messages");
    const q = query(messagesRef,
      where("atMs", ">=", session.startedAtMs),
      orderBy("atMs", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [orgId, selectedLead?.id, session?.startedAtMs]);

  const selectLead = (lead) => {
    setSelectedLead(lead);
    setSession({
      id: lead.activeChatSessionId,
      startedAtMs: lead.aiDisabledAt ? new Date(lead.aiDisabledAt).getTime() : Date.now() - 3600000,
    });
    loadMessages(lead);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending || !selectedLead) return;
    setSending(true); setError("");
    try {
      await sendWhatsAppMessage({ orgId, leadId: selectedLead.id, text: text.trim(), clientMessageId: `sess_${Date.now()}` });
      setText("");
    } catch (err) {
      setError(err.message || "Could not send message");
    }
    setSending(false);
  };

  const handleResolve = async () => {
    if (!selectedLead?.activeChatSessionId) return;
    setResolving(true);
    try {
      await resolveSession(orgId, selectedLead.id, selectedLead.activeChatSessionId, "");
      setSelectedLead(null);
      setMessages([]);
      setSession(null);
    } catch (err) { setError(err.message); }
    setResolving(false);
  };

  if (loading) {
    return <Layout><div className="flex items-center justify-center py-24"><Loader2 size={24} className="animate-spin text-orange-500" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <MessageCircle size={24} className="text-teal-600" />
          <div>
            <h1 className="text-xl font-display font-bold text-ink">My Conversations</h1>
            <p className="text-sm text-ink-muted">Active customer chats assigned to you</p>
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
                  <p className="text-sm text-ink-muted">No active conversations. AI is handling everything!</p>
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
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
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
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50">
                    {resolving ? "Ending..." : "Resolve & End Session"}
                  </button>
                </div>

                {/* AI Brief */}
                {selectedLead.aiDisabledReason && (
                  <div className="px-4 py-3 bg-purple-50 border-b border-purple-100">
                    <div className="flex items-start gap-2">
                      <Brain size={14} className="text-purple-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[11px] font-bold text-purple-700 uppercase">AI Session Brief</p>
                        <p className="text-xs text-purple-800 mt-0.5 leading-relaxed">Customer requested human assistance. Review messages below and respond from the business number.</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Messages (session-bounded) */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-cream-50/30">
                  {messages.length === 0 ? (
                    <p className="text-center text-sm text-ink-muted py-8">Waiting for messages in this session...</p>
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
