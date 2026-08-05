import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { useData } from "../../context/DataContext";
import { useBilling } from "../../context/BillingContext";
import {
  createBroadcast,
  getBroadcasts,
  getBroadcastStatus,
  cancelBroadcast,
} from "../../utils/billingApi";
import {
  Send,
  Loader2,
  Filter,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Radio,
  AlertCircle,
  RefreshCw,
  Ban,
  Megaphone,
  ChevronDown,
  Eye,
  MessageCircle,
} from "lucide-react";

const STATUS_OPTIONS = ["New", "Ringing", "Meeting Fixed", "Negotiation", "Follow-up", "Closed-Won", "Lost"];
const SOURCE_OPTIONS = ["WhatsApp", "Website", "Meta Ads", "Google Ads", "Manual", "CSV Import"];

const fmtDate = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    ", " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
};

const statusBadge = (status) => {
  const map = {
    queued: { bg: "bg-gray-100 text-gray-700", icon: Clock },
    processing: { bg: "bg-blue-100 text-blue-700", icon: Radio },
    completed: { bg: "bg-green-100 text-green-700", icon: CheckCircle2 },
    completed_with_errors: { bg: "bg-amber-100 text-amber-700", icon: AlertCircle },
    failed: { bg: "bg-red-100 text-red-700", icon: XCircle },
    cancelled: { bg: "bg-gray-100 text-gray-500", icon: Ban },
  };
  const m = map[status] || map.queued;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${m.bg}`}>
      <Icon size={12} /> {status?.replace("_", " ")}
    </span>
  );
};

export default function Broadcast() {
  const { user } = useAuth();
  const { org } = useBilling();
  const { whatsappTemplates, employees } = useData();
  const navigate = useNavigate();
  const orgId = org?.id || user?.activeOrgId;

  // ── State
  const [view, setView] = useState("create"); // "create" | "history"
  const [broadcasts, setBroadcasts] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Create form
  const [templateId, setTemplateId] = useState("");
  const [parameters, setParameters] = useState([]);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterAssigned, setFilterAssigned] = useState("");
  const [broadcastName, setBroadcastName] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  const approvedTemplates = (whatsappTemplates || [])
    .filter((t) => t.available && t.status === "APPROVED" && t.supported)
    .sort((a, b) => a.name.localeCompare(b.name));

  const selectedTemplate = approvedTemplates.find((t) => t.id === templateId) || null;

  // ── Load history
  const fetchHistory = useCallback(async () => {
    if (!orgId) return;
    setLoadingHistory(true);
    try {
      const data = await getBroadcasts(orgId);
      setBroadcasts(Array.isArray(data.broadcasts) ? data.broadcasts : []);
    } catch (e) {
      console.warn("Broadcast history:", e.message);
    } finally {
      setLoadingHistory(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (view === "history") fetchHistory();
  }, [view, fetchHistory]);

  // ── Template selection
  const handleTemplateChange = (id) => {
    setTemplateId(id);
    const t = approvedTemplates.find((tpl) => tpl.id === id);
    setParameters(Array.from({ length: t?.parameterCount || 0 }, () => ""));
  };

  // ── Send broadcast
  const handleSend = async () => {
    if (!templateId || sending) return;
    if (selectedTemplate?.parameterCount > 0 && parameters.some((p) => !p.trim())) {
      setMsg({ type: "error", text: "Fill all template parameter values." });
      return;
    }
    setSending(true);
    setMsg({ type: "", text: "" });
    try {
      const filters = {};
      if (filterStatus) filters.status = filterStatus;
      if (filterSource) filters.source = filterSource;
      if (filterAssigned) filters.assignedTo = filterAssigned;

      const result = await createBroadcast({
        orgId,
        templateId,
        parameters: parameters.map((p) => p.trim()),
        filters: Object.keys(filters).length > 0 ? filters : null,
        name: broadcastName || undefined,
      });

      setMsg({ type: "success", text: `Broadcast started! Sending to ${result.totalRecipients} leads...` });
      setBroadcastName("");
      setTemplateId("");
      setParameters([]);
      setFilterStatus("");
      setFilterSource("");
      setFilterAssigned("");
    } catch (e) {
      setMsg({ type: "error", text: e.message || "Could not start broadcast." });
    } finally {
      setSending(false);
    }
  };

  // ── Cancel broadcast
  const handleCancel = async (broadcastId) => {
    if (!window.confirm("Cancel this broadcast? Messages already sent won't be reverted.")) return;
    try {
      await cancelBroadcast({ orgId, broadcastId });
      fetchHistory();
    } catch (e) {
      alert(e.message || "Could not cancel.");
    }
  };

  return (
    <Layout title="WhatsApp Broadcast">
      {/* ── Tab toggle ── */}
      <div className="flex items-center gap-2 mb-6">
        <div className="inline-flex bg-cream-200 rounded-full p-1 text-sm">
          <button onClick={() => setView("create")} className={`px-4 py-1.5 rounded-full font-medium ${view === "create" ? "bg-white shadow-sm text-ink" : "text-ink-muted"}`}>
            New Broadcast
          </button>
          <button onClick={() => setView("history")} className={`px-4 py-1.5 rounded-full font-medium ${view === "history" ? "bg-white shadow-sm text-ink" : "text-ink-muted"}`}>
            History
          </button>
        </div>
      </div>

      {/* ── Status message ── */}
      {msg.text && (
        <div className={`rounded-xl px-4 py-3 mb-6 text-sm flex items-center gap-2 ${
          msg.type === "success"
            ? "bg-green-50 border border-green-200 text-green-700"
            : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {msg.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {msg.text}
        </div>
      )}

      {view === "create" ? (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* ── Left: Template Selection ── */}
          <div className="lg:col-span-2 space-y-5">
            {/* Campaign name */}
            <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6">
              <label className="text-sm font-medium text-ink block mb-2">Campaign Name (optional)</label>
              <input
                type="text"
                value={broadcastName}
                onChange={(e) => setBroadcastName(e.target.value)}
                placeholder="e.g. Diwali Offer 2026"
                className="w-full rounded-lg border border-cream-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
              />
            </div>

            {/* Template selection */}
            <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6">
              <div className="flex items-center gap-2 mb-4">
                <MessageCircle size={18} className="text-teal-600" />
                <h3 className="font-display font-bold text-base text-ink">Select Template</h3>
              </div>

              {approvedTemplates.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-ink-muted">No approved templates found.</p>
                  <p className="text-xs text-ink-muted mt-1">Sync templates from the Automation page first.</p>
                </div>
              ) : (
                <>
                  <select
                    value={templateId}
                    onChange={(e) => handleTemplateChange(e.target.value)}
                    className="w-full rounded-lg border border-cream-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
                  >
                    <option value="">Choose an approved template...</option>
                    {approvedTemplates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} · {t.language}</option>
                    ))}
                  </select>

                  {selectedTemplate && (
                    <div className="mt-4 space-y-3">
                      <div className="bg-teal-50 rounded-lg p-3 border border-teal-100">
                        <p className="text-xs text-teal-700 font-medium mb-1 flex items-center gap-1">
                          <Eye size={12} /> Preview
                        </p>
                        <p className="text-sm text-teal-900">{selectedTemplate.preview}</p>
                      </div>

                      {selectedTemplate.parameterCount > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-ink-muted">Template Parameters</p>
                          {parameters.map((val, idx) => (
                            <input
                              key={idx}
                              value={val}
                              onChange={(e) => {
                                const next = [...parameters];
                                next[idx] = e.target.value;
                                setParameters(next);
                              }}
                              placeholder={`Value for {{${idx + 1}}}`}
                              className="w-full rounded-lg border border-cream-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={!templateId || sending}
              className="btn btn-primary w-full py-3 text-base flex items-center justify-center gap-2"
            >
              {sending ? (
                <><Loader2 size={18} className="animate-spin" /> Starting broadcast...</>
              ) : (
                <><Send size={18} /> Send Broadcast</>
              )}
            </button>
          </div>

          {/* ── Right: Filters ── */}
          <div className="space-y-5">
            <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Filter size={18} className="text-orange-500" />
                <h3 className="font-display font-bold text-base text-ink">Lead Filters</h3>
              </div>
              <p className="text-xs text-ink-muted mb-4">
                Filter which leads receive this broadcast. Leave empty to send to all leads with WhatsApp numbers.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-ink-muted block mb-1">Status</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full rounded-lg border border-cream-300 px-3 py-2 text-sm"
                  >
                    <option value="">All statuses</option>
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-ink-muted block mb-1">Source</label>
                  <select
                    value={filterSource}
                    onChange={(e) => setFilterSource(e.target.value)}
                    className="w-full rounded-lg border border-cream-300 px-3 py-2 text-sm"
                  >
                    <option value="">All sources</option>
                    {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-ink-muted block mb-1">Assigned To</label>
                  <select
                    value={filterAssigned}
                    onChange={(e) => setFilterAssigned(e.target.value)}
                    className="w-full rounded-lg border border-cream-300 px-3 py-2 text-sm"
                  >
                    <option value="">All team members</option>
                    {(employees || []).map((emp) => (
                      <option key={emp.uid || emp.id} value={emp.uid || emp.id}>
                        {emp.displayName || emp.name || emp.phone}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-cream-200">
                <div className="flex items-center gap-2 text-xs text-ink-muted">
                  <Users size={14} className="text-orange-400" />
                  <span>Only leads with valid WhatsApp numbers will receive the message.</span>
                </div>
              </div>
            </div>

            {/* Info card */}
            <div className="bg-orange-50 rounded-2xl border border-orange-200 p-5">
              <h4 className="font-display font-bold text-sm text-orange-800 mb-2 flex items-center gap-1.5">
                <Megaphone size={15} /> Broadcast Tips
              </h4>
              <ul className="text-xs text-orange-700 space-y-1.5">
                <li>• Only Meta-approved templates can be used for broadcasts</li>
                <li>• Messages are sent in batches (~50/sec) to respect rate limits</li>
                <li>• You can cancel a running broadcast anytime</li>
                <li>• New accounts: 1,000 msgs/day. Scale tier: up to 100K/day</li>
                <li>• Keep template quality high to avoid Meta restrictions</li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        /* ── HISTORY VIEW ── */
        <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 overflow-hidden">
          <div className="px-6 py-4 border-b border-cream-200 flex items-center justify-between">
            <h3 className="font-display font-bold text-base text-ink flex items-center gap-2">
              <Clock size={16} className="text-orange-500" /> Broadcast History
            </h3>
            <button onClick={fetchHistory} className="text-sm text-ink-muted hover:text-ink flex items-center gap-1">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          {loadingHistory ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-orange-400" />
            </div>
          ) : broadcasts.length === 0 ? (
            <div className="text-center py-12 px-6">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-cream-100 flex items-center justify-center mb-3">
                <Megaphone size={24} className="text-ink-muted" />
              </div>
              <p className="text-sm text-ink-muted">No broadcasts yet.</p>
              <p className="text-xs text-ink-muted mt-1">Create your first broadcast to reach leads at scale.</p>
            </div>
          ) : (
            <div className="divide-y divide-cream-100">
              {broadcasts.map((bc) => (
                <div key={bc.id} className="px-6 py-4 hover:bg-cream-50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold text-ink truncate">{bc.name || bc.templateName}</p>
                        {statusBadge(bc.status)}
                      </div>
                      <p className="text-xs text-ink-muted">
                        Template: {bc.templateName} · {fmtDate(bc.createdAt)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-ink">{bc.sent || 0}/{bc.totalRecipients}</p>
                      <p className="text-xs text-ink-muted">
                        {bc.failed > 0 && <span className="text-red-500">{bc.failed} failed</span>}
                      </p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {(bc.status === "processing" || bc.status === "queued") && (
                    <div className="mt-2">
                      <div className="w-full bg-cream-200 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full bg-gradient-to-r from-orange-400 to-amber-500 transition-all"
                          style={{ width: `${bc.totalRecipients > 0 ? Math.round(((bc.sent || 0) + (bc.failed || 0)) / bc.totalRecipients * 100) : 0}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-ink-muted">{bc.sent || 0} sent</span>
                        <button
                          onClick={() => handleCancel(bc.id)}
                          className="text-[10px] text-red-500 hover:text-red-700 font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
