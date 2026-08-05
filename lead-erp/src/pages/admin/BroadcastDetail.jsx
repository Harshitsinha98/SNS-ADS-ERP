import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../../components/Layout";
import {
  getBroadcastStatus,
  getBroadcastRecipients,
  retryBroadcast,
  cancelBroadcast,
} from "../../utils/billingApi";
import { useBilling } from "../../context/BillingContext";
import { useAuth } from "../../context/AuthContext";
import {
  ArrowLeft,
  Loader2,
  Send,
  CheckCheck,
  Eye,
  XCircle,
  Clock,
  Radio,
  RefreshCw,
  Ban,
  AlertCircle,
  CheckCircle2,
  Calendar,
  RotateCcw,
  Search,
} from "lucide-react";

const fmtDateTime = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    ", " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
};

const STATUS_META = {
  pending: { label: "Pending", color: "text-gray-500", bg: "bg-gray-100", icon: Clock },
  sent: { label: "Sent", color: "text-blue-600", bg: "bg-blue-100", icon: Send },
  delivered: { label: "Delivered", color: "text-green-600", bg: "bg-green-100", icon: CheckCheck },
  read: { label: "Read", color: "text-orange-600", bg: "bg-orange-100", icon: Eye },
  failed: { label: "Failed", color: "text-red-600", bg: "bg-red-100", icon: XCircle },
};

