/**
 * KPI Card — reusable metric card for platform dashboards.
 * Shows value, label, trend indicator, and optional sparkline-ready slot.
 */

import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function KpiCard({ label, value, sublabel, trend, trendLabel, icon: Icon, color = "orange" }) {
  const colorMap = {
    orange: "from-orange-500 to-orange-600",
    green: "from-emerald-500 to-emerald-600",
    blue: "from-blue-500 to-blue-600",
    purple: "from-purple-500 to-purple-600",
    red: "from-red-500 to-red-600",
    amber: "from-amber-500 to-amber-600",
  };

  const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendColor = trend > 0 ? "text-emerald-600" : trend < 0 ? "text-red-600" : "text-ink-muted";

  return (
    <div className="rounded-2xl border border-cream-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-ink-muted uppercase tracking-wider">{label}</p>
          <p className="mt-1 text-2xl font-display font-bold text-ink">{value}</p>
          {sublabel && <p className="mt-0.5 text-xs text-ink-soft">{sublabel}</p>}
        </div>
        {Icon && (
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colorMap[color] || colorMap.orange} flex items-center justify-center flex-shrink-0`}>
            <Icon size={18} className="text-white" />
          </div>
        )}
      </div>
      {(trend !== undefined || trendLabel) && (
        <div className="mt-3 flex items-center gap-1.5">
          <TrendIcon size={13} className={trendColor} />
          <span className={`text-xs font-medium ${trendColor}`}>
            {trend !== undefined && `${trend > 0 ? "+" : ""}${trend}%`}
          </span>
          {trendLabel && <span className="text-xs text-ink-muted">{trendLabel}</span>}
        </div>
      )}
    </div>
  );
}
