/**
 * Module 5: Platform Analytics.
 * Usage metrics, growth rates, engagement tracking.
 */
import PlatformShell from "./components/PlatformShell";
import KpiCard from "./components/KpiCard";
import SectionCard from "./components/SectionCard";
import { usePlatformAuth } from "./hooks/usePlatformAuth";
import { usePlatformData } from "./hooks/usePlatformData";
import { BarChart3, Users, Target, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function AnalyticsPage() {
  const { isPlatformAdmin } = usePlatformAuth();
  const { analytics, orgs, loading } = usePlatformData(isPlatformAdmin);

  if (loading) return <PlatformShell title="Platform Analytics"><div className="animate-pulse h-64 rounded-2xl bg-cream-200" /></PlatformShell>;

  // Usage distribution chart
  const usageData = orgs
    .filter((o) => o.leadsLimit > 0)
    .map((o) => ({ name: (o.name || "?").slice(0, 12), usage: Math.round(((o.leadsUsed || 0) / o.leadsLimit) * 100) }))
    .sort((a, b) => b.usage - a.usage)
    .slice(0, 15);

  return (
    <PlatformShell title="Platform Analytics">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total Leads Managed" value={(analytics?.totalLeads || 0).toLocaleString("en-IN")} icon={Target} color="orange" />
          <KpiCard label="Total Seats Used" value={analytics?.totalSeats || 0} icon={Users} color="blue" />
          <KpiCard label="Avg Leads/Org" value={analytics?.total ? Math.round((analytics?.totalLeads || 0) / analytics.total) : 0} icon={BarChart3} color="purple" />
          <KpiCard label="Active Rate" value={`${analytics?.total ? Math.round((analytics.active / analytics.total) * 100) : 0}%`} icon={TrendingUp} color="green" />
        </div>

        <SectionCard title="Lead Usage by Organization" subtitle="Top 15 by lead capacity utilization">
          {usageData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={usageData} layout="vertical" margin={{ left: 60 }}>
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Bar dataKey="usage" fill="#f97316" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-ink-muted text-center py-8">No usage data yet</p>}
        </SectionCard>
      </div>
    </PlatformShell>
  );
}
