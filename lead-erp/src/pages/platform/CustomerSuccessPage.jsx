/**
 * Module 4: Customer Success.
 * Health scores, churn risk, onboarding funnel.
 */
import { useState, useEffect } from "react";
import PlatformShell from "./components/PlatformShell";
import SectionCard from "./components/SectionCard";
import StatusBadge from "./components/StatusBadge";
import KpiCard from "./components/KpiCard";
import { usePlatformAuth } from "./hooks/usePlatformAuth";
import { usePlatformData } from "./hooks/usePlatformData";
import { HeartHandshake, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";

export default function CustomerSuccessPage() {
  const { isPlatformAdmin } = usePlatformAuth();
  const { orgs, loading } = usePlatformData(isPlatformAdmin);

  // Simple health score (mirrors platformAnalytics.js logic client-side for real-time)
  const scored = orgs.map((org) => {
    let score = 100;
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const lastPay = org.lastPayment?.at ? Date.parse(org.lastPayment.at) : 0;
    const daysSince = lastPay ? Math.floor((now - lastPay) / dayMs) : 999;
    if (daysSince > 60) score -= 30; else if (daysSince > 30) score -= 15;
    const usage = org.leadsLimit > 0 ? (org.leadsUsed || 0) / org.leadsLimit : 0;
    if (usage < 0.1) score -= 20;
    if (org.subscriptionStatus === "past_due") score -= 25;
    if (org.subscriptionStatus === "expired") score -= 50;
    return { ...org, healthScore: Math.max(0, score) };
  }).sort((a, b) => a.healthScore - b.healthScore);

  const atRisk = scored.filter((o) => o.healthScore < 40);
  const attention = scored.filter((o) => o.healthScore >= 40 && o.healthScore < 70);
  const healthy = scored.filter((o) => o.healthScore >= 70);

  if (loading) return <PlatformShell title="Customer Success"><div className="animate-pulse h-64 rounded-2xl bg-cream-200" /></PlatformShell>;

  return (
    <PlatformShell title="Customer Success">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard label="Healthy" value={healthy.length} icon={CheckCircle} color="green" sublabel="Score ≥ 70" />
          <KpiCard label="Needs Attention" value={attention.length} icon={HeartHandshake} color="amber" sublabel="Score 40–70" />
          <KpiCard label="At Risk" value={atRisk.length} icon={AlertTriangle} color="red" sublabel="Score < 40" />
        </div>

        <SectionCard title="At-Risk Organizations" subtitle="Sorted by health score (lowest first)">
          {atRisk.length === 0 ? (
            <p className="text-center text-sm text-ink-muted py-6">No at-risk organizations 🎉</p>
          ) : (
            <div className="space-y-2">
              {atRisk.map((org) => (
                <div key={org.id} className="flex items-center justify-between p-3 rounded-xl border border-cream-200 hover:bg-cream-50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                      <span className="text-xs font-bold text-red-700">{org.healthScore}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink">{org.name || "Unnamed"}</p>
                      <p className="text-[11px] text-ink-muted">Leads: {org.leadsUsed || 0}/{org.leadsLimit || 0} · {org.ownerPhone}</p>
                    </div>
                  </div>
                  <StatusBadge status={org.subscriptionStatus} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </PlatformShell>
  );
}
