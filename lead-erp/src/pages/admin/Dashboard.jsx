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
  CartesianGrid,
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
  ArrowRight,
  Activity as ActivityIcon,
  Users,
  Flame,
} from "lucide-react";

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSED = ["Closed-Won", "Lost"];

// "3d late" / "5h late" / "just now" — avoids showing "0d late" for recent misses.
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

  // WhatsApp broadcast engagement — optional, fails silently if unavailable.
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

    // ── Today's pulse ──
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

    // ── Pipeline health ──
    const conversionRate = active.length ? Math.round((won.length / active.length) * 100) : 0;
    const avgDaysToClose = won.length
      ? Math.round(won.reduce((s, l) => s + Math.max(0, (new Date(l.lastUpdated) - new Date(l.createdAt)) / DAY_MS), 0) / won.length)
      : 0;
    const hotLeads = open.filter((l) => l.priority === "Hot").length;

    // ── Revenue (only surfaced when actually tracked) ──
    const wonValue = won.reduce((s, l) => s + revenueOf(l), 0);
    const pipelineValue = open.reduce((s, l) => s + revenueOf(l), 0);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const revenueThisMonth = won.reduce((s, l) => {
      const at = financials[l.id]?.revenueUpdatedAt;
      return at && new Date(at) >= monthStart ? s + revenueOf(l) : s;
    }, 0);
    const hasRevenue = wonValue > 0 || pipelineValue > 0;
    const wonMissingRevenue = won.filter((l) => revenueOf(l) <= 0);

    // ── 14-day lead inflow trend ──
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

    // ── Team performance (lead-first, revenue optional) ──
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
      .sort((a, b) => (b.revenue - a.revenue) || (b.wins - a.wins) || (b.assigned - a.assigned));

    // ── Source performance ──
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
  const showWhatsApp = Boolean(waTotals && waTotals.sent > 0);

  return (
    <Layout title="Business Command Center">
      {/* ═══ TODAY'S PULSE — what needs attention right now ═══ */}
      <SectionLabel icon={Flame} text="Today's Pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
        <PulseCard
          label="New Leads Today" value={m.newToday} icon={UserPlus} tone="primary"
          onClick={() => navigate("/admin/leads")}
        />
        <PulseCard
          label="Due Today" value={m.dueToday.length} icon={CalendarClock} tone="info"
          sub="follow-ups" onClick={() => navigate("/admin/follow-ups")}
        />
        <PulseCard
          label="Overdue" value={m.overdue.length} icon={CalendarX2}
          tone={m.overdue.length > 0 ? "danger" : "ok"} sub="follow-ups"
          onClick={() => navigate("/admin/follow-ups")}
        />
        <PulseCard
          label="Untouched 3d+" value={m.untouched.length} icon={AlertTriangle}
          tone={m.untouched.length > 0 ? "warn" : "ok"} sub="SLA risk"
          onClick={() => navigate("/admin/follow-ups")}
        />
      </div>

      {/* ═══ PIPELINE HEALTH ═══ */}
      <SectionLabel icon={Target} text="Pipeline Health" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
        <PulseCard label="Active Pipeline" value={m.open} icon={Layers} tone="primary" sub={`of ${m.total} total leads`} onClick={() => navigate("/admin/leads")} />
        <PulseCard label="Conversion Rate" value={`${m.conversionRate}%`} icon={TrendingUp} tone="ok" sub={`${m.won} won · ${m.lost} lost`} />
        <PulseCard label="Avg Days to Close" value={m.avgDaysToClose || "—"} icon={Timer} tone="signal" sub={m.won ? `across ${m.won} won deals` : "no wins yet"} />
        <PulseCard label="Hot Leads" value={m.hotLeads} icon={Flame} tone="danger" sub="high priority, open" onClick={() => navigate("/admin/leads")} />
      </div>

      {/* ═══ WHATSAPP ENGAGEMENT (only when broadcasts exist) ═══ */}
      {showWhatsApp && (
        <>
          <SectionLabel icon={MessageCircle} text="WhatsApp Engagement" action={{ label: "Broadcast dashboard", to: "/admin/broadcast" }} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
            <PulseCard label="Messages Sent" value={waTotals.sent.toLocaleString("en-IN")} icon={Send} tone="info" sub={`${waTotals.broadcasts} campaigns`} onClick={() => navigate("/admin/broadcast")} />
            <PulseCard label="Delivery Rate" value={`${waRates.deliveryRate}%`} icon={CheckCheck} tone="ok" sub={`${waTotals.delivered.toLocaleString("en-IN")} delivered`} />
            <PulseCard label="Read Rate" value={`${waRates.readRate}%`} icon={Eye} tone="primary" sub={`${waTotals.read.toLocaleString("en-IN")} read`} />
            <PulseCard label="Response Rate" value={`${waRates.responseRate}%`} icon={MessageCircle} tone="signal" sub={`${(waTotals.replied || 0).toLocaleString("en-IN")} replied`} />
          </div>
        </>
      )}

      {/* ═══ REVENUE (only when actually tracked) ═══ */}
      {m.hasRevenue && (
        <>
          <SectionLabel icon={IndianRupee} text="Revenue" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-7">
            <PulseCard label="Revenue Won" value={fmtMoney(m.wonValue)} icon={IndianRupee} tone="ok" />
            <PulseCard label="This Month" value={fmtMoney(m.revenueThisMonth)} icon={CalendarClock} tone="info" />
            <PulseCard label="Open Pipeline Value" value={fmtMoney(m.pipelineValue)} icon={Layers} tone="signal" />
          </div>
        </>
      )}

      {/* ═══ ACTION CENTER — the single most useful block ═══ */}
      {(m.overdue.length > 0 || m.untouched.length > 0 || m.wonMissingRevenue.length > 0) && (
        <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6 mb-7">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-danger-50 flex items-center justify-center">
              <AlertTriangle size={16} className="text-danger-600" />
            </div>
            <h3 className="font-display font-bold text-base text-ink">Needs Your Attention</h3>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Overdue follow-ups */}
            {m.overdue.length > 0 && (
              <ActionList
                title={`Overdue follow-ups (${m.overdue.length})`}
                to="/admin/follow-ups"
                items={m.overdue.slice(0, 5).map((t) => ({
                  key: t.id,
                  primary: t.leadName || t.title || "Follow-up",
                  secondary: t.assignedToName || "Unassigned",
                  badge: lateLabel(t.dueAt),
                  tone: "danger",
                  link: t.leadId ? `/admin/leads/${t.leadId}` : "/admin/follow-ups",
                }))}
              />
            )}

            {/* Untouched leads */}
            {m.untouched.length > 0 && (
              <ActionList
                title={`Untouched leads (${m.untouched.length})`}
                to="/admin/leads"
                items={m.untouched.slice(0, 5).map((l) => ({
                  key: l.id,
                  primary: l.name || "Lead",
                  secondary: l.assignedToName || "Unassigned",
                  badge: `${daysSince(l.lastUpdated)}d idle`,
                  tone: "warn",
                  link: `/admin/leads/${l.id}`,
                }))}
              />
            )}

            {/* Won deals missing revenue */}
            {m.wonMissingRevenue.length > 0 && (
              <ActionList
                title={`Won deals missing revenue (${m.wonMissingRevenue.length})`}
                to="/admin/leads"
                items={m.wonMissingRevenue.slice(0, 5).map((l) => ({
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
        </div>
      )}

      {/* ═══ TRENDS ═══ */}
      <div className="grid lg:grid-cols-3 gap-6 mb-7">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-card border border-cream-300/60 p-6">
          <h3 className="font-display font-bold text-base text-ink mb-1">Lead Inflow (Last 14 Days)</h3>
          <p className="text-xs text-ink-muted mb-4">New leads captured vs deals won</p>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={m.trend} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="dLeads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F04E00" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#F04E00" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="dWon" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2BAE66" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#2BAE66" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E6E1D6" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={1} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Area type="monotone" dataKey="leads" name="New leads" stroke="#F04E00" fill="url(#dLeads)" strokeWidth={2} />
              <Area type="monotone" dataKey="won" name="Won" stroke="#2BAE66" fill="url(#dWon)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6">
          <h3 className="font-display font-bold text-base text-ink mb-1">Status Distribution</h3>
          <p className="text-xs text-ink-muted mb-2">Where your pipeline sits</p>
          {m.statusData.length === 0
            ? <p className="text-sm text-ink-muted text-center py-16">No leads yet.</p>
            : <StatusPie data={m.statusData} />}
        </div>
      </div>

      {/* ═══ TEAM + SOURCE ═══ */}
      <div className="grid lg:grid-cols-2 gap-6 mb-7">
        {/* Team performance */}
        <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 overflow-hidden">
          <div className="px-6 py-4 border-b border-cream-200 flex items-center gap-2">
            <Users size={16} className="text-orange-500" />
            <h3 className="font-display font-bold text-base text-ink">Team Performance</h3>
          </div>
          {m.team.length === 0 ? (
            <p className="text-center text-sm text-ink-muted py-10">Add team members to see performance.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-cream-50">
                  <tr className="text-xs text-ink-muted">
                    <th className="text-left px-6 py-2.5 font-medium">Employee</th>
                    <th className="text-right px-3 py-2.5 font-medium">Open</th>
                    <th className="text-right px-3 py-2.5 font-medium">Won</th>
                    <th className="text-right px-3 py-2.5 font-medium">Conv.</th>
                    <th className="text-right px-6 py-2.5 font-medium">Stale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-100">
                  {m.team.slice(0, 6).map((e) => (
                    <tr key={e.id} className="hover:bg-cream-50">
                      <td className="px-6 py-3">
                        <p className="font-medium text-ink truncate max-w-[140px]">{e.name}</p>
                        {m.hasRevenue && e.revenue > 0 && <p className="text-xs text-success-600">{fmtMoney(e.revenue)}</p>}
                      </td>
                      <td className="px-3 py-3 text-right num text-ink-soft">{e.open}</td>
                      <td className="px-3 py-3 text-right num text-success-600 font-medium">{e.wins}</td>
                      <td className="px-3 py-3 text-right">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${e.conversion >= 20 ? "bg-green-100 text-green-700" : "bg-cream-200 text-ink-soft"}`}>
                          {e.conversion}%
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right num">
                        <span className={e.stale > 0 ? "text-danger-600 font-medium" : "text-ink-muted"}>{e.stale}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Source performance */}
        <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 overflow-hidden">
          <div className="px-6 py-4 border-b border-cream-200 flex items-center gap-2">
            <Target size={16} className="text-orange-500" />
            <h3 className="font-display font-bold text-base text-ink">Lead Source Performance</h3>
          </div>
          {m.sources.length === 0 ? (
            <p className="text-center text-sm text-ink-muted py-10">No leads yet.</p>
          ) : (
            <div className="divide-y divide-cream-100">
              {m.sources.slice(0, 6).map((s) => {
                const max = m.sources[0].total || 1;
                return (
                  <div key={s.source} className="px-6 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-ink">{s.source}</span>
                      <span className="text-xs text-ink-muted">
                        <span className="num text-ink-soft">{s.total}</span> leads ·{" "}
                        <span className="text-success-600 font-medium num">{s.won}</span> won ·{" "}
                        <span className="num">{s.rate}%</span>
                        {m.hasRevenue && s.revenue > 0 && <> · <span className="text-ink font-medium">{fmtMoney(s.revenue)}</span></>}
                      </span>
                    </div>
                    <div className="w-full bg-cream-200 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-gradient-to-r from-orange-400 to-amber-500" style={{ width: `${Math.round((s.total / max) * 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═══ RECENT ACTIVITY ═══ */}
      <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6">
        <div className="flex items-center gap-2 mb-4">
          <ActivityIcon size={16} className="text-orange-500" />
          <h3 className="font-display font-bold text-base text-ink">Recent Activity</h3>
        </div>
        {activity.length === 0 ? (
          <p className="text-sm text-ink-muted text-center py-8">No activity yet.</p>
        ) : (
          <ul className="space-y-2.5 max-h-72 overflow-y-auto">
            {activity.slice(0, 15).map((a) => (
              <li key={a.id} className="flex items-start gap-3 text-sm border-l-2 border-orange-200 pl-4 py-0.5">
                <span className="text-ink-soft flex-1">{a.text}</span>
                <span className="text-xs text-ink-muted num whitespace-nowrap">{fmtDate(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
}

/* ─────────────── UI primitives ─────────────── */

function SectionLabel({ icon: Icon, text, action }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon size={15} className="text-orange-500" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{text}</h2>
      </div>
      {action && (
        <Link to={action.to} className="text-xs font-medium text-orange-600 hover:text-orange-700 flex items-center gap-1">
          {action.label} <ArrowRight size={12} />
        </Link>
      )}
    </div>
  );
}

const TONES = {
  primary: { bar: "bg-orange-500", bg: "bg-orange-50", fg: "text-orange-600" },
  ok: { bar: "bg-green-500", bg: "bg-green-50", fg: "text-green-600" },
  danger: { bar: "bg-red-500", bg: "bg-red-50", fg: "text-red-600" },
  warn: { bar: "bg-amber-500", bg: "bg-amber-50", fg: "text-amber-600" },
  info: { bar: "bg-blue-500", bg: "bg-blue-50", fg: "text-blue-600" },
  signal: { bar: "bg-purple-500", bg: "bg-purple-50", fg: "text-purple-600" },
};

function PulseCard({ label, value, icon: Icon, tone = "primary", sub, onClick }) {
  const t = TONES[tone] || TONES.primary;
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl shadow-card border border-cream-300/60 p-4 relative overflow-hidden transition-all ${
        onClick ? "cursor-pointer hover:shadow-card-hover hover:border-orange-200" : ""
      }`}
    >
      <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${t.bar}`} />
      <div className="flex items-start justify-between mb-2">
        <div className={`w-9 h-9 ${t.bg} rounded-lg flex items-center justify-center`}>
          <Icon size={16} className={t.fg} />
        </div>
        {onClick && <ArrowRight size={13} className="text-ink-muted/50" />}
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-0.5">{label}</p>
      <p className="text-2xl font-display font-bold text-ink num leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-ink-muted mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

function ActionList({ title, items, to }) {
  const toneMap = {
    danger: "border-danger-100 bg-danger-50/50 text-danger-700",
    warn: "border-warning-200 bg-warning-50/50 text-warning-700",
    info: "border-blue-100 bg-blue-50/50 text-blue-700",
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-ink">{title}</p>
        <Link to={to} className="text-xs text-orange-600 hover:text-orange-700">View all</Link>
      </div>
      <div className="space-y-1.5">
        {items.map((it) => (
          <Link
            key={it.key}
            to={it.link}
            className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 hover:brightness-95 transition ${toneMap[it.tone] || toneMap.info}`}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink truncate">{it.primary}</p>
              <p className="text-[11px] opacity-80 truncate">{it.secondary}</p>
            </div>
            <span className="text-[11px] font-mono font-medium whitespace-nowrap">{it.badge}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
