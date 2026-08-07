/**
 * Tenant Usage & Renewals — Platform Owner Console.
 *
 * One screen answering "who is about to run out of what, and whose
 * subscription needs attention". Everything is joined server-side by
 * /api/v1/platform/tenant-usage (org docs + voiceWallets + effective plan
 * limits including purchased add-ons), so this page never mirrors pricing
 * logic in the browser.
 *
 * Rows are returned most-urgent-first; the filter chips narrow to a single
 * problem class rather than re-sorting.
 */
import { useEffect, useMemo, useState } from "react";
import PlatformShell from "./components/PlatformShell";
import SectionCard from "./components/SectionCard";
import KpiCard from "./components/KpiCard";
import {
  Loader2, Building2, Bot, Phone, AlertTriangle, CalendarClock,
  XCircle, Search, RefreshCw, Gauge, Download,
} from "lucide-react";
import { getTenantUsage } from "../../utils/platformApi";
import { downloadCsv } from "../../utils/csv";

const FILTERS = [
  { id: "all", label: "All tenants" },
  { id: "expired", label: "Expired" },
  { id: "past_due", label: "Past due" },
  { id: "expiring_soon", label: "Expiring soon" },
  { id: "ai_low", label: "AI low / out" },
  { id: "voice_low", label: "Voice low / empty" },
];

const RENEWAL_BADGE = {
  expired: { label: "Expired", cls: "bg-red-100 text-red-700" },
  lapsed: { label: "Lapsed", cls: "bg-red-100 text-red-700" },
  past_due: { label: "Past due", cls: "bg-amber-100 text-amber-700" },
  expiring_soon: { label: "Expiring soon", cls: "bg-orange-100 text-orange-700" },
  healthy: { label: "Active", cls: "bg-green-100 text-green-700" },
};

const fmtDate = (ms) => ms
  ? new Date(Number(ms)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })
  : "—";

const num = (v) => Number(v || 0).toLocaleString("en-IN");

