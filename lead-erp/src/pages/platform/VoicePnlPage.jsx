/**
 * Platform Voice P&L — per-tenant profit/loss for bridge calling.
 * Only visible to the platform owner.
 */

import { useState, useEffect } from "react";
import PlatformShell from "./components/PlatformShell";
import SectionCard from "./components/SectionCard";
import KpiCard from "./components/KpiCard";
import { Phone, TrendingUp, TrendingDown, AlertTriangle, Loader2, DollarSign, CheckCircle, XCircle } from "lucide-react";
import { getVoicePnl } from "../../utils/platformApi";

export default function VoicePnlPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getVoicePnl()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PlatformShell title="Voice P&L"><div className="flex justify-center py-20"><Loader2 className="animate-spin text-orange-500" size={32} /></div></PlatformShell>;
  if (error) return <PlatformShell title="Voice P&L"><p className="text-danger-600">{error}</p></PlatformShell>;

  const { tenants = [], totals = {} } = data || {};

  return (
    <PlatformShell title="Voice P&L">
      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard label="Total Calls" value={totals.totalCalls || 0} icon={Phone} color="blue" />
          <KpiCard label="Connected" value={totals.connectedCalls || 0} sublabel={`${totals.connectRate || 0}% rate`} icon={CheckCircle} color="green" />
          <KpiCard label="Failed (no charge)" value={totals.failedCalls || 0} icon={XCircle} color="amber" />
          <KpiCard label="Revenue" value={`₹${(totals.revenue || 0).toFixed(0)}`} icon={TrendingUp} color="green" />
          <KpiCard label="Profit" value={`₹${(totals.profit || 0).toFixed(0)}`} sublabel={`Cost: ₹${(totals.plivoCost || 0).toFixed(0)}`} icon={totals.profit >= 0 ? DollarSign : TrendingDown} color={totals.profit >= 0 ? "green" : "red"} />
        </div>

        {/* Per-tenant table */}
        <SectionCard title="Per-Tenant Breakdown" subtitle="Revenue, cost, profit/loss for each tenant's voice usage">
          {tenants.length === 0 ? (
            <p className="text-sm text-ink-muted py-8 text-center">No bridge calls yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-200 text-left text-xs font-semibold text-ink-muted uppercase tracking-wider">
                    <th className="pb-3 pr-4">Tenant</th>
                    <th className="pb-3 pr-4 text-right">Calls</th>
                    <th className="pb-3 pr-4 text-right">Connected</th>
                    <th className="pb-3 pr-4 text-right">Connect %</th>
                    <th className="pb-3 pr-4 text-right">Revenue</th>
                    <th className="pb-3 pr-4 text-right">Plivo Cost</th>
                    <th className="pb-3 pr-4 text-right">Profit</th>
                    <th className="pb-3 pr-4 text-right">VM</th>
                    <th className="pb-3 text-right">No-Ans</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => (
                    <tr key={t.orgId} className="border-b border-cream-100 hover:bg-cream-50">
                      <td className="py-2.5 pr-4 font-medium text-ink truncate max-w-[180px]">{t.orgId.slice(0, 12)}…</td>
                      <td className="py-2.5 pr-4 text-right">{t.totalCalls}</td>
                      <td className="py-2.5 pr-4 text-right">{t.connectedCalls}</td>
                      <td className="py-2.5 pr-4 text-right">
                        <span className={t.connectRate < 45 ? "text-danger-600 font-semibold" : ""}>{t.connectRate}%</span>
                      </td>
                      <td className="py-2.5 pr-4 text-right">₹{t.revenue.toFixed(0)}</td>
                      <td className="py-2.5 pr-4 text-right text-ink-muted">₹{t.plivoCost.toFixed(1)}</td>
                      <td className={`py-2.5 pr-4 text-right font-semibold ${t.profit >= 0 ? "text-success-700" : "text-danger-600"}`}>
                        {t.profit >= 0 ? "+" : ""}₹{t.profit.toFixed(0)}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-ink-muted">{t.voicemailCalls}</td>
                      <td className="py-2.5 text-right text-ink-muted">{t.noAnswerCalls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-xs text-ink-muted">
          <span className="flex items-center gap-1"><AlertTriangle size={12} className="text-danger-500" /> Red connect rate = below 45% (junk leads risk)</span>
          <span>VM = Voicemail (AMD detected, no charge)</span>
          <span>No-Ans = Customer didn't pick up</span>
          <span>Profit = Revenue − Plivo Cost (failed calls absorbed by CodeSkate)</span>
        </div>
      </div>
    </PlatformShell>
  );
}
