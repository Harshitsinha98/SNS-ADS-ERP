const TONE = {
  ink: {
    bg: "bg-gray-100",
    icon: "text-gray-600",
    dot: "bg-gray-400",
  },
  primary: {
    bg: "bg-primary-50",
    icon: "text-primary-600",
    dot: "bg-primary-500",
  },
  signal: {
    bg: "bg-purple-50",
    icon: "text-purple-600",
    dot: "bg-purple-500",
  },
  ok: {
    bg: "bg-success-50",
    icon: "text-success-600",
    dot: "bg-success-500",
  },
  danger: {
    bg: "bg-danger-50",
    icon: "text-danger-600",
    dot: "bg-danger-500",
  },
  info: {
    bg: "bg-blue-50",
    icon: "text-blue-600",
    dot: "bg-blue-500",
  },
};

export default function StatCard({ label, value, tone = "ink", icon: Icon, onClick }) {
  const toneStyles = TONE[tone] || TONE.ink;

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl shadow-card border border-gray-100 p-5 relative overflow-hidden hover:shadow-card-hover hover:border-gray-200 transition-all ${
        onClick ? "cursor-pointer" : ""
      }`}
    >
      {/* Accent dot */}
      <span
        className={`absolute left-0 top-0 bottom-0 w-[3px] ${toneStyles.dot}`}
      />

      {/* Icon */}
      {Icon && (
        <div className={`w-10 h-10 ${toneStyles.bg} rounded-lg flex items-center justify-center mb-3`}>
          <Icon size={18} className={toneStyles.icon} />
        </div>
      )}

      {/* Label */}
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
        {label}
      </p>

      {/* Value */}
      <p className="text-2xl font-display font-bold text-gray-800 num">
        {value}
      </p>
    </div>
  );
}
