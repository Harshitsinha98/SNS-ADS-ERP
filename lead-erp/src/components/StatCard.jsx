const TONE = {
  ink: {
    bg: "bg-cream-100",
    icon: "text-ink-soft",
    accent: "text-ink",
  },
  primary: {
    bg: "bg-orange-50",
    icon: "text-orange-600",
    accent: "text-orange-700",
  },
  signal: {
    bg: "bg-purple-50",
    icon: "text-purple-600",
    accent: "text-purple-700",
  },
  ok: {
    bg: "bg-success-50",
    icon: "text-success-600",
    accent: "text-success-700",
  },
  danger: {
    bg: "bg-danger-50",
    icon: "text-danger-600",
    accent: "text-danger-700",
  },
  info: {
    bg: "bg-blue-50",
    icon: "text-blue-600",
    accent: "text-blue-700",
  },
};

export default function StatCard({ label, value, tone = "ink", icon: Icon, onClick }) {
  const t = TONE[tone] || TONE.ink;

  return (
    <div
      onClick={onClick}
      className={`card p-3.5 flex items-center gap-3 transition-transform duration-100 ${
        onClick ? "cursor-pointer press-scale" : ""
      }`}
    >
      {/* Icon Circle */}
      {Icon && (
        <div className={`w-9 h-9 ${t.bg} rounded-xl flex items-center justify-center shrink-0`}>
          <Icon size={17} strokeWidth={2.2} className={t.icon} />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted truncate">
          {label}
        </p>
        <p className={`text-xl font-display font-bold num leading-tight ${t.accent}`}>
          {value}
        </p>
      </div>
    </div>
  );
}
