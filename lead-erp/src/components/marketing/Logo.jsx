import SkateMark from "./SkateMark";

export default function Logo({ size = "md", onDark = false, animate = true }) {
  const px = size === "lg" ? 44 : size === "sm" ? 32 : 36;
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-lg" : "text-xl";
  const pillText = size === "lg" ? "text-xs" : size === "sm" ? "text-[9px]" : "text-[10px]";
  const pillPad = size === "lg" ? "px-2.5 py-1" : size === "sm" ? "px-1.5 py-0.5" : "px-2 py-0.5";
  const id = "logo" + px;

  return (
    <>
      {animate && (
        <style>{`
          @keyframes ${id}-wm {
            from { opacity: 0; transform: translateX(-10px); }
            to { opacity: 1; transform: translateX(0); }
          }
          @keyframes ${id}-pill {
            from { opacity: 0; transform: scale(0.6) translateX(-4px); }
            to { opacity: 1; transform: scale(1) translateX(0); }
          }
          @keyframes ${id}-shine {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
        `}</style>
      )}
      <div className="flex items-center gap-2.5 select-none">
        <SkateMark size={px} animate={animate} />
        <div className="flex items-center gap-2">
          <span
            className={`font-display font-bold ${text} tracking-tight`}
            style={animate ? {
              opacity: 0,
              animation: `${id}-wm 0.6s cubic-bezier(0.2,0.8,0.2,1) 0.5s forwards`,
              color: onDark ? "#ffffff" : "#1a1a2e",
            } : {
              color: onDark ? "#ffffff" : "#1a1a2e",
            }}
          >
            Code<span style={{ color: "#ea580c" }}>Skate</span>
          </span>
          <span
            className={`${pillText} ${pillPad} font-bold rounded-md tracking-wide uppercase`}
            style={{
              background: "linear-gradient(135deg, #fb923c, #ea580c)",
              backgroundSize: "200% 100%",
              color: "#ffffff",
              ...(animate ? {
                opacity: 0,
                animation: `${id}-pill 0.5s cubic-bezier(0.2,0.8,0.2,1) 0.9s forwards, ${id}-shine 4s ease-in-out 2s infinite`,
              } : {
                animation: `${id}-shine 4s ease-in-out infinite`,
              }),
            }}
          >
            CRM
          </span>
        </div>
      </div>
    </>
  );
}
