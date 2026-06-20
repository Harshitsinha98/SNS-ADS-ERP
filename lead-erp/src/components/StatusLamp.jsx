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
  const dot = { info: "bg-info", signal: "bg-signal", ok: "bg-ok", danger: "bg-danger" }[tone];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink/70">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}

export function PriorityBadge({ p }) {
  const map = {
    Hot: "bg-danger-soft text-danger",
    Warm: "bg-signal-soft text-signal",
    Cold: "bg-info-soft text-info",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${map[p] || "bg-paper-line text-ink/40"}`}>
      {p || "—"}
    </span>
  );
}