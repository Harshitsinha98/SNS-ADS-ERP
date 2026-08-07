import SkateMark from "./SkateMark";

export default function Logo({ size = "md", onDark = false, animate = true }) {
  const px = size === "lg" ? 44 : size === "sm" ? 32 : 36;
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-lg" : "text-xl";

  return (
    <div className="flex items-center gap-2.5 select-none">
      <SkateMark size={px} animate={animate} />
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
