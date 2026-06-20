import { Phone, MessageCircle, StickyNote, ArrowRightLeft } from "lucide-react";
import { fmtDuration } from "../utils/helpers";

const META = {
  call: { icon: Phone, cls: "bg-ok-soft text-ok" },
  whatsapp: { icon: MessageCircle, cls: "bg-info-soft text-info" },
  note: { icon: StickyNote, cls: "bg-ink/10 text-ink/60" },
  status: { icon: ArrowRightLeft, cls: "bg-signal-soft text-signal" },
};

export default function Timeline({ entries = [] }) {
  const sorted = [...entries].sort((a, b) => new Date(b.at) - new Date(a.at));
  if (!sorted.length) return <p className="text-sm text-ink/40">No activity logged yet.</p>;

  return (
    <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
      {sorted.map((n, i) => {
        const meta = META[n.type] || META.note;
        const Icon = meta.icon;
        return (
          <div key={i} className="flex gap-3">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${meta.cls}`}>
              <Icon size={13} />
            </div>
            <div className="flex-1 border-b border-paper-line pb-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm">{n.text}</p>
                {n.duration != null && <span className="num text-xs text-ok font-medium shrink-0">{fmtDuration(n.duration)}</span>}
              </div>
              <p className="text-xs text-ink/35 num mt-0.5">
                {new Date(n.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                {n.by ? ` · ${n.by}` : ""}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}