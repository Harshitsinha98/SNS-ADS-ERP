/**
 * Floating AI Chat Widget for the marketing site.
 *
 * Connected to OpenAI via /api/v1/public/chat endpoint.
 * Supports any language — AI auto-detects and responds accordingly.
 * Falls back to basic answers if the backend is unreachable.
 */

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Bot, Sparkles } from "lucide-react";

const BASE = import.meta.env.VITE_BACKEND_URL || "";

const QUICK_QUESTIONS = [
  "What does Codeskate CRM do?",
  "How does AI auto-reply work?",
  "What are the pricing plans?",
  "Is there a free trial?",
];

async function getAIReply(message, history) {
  try {
    const res = await fetch(`${BASE}/api/v1/public/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }),
    });
    const data = await res.json();
    if (data.reply) return data.reply;
    if (data.error) return data.error;
    return "I'm having trouble connecting. Please try again or email us at hello@codeskate.com.";
  } catch {
    return "I'm temporarily offline. Start a free trial at codeskate.com/signup or email hello@codeskate.com for help!";
  }
}

export default function AIChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hi! I'm the Codeskate AI assistant. Ask me anything about our CRM — pricing, features, integrations — in any language." },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const sendMessage = async (text) => {
    if (!text.trim() || typing) return;
    const userMsg = { role: "user", text: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    const reply = await getAIReply(text.trim(), messages);
    setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    setTyping(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <>
      {/* Chat Window */}
      {open && (
        <div className="fixed bottom-24 right-5 z-50 w-[360px] max-w-[calc(100vw-2.5rem)] bg-white rounded-3xl shadow-2xl border border-cream-300/60 overflow-hidden animate-fade-in flex flex-col" style={{ maxHeight: "520px" }}>
          {/* Header */}
          <div className="bg-gradient-orange px-5 py-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
              <Bot size={18} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">Codeskate AI</p>
              <p className="text-[11px] text-white/80 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                Online — speaks every language
              </p>
            </div>
            <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
              <X size={16} className="text-white" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ minHeight: "200px", maxHeight: "320px" }}>
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-orange-500 text-white rounded-tr-md"
                    : "bg-cream-100 text-ink rounded-tl-md"
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div className="bg-cream-100 rounded-2xl rounded-tl-md px-4 py-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-ink-muted/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-ink-muted/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-ink-muted/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Questions (show only if few messages) */}
          {messages.length <= 2 && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-[11px] px-3 py-1.5 rounded-full border border-orange-200 bg-orange-50 text-orange-700 font-medium hover:bg-orange-100 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSubmit} className="border-t border-cream-200 px-4 py-3 flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask in any language..."
              className="flex-1 text-sm bg-cream-50 border border-cream-200 rounded-xl px-3.5 py-2.5 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 transition-all"
              disabled={typing}
            />
            <button
              type="submit"
              disabled={!input.trim() || typing}
              className="w-10 h-10 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:bg-cream-200 flex items-center justify-center transition-colors shadow-sm"
            >
              {typing ? <Loader2 size={16} className="text-white animate-spin" /> : <Send size={16} className="text-white" />}
            </button>
          </form>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 hover:scale-110 ${
          open
            ? "bg-ink hover:bg-ink/90"
            : "bg-gradient-orange shadow-glow hover:shadow-glow-lg"
        }`}
        aria-label="Chat with AI assistant"
      >
        {open ? (
          <X size={22} className="text-white" />
        ) : (
          <div className="relative">
            <MessageCircle size={22} className="text-white" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white animate-pulse" />
          </div>
        )}
      </button>

      {/* Tooltip (only when closed and first load) */}
      {!open && (
        <div className="fixed bottom-[5.5rem] right-6 z-50 animate-fade-in pointer-events-none">
          <div className="bg-ink text-white text-xs font-medium px-3 py-2 rounded-xl shadow-lg relative">
            <Sparkles size={10} className="inline mr-1 text-orange-300" />
            Got questions? Ask AI!
            <div className="absolute -bottom-1.5 right-5 w-3 h-3 bg-ink rotate-45" />
          </div>
        </div>
      )}
    </>
  );
}
