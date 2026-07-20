import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { Loader2, MessageCircle, Send, SendHorizontal } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import { sendWhatsAppMessage, sendWhatsAppTemplate } from "../utils/billingApi";

const formatTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

const createMessageId = (prefix) => globalThis.crypto?.randomUUID?.() || `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

export default function WhatsAppConversation({ lead, showConversation = true }) {
  const { user } = useAuth();
  const { whatsappTemplates } = useData();
  const orgId = user?.activeOrgId;
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [clientMessageId, setClientMessageId] = useState(null);
  const [sending, setSending] = useState(false);
  const [templateSending, setTemplateSending] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [templateParameters, setTemplateParameters] = useState([]);
  const [templateMessageId, setTemplateMessageId] = useState(null);
  const [error, setError] = useState("");
  const outboxStorageKey = orgId && lead?.id ? `codeskate:whatsapp-outbox:${orgId}:${lead.id}` : null;
  const templateOutboxStorageKey = orgId && lead?.id ? `codeskate:whatsapp-template-outbox:${orgId}:${lead.id}` : null;
  const approvedTemplates = useMemo(() => whatsappTemplates
    .filter((template) => template.available && template.status === "APPROVED" && template.supported)
    .sort((left, right) => left.name.localeCompare(right.name)), [whatsappTemplates]);
  const selectedTemplate = approvedTemplates.find((template) => template.id === templateId) || null;

  useEffect(() => {
    if (!outboxStorageKey) return;
    try {
      const draft = JSON.parse(window.localStorage.getItem(outboxStorageKey) || "null");
      setText(draft?.text || "");
      setClientMessageId(draft?.clientMessageId || null);
    } catch {
      window.localStorage.removeItem(outboxStorageKey);
    }
  }, [outboxStorageKey]);

  useEffect(() => {
    if (!templateOutboxStorageKey) return;
    try {
      const draft = JSON.parse(window.localStorage.getItem(templateOutboxStorageKey) || "null");
      setTemplateId(draft?.templateId || "");
      setTemplateParameters(Array.isArray(draft?.parameters) ? draft.parameters : []);
      setTemplateMessageId(draft?.clientMessageId || null);
    } catch {
      window.localStorage.removeItem(templateOutboxStorageKey);
    }
  }, [templateOutboxStorageKey]);

  useEffect(() => {
    if (!selectedTemplate) return;
    setTemplateParameters((current) => Array.from(
      { length: Number(selectedTemplate.parameterCount || 0) },
      (_, index) => current[index] || ""
    ));
  }, [selectedTemplate?.id, selectedTemplate?.parameterCount]);

  useEffect(() => {
    if (!showConversation || !orgId || !lead?.id) return undefined;
    const messagesRef = collection(db, "organizations", orgId, "leads", lead.id, "messages");
    return onSnapshot(query(messagesRef, orderBy("atMs", "asc")),
      (snapshot) => setMessages(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))),
      () => setError("Could not load this WhatsApp conversation."));
  }, [orgId, lead?.id, showConversation]);

  const send = async (event) => {
    event.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    const stableMessageId = clientMessageId || createMessageId("wa");
    setClientMessageId(stableMessageId);
    window.localStorage.setItem(outboxStorageKey, JSON.stringify({ text: body, clientMessageId: stableMessageId }));
    try {
      await sendWhatsAppMessage({ orgId, leadId: lead.id, text: body, clientMessageId: stableMessageId });
      setText("");
      setClientMessageId(null);
      window.localStorage.removeItem(outboxStorageKey);
    } catch (requestError) {
      setError(requestError.code === "template_required"
        ? "The 24-hour reply window has ended. Select an approved template below."
        : requestError.code === "delivery_indeterminate"
          ? "Meta may have accepted this reply, so it has been held for reconciliation to avoid sending a duplicate."
          : requestError.message || "Could not send WhatsApp message.");
    } finally {
      setSending(false);
    }
  };

  const saveTemplateDraft = (nextTemplateId, nextParameters, nextMessageId = null) => {
    if (!templateOutboxStorageKey) return;
    if (!nextTemplateId) {
      window.localStorage.removeItem(templateOutboxStorageKey);
      return;
    }
    window.localStorage.setItem(templateOutboxStorageKey, JSON.stringify({
      templateId: nextTemplateId,
      parameters: nextParameters,
      clientMessageId: nextMessageId,
    }));
  };

  const chooseTemplate = (nextTemplateId) => {
    const template = approvedTemplates.find((item) => item.id === nextTemplateId);
    const nextParameters = Array.from({ length: Number(template?.parameterCount || 0) }, () => "");
    setTemplateId(nextTemplateId);
    setTemplateParameters(nextParameters);
    setTemplateMessageId(null);
    saveTemplateDraft(nextTemplateId, nextParameters, null);
  };

  const sendTemplate = async (event) => {
    event.preventDefault();
    if (!selectedTemplate || templateSending) return;
    const values = templateParameters.map((item) => item.trim());
    if (values.some((item) => !item)) {
      setError("Complete every template value before sending.");
      return;
    }
    setTemplateSending(true);
    setError("");
    const stableMessageId = templateMessageId || createMessageId("wa_template");
    setTemplateMessageId(stableMessageId);
    saveTemplateDraft(templateId, values, stableMessageId);
    try {
      await sendWhatsAppTemplate({
        orgId,
        leadId: lead.id,
        templateId,
        parameters: values,
        clientMessageId: stableMessageId,
      });
      setTemplateParameters(Array.from({ length: Number(selectedTemplate.parameterCount || 0) }, () => ""));
      setTemplateMessageId(null);
      saveTemplateDraft(templateId, Array.from({ length: Number(selectedTemplate.parameterCount || 0) }, () => ""), null);
    } catch (requestError) {
      setError(requestError.code === "delivery_indeterminate"
        ? "Meta may have accepted this template, so it has been held for reconciliation to avoid a duplicate."
        : requestError.message || "Could not send WhatsApp template.");
    } finally {
      setTemplateSending(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow border p-5">
      <div className="flex items-center gap-2 mb-3">
        <MessageCircle size={18} className="text-teal-600" />
        <h3 className="font-semibold">{showConversation ? "WhatsApp conversation" : "WhatsApp outreach"}</h3>
      </div>
      {showConversation && <div className="h-64 overflow-y-auto rounded-lg bg-gray-50 border p-3 space-y-2">
        {messages.length === 0 ? (
          <p className="text-sm text-gray-500 text-center pt-20">No WhatsApp messages have been received for this lead yet.</p>
        ) : messages.map((message) => (
          <div key={message.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${message.direction === "outbound" ? "ml-auto bg-teal-600 text-white" : "bg-white border text-gray-800"}`}>
            <p className="whitespace-pre-wrap break-words">{message.text || `[${message.type || "message"}]`}</p>
            <p className={`mt-1 text-[10px] ${message.direction === "outbound" ? "text-teal-100" : "text-gray-400"}`}>
              {message.direction === "outbound" ? `${message.type === "template" ? "Template · " : ""}${message.status === "sent" ? "Sent" : message.status}` : "Customer"} · {formatTime(message.at || message.sentAt || message.receivedAt)}
            </p>
          </div>
        ))}
      </div>}
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

      <form onSubmit={sendTemplate} className="mt-4 rounded-lg border border-teal-100 bg-teal-50/60 p-3">
        <div className="flex items-center gap-2"><SendHorizontal size={15} className="text-teal-700" /><p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Approved template</p></div>
        <select value={templateId} onChange={(event) => chooseTemplate(event.target.value)} className="mt-2 w-full rounded-lg border border-teal-200 bg-white p-2 text-sm">
          <option value="">Select a Meta-approved template</option>
          {approvedTemplates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.language}</option>)}
        </select>
        {selectedTemplate && <><p className="mt-2 rounded-md bg-white/80 p-2 text-xs text-teal-900">{selectedTemplate.preview}</p><div className="mt-2 space-y-2">{templateParameters.map((value, index) => <input key={index} value={value} onChange={(event) => {
          const next = [...templateParameters];
          next[index] = event.target.value;
          setTemplateParameters(next);
          setTemplateMessageId(null);
          saveTemplateDraft(templateId, next, null);
        }} maxLength="1024" className="w-full rounded-lg border border-teal-200 bg-white p-2 text-sm" placeholder={`Value for {{${index + 1}}}`} />)}</div><button disabled={templateSending} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{templateSending ? <Loader2 size={15} className="animate-spin" /> : <SendHorizontal size={15} />}{templateSending ? "Sending…" : "Send approved template"}</button></>}
        {!approvedTemplates.length && <p className="mt-2 text-xs text-teal-800">No approved, supported templates are synced. An admin can sync them from Automation.</p>}
      </form>
    </div>
  );
}
