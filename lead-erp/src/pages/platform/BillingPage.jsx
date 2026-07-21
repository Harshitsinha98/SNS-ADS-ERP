/**
 * Module 3: Subscription & Billing.
 * MRR/ARR, payment history, plan distribution, billing health.
 */

import PlatformShell from "./components/PlatformShell";
import KpiCard from "./components/KpiCard";
import SectionCard from "./components/SectionCard";
import StatusBadge from "./components/StatusBadge";
import { usePlatformAuth } from "./hooks/usePlatformAuth";
import { usePlatformData } from "./hooks/usePlatformData";
import { IndianRupee, TrendingUp, CreditCard, AlertTriangle } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const COLORS = ["#f97316", "#3b82f6", "#8b5cf6", "#10b981"];

export default function BillingPage() {
  const { isPlatformAdmin } = usePlatformAuth();
  const { analytics, orgs, loading } = usePlatformData(isPlatformAdmin);

  if (loading) return <PlatformShell title="Subscription & Billing"><div className="animate-pulse h-64 rounded-2xl bg-cream-200" /></PlatformShell>;

  const pieData = analytics?.planDistribution
    ? Object.entries(analytics.planDistribution).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
    : [];

  const pastDueOrgs = orgs.filter((o) => o.subscriptionStatus === "past_due" || o.subscriptionStatus === "expired");

  return (
    <PlatformShell title="Subscription & Billing">
      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="MRR" value={`₹${(analytics?.mrr || 0).toLocaleString("en-IN")}`} icon={IndianRupee} color="green" />
          <KpiCard label="ARR" value={`₹${((analytics?.mrr || 0) * 12).toLocaleString("en-IN")}`} icon={TrendingUp} color="blue" />
          <KpiCard label="Active Subscriptions" value={analytics?.active || 0} icon={CreditCard} color="orange" />
          <KpiCard label="At-Risk Revenue" value={pastDueOrgs.length} sublabel="orgs past due / expired" icon={AlertTriangle} color="red" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Plan breakdown */}
          <SectionCard title="Plan Distribution">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-ink-muted text-center py-8">No data</p>}
          </SectionCard>

          {/* At-risk list */}
          <SectionCard title="At-Risk Accounts" subtitle="Past due or expired subscriptions">
            {pastDueOrgs.length === 0 ? (
              <p className="text-sm text-ink-muted text-center py-8">No at-risk accounts 🎉</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {pastDueOrgs.slice(0, 10).map((org) => (
                  <div key={org.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-cream-50">
                    <div>
                      <p className="text-sm font-medium text-ink">{org.name || "Unnamed"}</p>
                      <p className="text-[11px] text-ink-muted">{org.ownerPhone}</p>
                    </div>
                    <StatusBadge status={org.subscriptionStatus} />
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </PlatformShell>
  );
}
