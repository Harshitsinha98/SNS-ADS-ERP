import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { useData } from "../../context/DataContext";
import { useBilling } from "../../context/BillingContext";
import {
  createBroadcast,
  previewBroadcastAudience,
  getBroadcasts,
  getBroadcastAnalytics,
  cancelBroadcast,
} from "../../utils/billingApi";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
  Cell,
} from "recharts";
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
  Eye,
  MessageCircle,
  CheckCheck,
  TrendingUp,
  Calendar,
  Send as SendIcon,
  Zap,
  ChevronRight,
} from "lucide-react";

const STATUS_OPTIONS = ["New", "Ringing", "Meeting Fixed", "Negotiation", "Follow-up", "Closed-Won", "Lost"];
const SOURCE_OPTIONS = ["WhatsApp", "Website", "Meta Ads", "Google Ads", "Manual", "CSV Import"];

const fmtDate = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) +
    ", " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
};

const statusBadge = (status) => {
  const map = {
    scheduled: { bg: "bg-indigo-100 text-indigo-700", icon: Calendar },
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
      <Icon size={12} /> {String(status || "").replace(/_/g, " ")}
    </span>
  );
};

export default function Broadcast() {
  const { user } = useAuth();
  const { org } = useBilling();
  const { whatsappTemplates, users } = useData();
  const navigate = useNavigate();
  const orgId = org?.id || user?.activeOrgId;

  const [view, setView] = useState("dashboard"); // "dashboard" | "create" | "history"

  return (
    <Layout title="WhatsApp Broadcast">
      {/* ── Tab toggle ── */}
      <div className="flex items-center gap-2 mb-6">
        <div className="inline-flex bg-cream-200 rounded-full p-1 text-sm">
          {[
            { key: "dashboard", label: "Dashboard" },
            { key: "create", label: "New Broadcast" },
            { key: "history", label: "History" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={`px-4 py-1.5 rounded-full font-medium ${view === t.key ? "bg-white shadow-sm text-ink" : "text-ink-muted"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {view === "dashboard" && <DashboardView orgId={orgId} onNew={() => setView("create")} navigate={navigate} />}
      {view === "create" && (
        <CreateView
          orgId={orgId}
          user={user}
          whatsappTemplates={whatsappTemplates}
          users={users}
          onSent={() => setView("history")}
        />
      )}
      {view === "history" && <HistoryView orgId={orgId} navigate={navigate} />}
    </Layout>
  );
}

/* ═══════════════════════════════ DASHBOARD ═══════════════════════════════ */

function DashboardView({ orgId, onNew, navigate }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await getBroadcastAnalytics(orgId);
      setAnalytics(data);
    } catch (e) {
      console.warn("Broadcast analytics:", e.message);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-orange-400" /></div>;
  }

  if (!analytics || analytics.totals.broadcasts === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 text-center py-16 px-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center mb-4">
          <Megaphone className="text-white" size={28} />
        </div>
        <h3 className="font-display font-bold text-xl text-ink mb-2">No broadcasts yet</h3>
        <p className="text-sm text-ink-muted mb-5 max-w-md mx-auto">
          Reach hundreds of leads at once with approved WhatsApp templates. Track delivery, reads, and failures in real time.
        </p>
        <button onClick={onNew} className="btn btn-primary inline-flex items-center gap-2">
          <Send size={16} /> Create your first broadcast
        </button>
      </div>
    );
  }

  const { totals, rates, funnel, topTemplates, timeSeries, recent } = analytics;

  const funnelData = [
    { name: "Sent", value: funnel.sent, color: "#3E7CB1" },
    { name: "Delivered", value: funnel.delivered, color: "#2BAE66" },
    { name: "Read", value: funnel.read, color: "#F04E00" },
    { name: "Failed", value: funnel.failed, color: "#E14B4B" },
  ];

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={SendIcon} label="Total Sent" value={totals.sent.toLocaleString("en-IN")} color="from-blue-500 to-indigo-600" sub={`${totals.broadcasts} broadcasts`} />
        <KpiCard icon={CheckCheck} label="Delivery Rate" value={`${rates.deliveryRate}%`} color="from-green-500 to-emerald-600" sub={`${totals.delivered.toLocaleString("en-IN")} delivered`} />
        <KpiCard icon={Eye} label="Read Rate" value={`${rates.readRate}%`} color="from-orange-500 to-amber-500" sub={`${totals.read.toLocaleString("en-IN")} read`} />
        <KpiCard icon={XCircle} label="Failure Rate" value={`${rates.failureRate}%`} color="from-red-500 to-rose-600" sub={`${totals.failed.toLocaleString("en-IN")} failed`} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Time series */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-card border border-cream-300/60 p-6">
          <h3 className="font-display font-bold text-base text-ink mb-1">Activity (Last 30 Days)</h3>
          <p className="text-xs text-ink-muted mb-4">Messages sent, delivered, and read over time</p>
          {timeSeries.length === 0 ? (
            <p className="text-sm text-ink-muted text-center py-12">No recent activity.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={timeSeries} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3E7CB1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3E7CB1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gRead" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F04E00" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F04E00" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E6E1D6" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Area type="monotone" dataKey="sent" stroke="#3E7CB1" fill="url(#gSent)" strokeWidth={2} />
                <Area type="monotone" dataKey="read" stroke="#F04E00" fill="url(#gRead)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Delivery funnel */}
        <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6">
          <h3 className="font-display font-bold text-base text-ink mb-1">Delivery Funnel</h3>
          <p className="text-xs text-ink-muted mb-4">Across all broadcasts</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={funnelData} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E6E1D6" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={70} />
              <Tooltip />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {funnelData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top templates */}
        <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6">
          <h3 className="font-display font-bold text-base text-ink mb-4">Top Templates</h3>
          {topTemplates.length === 0 ? (
            <p className="text-sm text-ink-muted text-center py-8">No template data.</p>
          ) : (
            <div className="space-y-3">
              {topTemplates.map((t, i) => {
                const max = topTemplates[0].sent || 1;
                return (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-ink font-medium truncate">{t.name}</span>
                      <span className="text-ink-muted">{t.sent.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="w-full bg-cream-200 rounded-full h-2">
                      <div className="h-2 rounded-full bg-gradient-to-r from-orange-400 to-amber-500" style={{ width: `${Math.round((t.sent / max) * 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent broadcasts */}
        <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-base text-ink">Recent Broadcasts</h3>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-ink-muted text-center py-8">No broadcasts yet.</p>
          ) : (
            <div className="space-y-2">
              {recent.map((b) => (
                <button
                  key={b.id}
                  onClick={() => navigate(`/admin/broadcast/${b.id}`)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-cream-50 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{b.name || b.templateName}</p>
                    <p className="text-xs text-ink-muted">{fmtDate(b.createdAt)}</p>
                  </div>
                  {statusBadge(b.status)}
                  <span className="text-sm text-ink-muted whitespace-nowrap">{b.sent || 0}/{b.totalRecipients}</span>
                  <ChevronRight size={16} className="text-ink-muted" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-5">
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-3`}>
        <Icon className="text-white" size={18} />
      </div>
      <p className="font-display font-bold text-2xl text-ink">{value}</p>
      <p className="text-sm text-ink-muted">{label}</p>
      {sub && <p className="text-xs text-ink-muted mt-0.5">{sub}</p>}
    </div>
  );
}

/* ═══════════════════════════════ CREATE ═══════════════════════════════ */

function CreateView({ orgId, user, whatsappTemplates, users, onSent }) {
  const [templateId, setTemplateId] = useState("");
  const [parameters, setParameters] = useState([]);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterAssigned, setFilterAssigned] = useState("");
  const [broadcastName, setBroadcastName] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  // Audience preview
  const [audienceCount, setAudienceCount] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const previewTimer = useRef(null);

  // Scheduling
  const [scheduleMode, setScheduleMode] = useState("now"); // "now" | "later"
  const [scheduleAt, setScheduleAt] = useState("");

  const employees = (users || []).filter((u) => u.role === "employee" || u.role === "admin" || u.role === "owner");

  const approvedTemplates = (whatsappTemplates || [])
    .filter((t) => t.available && t.status === "APPROVED" && t.supported)
    .sort((a, b) => a.name.localeCompare(b.name));
  const selectedTemplate = approvedTemplates.find((t) => t.id === templateId) || null;

  const handleTemplateChange = (id) => {
    setTemplateId(id);
    const t = approvedTemplates.find((tpl) => tpl.id === id);
    setParameters(Array.from({ length: t?.parameterCount || 0 }, () => ""));
  };

  // Debounced audience preview whenever filters change
  const buildFilters = useCallback(() => {
    const filters = {};
    if (filterStatus) filters.status = filterStatus;
    if (filterSource) filters.source = filterSource;
    if (filterAssigned) filters.assignedTo = filterAssigned;
    return Object.keys(filters).length > 0 ? filters : null;
  }, [filterStatus, filterSource, filterAssigned]);

  useEffect(() => {
    if (!orgId) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    setPreviewing(true);
    previewTimer.current = setTimeout(async () => {
      try {
        const res = await previewBroadcastAudience({ orgId, filters: buildFilters() });
        setAudienceCount(res.count);
      } catch {
        setAudienceCount(null);
      } finally {
        setPreviewing(false);
      }
    }, 500);
    return () => previewTimer.current && clearTimeout(previewTimer.current);
  }, [orgId, buildFilters]);

  const handleSend = async () => {
    if (!templateId || sending) return;
    if (selectedTemplate?.parameterCount > 0 && parameters.some((p) => !p.trim())) {
      setMsg({ type: "error", text: "Fill all template parameter values." });
      return;
    }
    let scheduledAtMs = null;
    if (scheduleMode === "later") {
      if (!scheduleAt) { setMsg({ type: "error", text: "Pick a date & time to schedule." }); return; }
      scheduledAtMs = new Date(scheduleAt).getTime();
      if (scheduledAtMs <= Date.now() + 30000) { setMsg({ type: "error", text: "Schedule time must be at least 1 minute in the future." }); return; }
    }

    setSending(true);
    setMsg({ type: "", text: "" });
    try {
      const result = await createBroadcast({
        orgId,
        templateId,
        parameters: parameters.map((p) => p.trim()),
        filters: buildFilters(),
        name: broadcastName || undefined,
        scheduledAtMs,
      });
      setMsg({
        type: "success",
        text: result.scheduled
          ? `Broadcast scheduled for ${fmtDate(result.scheduledAtMs)} — ${result.totalRecipients} leads.`
          : `Broadcast started! Sending to ${result.totalRecipients} leads...`,
      });
      setBroadcastName(""); setTemplateId(""); setParameters([]);
      setFilterStatus(""); setFilterSource(""); setFilterAssigned("");
      setScheduleMode("now"); setScheduleAt("");
      setTimeout(onSent, 1500);
    } catch (e) {
      setMsg({ type: "error", text: e.message || "Could not start broadcast." });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {msg.text && (
        <div className={`rounded-xl px-4 py-3 mb-6 text-sm flex items-center gap-2 ${
          msg.type === "success" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {msg.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {msg.text}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: template + schedule */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6">
            <label className="text-sm font-medium text-ink block mb-2">Campaign Name (optional)</label>
            <input
              type="text" value={broadcastName} onChange={(e) => setBroadcastName(e.target.value)}
              placeholder="e.g. Diwali Offer 2026"
              className="w-full rounded-lg border border-cream-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
            />
          </div>

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
                <select value={templateId} onChange={(e) => handleTemplateChange(e.target.value)}
                  className="w-full rounded-lg border border-cream-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300">
                  <option value="">Choose an approved template...</option>
                  {approvedTemplates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.language}</option>)}
                </select>
                {selectedTemplate && (
                  <div className="mt-4 space-y-3">
                    <div className="bg-teal-50 rounded-lg p-3 border border-teal-100">
                      <p className="text-xs text-teal-700 font-medium mb-1 flex items-center gap-1"><Eye size={12} /> Preview</p>
                      <p className="text-sm text-teal-900">{selectedTemplate.preview}</p>
                    </div>
                    {selectedTemplate.parameterCount > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-ink-muted">Template Parameters</p>
                        {parameters.map((val, idx) => (
                          <input key={idx} value={val}
                            onChange={(e) => { const next = [...parameters]; next[idx] = e.target.value; setParameters(next); }}
                            placeholder={`Value for {{${idx + 1}}}`}
                            className="w-full rounded-lg border border-cream-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200" />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Scheduling */}
          <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={18} className="text-orange-500" />
              <h3 className="font-display font-bold text-base text-ink">When to Send</h3>
            </div>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setScheduleMode("now")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border ${scheduleMode === "now" ? "border-orange-300 bg-orange-50 text-orange-700" : "border-cream-300 text-ink-muted"}`}>
                <Zap size={14} className="inline mr-1" /> Send Now
              </button>
              <button onClick={() => setScheduleMode("later")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border ${scheduleMode === "later" ? "border-orange-300 bg-orange-50 text-orange-700" : "border-cream-300 text-ink-muted"}`}>
                <Calendar size={14} className="inline mr-1" /> Schedule
              </button>
            </div>
            {scheduleMode === "later" && (
              <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)}
                min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                className="w-full rounded-lg border border-cream-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200" />
            )}
          </div>

          <button onClick={handleSend} disabled={!templateId || sending}
            className="btn btn-primary w-full py-3 text-base flex items-center justify-center gap-2">
            {sending ? <><Loader2 size={18} className="animate-spin" /> Starting...</>
              : scheduleMode === "later" ? <><Calendar size={18} /> Schedule Broadcast</>
              : <><Send size={18} /> Send Broadcast{audienceCount != null ? ` to ${audienceCount}` : ""}</>}
          </button>
        </div>

        {/* Right: filters + audience */}
        <div className="space-y-5">
          {/* Audience preview card */}
          <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl p-6 text-white shadow-glow">
            <div className="flex items-center gap-2 mb-1">
              <Users size={18} />
              <p className="text-sm font-medium opacity-90">Audience Size</p>
            </div>
            <p className="font-display font-bold text-4xl">
              {previewing ? <Loader2 size={28} className="animate-spin" /> : (audienceCount != null ? audienceCount.toLocaleString("en-IN") : "—")}
            </p>
            <p className="text-xs opacity-80 mt-1">leads with valid WhatsApp numbers</p>
          </div>

          <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Filter size={18} className="text-orange-500" />
              <h3 className="font-display font-bold text-base text-ink">Lead Filters</h3>
            </div>
            <p className="text-xs text-ink-muted mb-4">Leave empty to send to all leads with WhatsApp numbers.</p>
            <div className="space-y-4">
              <FilterSelect label="Status" value={filterStatus} onChange={setFilterStatus} options={STATUS_OPTIONS} allLabel="All statuses" />
              <FilterSelect label="Source" value={filterSource} onChange={setFilterSource} options={SOURCE_OPTIONS} allLabel="All sources" />
              <div>
                <label className="text-xs font-medium text-ink-muted block mb-1">Assigned To</label>
                <select value={filterAssigned} onChange={(e) => setFilterAssigned(e.target.value)}
                  className="w-full rounded-lg border border-cream-300 px-3 py-2 text-sm">
                  <option value="">All team members</option>
                  {employees.map((emp) => (
                    <option key={emp.uid || emp.id} value={emp.uid || emp.id}>{emp.displayName || emp.name || emp.phone}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-orange-50 rounded-2xl border border-orange-200 p-5">
            <h4 className="font-display font-bold text-sm text-orange-800 mb-2 flex items-center gap-1.5">
              <Megaphone size={15} /> Broadcast Tips
            </h4>
            <ul className="text-xs text-orange-700 space-y-1.5">
              <li>• Only Meta-approved templates can be broadcast</li>
              <li>• Sent in rate-limited batches (~40/sec)</li>
              <li>• Track delivery & reads live in the dashboard</li>
              <li>• New accounts: 1,000/day; Scale: up to 100K/day</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

function FilterSelect({ label, value, onChange, options, allLabel }) {
  return (
    <div>
      <label className="text-xs font-medium text-ink-muted block mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-cream-300 px-3 py-2 text-sm">
        <option value="">{allLabel}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

/* ═══════════════════════════════ HISTORY ═══════════════════════════════ */

function HistoryView({ orgId, navigate }) {
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await getBroadcasts(orgId);
      setBroadcasts(Array.isArray(data.broadcasts) ? data.broadcasts : []);
    } catch (e) {
      console.warn("Broadcast history:", e.message);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const handleCancel = async (e, broadcastId) => {
    e.stopPropagation();
    if (!window.confirm("Cancel this broadcast? Messages already sent won't be reverted.")) return;
    try { await cancelBroadcast({ orgId, broadcastId }); fetchHistory(); }
    catch (err) { alert(err.message || "Could not cancel."); }
  };

  return (
    <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 overflow-hidden">
      <div className="px-6 py-4 border-b border-cream-200 flex items-center justify-between">
        <h3 className="font-display font-bold text-base text-ink flex items-center gap-2">
          <Clock size={16} className="text-orange-500" /> Broadcast History
        </h3>
        <button onClick={fetchHistory} className="text-sm text-ink-muted hover:text-ink flex items-center gap-1">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-orange-400" /></div>
      ) : broadcasts.length === 0 ? (
        <div className="text-center py-12 px-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-cream-100 flex items-center justify-center mb-3">
            <Megaphone size={24} className="text-ink-muted" />
          </div>
          <p className="text-sm text-ink-muted">No broadcasts yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-cream-100">
          {broadcasts.map((bc) => {
            const progress = bc.totalRecipients > 0 ? Math.round(((bc.sent || 0) + (bc.failed || 0)) / bc.totalRecipients * 100) : 0;
            return (
              <button key={bc.id} onClick={() => navigate(`/admin/broadcast/${bc.id}`)}
                className="w-full px-6 py-4 hover:bg-cream-50 transition-colors text-left block">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-sm font-semibold text-ink truncate">{bc.name || bc.templateName}</p>
                      {statusBadge(bc.status)}
                    </div>
                    <p className="text-xs text-ink-muted">
                      {bc.templateName} · {bc.status === "scheduled" ? `Scheduled for ${fmtDate(bc.scheduledAtMs)}` : fmtDate(bc.createdAt)}
                    </p>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{bc.sent || 0}/{bc.totalRecipients}</p>
                      <div className="flex items-center gap-2 justify-end text-xs">
                        {bc.delivered > 0 && <span className="text-green-600">{bc.delivered} ✓✓</span>}
                        {bc.read > 0 && <span className="text-orange-500">{bc.read} read</span>}
                        {bc.failed > 0 && <span className="text-red-500">{bc.failed} failed</span>}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-ink-muted" />
                  </div>
                </div>
                {(bc.status === "processing" || bc.status === "queued") && (
                  <div className="mt-2">
                    <div className="w-full bg-cream-200 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-gradient-to-r from-orange-400 to-amber-500 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="flex justify-end mt-1">
                      <span onClick={(e) => handleCancel(e, bc.id)} className="text-[10px] text-red-500 hover:text-red-700 font-medium cursor-pointer">Cancel</span>
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
