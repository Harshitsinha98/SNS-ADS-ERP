/**
 * Module 8: AI Usage & Cost — Platform Owner Dashboard.
 *
 * Shows cross-org AI usage, cost breakdown, resolution rates, and per-org
 * consumption. Data comes from /api/v1/platform/ai-usage endpoint.
 */
import { useEffect, useState } from "react";
import PlatformShell from "./components/PlatformShell";
import SectionCard from "./components/SectionCard";
import KpiCard from "./components/KpiCard";
import { Brain, DollarSign, Zap, Clock, Building2, TrendingUp, Loader2 } from "lucide-react";
import { getPlatformAIUsage } from "../../utils/aiApi";


export default function AiUsagePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    getPlatformAIUsage(days)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <PlatformShell title="AI Usage & Cost">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-muted">Cross-organization AI consumption and cost analytics</p>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-cream-200 px-3 py-1.5 text-sm">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-orange-500" />
          </div>
        ) : error ? (
          <SectionCard title="Error">
            <p className="text-sm text-red-600">{error}</p>
          </SectionCard>
        ) : !data || data.totalCalls === 0 ? (
          <NoDataState />
        ) : (
          <LiveDashboard data={data} days={days} />
        )}
      </div>
    </PlatformShell>
  );
}


function NoDataState() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total API Calls" value="0" icon={Zap} color="purple" sublabel="No activity yet" />
        <KpiCard label="Monthly Cost" value="₹0" icon={DollarSign} color="green" />
        <KpiCard label="Active Orgs" value="0" icon={Building2} color="blue" />
        <KpiCard label="Models Active" value="0" icon={Brain} color="orange" />
      </div>
      <SectionCard title="Getting Started">
        <div className="text-center py-12">
          <Brain size={48} className="text-cream-300 mx-auto mb-4" />
          <h3 className="font-semibold text-ink mb-2">AI Customer Care Ready</h3>
          <p className="text-sm text-ink-muted max-w-md mx-auto">
            Organizations can enable AI Customer Care from their admin panel
            (Settings &rarr; AI Customer Care). Once enabled and the OPENAI_API_KEY
            environment variable is set, AI will auto-respond to WhatsApp messages.
            Usage data will appear here automatically.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}


function LiveDashboard({ data, days }) {
  const avgCallsPerDay = Math.round(data.totalCalls / days);
  const costPerCall = data.totalCalls > 0
    ? (data.estimatedCost.inr / data.totalCalls).toFixed(2)
    : "0.00";

  const orgList = Object.entries(data.orgBreakdown || {})
    .map(([orgId, stats]) => ({ orgId, ...stats }))
    .sort((a, b) => b.calls - a.calls);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total AI Calls"
          value={data.totalCalls.toLocaleString("en-IN")}
          sublabel={`${avgCallsPerDay}/day avg`}
          icon={Zap}
          color="purple"
        />
        <KpiCard
          label="Estimated Cost"
          value={`₹${data.estimatedCost.inr.toLocaleString("en-IN")}`}
          sublabel={`₹${costPerCall}/call avg`}
          icon={DollarSign}
          color="green"
        />
        <KpiCard
          label="Active Orgs"
          value={data.activeOrgs}
          sublabel="using AI this period"
          icon={Building2}
          color="blue"
        />
        <KpiCard
          label="Total Tokens"
          value={data.totalTokens > 1000000
            ? `${(data.totalTokens / 1000000).toFixed(1)}M`
            : `${Math.round(data.totalTokens / 1000)}K`}
          sublabel="GPT-4o-mini"
          icon={Brain}
          color="orange"
        />
      </div>

      {data.dailyData?.length > 0 && (
        <SectionCard title="Daily AI Volume" subtitle={`Last ${days} days`}>
          <div className="flex items-end gap-1 h-32">
            {data.dailyData.map((day, i) => {
              const allCalls = Object.values(day.orgs || {}).reduce((s, o) => s + (o.calls || 0), 0);
              const max = Math.max(...data.dailyData.map((d) =>
                Object.values(d.orgs || {}).reduce((s, o) => s + (o.calls || 0), 0)
              ), 1);
              const height = (allCalls / max) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end"
                  title={`${day.date}: ${allCalls} calls`}>
                  <div className="w-full rounded-t bg-purple-400 hover:bg-purple-500 transition-colors cursor-default"
                    style={{ height: `${Math.max(height, 2)}%` }} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-ink-muted">
            <span>{data.dailyData[0]?.date}</span>
            <span>{data.dailyData[data.dailyData.length - 1]?.date}</span>
          </div>
        </SectionCard>
      )}


      {orgList.length > 0 && (
        <SectionCard title="Per-Organization Breakdown" subtitle={`${orgList.length} organizations using AI`}>
          <div className="divide-y divide-cream-100">
            <div className="grid grid-cols-4 gap-4 pb-2 text-[11px] font-semibold text-ink-muted uppercase">
              <span>Organization</span>
              <span className="text-right">Calls</span>
              <span className="text-right">Tokens</span>
              <span className="text-right">Est. Cost</span>
            </div>
            {orgList.slice(0, 20).map((org) => {
              const orgCost = ((org.tokens || 0) / 1_000_000) * 0.30 * 84;
              return (
                <div key={org.orgId} className="grid grid-cols-4 gap-4 py-2.5 text-sm">
                  <span className="text-ink font-medium truncate" title={org.orgId}>{org.orgId.slice(0, 12)}...</span>
                  <span className="text-right text-ink">{(org.calls || 0).toLocaleString("en-IN")}</span>
                  <span className="text-right text-ink-soft">{org.tokens > 1000 ? `${Math.round(org.tokens / 1000)}K` : org.tokens}</span>
                  <span className="text-right text-emerald-700 font-medium">{`₹${Math.round(orgCost)}`}</span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Cost Projection">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="text-center p-4 rounded-xl bg-cream-50">
            <p className="text-xs text-ink-muted mb-1">Current Monthly Run Rate</p>
            <p className="text-xl font-bold text-ink">₹{Math.round((data.estimatedCost.inr / days) * 30).toLocaleString("en-IN")}</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-cream-50">
            <p className="text-xs text-ink-muted mb-1">Annual Projection</p>
            <p className="text-xl font-bold text-ink">₹{Math.round((data.estimatedCost.inr / days) * 365).toLocaleString("en-IN")}</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-emerald-50">
            <p className="text-xs text-ink-muted mb-1">Revenue Opportunity (3x markup)</p>
            <p className="text-xl font-bold text-emerald-700">₹{Math.round(((data.estimatedCost.inr / days) * 365) * 3).toLocaleString("en-IN")}/yr</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
