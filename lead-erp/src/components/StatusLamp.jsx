const STATUS_TONE = {
  "New": "info",
  "Ringing": "signal",
  "Meeting Fixed": "signal",
  "Negotiation": "signal",
  "Follow-up": "signal",
  "Closed-Won": "ok",
  "Lost": "danger",
};

export function StatusLamp({ status }) {
  const tone = STATUS_TONE[status] || "info";
  // These previously referenced tokens that don't exist in tailwind.config.js
  // (bg-info, bg-signal, bg-ok, bg-danger), so no class was ever emitted and
  // every status dot rendered invisible.
  const dot = {
    info: "bg-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.15)]",
    signal: "bg-purple-500 shadow-[0_0_0_3px_rgba(168,85,247,0.15)]",
    ok: "bg-success-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]",
    danger: "bg-danger-500 shadow-[0_0_0_3px_rgba(239,68,68,0.15)]",
  }[tone];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}

export function PriorityBadge({ p }) {
  // Same issue as StatusLamp: danger-soft / signal-soft / info-soft and
  // paper-line were never defined, so Hot, Warm and Cold all rendered as
  // identical uncoloured text. Mapped to real tokens; Warm moves to amber so
  // the scale reads hot -> warm -> cold at a glance.
  const map = {
    Hot: "bg-danger-50 text-danger-700 ring-1 ring-inset ring-danger-200",
    Warm: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
    Cold: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${map[p] || "bg-cream-200 text-ink-muted"}`}>
      {p || "—"}
    </span>
  );
}