/**
 * AI Customer Care — Org Admin Configuration Page.
 *
 * Sections:
 * 1. AI On/Off + General Settings
 * 2. Knowledge Base Manager
 * 3. Test Playground
 * 4. Usage Analytics
 */

import { useEffect, useState, useCallback } from "react";
import {
  Brain, BookOpen, FlaskConical, BarChart3, Power, Save,
  Plus, Trash2, Edit3, Send, Loader2, CheckCircle2, AlertTriangle,
  MessageCircle, Zap, TrendingUp, Clock,
} from "lucide-react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import {
  getAIConfig, saveAIConfig, listKnowledgeBase, createArticle,
  updateArticle, deleteArticle, testAI, getAIUsage,
} from "../../utils/aiApi";


const TABS = [
  { id: "settings", label: "Settings", icon: Power },
  { id: "knowledge", label: "Knowledge Base", icon: BookOpen },
  { id: "playground", label: "Test AI", icon: FlaskConical },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
];

const TONE_OPTIONS = [
  { value: "friendly", label: "Friendly", desc: "Warm and approachable" },
  { value: "formal", label: "Formal", desc: "Professional and polished" },
  { value: "sales", label: "Sales-focused", desc: "Persuasive and conversion-driven" },
];

// Mirrors DEFAULT_QUALIFICATION_QUESTIONS on the backend. Shown (and saved on
// first edit) when the org has not customised the flow yet.
const DEFAULT_QUESTIONS = [
  { id: "name", field: "name", type: "text", question: "Hi! 👋 Thanks for reaching out. Before we begin — may I know your name?" },
  {
    id: "interest", field: "requirement", type: "buttons",
    question: "Great to meet you! What can we help you with today?",
    options: [
      { id: "pricing", title: "Pricing" },
      { id: "products", title: "Product info" },
      { id: "support", title: "Support" },
    ],
  },
  {
    id: "timeline", type: "buttons",
    question: "Got it. When are you looking to move forward?",
    options: [
      { id: "immediately", title: "Immediately" },
      { id: "this_month", title: "This month" },
      { id: "exploring", title: "Just exploring" },
    ],
  },
];

const slugId = (text, fallback) =>
  String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || fallback;


