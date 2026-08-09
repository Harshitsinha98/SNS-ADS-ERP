/**
 * Floating AI Support Chat Widget — appears on all admin/employee pages.
 *
 * Flow:
 *   1. User clicks help button (bottom-right) → chat drawer opens
 *   2. User types question → AI responds (OpenAI + CodeSkate KB)
 *   3. If AI can't resolve → "Raise Ticket" button appears
 *   4. Ticket created → Telegram alert to platform owner → ticket in Support Center
 */

import { useState, useRef, useEffect } from "react";
import { auth } from "../firebase";
import { MessageCircle, X, Send, Loader2, TicketPlus, ChevronDown } from "lucide-react";

const BASE = import.meta.env.VITE_BACKEND_URL || "";

async function authedPost(path, body) {
  const user = auth.currentUser;
  if (!user) return { error: "Not logged in" };
  const token = await user.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ error: "Request failed" }));
}

export default function SupportChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hi! I'm CodeSkate's support assistant. How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketDesc, setTicketDesc] = useState("");
  const [ticketSent, setTicketSent] = useState(false);
  const [ticketBusy, setTicketBusy] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, showTicketForm]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const userMsg = { role: "user", text };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);

    const history = [...messages, userMsg].map((m) => ({ role: m.role, text: m.text }));
    const res = await authedPost("/api/v1/support/chat", { message: text, history });

    if (res.reply) {
      setMessages((m) => [...m, { role: "assistant", text: res.reply }]);
      // Show ticket option after 3+ messages or if AI suggests it
      if (messages.length >= 4 || res.reply.toLowerCase().includes("ticket")) {
        setShowTicketForm(true);
      }
    } else {
      setMessages((m) => [...m, { role: "assistant", text: res.error || "Sorry, something went wrong. Try again." }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const submitTicket = async () => {
    if (!ticketSubject.trim() && !ticketDesc.trim()) return;
    setTicketBusy(true);
    const conversationHistory = messages.map((m) => ({ role: m.role, text: m.text }));
    await authedPost("/api/v1/support/ticket", {
      subject: ticketSubject || "Support request",
      description: ticketDesc || messages.filter((m) => m.role === "user").map((m) => m.text).join(" | "),
      conversationHistory,
    });
    setTicketSent(true);
    setTicketBusy(false);
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 w-13 h-13 bg-gradient-to-br from-orange-500 to-amber-500 text-white rounded-full shadow-xl flex items-center justify-center hover:scale-105 transition-transform"
          title="Need help?"
        >
          <MessageCircle size={22} />
        </button>
      )}

      {/* Chat drawer */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-3rem)] bg-white rounded-2xl shadow-2xl border border-cream-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <MessageCircle size={16} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">CodeSkate Support</p>
              <p className="text-[10px] text-white/70">AI-powered help</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white">
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                  msg.role === "user"
                    ? "bg-orange-500 text-white rounded-br-sm"
                    : "bg-cream-100 text-ink rounded-bl-sm"
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-cream-100 px-3 py-2 rounded-xl rounded-bl-sm">
                  <Loader2 size={14} className="animate-spin text-orange-500" />
                </div>
              </div>
            )}

            {/* Ticket form */}
            {showTicketForm && !ticketSent && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-orange-800 flex items-center gap-1">
                  <TicketPlus size={13} /> Can't resolve? Raise a ticket
                </p>
                <input
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  placeholder="Brief subject..."
                  className="w-full border border-orange-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-orange-400"
                />
                <textarea
                  value={ticketDesc}
                  onChange={(e) => setTicketDesc(e.target.value)}
                  placeholder="Describe your issue (optional — AI chat history will be attached)..."
                  rows={2}
                  className="w-full border border-orange-200 rounded-lg px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:border-orange-400"
                />
                <button onClick={submitTicket} disabled={ticketBusy}
                  className="w-full bg-orange-500 text-white text-xs font-medium py-1.5 rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-1">
                  {ticketBusy ? <Loader2 size={12} className="animate-spin" /> : <TicketPlus size={12} />}
                  {ticketBusy ? "Submitting..." : "Submit Ticket"}
                </button>
              </div>
            )}

            {ticketSent && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-700 text-center">
                ✅ Ticket raised! Our team will get back to you within 24 hours.
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-cream-200 px-3 py-2 flex items-center gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your question..."
              className="flex-1 text-sm px-3 py-2 rounded-xl border border-cream-200 focus:outline-none focus:border-orange-300"
              disabled={loading}
            />
            <button onClick={sendMessage} disabled={!input.trim() || loading}
              className="w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 disabled:opacity-40 transition-colors">
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
