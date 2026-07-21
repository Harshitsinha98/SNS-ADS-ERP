/**
 * Module 1: Executive Dashboard.
 *
 * Top-level KPIs, revenue chart, org growth, and real-time metrics.
 * This is the landing page of the Platform Console (/platform).
 */

import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import PlatformShell from "./components/PlatformShell";
import KpiCard from "./components/KpiCard";
import SectionCard from "./components/SectionCard";
import { usePlatformAuth } from "./hooks/usePlatformAuth";
import { usePlatformData } from "./hooks/usePlatformData";
import {
  Building2, Users, IndianRupee, TrendingUp, Calendar, Zap, MessageCircle, Target,
} from "lucide-react";

export default function ExecutiveDashboard() {
  const { isPlatformAdmin } = usePlatformAuth();
  const { analytics, loading } = usePlatformData(isPlatformAdmin);

  const planChartData = useMemo(() => {
    if (!analytics?.planDistribution) return [];
    return Object.entries(analytics.planDistribution).map(([plan, count]) => ({
      name: plan.charAt(0).toUpperCase() + plan.slice(1),
      count,
    }));
  }, [analytics]);

  return (
    <PlatformShell title="Executive Dashboard">
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl border border-cream-200 bg-white p-5 h-28 animate-pulse" />
          ))}
        </div>
      ) : analytics ? (
        <div className="space-y-6">
          {/* KPI Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Monthly Revenue"
              value={`₹${(analytics.mrr || 0).toLocaleString("en-IN")}`}
              sublabel={`ARR: ₹${((analytics.mrr || 0) * 12).toLocaleString("en-IN")}`}
              icon={IndianRupee}
              color="green"
              trend={12}
              trendLabel="vs last month"
            />
            <KpiCard
              label="Total Organizations"
              value={analytics.total}
              sublabel={`${analytics.recentSignups} new this week`}
              icon={Building2}
              color="blue"
              trend={analytics.recentSignups > 0 ? Math.round((analytics.recentSignups / Math.max(analytics.total, 1)) * 100) : 0}
              trendLabel="weekly growth"
            />
            <KpiCard
              label="Active Subscriptions"
              value={analytics.active}
              sublabel={`${analytics.trialing} trialing · ${analytics.expired} expired`}
              icon={TrendingUp}
              color="orange"
            />
            <KpiCard
              label="Platform Users"
              value={analytics.totalSeats}
              sublabel={`across ${analytics.total} workspaces`}
              icon={Users}
              color="purple"
            />
          </div>

          {/* Second KPI Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Total Leads" value={analytics.totalLeads?.toLocaleString("en-IN")} icon={Target} color="amber" />
            <KpiCard label="WhatsApp Connected" value={analytics.whatsappConnected} icon={MessageCircle} color="green" />
            <KpiCard label="Trial Conversions" value={`${analytics.active && analytics.total ? Math.round((analytics.active / analytics.total) * 100) : 0}%`} icon={Zap} color="orange" />
            <KpiCard label="At-Risk (Expired)" value={analytics.expired + analytics.pastDue} icon={Calendar} color="red" />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title="Plan Distribution" subtitle="Active organizations by plan">
              {planChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={planChartData}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#f97316" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-ink-muted text-center py-8">No data yet</p>
              )}
            </SectionCard>

            <SectionCard title="Subscription Status" subtitle="Organization health overview">
              <div className="space-y-3">
                {[
                  { label: "Active", count: analytics.active, color: "bg-emerald-500", pct: analytics.total ? (analytics.active / analytics.total) * 100 : 0 },
                  { label: "Trialing", count: analytics.trialing, color: "bg-amber-500", pct: analytics.total ? (analytics.trialing / analytics.total) * 100 : 0 },
                  { label: "Past Due", count: analytics.pastDue, color: "bg-orange-500", pct: analytics.total ? (analytics.pastDue / analytics.total) * 100 : 0 },
                  { label: "Expired", count: analytics.expired, color: "bg-red-500", pct: analytics.total ? (analytics.expired / analytics.total) * 100 : 0 },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-ink-soft w-20">{item.label}</span>
                    <div className="flex-1 h-4 rounded-full bg-cream-200 overflow-hidden">
                      <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.pct}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-ink w-8 text-right">{item.count}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </div>
      ) : (
        <div className="card p-12 text-center">
          <Building2 size={36} className="text-cream-400 mx-auto mb-3" />
          <p className="text-ink-muted">No platform data available yet.</p>
        </div>
      )}
    </PlatformShell>
  );
}
