/**
 * Mission Control Dashboard.
 *
 * The Platform Owner landing page retains the existing Executive KPI cards and
 * charts, while placing time-sensitive operational signals first.
 */

import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, Tooltip, XAxis, YAxis } from "recharts";
import PlatformShell from "./components/PlatformShell";
import KpiCard from "./components/KpiCard";
import SectionCard from "./components/SectionCard";
import ActionCenter from "./components/ActionCenter";
import LiveActivityFeed from "./components/LiveActivityFeed";
import { usePlatformAuth } from "./hooks/usePlatformAuth";
import { usePlatformData } from "./hooks/usePlatformData";
import { useMissionControl } from "./hooks/useMissionControl";
import {
  Building2, Calendar, IndianRupee, MessageCircle, Target, TrendingUp, Users, Zap,
} from "lucide-react";

export default function ExecutiveDashboard() {
  const { isPlatformAdmin } = usePlatformAuth();
  const { analytics, loading } = usePlatformData(isPlatformAdmin);
  const {
    data: missionControl,
    loading: missionControlLoading,
    refreshing: missionControlRefreshing,
    error: missionControlError,
    refresh: refreshMissionControl,
  } = useMissionControl(isPlatformAdmin);

  const planChartData = useMemo(() => {
    if (!analytics?.planDistribution) return [];
    return Object.entries(analytics.planDistribution).map(([plan, count]) => ({
      name: plan.charAt(0).toUpperCase() + plan.slice(1),
      count,
    }));
  }, [analytics]);

  return (
    <PlatformShell title="Mission Control">
      <div className="space-y-6">
        <ActionCenter
          data={missionControl}
          loading={missionControlLoading}
          refreshing={missionControlRefreshing}
          error={missionControlError}
          onRefresh={refreshMissionControl}
        />

        <LiveActivityFeed isPlatformAdmin={isPlatformAdmin} />

        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl border border-cream-200 bg-white p-5" />
            ))}
          </div>
        ) : analytics ? (
          <>
            {/* Existing Executive KPI Row — deliberately preserved. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

            {/* Existing Executive KPI Row — deliberately preserved. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label="Total Leads" value={analytics.totalLeads?.toLocaleString("en-IN")} icon={Target} color="amber" />
              <KpiCard label="WhatsApp Connected" value={analytics.whatsappConnected} icon={MessageCircle} color="green" />
              <KpiCard label="Trial Conversions" value={`${analytics.active && analytics.total ? Math.round((analytics.active / analytics.total) * 100) : 0}%`} icon={Zap} color="orange" />
              <KpiCard label="At-Risk (Expired)" value={analytics.expired + analytics.pastDue} icon={Calendar} color="red" />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                  <p className="py-8 text-center text-sm text-ink-muted">No data yet</p>
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
                      <span className="w-20 text-xs font-medium text-ink-soft">{item.label}</span>
                      <div className="h-4 flex-1 overflow-hidden rounded-full bg-cream-200">
                        <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.pct}%` }} />
                      </div>
                      <span className="w-8 text-right text-xs font-semibold text-ink">{item.count}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          </>
        ) : (
          <div className="card p-12 text-center">
            <Building2 size={36} className="mx-auto mb-3 text-cream-400" />
            <p className="text-ink-muted">No platform data available yet.</p>
          </div>
        )}
      </div>
    </PlatformShell>
  );
}