function SettingsTab({ config, setConfig, saving, onSave }) {
  // Editing any question materializes the defaults into saved config, so what
  // the admin sees on screen is exactly what runs.
  const currentQuestions = () =>
    config.qualificationQuestions?.length ? config.qualificationQuestions : DEFAULT_QUESTIONS;

  const writeQuestions = (questions) =>
    setConfig((c) => ({ ...c, qualificationQuestions: questions }));

  const updateQuestion = (index, patch) => {
    const next = currentQuestions().map((q, i) => {
      if (i !== index) return q;
      const merged = { ...q, ...patch };
      // Keep a stable id so in-flight leads mid-flow don't lose their place.
      if (!merged.id) merged.id = slugId(merged.question, `q${index + 1}`);
      return merged;
    });
    writeQuestions(next);
  };

  const removeQuestion = (index) => writeQuestions(currentQuestions().filter((_, i) => i !== index));

  const addQuestion = () => writeQuestions([
    ...currentQuestions(),
    { id: `q${currentQuestions().length + 1}_${Date.now().toString(36)}`, type: "text", question: "", field: "" },
  ]);

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-ink">AI Customer Care</h3>
            <p className="text-sm text-ink-muted">Enable AI to auto-respond to WhatsApp messages</p>
          </div>
          <button
            onClick={() => setConfig((c) => ({ ...c, enabled: !c.enabled }))}
            className={`relative w-12 h-6 rounded-full transition-colors ${config.enabled ? "bg-emerald-500" : "bg-cream-300"}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${config.enabled ? "translate-x-6" : ""}`} />
          </button>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h3 className="font-semibold text-ink">Business Information</h3>
        <div>
          <label className="text-sm font-medium text-ink-soft">Business Name</label>
          <input
            type="text" value={config.businessName || ""}
            onChange={(e) => setConfig((c) => ({ ...c, businessName: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm"
            placeholder="Your Business Name"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-ink-soft">Business Description</label>
          <textarea
            value={config.businessDescription || ""} rows={3}
            onChange={(e) => setConfig((c) => ({ ...c, businessDescription: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm"
            placeholder="Brief description of what your business does..."
          />
        </div>
      </div>


      <div className="card p-6 space-y-4">
        <h3 className="font-semibold text-ink">Response Tone</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TONE_OPTIONS.map((opt) => (
            <button key={opt.value}
              onClick={() => setConfig((c) => ({ ...c, tone: opt.value }))}
              className={`p-3 rounded-xl border text-left transition-all ${config.tone === opt.value ? "border-orange-400 bg-orange-50 ring-1 ring-orange-200" : "border-cream-200 hover:border-cream-300"}`}
            >
              <p className="text-sm font-semibold text-ink">{opt.label}</p>
              <p className="text-xs text-ink-muted mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h3 className="font-semibold text-ink">AI Behavior</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-ink-soft">Confidence Threshold</label>
            <input type="number" step="0.05" min="0.3" max="1" value={config.confidenceThreshold ?? 0.7}
              onChange={(e) => setConfig((c) => ({ ...c, confidenceThreshold: Number(e.target.value) }))}
              className="mt-1 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm" />
            <p className="text-xs text-ink-muted mt-1">Higher = fewer auto-replies but more accurate</p>
          </div>
          <div>
            <label className="text-sm font-medium text-ink-soft">Daily Message Limit</label>
            <input type="number" min="1" max="50000" value={config.dailyLimit ?? 500}
              onChange={(e) => setConfig((c) => ({ ...c, dailyLimit: Number(e.target.value) }))}
              className="mt-1 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-soft">Max AI Replies Per Lead</label>
            <input type="number" min="1" max="100" value={config.maxAutoRepliesPerLead ?? 10}
              onChange={(e) => setConfig((c) => ({ ...c, maxAutoRepliesPerLead: Number(e.target.value) }))}
              className="mt-1 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm" />
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" checked={config.workingHoursOnly || false}
              onChange={(e) => setConfig((c) => ({ ...c, workingHoursOnly: e.target.checked }))}
              className="rounded border-cream-300" />
            <label className="text-sm text-ink-soft">Only reply outside working hours (AI as after-hours support)</label>
          </div>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-ink">Lead Qualification</h3>
          <p className="text-sm text-ink-muted">
            Before answering questions, AI can collect the customer's name and what they need — asked one
            at a time using tappable WhatsApp buttons.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input type="checkbox" checked={config.qualificationEnabled || false}
            onChange={(e) => setConfig((c) => ({ ...c, qualificationEnabled: e.target.checked }))}
            className="rounded border-cream-300" />
          <label className="text-sm text-ink-soft">Ask qualifying questions to new leads</label>
        </div>

        {config.qualificationEnabled && (
          <>
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
              <p className="text-xs text-blue-700">
                Questions are asked in order, once per lead. A customer can tap an option or type their own
                answer — both advance the flow. Once complete, AI switches to normally answering questions.
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium text-ink-soft uppercase tracking-wide">Questions</p>
              {(config.qualificationQuestions?.length ? config.qualificationQuestions : DEFAULT_QUESTIONS).map((q, i) => (
                <div key={i} className="rounded-xl border border-cream-200 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="mt-2 text-xs font-mono text-ink-muted">{i + 1}</span>
                    <input
                      value={q.question || ""}
                      onChange={(e) => updateQuestion(i, { question: e.target.value })}
                      placeholder="Question to ask"
                      className="flex-1 rounded-lg border border-cream-200 px-3 py-2 text-sm"
                    />
                    <button onClick={() => removeQuestion(i)} title="Remove question"
                      className="mt-1 text-ink-muted hover:text-danger-600 px-1">✕</button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pl-6">
                    <select value={q.type || "text"} onChange={(e) => updateQuestion(i, { type: e.target.value })}
                      className="rounded-lg border border-cream-200 px-2 py-1.5 text-xs">
                      <option value="text">Free text answer</option>
                      <option value="buttons">Buttons (max 3)</option>
                      <option value="list">Menu list (max 10)</option>
                    </select>

                    <select value={q.field || ""} onChange={(e) => updateQuestion(i, { field: e.target.value })}
                      className="rounded-lg border border-cream-200 px-2 py-1.5 text-xs">
                      <option value="">Don't save to lead</option>
                      <option value="name">Save as lead name</option>
                      <option value="email">Save as email</option>
                      <option value="requirement">Save as requirement</option>
                      <option value="city">Save as city</option>
                      <option value="company">Save as company</option>
                    </select>
                  </div>

                  {(q.type === "buttons" || q.type === "list") && (
                    <div className="pl-6">
                      <input
                        value={(q.options || []).map((o) => o.title).join(", ")}
                        onChange={(e) => updateQuestion(i, {
                          options: e.target.value.split(",").map((t) => t.trim()).filter(Boolean)
                            .map((title) => ({ id: title.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30), title })),
                        })}
                        placeholder="Options, comma separated — e.g. Pricing, Product info, Support"
                        className="w-full rounded-lg border border-cream-200 px-3 py-2 text-xs"
                      />
                      <p className="text-[11px] text-ink-muted mt-1">
                        WhatsApp allows 3 buttons (20 chars each) or 10 menu rows (24 chars each).
                      </p>
                    </div>
                  )}
                </div>
              ))}

              <button onClick={addQuestion}
                className="text-sm text-orange-600 hover:text-orange-700 font-medium">
                + Add question
              </button>
            </div>

            <div>
              <label className="text-sm font-medium text-ink-soft">Message after qualification completes</label>
              <input value={config.qualificationCompleteMessage || ""}
                onChange={(e) => setConfig((c) => ({ ...c, qualificationCompleteMessage: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm"
                placeholder="Thank you! Go ahead and ask me anything — I'm here to help." />
            </div>
          </>
        )}
      </div>

      <div className="card p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-ink">Agent Handover</h3>
          <p className="text-sm text-ink-muted">
            When a team member takes over a chat, let the customer know who they're now talking to.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input type="checkbox" checked={config.agentIntroEnabled !== false}
            onChange={(e) => setConfig((c) => ({ ...c, agentIntroEnabled: e.target.checked }))}
            className="rounded border-cream-300" />
          <label className="text-sm text-ink-soft">Tell the customer the agent's name on takeover</label>
        </div>

        {config.agentIntroEnabled !== false && (
          <div>
            <label className="text-sm font-medium text-ink-soft">Handover message</label>
            <input value={config.agentIntroTemplate ?? "👤 {agent} from our team is now assisting you."}
              onChange={(e) => setConfig((c) => ({ ...c, agentIntroTemplate: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm" />
            <p className="text-xs text-ink-muted mt-1">
              Use <code className="font-mono">{"{agent}"}</code> where the agent's name should appear.
              Only sent if the customer messaged within the last 24 hours (WhatsApp policy).
            </p>
          </div>
        )}
      </div>

      <div className="card p-6 space-y-4">
        <h3 className="font-semibold text-ink">Product / Service Catalogue</h3>
        <p className="text-sm text-ink-muted">When customers ask about your products or services, how should AI respond?</p>

        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 mb-2">
          <p className="text-xs text-emerald-700"><strong>Recommended:</strong> Just add your products, pricing, and services info in the <strong>Knowledge Base</strong> tab above. AI will use that information to answer customer queries naturally. No extra setup needed.</p>
        </div>

        <p className="text-xs font-medium text-ink-soft uppercase tracking-wide mt-4">Optional: Share a catalogue link</p>
        <div className="space-y-3">
          {[
            { value: "none", label: "Knowledge Base Only", desc: "AI answers from your knowledge base articles (recommended for most businesses)" },
            { value: "whatsapp_catalogue", label: "WhatsApp Catalogue Link", desc: "Also share your WhatsApp Business catalogue when customers ask to browse" },
            { value: "website", label: "Website Link", desc: "Also share your website or specific category pages" },
          ].map((opt) => (
            <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${config.catalogueMode === opt.value || (!config.catalogueMode && opt.value === "none") ? "border-orange-300 bg-orange-50/50" : "border-cream-200 hover:border-cream-300"}`}>
              <input type="radio" name="catalogueMode" value={opt.value} checked={config.catalogueMode === opt.value || (!config.catalogueMode && opt.value === "none")}
                onChange={() => setConfig((c) => ({ ...c, catalogueMode: opt.value }))}
                className="mt-0.5 text-orange-500" />
              <div>
                <p className="text-sm font-medium text-ink">{opt.label}</p>
                <p className="text-xs text-ink-muted">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>

        {config.catalogueMode === "whatsapp_catalogue" && (
          <div className="ml-6 mt-2">
            <label className="text-sm font-medium text-ink-soft">WhatsApp Catalogue Link</label>
            <input type="url" value={config.catalogueLink || ""}
              onChange={(e) => setConfig((c) => ({ ...c, catalogueLink: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm"
              placeholder="https://wa.me/c/919XXXXXXXXX" />
            <p className="text-xs text-ink-muted mt-1">Get this from WhatsApp Business → Settings → Catalogue → Share link</p>
          </div>
        )}

        {config.catalogueMode === "website" && (
          <div className="ml-6 mt-2 space-y-3">
            <div>
              <label className="text-sm font-medium text-ink-soft">Website URL</label>
              <input type="url" value={config.websiteUrl || ""}
                onChange={(e) => setConfig((c) => ({ ...c, websiteUrl: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm"
                placeholder="https://yourwebsite.com" />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-soft">Category Pages (optional)</label>
              <p className="text-xs text-ink-muted mb-2">Add specific pages so AI can share the right link based on what customer asks</p>
              {(config.categoryPages || []).map((page, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input type="text" value={page.name} placeholder="Category name"
                    onChange={(e) => { const pages = [...(config.categoryPages || [])]; pages[i] = { ...pages[i], name: e.target.value }; setConfig((c) => ({ ...c, categoryPages: pages })); }}
                    className="flex-1 rounded-lg border border-cream-200 px-3 py-2 text-sm" />
                  <input type="text" value={page.url} placeholder="/collections/earrings"
                    onChange={(e) => { const pages = [...(config.categoryPages || [])]; pages[i] = { ...pages[i], url: e.target.value }; setConfig((c) => ({ ...c, categoryPages: pages })); }}
                    className="flex-1 rounded-lg border border-cream-200 px-3 py-2 text-sm" />
                  <button type="button" onClick={() => { const pages = [...(config.categoryPages || [])]; pages.splice(i, 1); setConfig((c) => ({ ...c, categoryPages: pages })); }}
                    className="px-2 text-red-500 hover:bg-red-50 rounded">×</button>
                </div>
              ))}
              <button type="button" onClick={() => setConfig((c) => ({ ...c, categoryPages: [...(c.categoryPages || []), { name: "", url: "" }] }))}
                className="text-sm text-orange-600 font-medium hover:underline">+ Add category page</button>
            </div>
          </div>
        )}
      </div>

      <button onClick={onSave} disabled={saving}
        className="btn-primary flex items-center gap-2">
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        Save Settings
      </button>
    </div>
  );
}


function KnowledgeTab({ orgId }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ title: "", content: "", category: "general", priority: 0 });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listKnowledgeBase(orgId);
      setArticles(data.articles || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editId) {
        await updateArticle(orgId, editId, form);
      } else {
        await createArticle(orgId, form);
      }
      setShowForm(false); setEditId(null);
      setForm({ title: "", content: "", category: "general", priority: 0 });
      await load();
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this article?")) return;
    try { await deleteArticle(orgId, id); await load(); } catch (e) { alert(e.message); }
  };

  const startEdit = (article) => {
    setForm({ title: article.title, content: article.content, category: article.category, priority: article.priority || 0 });
    setEditId(article.id); setShowForm(true);
  };

  if (loading) return <div className="py-12 text-center text-ink-muted">Loading knowledge base...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-ink">Knowledge Base ({articles.length}/100)</h3>
          <p className="text-sm text-ink-muted">Add FAQs, product info, and policies for AI to use</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm({ title: "", content: "", category: "general", priority: 0 }); }}
          className="btn-primary text-sm flex items-center gap-1.5"><Plus size={14} /> Add Article</button>
      </div>


      {showForm && (
        <div className="card p-5 space-y-3 border-orange-200 bg-orange-50/30">
          <input type="text" value={form.title} placeholder="Article title"
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full rounded-lg border border-cream-200 px-3 py-2 text-sm" />
          <textarea value={form.content} rows={6} placeholder="Article content — what should AI know?"
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            className="w-full rounded-lg border border-cream-200 px-3 py-2 text-sm" />
          <div className="flex gap-3">
            <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="rounded-lg border border-cream-200 px-3 py-2 text-sm">
              <option value="general">General</option>
              <option value="pricing">Pricing</option>
              <option value="product">Product</option>
              <option value="support">Support</option>
              <option value="policy">Policy</option>
              <option value="faq">FAQ</option>
            </select>
            <input type="number" value={form.priority} min={0} max={100} placeholder="Priority"
              onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
              className="w-24 rounded-lg border border-cream-200 px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !form.title || !form.content}
              className="btn-primary text-sm flex items-center gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {editId ? "Update" : "Create"}
            </button>
            <button onClick={() => setShowForm(false)} className="btn-ghost text-sm">Cancel</button>
          </div>
        </div>
      )}

      {articles.length === 0 ? (
        <div className="card p-12 text-center">
          <BookOpen size={32} className="mx-auto text-cream-300 mb-3" />
          <p className="text-ink-muted text-sm">No knowledge base articles yet. Add your FAQs and product info so AI can respond accurately.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {articles.map((article) => (
            <div key={article.id} className="card p-4 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-ink truncate">{article.title}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-cream-100 text-ink-muted">{article.category}</span>
                  {!article.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Inactive</span>}
                </div>
                <p className="text-xs text-ink-soft mt-1 line-clamp-2">{article.content}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => startEdit(article)} className="p-1.5 rounded hover:bg-cream-100"><Edit3 size={14} className="text-ink-muted" /></button>
                <button onClick={() => handleDelete(article.id)} className="p-1.5 rounded hover:bg-red-50"><Trash2 size={14} className="text-red-500" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function PlaygroundTab({ orgId }) {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const runTest = async () => {
    if (!message.trim()) return;
    setTesting(true); setResult(null);
    try {
      const data = await testAI(orgId, message);
      setResult(data);
    } catch (e) { setResult({ success: false, error: e.message }); }
    setTesting(false);
  };

  return (
    <div className="space-y-4">
      <div className="card p-6">
        <h3 className="font-semibold text-ink mb-1">Test AI Response</h3>
        <p className="text-sm text-ink-muted mb-4">Type a customer message to see how AI would respond</p>
        <div className="flex gap-2">
          <input type="text" value={message} placeholder="Type a customer message..."
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runTest()}
            className="flex-1 rounded-lg border border-cream-200 px-3 py-2 text-sm" />
          <button onClick={runTest} disabled={testing || !message.trim()}
            className="btn-primary flex items-center gap-1.5 text-sm">
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Test
          </button>
        </div>
      </div>

      {result && (
        <div className={`card p-5 ${result.success ? "border-emerald-200 bg-emerald-50/30" : "border-red-200 bg-red-50/30"}`}>
          {result.success ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 size={16} /> <span className="text-sm font-semibold">AI Response</span>
              </div>
              <p className="text-sm text-ink whitespace-pre-wrap">{result.response}</p>
              <div className="flex flex-wrap gap-3 text-xs text-ink-muted pt-2 border-t border-emerald-100">
                <span>Intent: <strong>{result.intent}</strong></span>
                <span>Confidence: <strong>{(result.confidence * 100).toFixed(0)}%</strong></span>
                <span>Tokens: <strong>{result.tokensUsed}</strong></span>
                <span>Model: <strong>{result.model}</strong></span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle size={16} /> <span className="text-sm">{result.error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function AnalyticsTab({ orgId }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAIUsage(orgId, 30).then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, [orgId]);

  if (loading) return <div className="py-12 text-center text-ink-muted">Loading analytics...</div>;
  if (!stats) return <div className="card p-12 text-center text-ink-muted">No usage data yet</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 text-center">
          <MessageCircle size={20} className="mx-auto text-orange-500 mb-1" />
          <p className="text-xl font-bold text-ink">{stats.totals?.totalCalls || 0}</p>
          <p className="text-[11px] text-ink-muted">Total AI Calls</p>
        </div>
        <div className="card p-4 text-center">
          <Zap size={20} className="mx-auto text-emerald-500 mb-1" />
          <p className="text-xl font-bold text-ink">{stats.resolutionRate || 0}%</p>
          <p className="text-[11px] text-ink-muted">Auto-Resolved</p>
        </div>
        <div className="card p-4 text-center">
          <TrendingUp size={20} className="mx-auto text-blue-500 mb-1" />
          <p className="text-xl font-bold text-ink">{stats.totals?.autoReplies || 0}</p>
          <p className="text-[11px] text-ink-muted">AI Replies Sent</p>
        </div>
        {/* Escalations, not infrastructure cost — token spend is the platform's
            operating cost, not something the customer is billed for, so showing
            it here was misleading. Customers are metered by their plan's
            monthly AI reply allowance instead. */}
        <div className="card p-4 text-center">
          <Clock size={20} className="mx-auto text-purple-500 mb-1" />
          <p className="text-xl font-bold text-ink">{stats.totals?.escalations || 0}</p>
          <p className="text-[11px] text-ink-muted">Sent to Agent</p>
        </div>
      </div>

      {stats.dailyStats?.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-ink mb-3">Daily Activity (Last 30 Days)</h3>
          <div className="flex items-end gap-1 h-24">
            {stats.dailyStats.map((day, i) => {
              const max = Math.max(...stats.dailyStats.map((d) => d.totalCalls || 0), 1);
              const height = ((day.totalCalls || 0) / max) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end" title={`${day.date}: ${day.totalCalls} calls`}>
                  <div className="w-full rounded-t bg-orange-400" style={{ height: `${Math.max(height, 2)}%` }} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


export default function AICustomerCare() {
  const { user } = useAuth();
  const orgId = user?.activeOrgId;
  const [tab, setTab] = useState("settings");
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!orgId) return;
    getAIConfig(orgId).then(setConfig).catch(() => {}).finally(() => setLoading(false));
  }, [orgId]);

  const handleSave = async () => {
    setSaving(true); setMsg("");
    try {
      const updated = await saveAIConfig(orgId, config);
      setConfig(updated); setMsg("Settings saved!");
      setTimeout(() => setMsg(""), 3000);
    } catch (e) { setMsg(e.message); }
    setSaving(false);
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-24">
          <Loader2 size={24} className="animate-spin text-orange-500" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <Brain size={24} className="text-orange-500" />
            <h1 className="text-xl font-display font-bold text-ink">AI Customer Care</h1>
            {config.enabled && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">ACTIVE</span>}
          </div>
          <p className="text-sm text-ink-muted">Configure AI-powered WhatsApp auto-replies for your customers</p>
        </div>

        <div className="flex gap-1 mb-6 border-b border-cream-200">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? "border-orange-500 text-orange-600" : "border-transparent text-ink-muted hover:text-ink"}`}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {msg && <div className={`mb-4 p-3 rounded-lg text-sm ${msg.includes("saved") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{msg}</div>}

        {tab === "settings" && <SettingsTab config={config} setConfig={setConfig} saving={saving} onSave={handleSave} />}
        {tab === "knowledge" && <KnowledgeTab orgId={orgId} />}
        {tab === "playground" && <PlaygroundTab orgId={orgId} />}
        {tab === "analytics" && <AnalyticsTab orgId={orgId} />}
      </div>
    </Layout>
  );
}
