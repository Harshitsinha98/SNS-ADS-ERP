import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../../components/Layout";
import StatusPie from "../../components/charts/PieChart";
import { useData } from "../../context/DataContext";
import { useAuth } from "../../context/AuthContext";
import { useBilling } from "../../context/BillingContext";
import { getBroadcastAnalytics } from "../../utils/billingApi";
import { daysSince, fmtMoney, fmtDate } from "../../utils/helpers";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  IndianRupee,
  Layers,
  AlertTriangle,
  UserPlus,
  CalendarClock,
  CalendarX2,
  Target,
  Timer,
  TrendingUp,
  Send,
  CheckCheck,
  Eye,
  MessageCircle,
  ChevronRight,
  Activity as ActivityIcon,
  Users,
  Flame,
  Megaphone,
} from "lucide-react";

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSED = ["Closed-Won", "Lost"];

const lateLabel = (dueAt) => {
  const ms = Date.now() - new Date(dueAt).getTime();
  if (ms < 0) return "due soon";
  const days = Math.floor(ms / DAY_MS);
  if (days >= 1) return `${days}d late`;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 1) return `${hours}h late`;
  return "just now";
};

export default function Dashboard() {
  const { leads, users, activity, financials, followUpTasks } = useData();
  const { user } = useAuth();
  const { org } = useBilling();
  const navigate = useNavigate();
  const orgId = org?.id || user?.activeOrgId;

  const [waStats, setWaStats] = useState(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    getBroadcastAnalytics(orgId)
      .then((d) => { if (!cancelled) setWaStats(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [orgId]);

  const m = useMemo(() => {
    const active = leads.filter((l) => !l.blacklisted);
    const revenueOf = (lead) => financials[lead.id]?.revenue || 0;

    const won = active.filter((l) => l.status === "Closed-Won");
    const lost = active.filter((l) => l.status === "Lost");
    const open = active.filter((l) => !CLOSED.includes(l.status));

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const tomorrow = new Date(todayStart.getTime() + DAY_MS);
    const now = new Date();

    const newToday = active.filter((l) => l.createdAt && new Date(l.createdAt) >= todayStart).length;
    const openTasks = (followUpTasks || []).filter((t) => t.status === "open");
    const dueToday = openTasks.filter((t) => {
      const d = new Date(t.dueAt);
      return d >= now && d < tomorrow;
    });
    const overdue = openTasks
      .filter((t) => new Date(t.dueAt) < now)
      .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
    const untouched = open
      .filter((l) => daysSince(l.lastUpdated) >= 3)
      .sort((a, b) => daysSince(b.lastUpdated) - daysSince(a.lastUpdated));

    const conversionRate = active.length ? Math.round((won.length / active.length) * 100) : 0;
    const avgDaysToClose = won.length
      ? Math.round(won.reduce((s, l) => s + Math.max(0, (new Date(l.lastUpdated) - new Date(l.createdAt)) / DAY_MS), 0) / won.length)
      : 0;
    const hotLeads = open.filter((l) => l.priority === "Hot").length;

    const wonValue = won.reduce((s, l) => s + revenueOf(l), 0);
    const pipelineValue = open.reduce((s, l) => s + revenueOf(l), 0);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const revenueThisMonth = won.reduce((s, l) => {
      const at = financials[l.id]?.revenueUpdatedAt;
      return at && new Date(at) >= monthStart ? s + revenueOf(l) : s;
    }, 0);
    const hasRevenue = wonValue > 0 || pipelineValue > 0;
    const wonMissingRevenue = won.filter((l) => revenueOf(l) <= 0);

    const trend = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(todayStart.getTime() - i * DAY_MS);
      const next = new Date(d.getTime() + DAY_MS);
      const created = active.filter((l) => l.createdAt && new Date(l.createdAt) >= d && new Date(l.createdAt) < next).length;
      const closedWon = active.filter((l) => l.status === "Closed-Won" && l.lastUpdated && new Date(l.lastUpdated) >= d && new Date(l.lastUpdated) < next).length;
      trend.push({
        date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
        leads: created,
        won: closedWon,
      });
    }

    const statusData = [...new Set(active.map((l) => l.status))].map((s) => ({
      name: s,
      value: active.filter((l) => l.status === s).length,
    }));

    const team = users
      .filter((u) => u.role === "employee")
      .map((u) => {
        const assigned = active.filter((l) => l.assignedTo === u.id);
        const uWon = assigned.filter((l) => l.status === "Closed-Won");
        const uOpen = assigned.filter((l) => !CLOSED.includes(l.status));
        return {
          id: u.id,
          name: u.name || "Unnamed",
          assigned: assigned.length,
          open: uOpen.length,
          wins: uWon.length,
          conversion: assigned.length ? Math.round((uWon.length / assigned.length) * 100) : 0,
          stale: uOpen.filter((l) => daysSince(l.lastUpdated) >= 3).length,
          revenue: uWon.reduce((s, l) => s + revenueOf(l), 0),
        };
      })
      .sort((a, b) => (b.revenue - a.revenue) || (b.wins - a.wins));

    const srcMap = {};
    active.forEach((l) => {
      const src = l.source || "Unknown";
      if (!srcMap[src]) srcMap[src] = { source: src, total: 0, won: 0, revenue: 0 };
      srcMap[src].total++;
      if (l.status === "Closed-Won") { srcMap[src].won++; srcMap[src].revenue += revenueOf(l); }
    });
    const sources = Object.values(srcMap)
      .map((s) => ({ ...s, rate: s.total ? Math.round((s.won / s.total) * 100) : 0 }))
      .sort((a, b) => (b.revenue - a.revenue) || (b.total - a.total));

    return {
      total: active.length, open: open.length, won: won.length, lost: lost.length,
      newToday, dueToday, overdue, untouched,
      conversionRate, avgDaysToClose, hotLeads,
      wonValue, pipelineValue, revenueThisMonth, hasRevenue, wonMissingRevenue,
      trend, statusData, team, sources,
    };
  }, [leads, users, financials, followUpTasks]);

  const waTotals = waStats?.totals;
  const waRates = waStats?.rates;
  const hasBroadcasts = Boolean(waTotals && waTotals.sent > 0);

  return (
    <Layout title="Dashboard">

      {/* ═══ TODAY'S PULSE ═══ */}
      <SectionLabel icon={Flame} text="Today's Pulse" />
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <PulseCard label="New Today" value={m.newToday} icon={UserPlus} tone="primary" onClick={() => navigate("/admin/leads")} />
        <PulseCard label="Due Today" value={m.dueToday.length} icon={CalendarClock} tone="info" onClick={() => navigate("/admin/follow-ups")} />
        <PulseCard label="Overdue" value={m.overdue.length} icon={CalendarX2} tone={m.overdue.length > 0 ? "danger" : "ok"} onClick={() => navigate("/admin/follow-ups")} />
        <PulseCard label="Untouched 3d+" value={m.untouched.length} icon={AlertTriangle} tone={m.untouched.length > 0 ? "warn" : "ok"} onClick={() => navigate("/admin/follow-ups")} />
      </div>

      {/* ═══ PIPELINE HEALTH ═══ */}
      <SectionLabel icon={Target} text="Pipeline" />
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <PulseCard label="Active" value={m.open} icon={Layers} tone="primary" sub={`of ${m.total}`} onClick={() => navigate("/admin/leads")} />
        <PulseCard label="Conv. Rate" value={`${m.conversionRate}%`} icon={TrendingUp} tone="ok" sub={`${m.won} won`} />
        <PulseCard label="Avg Close" value={m.avgDaysToClose || "—"} icon={Timer} tone="signal" sub="days" />
        <PulseCard label="Hot" value={m.hotLeads} icon={Flame} tone="danger" onClick={() => navigate("/admin/leads")} />
      </div>

      {/* ═══ REVENUE (only when tracked) ═══ */}
      {m.hasRevenue && (
        <>
          <SectionLabel icon={IndianRupee} text="Revenue" />
          <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1 mb-4 -mx-4 px-4">
            <PulseCard label="Won" value={fmtMoney(m.wonValue)} icon={IndianRupee} tone="ok" className="min-w-[140px]" />
            <PulseCard label="This month" value={fmtMoney(m.revenueThisMonth)} icon={CalendarClock} tone="info" className="min-w-[140px]" />
            <PulseCard label="Pipeline" value={fmtMoney(m.pipelineValue)} icon={Layers} tone="signal" className="min-w-[140px]" />
          </div>
        </>
      )}

      {/* ═══ ACTION CENTER ═══ */}
      {(m.overdue.length > 0 || m.untouched.length > 0 || m.wonMissingRevenue.length > 0) && (
        <div className="card p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-danger-50 flex items-center justify-center">
              <AlertTriangle size={14} className="text-danger-600" />
            </div>
            <h3 className="text-sm font-bold text-ink">Needs Attention</h3>
          </div>

          {/* Overdue */}
          {m.overdue.length > 0 && (
            <ActionList
              title={`Overdue (${m.overdue.length})`}
              to="/admin/follow-ups"
              items={m.overdue.slice(0, 3).map((t) => ({
                key: t.id,
                primary: t.leadName || t.title || "Follow-up",
                secondary: t.assignedToName || "Unassigned",
                badge: lateLabel(t.dueAt),
                tone: "danger",
                link: t.leadId ? `/admin/leads/${t.leadId}` : "/admin/follow-ups",
              }))}
            />
          )}

          {/* Untouched */}
          {m.untouched.length > 0 && (
            <ActionList
              title={`Untouched (${m.untouched.length})`}
              to="/admin/leads"
              items={m.untouched.slice(0, 3).map((l) => ({
                key: l.id,
                primary: l.name || "Lead",
                secondary: l.assignedToName || "Unassigned",
                badge: `${daysSince(l.lastUpdated)}d`,
                tone: "warn",
                link: `/admin/leads/${l.id}`,
              }))}
            />
          )}

          {/* Missing revenue */}
          {m.wonMissingRevenue.length > 0 && (
            <ActionList
              title={`Missing ₹ (${m.wonMissingRevenue.length})`}
              to="/admin/leads"
              items={m.wonMissingRevenue.slice(0, 3).map((l) => ({
                key: l.id,
                primary: l.name || "Lead",
                secondary: "Add deal value",
                badge: "no ₹",
                tone: "info",
                link: `/admin/leads/${l.id}`,
              }))}
            />
          )}
        </div>
      )}

      {/* ═══ WHATSAPP BROADCAST ═══ */}
      <SectionLabel icon={MessageCircle} text="WhatsApp" action={{ label: "View all", to: "/admin/broadcast" }} />
      {!hasBroadcasts ? (
        <Link to="/admin/broadcast" className="card p-4 mb-4 flex items-center gap-3 press-scale">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shrink-0">
            <Megaphone className="text-white" size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink">Send first broadcast</p>
            <p className="text-[11px] text-ink-muted">Reach {m.total} leads via WhatsApp</p>
          </div>
          <ChevronRight size={16} className="text-ink-muted" />
        </Link>
      ) : (
        <div className="mb-4">
          {/* WA Stats horizontal scroll */}
          <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4 mb-3">
            <PulseCard label="Sent" value={waTotals.sent.toLocaleString("en-IN")} icon={Send} tone="info" className="min-w-[120px]" />
            <PulseCard label="Delivered" value={`${waRates.deliveryRate}%`} icon={CheckCheck} tone="ok" className="min-w-[120px]" />
            <PulseCard label="Read" value={`${waRates.readRate}%`} icon={Eye} tone="primary" className="min-w-[120px]" />
            <PulseCard label="Replied" value={`${waRates.responseRate}%`} icon={MessageCircle} tone="signal" className="min-w-[120px]" />
          </div>

          {/* Delivery funnel */}
          <div className="card p-4">
            <p className="eyebrow mb-3">Delivery funnel</p>
            <div className="space-y-2.5">
              {[
                { label: "Sent", value: waTotals.sent, color: "bg-blue-500" },
                { label: "Delivered", value: waTotals.delivered, color: "bg-green-500" },
                { label: "Read", value: waTotals.read, color: "bg-orange-500" },
                { label: "Replied", value: waTotals.replied || 0, color: "bg-purple-500" },
              ].map((s) => {
                const pct = waTotals.sent > 0 ? Math.round((s.value / waTotals.sent) * 100) : 0;
                return (
                  <div key={s.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-ink">{s.label}</span>
                      <span className="text-xs num text-ink-soft">{s.value.toLocaleString("en-IN")} · {pct}%</span>
                    </div>
                    <div className="w-full bg-cream-200 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${s.color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ TREND CHART ═══ */}
      <div className="card p-4 mb-4">
        <p className="eyebrow mb-1">Lead inflow · 14 days</p>
        <p className="text-[10px] text-ink-muted mb-3">New leads vs won</p>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={m.trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F04E00" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#F04E00" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gWon" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={2} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9 }} allowDecimals={false} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
            <Area type="monotone" dataKey="leads" name="New" stroke="#F04E00" fill="url(#gLeads)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="won" name="Won" stroke="#10B981" fill="url(#gWon)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ═══ STATUS PIE ═══ */}
      <div className="card p-4 mb-4">
        <p className="eyebrow mb-2">Status split</p>
        {m.statusData.length === 0
          ? <p className="text-xs text-ink-muted text-center py-8">No leads yet</p>
          : <StatusPie data={m.statusData} />}
      </div>

      {/* ═══ TEAM PERFORMANCE ═══ */}
      <SectionLabel icon={Users} text="Team" action={{ label: "Manage", to: "/admin/employees" }} />
      {m.team.length === 0 ? (
        <div className="card p-4 mb-4">
          <p className="text-xs text-ink-muted text-center py-4">Add team members to see performance</p>
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {m.team.slice(0, 5).map((e) => (
            <div key={e.id} className="card p-3.5 flex items-center gap-3">
              <div className="avatar-sm shrink-0">
                {(e.name || "?")[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">{e.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] num text-ink-muted">{e.open} open</span>
                  <span className="text-[10px] num text-success-600">{e.wins} won</span>
                  <span className="text-[10px] num text-ink-muted">{e.conversion}%</span>
                  {e.stale > 0 && <span className="text-[10px] num text-danger-600">{e.stale} stale</span>}
                </div>
              </div>
              {m.hasRevenue && e.revenue > 0 && (
                <span className="text-xs font-semibold text-success-600 num">{fmtMoney(e.revenue)}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ═══ SOURCES ═══ */}
      <SectionLabel icon={Target} text="Sources" />
      {m.sources.length === 0 ? (
        <div className="card p-4 mb-4">
          <p className="text-xs text-ink-muted text-center py-4">No leads yet</p>
        </div>
      ) : (
        <div className="card p-4 mb-4">
          <div className="space-y-3">
            {m.sources.slice(0, 5).map((s) => {
              const max = m.sources[0].total || 1;
              return (
                <div key={s.source}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-ink">{s.source}</span>
                    <span className="text-[10px] num text-ink-muted">
                      {s.total} · <span className="text-success-600">{s.won} won</span> · {s.rate}%
                    </span>
                  </div>
                  <div className="w-full bg-cream-200 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-gradient-orange" style={{ width: `${Math.round((s.total / max) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ RECENT ACTIVITY ═══ */}
      <SectionLabel icon={ActivityIcon} text="Activity" />
      <div className="card p-4 mb-2">
        {activity.length === 0 ? (
          <p className="text-xs text-ink-muted text-center py-6">No activity yet</p>
        ) : (
          <div className="space-y-2.5">
            {activity.slice(0, 8).map((a) => (
              <div key={a.id} className="flex items-start gap-2.5 text-xs border-l-2 border-orange-200 pl-3 py-0.5">
                <span className="text-ink-soft flex-1 leading-relaxed">{a.text}</span>
                <span className="text-ink-muted num whitespace-nowrap shrink-0">{fmtDate(a.at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

/* ─────────────── UI PRIMITIVES ─────────────── */

function SectionLabel({ icon: Icon, text, action }) {
  return (
    <div className="flex items-center justify-between mb-2 mt-1">
      <div className="flex items-center gap-1.5">
        <Icon size={13} className="text-orange-500" />
        <h2 className="section-title">{text}</h2>
      </div>
      {action && (
        <Link to={action.to} className="text-[11px] font-semibold text-orange-600 flex items-center gap-0.5 press-scale">
          {action.label} <ChevronRight size={11} />
        </Link>
      )}
    </div>
  );
}

const TONES = {
  primary: { bg: "bg-orange-50", fg: "text-orange-600", accent: "text-orange-700" },
  ok: { bg: "bg-success-50", fg: "text-success-600", accent: "text-success-700" },
  danger: { bg: "bg-danger-50", fg: "text-danger-600", accent: "text-danger-700" },
  warn: { bg: "bg-amber-50", fg: "text-amber-600", accent: "text-amber-700" },
  info: { bg: "bg-blue-50", fg: "text-blue-600", accent: "text-blue-700" },
  signal: { bg: "bg-purple-50", fg: "text-purple-600", accent: "text-purple-700" },
};

function PulseCard({ label, value, icon: Icon, tone = "primary", sub, onClick, className = "" }) {
  const t = TONES[tone] || TONES.primary;

  return (
    <div
      onClick={onClick}
      className={`card p-3 transition-transform duration-100 ${onClick ? "press-scale cursor-pointer" : ""} ${className}`}
    >
      <div className={`w-8 h-8 ${t.bg} rounded-lg flex items-center justify-center mb-2`}>
        <Icon size={15} strokeWidth={2.2} className={t.fg} />
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted mb-0.5 truncate">{label}</p>
      <p className={`text-lg font-display font-bold num leading-tight ${t.accent}`}>{value}</p>
      {sub && <p className="text-[10px] text-ink-muted mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

function ActionList({ title, items, to }) {
  const toneMap = {
    danger: "border-danger-100 bg-danger-50/60",
    warn: "border-warning-200 bg-warning-50/60",
    info: "border-blue-100 bg-blue-50/60",
  };
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-bold text-ink">{title}</p>
        <Link to={to} className="text-[10px] font-semibold text-orange-600 press-scale">View all</Link>
      </div>
      <div className="space-y-1.5">
        {items.map((it) => (
          <Link
            key={it.key}
            to={it.link}
            className={`flex items-center justify-between rounded-xl border px-3 py-2.5 press-scale ${toneMap[it.tone] || toneMap.info}`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink truncate">{it.primary}</p>
              <p className="text-[10px] text-ink-muted truncate">{it.secondary}</p>
            </div>
            <span className="text-[10px] font-mono font-semibold whitespace-nowrap ml-2">{it.badge}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
