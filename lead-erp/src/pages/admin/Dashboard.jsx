import Layout from "../../components/Layout";
import StatCard from "../../components/StatCard";
import StatusPie from "../../components/charts/PieChart";
import ConvBar from "../../components/charts/BarChart";
import { useData } from "../../context/DataContext";
import { daysSince, fmtMoney, pipelineValue, sourceStats, fmtDate } from "../../utils/helpers";
import { IndianRupee, Layers, TrendingUp, Flame, AlertTriangle } from "lucide-react";

export default function Dashboard() {
  const { leads, users, activity } = useData();
  const active = leads.filter((l) => !l.blacklisted);

  const total = active.length;
  const converted = active.filter((l) => l.status === "Closed-Won").length;
  const lost = active.filter((l) => l.status === "Lost").length;
  const activeLeads = total - converted - lost;
  const convRate = total ? ((converted / total) * 100).toFixed(1) : 0;

  const { wonValue, openValue } = pipelineValue(leads);
  const slaBreaches = active.filter(
    (l) => !["Closed-Won", "Lost"].includes(l.status) && daysSince(l.lastUpdated) >= 3
  );
  const hotLeads = active.filter((l) => l.priority === "Hot" && !["Closed-Won", "Lost"].includes(l.status));

  const statusData = [...new Set(active.map((l) => l.status))].map((s) => ({
    name: s, value: active.filter((l) => l.status === s).length,
  }));
  const leaderboard = users.filter((u) => u.role === "employee").map((u) => ({
    name: u.name, value: active.filter((l) => l.assignedTo === u.id && l.status === "Closed-Won").length,
  }));
  const sources = sourceStats(leads);

  return (
    <Layout title="Business Command Center">
      <div className="grid grid-cols-4 gap-4 mb-4">
        <StatCard label="Revenue won" value={fmtMoney(wonValue)} tone="ok" icon={IndianRupee} />
        <StatCard label="Pipeline value" value={fmtMoney(openValue)} tone="info" icon={Layers} />
        <StatCard label="Conversion rate" value={`${convRate}%`} tone="signal" icon={TrendingUp} />
        <StatCard label="Hot leads open" value={hotLeads.length} tone="danger" icon={Flame} />
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total leads" value={total} tone="ink" />
        <StatCard label="Active" value={activeLeads} tone="info" />
        <StatCard label="Converted" value={converted} tone="ok" />
        <StatCard label="Lost" value={lost} tone="danger" />
      </div>

      {slaBreaches.length > 0 && (
        <div className="bg-white border border-danger/25 rounded-lg p-4 mb-6">
          <h3 className="flex items-center gap-2 font-display font-semibold text-danger mb-2">
            <AlertTriangle size={16} /> SLA escalation — {slaBreaches.length} untouched
          </h3>
          <ul className="text-sm text-ink/70 space-y-1">
            {slaBreaches.map((l) => (
              <li key={l.id} className="flex justify-between border-b border-paper-line last:border-0 py-1">
                <span>{l.name} <span className="num text-ink/40">({l.id})</span></span>
                <span className="num text-danger">{daysSince(l.lastUpdated)}d idle</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-card border border-paper-line p-5">
          <p className="eyebrow mb-3">Lead status distribution</p>
          <StatusPie data={statusData} />
        </div>
        <div className="bg-white rounded-lg shadow-card border border-paper-line p-5">
          <p className="eyebrow mb-3">Conversions by employee</p>
          <ConvBar data={leaderboard} />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-card border border-paper-line p-5 mb-6">
        <p className="eyebrow mb-3">Lead source performance</p>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ink/40 border-b border-paper-line">
            <th className="py-2 font-medium">Source</th><th className="font-medium">Leads</th>
            <th className="font-medium">Won</th><th className="font-medium">Rate</th><th className="font-medium">Revenue</th>
          </tr></thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.source} className="border-b border-paper-line last:border-0">
                <td className="py-2 font-medium">{s.source}</td>
                <td className="num">{s.total}</td>
                <td className="num text-ok">{s.won}</td>
                <td className="num">{s.rate}%</td>
                <td className="num">{fmtMoney(s.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-lg shadow-card border border-paper-line p-5">
        <p className="eyebrow mb-3">Recent activity</p>
        <ul className="space-y-2 max-h-60 overflow-y-auto">
          {activity.length === 0 && <li className="text-sm text-ink/40">No activity yet.</li>}
          {activity.slice(0, 15).map((a) => (
            <li key={a.id} className="text-sm border-l-2 border-signal/40 pl-3">
              {a.text} <span className="num text-xs text-ink/35">· {fmtDate(a.at)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Layout>
  );
}