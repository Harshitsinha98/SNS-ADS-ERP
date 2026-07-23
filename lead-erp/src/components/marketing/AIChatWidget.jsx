/**
 * Floating AI Chat Widget for the marketing site.
 *
 * A sticky bottom-right button that expands into a mini chat window.
 * Visitors can ask questions about the product, pricing, features, etc.
 * Responses are generated client-side via the public test endpoint
 * (no auth required — uses a limited public knowledge base).
 */

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Bot, Sparkles } from "lucide-react";

const QUICK_QUESTIONS = [
  "What does Codeskate CRM do?",
  "How does AI auto-reply work?",
  "What are the pricing plans?",
  "Is there a free trial?",
];

const KNOWLEDGE = {
  "what does codeskate crm do": "Codeskate CRM is an AI-powered sales platform that captures leads from WhatsApp, auto-assigns them to your team, replies to customers instantly using AI, and tracks your entire pipeline — all in one place.",
  "how does ai auto-reply work": "When a customer sends a WhatsApp message, our AI reads it, classifies the intent (pricing, booking, support, etc.), and generates a contextual reply using your uploaded knowledge base — all within 3 seconds. The customer can't tell it's AI.",
  "what are the pricing plans": "We have 3 plans: Starter at ₹599/mo (3 users, 1,000 leads), Growth at ₹1,499/mo (10 users, 10,000 leads, AI included), and Scale at ₹3,499/mo (25 users, 50,000 leads, unlimited AI). All plans include a 7-day free trial.",
  "is there a free trial": "Yes! Our Starter plan comes with a 7-day free trial. No credit card required. You can set up your workspace in under 2 minutes and start capturing leads immediately.",
  "how much does it cost": "Plans start at just ₹599/month (₹20/day). Our most popular Growth plan is ₹1,499/month and includes AI auto-reply, workflow automation, and priority support.",
  "what is whatsapp integration": "We connect directly to WhatsApp Business API. Every customer message lands in your CRM instantly as a lead. You can reply manually or let AI handle it — all from one dashboard.",
  "can i try before buying": "Absolutely! Sign up for our Starter plan and get 7 days completely free. No credit card needed. If you love it, continue. If not, no charges.",
  "how is this different from other crms": "Unlike other CRMs, Codeskate includes built-in AI auto-reply, WhatsApp Business integration, workflow automation, native call tracking, and auto-dialer — all in one platform. Others charge separately for each of these.",
  "do you support multiple branches": "Yes! Our Multi-Org feature lets you manage multiple branches with completely isolated data from a single login. Each branch gets its own workspace, team, and leads.",
  "what about data security": "We use bank-level encryption, role-based access control, and complete tenant data isolation. Your data is never shared between organizations. We're built on Google Cloud infrastructure.",
};

function findAnswer(message) {
  const lower = message.toLowerCase().trim();
  // Direct match
  for (const [key, answer] of Object.entries(KNOWLEDGE)) {
    if (lower.includes(key) || key.includes(lower)) return answer;
  }
  // Keyword matching
  if (lower.includes("price") || lower.includes("cost") || lower.includes("plan")) {
    return KNOWLEDGE["what are the pricing plans"];
  }
  if (lower.includes("trial") || lower.includes("free")) {
    return KNOWLEDGE["is there a free trial"];
  }
  if (lower.includes("ai") || lower.includes("auto") || lower.includes("reply")) {
    return KNOWLEDGE["how does ai auto-reply work"];
  }
  if (lower.includes("whatsapp")) {
    return KNOWLEDGE["what is whatsapp integration"];
  }
  if (lower.includes("different") || lower.includes("compare") || lower.includes("other")) {
    return KNOWLEDGE["how is this different from other crms"];
  }
  if (lower.includes("security") || lower.includes("safe") || lower.includes("data")) {
    return KNOWLEDGE["what about data security"];
  }
  if (lower.includes("branch") || lower.includes("multi") || lower.includes("org")) {
    return KNOWLEDGE["do you support multiple branches"];
  }
  // Fallback
  return "Great question! I'd love to help you with that. For detailed information, you can start a free trial and explore the platform yourself, or reach out to our team at hello@codeskate.com. Is there anything specific about our features or pricing I can help with?";
}

export default function AIChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hi there! I'm the Codeskate AI assistant. Ask me anything about our CRM, pricing, or features." },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const sendMessage = (text) => {
    if (!text.trim()) return;
    const userMsg = { role: "user", text: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    // Simulate AI thinking (300-800ms for realism)
    setTimeout(() => {
      const answer = findAnswer(text);
      setMessages((prev) => [...prev, { role: "assistant", text: answer }]);
      setTyping(false);
    }, 400 + Math.random() * 400);
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
                Online — replies instantly
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
              placeholder="Ask about features, pricing..."
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
