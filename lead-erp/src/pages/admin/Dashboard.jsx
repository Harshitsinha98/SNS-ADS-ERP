import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import StatCard from "../../components/StatCard";
import StatusPie from "../../components/charts/PieChart";
import ConvBar from "../../components/charts/BarChart";
import { useData } from "../../context/DataContext";
import { daysSince, fmtMoney, fmtDate } from "../../utils/helpers";
import {
  IndianRupee,
  Layers,
  AlertTriangle,
  ArrowUpRight,
  Sparkles,
  CalendarDays,
  CircleDollarSign,
} from "lucide-react";

export default function Dashboard() {
  const { leads, users, activity, financials } = useData();
  const active = leads.filter((l) => !l.blacklisted);

  const total = active.length;
  const converted = active.filter((l) => l.status === "Closed-Won").length;
  const lost = active.filter((l) => l.status === "Lost").length;
  const activeLeads = total - converted - lost;

  const revenueOf = (lead) => financials[lead.id]?.revenue || 0;

  const wonValue = active
    .filter((l) => l.status === "Closed-Won")
    .reduce((sum, l) => sum + revenueOf(l), 0);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const revenueThisMonth = active
    .filter((l) => l.status === "Closed-Won")
    .reduce((sum, lead) => {
      const revenueUpdatedAt = financials[lead.id]?.revenueUpdatedAt;
      return revenueUpdatedAt && new Date(revenueUpdatedAt) >= monthStart
        ? sum + revenueOf(lead)
        : sum;
    }, 0);
  const averageWonDeal = converted ? wonValue / converted : 0;
  const wonLeads = active.filter((lead) => lead.status === "Closed-Won");
  const wonWithRevenue = wonLeads.filter((lead) => Number(revenueOf(lead)) > 0);
  const wonMissingRevenue = wonLeads.filter((lead) => Number(revenueOf(lead)) <= 0);
  const revenueCoverage = converted ? Math.round((wonWithRevenue.length / converted) * 100) : 0;

  const openValue = active
    .filter((l) => !["Closed-Won", "Lost"].includes(l.status))
    .reduce((sum, l) => sum + revenueOf(l), 0);

  const slaBreaches = active.filter(
    (l) =>
      !["Closed-Won", "Lost"].includes(l.status) && daysSince(l.lastUpdated) >= 3
  );

  const statusData = [...new Set(active.map((l) => l.status))].map((s) => ({
    name: s,
    value: active.filter((l) => l.status === s).length,
  }));

  const leaderboard = users
    .filter((u) => u.role === "employee")
    .map((u) => {
      const assigned = active.filter((lead) => lead.assignedTo === u.id);
      const wonLeads = assigned.filter((lead) => lead.status === "Closed-Won");
      return {
        name: u.name || "Unassigned",
        value: wonLeads.reduce((sum, lead) => sum + revenueOf(lead), 0),
        wins: wonLeads.length,
        pipeline: assigned
          .filter((lead) => !["Closed-Won", "Lost"].includes(lead.status))
          .reduce((sum, lead) => sum + revenueOf(lead), 0),
        conversion: assigned.length ? ((wonLeads.length / assigned.length) * 100).toFixed(1) : "0.0",
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const sourceMap = {};
  active.forEach((l) => {
    const src = l.source || "Unknown";
    if (!sourceMap[src]) sourceMap[src] = { source: src, total: 0, won: 0, revenue: 0 };
    sourceMap[src].total++;
    if (l.status === "Closed-Won") {
      sourceMap[src].won++;
      sourceMap[src].revenue += revenueOf(l);
    }
  });
  const sources = Object.values(sourceMap)
    .map((s) => ({
      ...s,
      rate: s.total ? ((s.won / s.total) * 100).toFixed(1) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return (
    <Layout title="Business Command Center">
      {/* Hero Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Revenue Won"
          value={fmtMoney(wonValue)}
          tone="ok"
          icon={IndianRupee}
        />
        <StatCard
          label="Revenue This Month"
          value={fmtMoney(revenueThisMonth)}
          tone="signal"
          icon={CalendarDays}
        />
        <StatCard
          label="Average Won Deal"
          value={fmtMoney(averageWonDeal)}
          tone="info"
          icon={CircleDollarSign}
        />
        <StatCard
          label="Pipeline Value"
          value={fmtMoney(openValue)}
          tone="danger"
          icon={Layers}
        />
      </div>

      <section className="mb-6 rounded-2xl border border-success-200 bg-gradient-to-r from-success-50 via-white to-emerald-50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div><p className="eyebrow text-success-700">Connected deal revenue</p><h2 className="mt-1 text-xl font-bold text-ink">₹ values flow from each won lead into this dashboard</h2><p className="mt-1 text-sm text-ink-soft">Revenue is stored in a separate admin-only lead record and powers won revenue, monthly revenue, pipeline value, team performance, and source reporting.</p></div>
          <div className="grid grid-cols-2 gap-2 sm:flex"><RevenueMetric label="Captured" value={`${revenueCoverage}%`} /><RevenueMetric label="Won deals tracked" value={`${wonWithRevenue.length}/${converted}`} /><RevenueMetric label="Needs value" value={wonMissingRevenue.length} danger /></div>
        </div>
        {wonMissingRevenue.length > 0 && <div className="mt-4 flex flex-wrap gap-2"><span className="text-xs font-medium text-success-800">Add revenue to these won deals:</span>{wonMissingRevenue.slice(0, 4).map((lead) => <Link key={lead.id} to={`/admin/leads/${lead.id}`} className="rounded-full border border-success-200 bg-white px-3 py-1 text-xs font-medium text-success-800 hover:bg-success-100">{lead.name || "Lead"}</Link>)}{wonMissingRevenue.length > 4 && <span className="rounded-full bg-white px-3 py-1 text-xs text-success-800">+{wonMissingRevenue.length - 4} more</span>}</div>}
      </section>

      {/* Lead Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-card border border-gray-100 p-4">
          <p className="text-xs font-medium text-gray-500 mb-1">Total Leads</p>
          <p className="text-2xl font-bold text-gray-800 num">{total}</p>
        </div>
        <div className="bg-white rounded-xl shadow-card border border-gray-100 p-4">
          <p className="text-xs font-medium text-gray-500 mb-1">Active</p>
          <p className="text-2xl font-bold text-primary-600 num">{activeLeads}</p>
        </div>
        <div className="bg-white rounded-xl shadow-card border border-gray-100 p-4">
          <p className="text-xs font-medium text-gray-500 mb-1">Converted</p>
          <p className="text-2xl font-bold text-success-600 num">{converted}</p>
        </div>
        <div className="bg-white rounded-xl shadow-card border border-gray-100 p-4">
          <p className="text-xs font-medium text-gray-500 mb-1">Lost</p>
          <p className="text-2xl font-bold text-danger-600 num">{lost}</p>
        </div>
      </div>

      {/* SLA Alerts */}
      {slaBreaches.length > 0 && (
        <div className="bg-gradient-to-r from-danger-50 to-warning-50 rounded-xl border border-danger-100 p-5 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-danger-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-danger-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-danger-700 mb-2">
                SLA Escalation — {slaBreaches.length} untouched leads
              </h3>
              <ul className="space-y-2">
                {slaBreaches.slice(0, 5).map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between text-sm bg-white/50 rounded-lg px-3 py-2"
                  >
                    <span className="font-medium text-gray-800">{l.name}</span>
                    <span className="text-danger-600 font-mono text-xs">
                      {daysSince(l.lastUpdated)}d idle
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-card border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">Lead Status Distribution</h3>
            <ArrowUpRight className="w-4 h-4 text-gray-400" />
          </div>
          <StatusPie data={statusData} />
        </div>
        <div className="bg-white rounded-xl shadow-card border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">Revenue by Employee</h3>
            <Sparkles className="w-4 h-4 text-accent-500" />
          </div>
          <ConvBar data={leaderboard} />
        </div>
      </div>

      {/* Employee Revenue Table */}
      <div className="bg-white rounded-xl shadow-card border border-gray-100 p-6 mb-6 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-gray-800">Employee Revenue Performance</h3>
            <p className="text-xs text-gray-500 mt-1">Won revenue, open pipeline and conversion from assigned leads.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead><tr className="border-b border-gray-100">
              <th className="text-left py-3 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wider">Employee</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wider">Won deals</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wider">Won revenue</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wider">Pipeline</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wider">Conversion</th>
            </tr></thead>
            <tbody>
              {leaderboard.map((employee) => (
                <tr key={employee.name} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium text-gray-800">{employee.name}</td>
                  <td className="py-3 px-4 text-right font-mono text-success-600">{employee.wins}</td>
                  <td className="py-3 px-4 text-right font-mono font-medium text-gray-800">{fmtMoney(employee.value)}</td>
                  <td className="py-3 px-4 text-right font-mono text-gray-600">{fmtMoney(employee.pipeline)}</td>
                  <td className="py-3 px-4 text-right font-mono text-gray-600">{employee.conversion}%</td>
                </tr>
              ))}
              {leaderboard.length === 0 && <tr><td colSpan="5" className="py-6 text-center text-gray-400">Add and assign employees to see revenue performance.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Source Performance Table */}
      <div className="bg-white rounded-xl shadow-card border border-gray-100 p-6 mb-6 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">Lead Source Performance</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                  Source
                </th>
                <th className="text-right py-3 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                  Leads
                </th>
                <th className="text-right py-3 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                  Won
                </th>
                <th className="text-right py-3 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                  Rate
                </th>
                <th className="text-right py-3 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s, i) => (
                <tr
                  key={s.source}
                  className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${
                    i === 0 ? "bg-primary-50/30" : ""
                  }`}
                >
                  <td className="py-3 px-4 font-medium text-gray-800">{s.source}</td>
                  <td className="py-3 px-4 text-right text-gray-600 font-mono">
                    {s.total}
                  </td>
                  <td className="py-3 px-4 text-right text-success-600 font-mono font-medium">
                    {s.won}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-600 font-mono">
                    {s.rate}%
                  </td>
                  <td className="py-3 px-4 text-right text-gray-800 font-mono font-medium">
                    {fmtMoney(s.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl shadow-card border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">Recent Activity</h3>
        </div>
        <ul className="space-y-3 max-h-80 overflow-y-auto">
          {activity.length === 0 && (
            <li className="text-sm text-gray-400 text-center py-8">
              No activity yet
            </li>
          )}
          {activity.slice(0, 20).map((a) => (
            <li
              key={a.id}
              className="flex items-start gap-3 text-sm border-l-2 border-primary-200 pl-4 py-1"
            >
              <span className="text-gray-700 flex-1">{a.text}</span>
              <span className="text-xs text-gray-400 font-mono whitespace-nowrap">
                {fmtDate(a.at)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Layout>
  );
}


function RevenueMetric({ label, value, danger = false }) {
  return <div className={`rounded-xl border px-3 py-2 text-center ${danger ? "border-warning-200 bg-warning-50 text-warning-800" : "border-success-200 bg-white text-success-800"}`}><p className="text-[10px] font-semibold uppercase tracking-wide">{label}</p><p className="num mt-1 text-lg font-bold">{value}</p></div>;
}