const bcStatusBadge = (status) => {
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
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${m.bg}`}>
      <Icon size={12} /> {String(status || "").replace(/_/g, " ")}
    </span>
  );
};

export default function BroadcastDetail() {
  const { broadcastId } = useParams();
  const navigate = useNavigate();
  const { org } = useBilling();
  const { user } = useAuth();
  const orgId = org?.id || user?.activeOrgId;

  const [broadcast, setBroadcast] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [msg, setMsg] = useState("");
  const pollRef = useRef(null);

  const fetchAll = useCallback(async () => {
    if (!broadcastId) return;
    try {
      const [bc, rec] = await Promise.all([
        getBroadcastStatus(broadcastId),
        getBroadcastRecipients(broadcastId, filterStatus || undefined),
      ]);
      setBroadcast(bc);
      setRecipients(Array.isArray(rec.recipients) ? rec.recipients : []);
    } catch (e) {
      setMsg(e.message || "Could not load broadcast.");
    } finally {
      setLoading(false);
    }
  }, [broadcastId, filterStatus]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh while processing
  useEffect(() => {
    if (broadcast && (broadcast.status === "processing" || broadcast.status === "queued")) {
      pollRef.current = setInterval(fetchAll, 5000);
      return () => clearInterval(pollRef.current);
    }
  }, [broadcast?.status, fetchAll]);

  const handleRetry = async () => {
    setRetrying(true);
    setMsg("");
    try {
      const res = await retryBroadcast({ orgId, broadcastId });
      setMsg(`Retrying ${res.retrying} failed message(s)...`);
      setTimeout(fetchAll, 1000);
    } catch (e) {
      setMsg(e.message || "Could not retry.");
    } finally {
      setRetrying(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm("Cancel this broadcast?")) return;
    try { await cancelBroadcast({ orgId, broadcastId }); fetchAll(); }
    catch (e) { setMsg(e.message || "Could not cancel."); }
  };

  if (loading) {
    return <Layout title="Broadcast"><div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-orange-400" /></div></Layout>;
  }

  if (!broadcast) {
    return (
      <Layout title="Broadcast">
        <button onClick={() => navigate("/admin/broadcast")} className="text-sm text-ink-muted hover:text-ink flex items-center gap-1 mb-4">
          <ArrowLeft size={15} /> Back
        </button>
        <p className="text-sm text-red-600">{msg || "Broadcast not found."}</p>
      </Layout>
    );
  }

  const total = broadcast.totalRecipients || 0;
  const sent = broadcast.sent || 0;
  const delivered = broadcast.delivered || 0;
  const read = broadcast.read || 0;
  const failed = broadcast.failed || 0;
  const pct = (n) => total > 0 ? Math.round((n / total) * 100) : 0;

  const filteredRecipients = recipients.filter((r) =>
    !search || (r.name || "").toLowerCase().includes(search.toLowerCase()) || (r.phone || "").includes(search)
  );

  const funnelSteps = [
    { key: "sent", label: "Sent", value: sent, color: "bg-blue-500", icon: Send },
    { key: "delivered", label: "Delivered", value: delivered, color: "bg-green-500", icon: CheckCheck },
    { key: "read", label: "Read", value: read, color: "bg-orange-500", icon: Eye },
  ];

  return (
    <Layout title="Broadcast Detail">
      <button onClick={() => navigate("/admin/broadcast")} className="text-sm text-ink-muted hover:text-ink flex items-center gap-1 mb-4">
        <ArrowLeft size={15} /> Back to broadcasts
      </button>

      {msg && (
        <div className="bg-orange-50 border border-orange-200 text-ember-700 rounded-xl px-4 py-3 mb-5 text-sm">{msg}</div>
      )}

      {/* Header */}
      <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h2 className="font-display font-bold text-2xl text-ink">{broadcast.name || broadcast.templateName}</h2>
              {bcStatusBadge(broadcast.status)}
            </div>
            <p className="text-sm text-ink-muted">
              Template: <span className="font-medium text-ink">{broadcast.templateName}</span> · {broadcast.templateLanguage}
              {broadcast.templateCategory && <span className="ml-2 px-2 py-0.5 rounded bg-cream-200 text-xs">{broadcast.templateCategory}</span>}
            </p>
            <p className="text-xs text-ink-muted mt-1">
              {broadcast.status === "scheduled"
                ? <>Scheduled for <span className="font-medium">{fmtDateTime(broadcast.scheduledAtMs)}</span></>
                : <>Created {fmtDateTime(broadcast.createdAt)}{broadcast.completedAt ? ` · Completed ${fmtDateTime(broadcast.completedAt)}` : ""}</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(broadcast.status === "processing" || broadcast.status === "queued" || broadcast.status === "scheduled") && (
              <button onClick={handleCancel} className="btn btn-secondary text-sm text-red-600 flex items-center gap-1.5">
                <Ban size={14} /> Cancel
              </button>
            )}
            {failed > 0 && ["completed", "completed_with_errors", "failed"].includes(broadcast.status) && (
              <button onClick={handleRetry} disabled={retrying} className="btn btn-primary text-sm flex items-center gap-1.5">
                {retrying ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Retry {failed} failed
              </button>
            )}
            <button onClick={fetchAll} className="btn btn-secondary text-sm flex items-center gap-1.5">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Funnel + stats */}
      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        {/* Delivery funnel */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-card border border-cream-300/60 p-6">
          <h3 className="font-display font-bold text-base text-ink mb-5">Delivery Funnel</h3>
          <div className="space-y-4">
            {funnelSteps.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-ink flex items-center gap-2">
                      <Icon size={15} className="text-ink-muted" /> {step.label}
                    </span>
                    <span className="text-sm font-semibold text-ink">
                      {step.value.toLocaleString("en-IN")} <span className="text-ink-muted font-normal">({pct(step.value)}%)</span>
                    </span>
                  </div>
                  <div className="w-full bg-cream-200 rounded-full h-2.5">
                    <div className={`h-2.5 rounded-full ${step.color} transition-all`} style={{ width: `${pct(step.value)}%` }} />
                  </div>
                </div>
              );
            })}
            {failed > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-ink flex items-center gap-2"><XCircle size={15} className="text-red-500" /> Failed</span>
                  <span className="text-sm font-semibold text-red-600">{failed.toLocaleString("en-IN")} ({pct(failed)}%)</span>
                </div>
                <div className="w-full bg-cream-200 rounded-full h-2.5">
                  <div className="h-2.5 rounded-full bg-red-500 transition-all" style={{ width: `${pct(failed)}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-2 gap-4">
          <MiniStat label="Recipients" value={total} icon={Send} color="text-ink" />
          <MiniStat label="Sent" value={sent} icon={Send} color="text-blue-600" />
          <MiniStat label="Delivered" value={delivered} icon={CheckCheck} color="text-green-600" />
          <MiniStat label="Read" value={read} icon={Eye} color="text-orange-600" />
        </div>
      </div>

      {/* Recipients table */}
      <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 overflow-hidden">
        <div className="px-6 py-4 border-b border-cream-200 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display font-bold text-base text-ink">Recipients</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name / phone"
                className="pl-8 pr-3 py-1.5 rounded-lg border border-cream-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 w-48" />
            </div>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-cream-300 px-3 py-1.5 text-sm">
              <option value="">All ({total})</option>
              <option value="sent">Sent</option>
              <option value="delivered">Delivered</option>
              <option value="read">Read</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>

        {filteredRecipients.length === 0 ? (
          <p className="text-center text-sm text-ink-muted py-12">No recipients match.</p>
        ) : (
          <div className="max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-cream-50 sticky top-0">
                <tr className="text-left text-xs text-ink-muted">
                  <th className="px-6 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Phone</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-6 py-2.5 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                {filteredRecipients.map((r) => {
                  const meta = STATUS_META[r.status] || STATUS_META.pending;
                  const Icon = meta.icon;
                  return (
                    <tr key={r.id} className="hover:bg-cream-50">
                      <td className="px-6 py-3 text-ink font-medium truncate max-w-[180px]">{r.name || "—"}</td>
                      <td className="px-4 py-3 text-ink-soft font-mono text-xs">{r.phone}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.bg} ${meta.color}`}>
                          <Icon size={11} /> {meta.label}
                        </span>
                        {r.status === "failed" && r.error && (
                          <span className="block text-[10px] text-red-400 mt-0.5 truncate max-w-[200px]">{r.error}</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-ink-muted text-xs">{fmtDateTime(r.updatedAt || r.sentAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}

function MiniStat({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-4 flex flex-col justify-center">
      <Icon size={16} className={`${color} mb-1.5`} />
      <p className="font-display font-bold text-2xl text-ink">{(value || 0).toLocaleString("en-IN")}</p>
      <p className="text-xs text-ink-muted">{label}</p>
    </div>
  );
}
