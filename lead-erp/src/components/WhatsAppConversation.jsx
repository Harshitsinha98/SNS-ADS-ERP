import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { sendWhatsAppMessage } from "../utils/billingApi";

const formatTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

export default function WhatsAppConversation({ lead }) {
  const { user } = useAuth();
  const orgId = user?.activeOrgId;
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [clientMessageId, setClientMessageId] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const outboxStorageKey = orgId && lead?.id ? `codeskate:whatsapp-outbox:${orgId}:${lead.id}` : null;

  useEffect(() => {
    if (!outboxStorageKey) return;
    try {
      const draft = JSON.parse(window.localStorage.getItem(outboxStorageKey) || "null");
      if (draft?.text) {
        setText(draft.text);
        setClientMessageId(draft.clientMessageId || null);
      } else {
        setText("");
        setClientMessageId(null);
      }
    } catch {
      window.localStorage.removeItem(outboxStorageKey);
    }
  }, [outboxStorageKey]);

  useEffect(() => {
    if (!orgId || !lead?.id) return undefined;
    const messagesRef = collection(db, "organizations", orgId, "leads", lead.id, "messages");
    return onSnapshot(query(messagesRef, orderBy("atMs", "asc")),
      (snapshot) => setMessages(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))),
      () => setError("Could not load this WhatsApp conversation."));
  }, [orgId, lead?.id]);

  const send = async (event) => {
    event.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    const stableMessageId = clientMessageId
      || globalThis.crypto?.randomUUID?.()
      || `wa_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setClientMessageId(stableMessageId);
    window.localStorage.setItem(outboxStorageKey, JSON.stringify({ text: body, clientMessageId: stableMessageId }));
    try {
      await sendWhatsAppMessage({
        orgId,
        leadId: lead.id,
        text: body,
        clientMessageId: stableMessageId,
      });
      setText("");
      setClientMessageId(null);
      window.localStorage.removeItem(outboxStorageKey);
    } catch (requestError) {
      setError(requestError.code === "template_required"
        ? "The 24-hour reply window has ended. An approved WhatsApp template is required for this customer."
        : requestError.code === "delivery_indeterminate"
          ? "Meta may have accepted this reply, so it has been held for reconciliation to avoid sending a duplicate."
          : requestError.message || "Could not send WhatsApp message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow border p-5">
      <div className="flex items-center gap-2 mb-3">
        <MessageCircle size={18} className="text-teal-600" />
        <h3 className="font-semibold">WhatsApp conversation</h3>
      </div>
      <div className="h-64 overflow-y-auto rounded-lg bg-gray-50 border p-3 space-y-2">
        {messages.length === 0 ? (
          <p className="text-sm text-gray-500 text-center pt-20">No WhatsApp messages have been received for this lead yet.</p>
        ) : messages.map((message) => (
          <div key={message.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${message.direction === "outbound" ? "ml-auto bg-teal-600 text-white" : "bg-white border text-gray-800"}`}>
            <p className="whitespace-pre-wrap break-words">{message.text || `[${message.type || "message"}]`}</p>
            <p className={`mt-1 text-[10px] ${message.direction === "outbound" ? "text-teal-100" : "text-gray-400"}`}>
              {message.direction === "outbound" ? (message.status === "sent" ? "Sent" : message.status) : "Customer"} · {formatTime(message.at || message.sentAt || message.receivedAt)}
            </p>
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      <form onSubmit={send} className="flex gap-2 mt-3">
        <textarea value={text} onChange={(event) => {
          const nextText = event.target.value;
          setText(nextText);
          setClientMessageId(null);
          if (nextText) window.localStorage.setItem(outboxStorageKey, JSON.stringify({ text: nextText, clientMessageId: null }));
          else window.localStorage.removeItem(outboxStorageKey);
        }} maxLength={4096} rows="2"
          className="flex-1 border rounded-lg p-2 text-sm" placeholder="Reply from the connected WhatsApp Business number…" />
        <button disabled={sending || !text.trim()} className="self-end bg-teal-600 text-white rounded-lg p-2.5 disabled:opacity-50" aria-label="Send WhatsApp message">
          {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
        </button>
      </form>
      <p className="text-[11px] text-gray-500 mt-2">Free-form replies are available for 24 hours after the customer's last message.</p>
    </div>
  );
}
