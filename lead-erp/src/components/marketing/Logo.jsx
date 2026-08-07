import SkateMark from "./SkateMark";

export default function Logo({ size = "md", onDark = false, animate = true }) {
  const px = size === "lg" ? 44 : size === "sm" ? 32 : 36;
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-lg" : "text-xl";
  const id = "logo" + px;

  return (
    <>
      {animate && (
        <style>{`
          @keyframes ${id}-wm {
            from { opacity: 0; transform: translateX(-10px); }
            to { opacity: 1; transform: translateX(0); }
          }
          @keyframes ${id}-crm {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes ${id}-shimmer {
            0% { background-position: -100% 0; }
            100% { background-position: 200% 0; }
          }
        `}</style>
      )}
      <div className="flex items-center gap-2.5 select-none">
        <SkateMark size={px} animate={animate} />
        <span
          className={`font-display font-bold ${text} tracking-tight ${
            onDark ? "text-white" : "text-ink"
          }`}
          style={animate ? {
            opacity: 0,
            animation: `${id}-wm 0.6s cubic-bezier(0.2,0.8,0.2,1) 0.5s forwards`,
          } : {}}
        >
          Codeskate{" "}
          <span
            style={{
              ...(animate ? {
                opacity: 0,
                animation: `${id}-crm 0.5s cubic-bezier(0.2,0.8,0.2,1) 0.85s forwards`,
              } : {}),
              background: "linear-gradient(90deg, #ea580c 0%, #f97316 25%, #fdba74 50%, #f97316 75%, #ea580c 100%)",
              backgroundSize: "200% 100%",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              fontWeight: 800,
              letterSpacing: "0.5px",
              animation: animate
                ? `${id}-crm 0.5s cubic-bezier(0.2,0.8,0.2,1) 0.85s forwards, ${id}-shimmer 3s ease-in-out 1.5s infinite`
                : `${id}-shimmer 3s ease-in-out infinite`,
              opacity: animate ? 0 : 1,
            }}
          >
            CRM
          </span>
        </span>
      </div>
    </>
  );
}
