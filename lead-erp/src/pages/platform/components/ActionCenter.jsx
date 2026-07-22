/**
 * Mission Control Action Center.
 *
 * This intentionally uses the existing Platform Console card language while
 * surfacing only bounded, pre-aggregated operational signals. It does not
 * replace or alter the Executive Dashboard KPI cards.
 */

import { Link } from "react-router-dom";
import {
  AlertCircle, AlertTriangle, ArrowRight, Building2, CalendarClock,
  CheckCircle2, CircleDollarSign, HeartPulse, MessageCircleOff,
  RefreshCw, ServerCrash, UserPlus,
} from "lucide-react";

const SEVERITY_STYLES = {
  critical: {
    label: "Critical",
    card: "border-red-200 bg-red-50/40",
    icon: "bg-red-100 text-red-700",
    badge: "bg-red-100 text-red-700 border-red-200",
    button: "bg-red-600 hover:bg-red-700 focus:ring-red-500",
  },
  warning: {
    label: "Attention",
    card: "border-orange-200 bg-orange-50/40",
    icon: "bg-orange-100 text-orange-700",
    badge: "bg-orange-100 text-orange-700 border-orange-200",
    button: "bg-orange-600 hover:bg-orange-700 focus:ring-orange-500",
  },
  success: {
    label: "Healthy",
    card: "border-emerald-200 bg-emerald-50/40",
    icon: "bg-emerald-100 text-emerald-700",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    button: "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500",
  },
};

function relativeTime(value) {
  const timestamp = value ? new Date(value).getTime() : 0;
  if (!Number.isFinite(timestamp) || !timestamp) return "Updating…";

  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function MetricCard({ icon: Icon, label, count, countLabel, severity, ctaLabel, to, updatedAt, currency = false }) {
  const style = SEVERITY_STYLES[severity];
  const numericCount = Number(count || 0);

  return (
    <article className={`rounded-2xl border p-4 shadow-sm transition-shadow hover:shadow-md ${style.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${style.icon}`}>
          <Icon size={18} aria-hidden="true" />
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}>
          {style.label}
        </span>
      </div>
      <p className="mt-4 text-xs font-medium uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-display font-bold text-ink">
        {currency ? formatCurrency(numericCount) : numericCount.toLocaleString("en-IN")}
      </p>
      <p className="mt-1 min-h-4 text-xs text-ink-soft">Count: {countLabel}</p>
      <div className="mt-4 flex items-center justify-between gap-2">
        <Link
          to={to}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${style.button}`}
        >
          {ctaLabel}<ArrowRight size={13} aria-hidden="true" />
        </Link>
        <span className="text-[10px] text-ink-muted whitespace-nowrap">Updated {relativeTime(updatedAt)}</span>
      </div>
    </article>
  );
}

function ActionCenterSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="h-48 animate-pulse rounded-2xl border border-cream-200 bg-cream-100" />
      ))}
    </div>
  );
}

export default function ActionCenter({ data, loading, error, onRefresh, refreshing }) {
  const updatedAt = data?.updatedAt;
  const metrics = data?.metrics || data || {};
  const cards = [
    { label: "Failed Payments", count: metrics.failedPayments, countLabel: `${Number(metrics.failedPayments || 0).toLocaleString("en-IN")} failed payments`, severity: "critical", ctaLabel: "Review payments", to: "/platform/billing", icon: CircleDollarSign },
    { label: "Trial Ending in 3 Days", count: metrics.trialsEndingSoon, countLabel: `${Number(metrics.trialsEndingSoon || 0).toLocaleString("en-IN")} trials ending`, severity: "warning", ctaLabel: "Review trials", to: "/platform/customer-success", icon: CalendarClock },
    { label: "Failed WhatsApp Connections", count: metrics.failedWhatsAppConnections, countLabel: `${Number(metrics.failedWhatsAppConnections || 0).toLocaleString("en-IN")} connections`, severity: "critical", ctaLabel: "Open WhatsApp Ops", to: "/platform/whatsapp", icon: MessageCircleOff },
    { label: "Failed Cron Jobs", count: metrics.failedCronJobs, countLabel: `${Number(metrics.failedCronJobs || 0).toLocaleString("en-IN")} jobs failed`, severity: "critical", ctaLabel: "Inspect infrastructure", to: "/platform/infrastructure", icon: ServerCrash },
    { label: "No Activity in 7 Days", count: metrics.inactiveOrganizations, countLabel: `${Number(metrics.inactiveOrganizations || 0).toLocaleString("en-IN")} organizations`, severity: "warning", ctaLabel: "Review customers", to: "/platform/customer-success", icon: Building2 },
    { label: "Churn Risk Customers", count: metrics.churnRiskCustomers, countLabel: `${Number(metrics.churnRiskCustomers || 0).toLocaleString("en-IN")} customers at risk`, severity: "warning", ctaLabel: "View health", to: "/platform/customer-success", icon: HeartPulse },
    { label: "New Signups Today", count: metrics.newSignupsToday, countLabel: `${Number(metrics.newSignupsToday || 0).toLocaleString("en-IN")} new organizations`, severity: "success", ctaLabel: "View organizations", to: "/platform/organizations", icon: UserPlus },
    { label: "Revenue Today", count: metrics.revenueToday, countLabel: `${Number(metrics.revenueTodayPayments || 0).toLocaleString("en-IN")} payments recorded`, severity: "success", ctaLabel: "View revenue", to: "/platform/billing", icon: CheckCircle2, currency: true },
  ];

  return (
    <section aria-labelledby="action-center-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <AlertCircle size={19} className="text-orange-600" aria-hidden="true" />
            <h2 id="action-center-title" className="font-display text-xl font-bold text-ink">Action Center</h2>
          </div>
          <p className="mt-1 text-sm text-ink-muted">Prioritized signals that need your attention across the platform.</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cream-300 bg-white px-3 py-2 text-xs font-semibold text-ink-soft transition-colors hover:bg-cream-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {loading ? <ActionCenterSkeleton /> : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <p className="font-semibold">Action Center could not be loaded.</p>
          <p className="mt-1 text-red-700">{error}</p>
          <button type="button" onClick={onRefresh} className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">Try again</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => <MetricCard key={card.label} {...card} updatedAt={updatedAt} />)}
        </div>
      )}
    </section>
  );
}
