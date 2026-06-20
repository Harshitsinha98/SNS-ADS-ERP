const TONE = { ink: "bg-ink", signal: "bg-signal", ok: "bg-ok", danger: "bg-danger", info: "bg-info" };

export default function StatCard({ label, value, tone = "ink", icon: Icon }) {
  return (
    <div className="bg-paper-card rounded-lg shadow-card border border-paper-line relative overflow-hidden pl-4 pr-4 py-4">
      <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${TONE[tone]}`} />
      <div className="flex items-center justify-between mb-1.5">
        <p className="eyebrow">{label}</p>
        {Icon && <Icon size={14} className="text-ink/30" />}
      </div>
      <p className="text-2xl font-display font-semibold num">{value}</p>
    </div>
  );
}