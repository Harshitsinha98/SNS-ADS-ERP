/**
 * Team Inbox — shared WhatsApp conversation queue.
 *
 * ARCHITECTURAL DECISION: The conversation LIST is driven by the backend's
 * `conversations` projection (one summary doc per lead), not by reading each
 * lead's messages subcollection. That keeps the list to a single realtime
 * listener regardless of conversation count.
 *
 * The TRANSCRIPT is only loaded for the selected conversation, and only when
 * the current user is allowed to read it (assignee with an open session, or the
 * agent holding the claim). For anything else the UI shows the last-message
 * preview and a Claim action — matching the Firestore rules exactly, so the UI
 * never promises access the backend will deny.
 *
 * Used by both admins (/admin/inbox) and employees (/app/inbox); role only
 * changes which actions are offered, not the layout.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, orderBy, query, limit } from "firebase/firestore";
import {
  MessageCircle, Send, Loader2, Search, Inbox as InboxIcon,
  Bot, User, Lock, CheckCircle2, RefreshCw, AlertTriangle, ChevronLeft,
} from "lucide-react";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import { db } from "../firebase";
import { sendWhatsAppMessage } from "../utils/billingApi";
import {
  claimConversation, releaseConversation, markConversationRead, rebuildInbox,
} from "../utils/chatSessionApi";

const FILTERS = [
  { id: "unassigned", label: "Unclaimed" },
  { id: "mine", label: "Mine" },
  { id: "all", label: "All" },
];

const relTime = (ms) => {
  if (!ms) return "";
  const diff = Date.now() - Number(ms);
  if (diff < 60_000) return "now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
};

const clockTime = (value) => {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
};

const createMessageId = () =>
  globalThis.crypto?.randomUUID?.() || `inbox_${Date.now()}_${Math.random().toString(36).slice(2)}`;

export default function TeamInbox() {
  const { user, authLoading } = useAuth();
  const { users } = useData();
  const orgId = user?.activeOrgId;
  const uid = user?.uid;
  const isAdmin = user?.activeOrgRole === "admin" || user?.activeOrgRole === "owner";

  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("unassigned");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesError, setMessagesError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [banner, setBanner] = useState("");
  const [showListOnMobile, setShowListOnMobile] = useState(true);
  const endRef = useRef(null);

  // ── Inbox list: one realtime listener over the backend projection ──
  useEffect(() => {
    if (authLoading) return;
    if (!orgId) { setLoading(false); return; }
    const q = query(
      collection(db, "organizations", orgId, "conversations"),
      orderBy("lastMessageAtMs", "desc"),
      limit(200)
    );
    const unsub = onSnapshot(q,
      (snap) => {
        setConversations(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error("Inbox listener error:", err);
        setBanner("Could not load the inbox. Ask an admin to deploy the latest Firestore rules.");
        setLoading(false);
      }
    );
    return unsub;
  }, [orgId, authLoading]);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) || null,
    [conversations, selectedId]
  );

  // Whether the current user may read this transcript — mirrors firestore.rules
  // so we never render a listener that is guaranteed to be denied.
  const canReadTranscript = useMemo(() => {
    if (!selected) return false;
    if (isAdmin) return true;
    if (selected.activeChatSessionEmployee === uid) return true;
    return selected.assignedTo === uid && selected.aiEnabled === false;
  }, [selected, isAdmin, uid]);

  const iHoldChat = selected?.activeChatSessionEmployee === uid;
  const heldByOther = Boolean(selected?.activeChatSessionEmployee) && !iHoldChat;
  const canReply = iHoldChat || (isAdmin && Boolean(selected?.activeChatSessionEmployee)) ||
    (selected?.assignedTo === uid && selected?.aiEnabled === false);

  // ── Transcript for the selected conversation ──
  useEffect(() => {
    if (!orgId || !selectedId || !canReadTranscript) { setMessages([]); return; }
    setMessagesError("");
    const q = query(
      collection(db, "organizations", orgId, "leads", selectedId, "messages"),
      orderBy("atMs", "asc")
    );
    const unsub = onSnapshot(q,
      (snap) => setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setMessagesError("You don't have access to this conversation's history.")
    );
    return unsub;
  }, [orgId, selectedId, canReadTranscript]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const openConversation = (conversation) => {
    setSelectedId(conversation.id);
    setShowListOnMobile(false);
    setBanner("");
    if (conversation.unreadCount > 0) {
      markConversationRead(orgId, conversation.id).catch(() => {});
    }
  };

  const handleClaim = async () => {
    if (!selected) return;
    setClaiming(true);
    setBanner("");
    try {
      await claimConversation(orgId, selected.id);
    } catch (e) {
      setBanner(e.message || "Could not claim this chat.");
    } finally {
      setClaiming(false);
    }
  };

  const handleRelease = async () => {
    if (!selected) return;
    setReleasing(true);
    setBanner("");
    try {
      await releaseConversation(orgId, selected.id);
      setBanner("Chat released back to the queue.");
    } catch (e) {
      setBanner(e.message || "Could not release this chat.");
    } finally {
      setReleasing(false);
    }
  };

  const handleRebuild = async () => {
    setRebuilding(true);
    setBanner("");
    try {
      const res = await rebuildInbox(orgId);
      setBanner(`Imported ${res.rebuilt || 0} existing conversation(s) into the inbox.`);
    } catch (e) {
      setBanner(e.message || "Could not import existing conversations.");
    } finally {
      setRebuilding(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending || !selected) return;
    setSending(true);
    setBanner("");
    try {
      await sendWhatsAppMessage({
        orgId, leadId: selected.id, text: body, clientMessageId: createMessageId(),
      });
      setText("");
    } catch (err) {
      setBanner(
        err.code === "template_required"
          ? "The 24-hour reply window has closed. Send an approved template from the lead page."
          : err.message || "Could not send the message."
      );
    } finally {
      setSending(false);
    }
  };

  // ── Filtering ──
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === "mine") {
        if (c.activeChatSessionEmployee !== uid && c.assignedTo !== uid) return false;
      } else if (filter === "unassigned") {
        if (c.activeChatSessionEmployee) return false;
      }
      if (!term) return true;
      return (c.leadName || "").toLowerCase().includes(term)
        || (c.phone || "").includes(term)
        || (c.lastMessage || "").toLowerCase().includes(term);
    });
  }, [conversations, filter, search, uid]);

  const counts = useMemo(() => ({
    unassigned: conversations.filter((c) => !c.activeChatSessionEmployee).length,
    mine: conversations.filter((c) => c.activeChatSessionEmployee === uid || c.assignedTo === uid).length,
    all: conversations.length,
  }), [conversations, uid]);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
    [conversations]
  );

  const handlerName = (conversation) => {
    if (!conversation?.activeChatSessionEmployee) return null;
    if (conversation.activeChatSessionEmployee === uid) return "You";
    if (conversation.activeChatSessionEmployeeName) return conversation.activeChatSessionEmployeeName;
    const match = (users || []).find(
      (u) => u.uid === conversation.activeChatSessionEmployee || u.id === conversation.activeChatSessionEmployee
    );
    return match?.name || match?.displayName || "Agent";
  };

  return (
    <Layout title={`Team Inbox${totalUnread ? ` (${totalUnread})` : ""}`}>
      {banner && (
        <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-ember-700 flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{banner}</span>
          <button onClick={() => setBanner("")} className="text-ink-muted hover:text-ink">✕</button>
        </div>
      )}

      <div className="grid lg:grid-cols-[340px_1fr] gap-4 h-[calc(100vh-190px)]">
        {/* ═══ Conversation list ═══ */}
        <div className={`bg-white rounded-2xl shadow-card border border-cream-300/60 flex flex-col overflow-hidden ${showListOnMobile ? "" : "hidden lg:flex"}`}>
          <div className="p-3 border-b border-cream-200 space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, phone, message"
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-cream-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
              />
            </div>
            <div className="flex gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                    filter === f.id ? "bg-orange-100 text-orange-700" : "text-ink-muted hover:bg-cream-100"
                  }`}
                >
                  {f.label} <span className="num opacity-70">{counts[f.id]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-cream-100">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={22} className="animate-spin text-orange-400" />
              </div>
            ) : visible.length === 0 ? (
              <div className="text-center py-16 px-6">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-cream-100 flex items-center justify-center mb-3">
                  <InboxIcon size={20} className="text-ink-muted" />
                </div>
                <p className="text-sm text-ink-muted">
                  {conversations.length === 0 ? "No conversations yet." : "Nothing matches this filter."}
                </p>
                {conversations.length === 0 && isAdmin && (
                  <button
                    onClick={handleRebuild}
                    disabled={rebuilding}
                    className="mt-3 text-xs text-orange-600 hover:text-orange-700 font-medium inline-flex items-center gap-1"
                  >
                    {rebuilding ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    Import existing WhatsApp chats
                  </button>
                )}
              </div>
            ) : visible.map((c) => {
              const handler = handlerName(c);
              const isSelected = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => openConversation(c)}
                  className={`w-full text-left px-3 py-3 transition ${isSelected ? "bg-orange-50" : "hover:bg-cream-50"}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-0.5">
                    <p className={`text-sm truncate ${c.unreadCount > 0 ? "font-bold text-ink" : "font-medium text-ink"}`}>
                      {c.leadName || c.phone || "Customer"}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-ink-muted num">{relTime(c.lastMessageAtMs)}</span>
                      {c.unreadCount > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {c.unreadCount > 99 ? "99+" : c.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-ink-muted truncate">
                    {c.lastDirection === "outbound" && <span className="text-ink-soft">You: </span>}
                    {c.lastMessage || "—"}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {handler ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700">
                        <User size={9} /> {handler}
                      </span>
                    ) : c.aiEnabled === false ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        <AlertTriangle size={9} /> Needs agent
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                        <Bot size={9} /> AI
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ═══ Conversation pane ═══ */}
        <div className={`bg-white rounded-2xl shadow-card border border-cream-300/60 flex flex-col overflow-hidden ${showListOnMobile ? "hidden lg:flex" : ""}`}>
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-cream-100 flex items-center justify-center mb-3">
                <MessageCircle size={24} className="text-ink-muted" />
              </div>
              <p className="text-sm text-ink-muted">Select a conversation to get started.</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-4 py-3 border-b border-cream-200 flex items-center gap-3">
                <button onClick={() => setShowListOnMobile(true)} className="lg:hidden text-ink-muted">
                  <ChevronLeft size={18} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ink truncate">{selected.leadName || "Customer"}</p>
                  <p className="text-xs text-ink-muted font-mono">{selected.phone}</p>
                </div>

                <div className="flex items-center gap-2">
                  {!selected.activeChatSessionEmployee && (
                    <button
                      onClick={handleClaim}
                      disabled={claiming}
                      className="btn btn-primary text-sm flex items-center gap-1.5"
                    >
                      {claiming ? <Loader2 size={14} className="animate-spin" /> : <User size={14} />} Claim
                    </button>
                  )}
                  {iHoldChat && (
                    <button
                      onClick={handleRelease}
                      disabled={releasing}
                      className="btn btn-secondary text-sm flex items-center gap-1.5"
                    >
                      {releasing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Resolve
                    </button>
                  )}
                  {heldByOther && (
                    <span className="text-xs px-2 py-1 rounded-full bg-teal-100 text-teal-700 font-medium">
                      {handlerName(selected)} handling
                    </span>
                  )}
                </div>
              </div>

              {/* Transcript */}
              <div className="flex-1 overflow-y-auto p-4 bg-cream-50/50 space-y-2">
                {!canReadTranscript ? (
                  <div className="h-full flex flex-col items-center justify-center text-center px-6">
                    <Lock size={22} className="text-ink-muted mb-2" />
                    <p className="text-sm text-ink-soft font-medium">Claim this chat to read the conversation</p>
                    <p className="text-xs text-ink-muted mt-1 max-w-sm">
                      Transcripts stay private until you take responsibility for the chat. Last message:
                    </p>
                    <p className="text-xs text-ink mt-2 italic max-w-sm">"{selected.lastMessage}"</p>
                  </div>
                ) : messagesError ? (
                  <p className="text-sm text-danger-600 text-center py-8">{messagesError}</p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-ink-muted text-center py-8">No messages yet.</p>
                ) : messages.map((m) => {
                  const outbound = m.direction === "outbound";
                  const isAI = m.source === "ai_customer_care";
                  return (
                    <div key={m.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                        outbound
                          ? isAI ? "bg-purple-100 text-purple-900 rounded-tr-md" : "bg-teal-600 text-white rounded-tr-md"
                          : "bg-white border border-cream-200 text-ink rounded-tl-md shadow-sm"
                      }`}>
                        <p className="whitespace-pre-wrap break-words">{m.text || `[${m.type || "message"}]`}</p>

                        {m.type === "interactive" && m.interactiveOptions?.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {m.interactiveOptions.map((opt, i) => (
                              <div key={opt.id || i}
                                className={`rounded border px-2 py-1 text-[11px] ${
                                  isAI ? "border-purple-200 bg-purple-50" : "border-teal-300/60 bg-teal-500/30"
                                }`}>
                                {opt.title}
                                {opt.description && <span className="opacity-70"> — {opt.description}</span>}
                              </div>
                            ))}
                          </div>
                        )}

                        <p className={`mt-1 text-[10px] ${
                          outbound ? (isAI ? "text-purple-500" : "text-teal-100") : "text-ink-muted"
                        }`}>
                          {outbound ? (isAI ? "AI" : m.senderName || "You") : "Customer"} · {clockTime(m.at || m.sentAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              {/* Composer */}
              <div className="border-t border-cream-200 p-3">
                {canReply ? (
                  <form onSubmit={handleSend} className="flex gap-2">
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows="2"
                      maxLength={4096}
                      placeholder="Type your reply…"
                      className="flex-1 rounded-lg border border-cream-300 p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-200"
                    />
                    <button
                      type="submit"
                      disabled={sending || !text.trim()}
                      className="self-end btn btn-primary px-3 py-2.5 disabled:opacity-50"
                      aria-label="Send reply"
                    >
                      {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                  </form>
                ) : (
                  <p className="text-xs text-ink-muted text-center py-2">
                    {heldByOther
                      ? `${handlerName(selected)} is handling this chat.`
                      : "Claim this chat to reply."}
                  </p>
                )}
                <p className="text-[11px] text-ink-muted mt-1.5 text-center">
                  {selected.aiEnabled === false
                    ? "🤖 AI is paused for this conversation."
                    : "🤖 AI is answering this conversation — claiming pauses it."}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
