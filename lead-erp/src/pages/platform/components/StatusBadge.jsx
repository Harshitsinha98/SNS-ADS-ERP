/**
 * Status badge component for platform console.
 */

const STATUS_STYLES = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  trialing: "bg-amber-100 text-amber-700 border-amber-200",
  past_due: "bg-orange-100 text-orange-700 border-orange-200",
  expired: "bg-red-100 text-red-700 border-red-200",
  draft: "bg-blue-100 text-blue-700 border-blue-200",
  paused: "bg-gray-100 text-gray-600 border-gray-200",
  healthy: "bg-emerald-100 text-emerald-700 border-emerald-200",
  degraded: "bg-amber-100 text-amber-700 border-amber-200",
  down: "bg-red-100 text-red-700 border-red-200",
  open: "bg-blue-100 text-blue-700 border-blue-200",
  closed: "bg-gray-100 text-gray-600 border-gray-200",
  enabled: "bg-emerald-100 text-emerald-700 border-emerald-200",
  disabled: "bg-gray-100 text-gray-600 border-gray-200",
};

export default function StatusBadge({ status, className = "" }) {
  const style = STATUS_STYLES[status] || "bg-cream-100 text-ink-soft border-cream-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${style} ${className}`}>
      {status || "—"}
    </span>
  );
}