export default function TenantUsagePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const load = () => {
    setLoading(true);
    setError(null);
    getTenantUsage()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const tenants = data?.tenants || [];
  const summary = data?.summary || {};

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tenants.filter((t) => {
      if (filter === "expired" && !["expired", "lapsed"].includes(t.renewal)) return false;
      if (filter === "past_due" && t.renewal !== "past_due") return false;
      if (filter === "expiring_soon" && t.renewal !== "expiring_soon") return false;
      if (filter === "ai_low" && (t.aiReplies.unlimited || t.aiReplies.pct < 80)) return false;
      if (filter === "voice_low" && t.voice.bridgeMinutes >= 50) return false;
      if (!term) return true;
      return (t.name || "").toLowerCase().includes(term)
        || (t.ownerPhone || "").includes(term)
        || (t.planName || "").toLowerCase().includes(term);
    });
  }, [tenants, filter, search]);

  const exportCsv = () => {
    const rows = [[
      "Tenant", "Owner phone", "Plan", "Status", "Renewal", "Days left", "Period end",
      "AI used", "AI limit", "AI left", "Leads used", "Leads limit",
      "Seats used", "Seats limit", "Bridge minutes", "AI voice minutes",
      "Lifetime revenue", "Active add-ons",
    ]];
    visible.forEach((t) => rows.push([
      t.name, t.ownerPhone || "", t.planName, t.subscriptionStatus, t.renewal,
      t.daysLeft ?? "", t.currentPeriodEndMs ? new Date(t.currentPeriodEndMs).toISOString().slice(0, 10) : "",
      t.aiReplies.used, t.aiReplies.unlimited ? "unlimited" : t.aiReplies.limit,
      t.aiReplies.unlimited ? "unlimited" : t.aiReplies.remaining,
      t.leads.used, t.leads.unlimited ? "unlimited" : t.leads.limit,
      t.seats.used, t.seats.unlimited ? "unlimited" : t.seats.limit,
      t.voice.bridgeMinutes, t.voice.aiVoiceMinutes,
      t.lifetimeRevenue,
      (t.activeAddOns || []).map((a) => `${a.name} x${a.quantity}`).join("; "),
    ]));
    downloadCsv(rows, `tenant-usage-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <PlatformShell title="Tenant Usage & Renewals">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">
            Voice minutes, AI allowance and subscription health for every tenant
            {data?.monthKey && <span className="text-ink-muted/70"> · AI usage for {data.monthKey}</span>}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={exportCsv} disabled={!visible.length}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cream-200 px-3 py-1.5 text-sm text-ink-soft hover:bg-cream-50 disabled:opacity-50">
              <Download size={14} /> Export
            </button>
            <button onClick={load}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cream-200 px-3 py-1.5 text-sm text-ink-soft hover:bg-cream-50">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-orange-500" />
          </div>
        ) : error ? (
          <SectionCard title="Could not load tenant usage">
            <p className="text-sm text-red-600">{error}</p>
            <button onClick={load} className="mt-3 text-sm text-orange-600 hover:text-orange-700">Try again</button>
          </SectionCard>
        ) : (
          <>
            {/* Attention KPIs — each one is a real action item */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard label="Total Tenants" value={num(summary.tenants)} icon={Building2} color="blue"
                sublabel={`${num(summary.expiringSoon)} renewing within 7 days`} />
              <KpiCard label="Expired / Lapsed" value={num(summary.expired)} icon={XCircle} color="red"
                sublabel={`${num(summary.pastDue)} past due`} />
              <KpiCard label="AI Quota Exhausted" value={num(summary.aiExhausted)} icon={Bot} color="amber"
                sublabel={`${num(summary.aiNearLimit)} above 80%`} />
              <KpiCard label="Voice Wallet Empty" value={num(summary.voiceEmpty)} icon={Phone} color="purple"
                sublabel={`${num(summary.voiceLow)} under 50 min`} />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              {FILTERS.map((f) => (
                <button key={f.id} onClick={() => setFilter(f.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    filter === f.id ? "bg-orange-100 text-orange-700" : "text-ink-muted hover:bg-cream-100"
                  }`}>
                  {f.label}
                </button>
              ))}
              <div className="relative ml-auto">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tenant, phone, plan"
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-cream-200 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-orange-100" />
              </div>
            </div>

            <SectionCard
              title="Per-tenant usage"
              subtitle={`${visible.length} of ${tenants.length} tenants${filter !== "all" ? " (filtered)" : ""}`}
            >
              {visible.length === 0 ? (
                <div className="text-center py-12">
                  <Gauge size={22} className="mx-auto text-ink-muted mb-2" />
                  <p className="text-sm text-ink-muted">No tenants match this view.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[980px]">
                    <thead>
                      <tr className="border-b border-cream-200 text-xs uppercase tracking-wider text-ink-muted">
                        <th className="text-left py-2.5 px-3 font-semibold">Tenant</th>
                        <th className="text-left py-2.5 px-3 font-semibold">Plan</th>
                        <th className="text-left py-2.5 px-3 font-semibold">Renewal</th>
                        <th className="text-left py-2.5 px-3 font-semibold">AI replies left</th>
                        <th className="text-left py-2.5 px-3 font-semibold">Voice minutes</th>
                        <th className="text-right py-2.5 px-3 font-semibold">Leads</th>
                        <th className="text-right py-2.5 px-3 font-semibold">Seats</th>
                        <th className="text-right py-2.5 px-3 font-semibold">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((t) => {
                        const badge = RENEWAL_BADGE[t.renewal] || RENEWAL_BADGE.healthy;
                        const voiceTone = t.voice.bridgeMinutes <= 0 ? "text-red-600 font-semibold"
                          : t.voice.bridgeMinutes < 50 ? "text-amber-600 font-medium" : "text-ink-soft";
                        return (
                          <tr key={t.orgId} className="border-b border-cream-100 last:border-0 hover:bg-cream-50/60">
                            <td className="py-3 px-3">
                              <p className="font-medium text-ink truncate max-w-[190px]">{t.name}</p>
                              <p className="text-xs text-ink-muted font-mono">{t.ownerPhone || t.orgId.slice(0, 10)}</p>
                              {t.activeAddOns?.length > 0 && (
                                <p className="text-[11px] text-orange-600 mt-0.5">
                                  {t.activeAddOns.map((a) => `${a.name} x${a.quantity}`).join(", ")}
                                </p>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <p className="text-ink-soft">{t.planName}</p>
                              <p className="text-xs text-ink-muted">{t.billingCycle}{t.autopay ? " · autopay" : ""}</p>
                            </td>
                            <td className="py-3 px-3">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                                {badge.label}
                              </span>
                              <p className="text-xs text-ink-muted mt-1">
                                {t.daysLeft !== null && t.daysLeft >= 0 ? `${t.daysLeft}d left · ` : ""}
                                {fmtDate(t.subscriptionStatus === "trialing" ? t.trialEndsAtMs : t.currentPeriodEndMs)}
                              </p>
                            </td>
                            <td className="py-3 px-3 w-[150px]">
                              <UsageBar meter={t.aiReplies} />
                            </td>
                            <td className="py-3 px-3">
                              <p className={`num ${voiceTone}`}>{num(t.voice.bridgeMinutes)} min</p>
                              {t.voice.aiVoiceMinutes > 0 && (
                                <p className="text-xs text-ink-muted num">{num(t.voice.aiVoiceMinutes)} AI voice</p>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right num text-ink-soft">
                              {num(t.leads.used)}{t.leads.unlimited ? "" : ` / ${num(t.leads.limit)}`}
                            </td>
                            <td className="py-3 px-3 text-right num text-ink-soft">
                              {num(t.seats.used)}{t.seats.unlimited ? "" : ` / ${num(t.seats.limit)}`}
                            </td>
                            <td className="py-3 px-3 text-right num font-medium text-ink">
                              ₹{num(t.lifetimeRevenue)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </>
        )}
      </div>
    </PlatformShell>
  );
}

/** Compact meter for a { limit, used, remaining, unlimited, pct } shape. */
function UsageBar({ meter }) {
  if (meter.unlimited) {
    return <span className="text-xs text-ink-muted">Unlimited · {Number(meter.used).toLocaleString("en-IN")} used</span>;
  }
  const tone = meter.remaining === 0 ? "bg-red-500"
    : meter.pct >= 80 ? "bg-amber-500"
    : "bg-green-500";
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs num font-medium ${meter.remaining === 0 ? "text-red-600" : "text-ink-soft"}`}>
          {Number(meter.remaining).toLocaleString("en-IN")} left
        </span>
        <span className="text-[11px] text-ink-muted num">{meter.pct}%</span>
      </div>
      <div className="w-full bg-cream-200 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${tone}`} style={{ width: `${Math.min(100, meter.pct)}%` }} />
      </div>
    </div>
  );
}
