/**
 * Call History — tenant admin views all bridge calls for their org.
 * Shows: date, employee, lead, duration (agent+customer), cost, status, recording.
 */

import { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { Phone, Play, Loader2, ChevronDown, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { auth } from "../../firebase";

const BASE = import.meta.env.VITE_BACKEND_URL || "";

async function fetchCallHistory(orgId, cursor) {
  const token = await auth.currentUser?.getIdToken();
  const params = new URLSearchParams({ orgId, limit: "50" });
  if (cursor) params.set("startAfter", cursor);
  const res = await fetch(`${BASE}/api/v1/bridge-call/history?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

function fmtDuration(s) {
  if (!s) return "0s";
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function StatusBadge({ status }) {
  const map = {
    completed: { label: "Connected", color: "bg-success-100 text-success-700", icon: CheckCircle },
    "wallet-deducted": { label: "Connected", color: "bg-success-100 text-success-700", icon: CheckCircle },
    customer_voicemail: { label: "Voicemail", color: "bg-amber-100 text-amber-700", icon: AlertTriangle },
    "no-answer": { label: "No answer", color: "bg-cream-200 text-ink-muted", icon: XCircle },
    agent_no_confirm: { label: "Agent missed", color: "bg-red-100 text-red-700", icon: XCircle },
    failed: { label: "Failed", color: "bg-red-100 text-red-700", icon: XCircle },
  };
  const s = map[status] || { label: status || "Unknown", color: "bg-cream-200 text-ink-muted", icon: Phone };
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.color}`}>
      <Icon size={11} /> {s.label}
    </span>
  );
}

export default function CallHistory() {
  const { user } = useAuth();
  const orgId = user?.activeOrgId;
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    fetchCallHistory(orgId).then((d) => {
      setCalls(d.calls || []);
      setCursor(d.nextCursor);
      setHasMore(d.hasMore || false);
    }).finally(() => setLoading(false));
  }, [orgId]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    const d = await fetchCallHistory(orgId, cursor);
    setCalls((prev) => [...prev, ...(d.calls || [])]);
    setCursor(d.nextCursor);
    setHasMore(d.hasMore || false);
    setLoadingMore(false);
  };

  const noCharge = (s) => ["customer_voicemail", "no-answer", "agent_no_confirm", "failed"].includes(s);

  return (
    <Layout title="Call History">
      <div className="bg-white rounded-xl shadow border p-6">
        <div className="flex items-center gap-2 mb-5">
          <Phone size={20} className="text-blue-600" />
          <h2 className="font-display font-bold text-lg text-ink">Bridge Call History</h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-500" size={28} /></div>
        ) : calls.length === 0 ? (
          <p className="text-sm text-ink-muted text-center py-12">No bridge calls yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-200 text-left text-xs font-semibold text-ink-muted uppercase tracking-wider">
                    <th className="pb-2 pr-3">Date</th>
                    <th className="pb-2 pr-3">Employee</th>
                    <th className="pb-2 pr-3">Lead</th>
                    <th className="pb-2 pr-3">Status</th>
                    <th className="pb-2 pr-3 text-right">Agent</th>
                    <th className="pb-2 pr-3 text-right">Customer</th>
                    <th className="pb-2 pr-3 text-right">Cost</th>
                    <th className="pb-2">Recording</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((c) => (
                    <tr key={c.callId} className="border-b border-cream-100 hover:bg-cream-50">
                      <td className="py-2.5 pr-3 text-xs text-ink-muted whitespace-nowrap">
                        {new Date(c.initiatedAt || c.initiatedAtMs).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-2.5 pr-3 font-medium">{c.employeeName}</td>
                      <td className="py-2.5 pr-3">{c.leadName || c.leadPhone}</td>
                      <td className="py-2.5 pr-3"><StatusBadge status={c.status} /></td>
                      <td className="py-2.5 pr-3 text-right text-xs">{fmtDuration(c.agentSeconds)}</td>
                      <td className="py-2.5 pr-3 text-right text-xs">{fmtDuration(c.customerSeconds)}</td>
                      <td className="py-2.5 pr-3 text-right font-medium">
                        {noCharge(c.status) ? (
                          <span className="text-ink-muted">No charge</span>
                        ) : (
                          <span className="text-ink">₹{(c.costInr || 0).toFixed(0)}</span>
                        )}
                      </td>
                      <td className="py-2.5">
                        {c.recordingUrl ? (
                          <a href={c.recordingUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800">
                            <Play size={14} />
                          </a>
                        ) : <span className="text-ink-muted text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hasMore && (
              <div className="text-center mt-4">
                <button onClick={loadMore} disabled={loadingMore} className="btn btn-secondary text-sm px-4 py-2">
                  {loadingMore ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />}
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
