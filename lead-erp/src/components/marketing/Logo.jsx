import { Zap } from "lucide-react";

export default function Logo({ size = "md", onDark = false }) {
  const dims = size === "lg" ? "w-11 h-11" : size === "sm" ? "w-8 h-8" : "w-9 h-9";
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-lg" : "text-xl";
  const icon = size === "lg" ? 22 : size === "sm" ? 16 : 18;

  return (
    <div className="flex items-center gap-2.5 select-none">
      <div
        className={`${dims} rounded-xl bg-gradient-orange flex items-center justify-center shadow-glow`}
      >
        <Zap size={icon} className="text-white" fill="currentColor" strokeWidth={1.5} />
      </div>
      <span
        className={`font-display font-bold ${text} tracking-tight ${
          onDark ? "text-white" : "text-ink"
        }`}
      >
        Codeskate <span className="text-orange-600">CRM</span>
      </span>
    </div>
  );
}
