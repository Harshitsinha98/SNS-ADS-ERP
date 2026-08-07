/**
 * CodeSkate "Signature C" brand mark.
 *
 * A single confident stroke forms an open "C" that reads as forward motion —
 * the "skate" in CodeSkate. Deliberately abstract so the same mark fronts the
 * agency (Studio), the CRM, and the Voice AI product.
 *
 * Renders the orange rounded tile + white glyph as one self-contained unit.
 * Animation is done via inline <style> to avoid Tailwind purge issues.
 *
 * Props:
 *   size    number  pixel size of the square tile (default 40)
 *   animate boolean draw the stroke in once on mount (default true)
 *   className string extra classes on the tile wrapper
 */
export default function SkateMark({ size = 40, animate = true, className = "" }) {
  const radius = Math.round(size * 0.28);
  const id = "sk" + size; // unique enough per instance size

  return (
    <>
      {animate && (
        <style>{`
          @keyframes ${id}-tile {
            from { opacity: 0; transform: scale(0.55) rotate(-10deg); }
            to { opacity: 1; transform: scale(1) rotate(0deg); }
          }
          @keyframes ${id}-draw {
            from { stroke-dashoffset: 78; }
            to { stroke-dashoffset: 0; }
          }
          @keyframes ${id}-glow {
            0%, 100% { box-shadow: 0 4px 14px rgba(249,115,22,0.35); }
            50% { box-shadow: 0 6px 24px rgba(249,115,22,0.6); }
          }
        `}</style>
      )}
      <span
        className={`inline-flex items-center justify-center bg-gradient-orange shadow-glow ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          ...(animate ? {
            animation: `${id}-tile 0.65s cubic-bezier(0.2,0.8,0.2,1) forwards, ${id}-glow 3.5s ease-in-out 1.3s infinite`,
          } : {}),
        }}
        aria-hidden="true"
      >
        <svg width={Math.round(size * 0.7)} height={Math.round(size * 0.7)} viewBox="0 0 48 48" fill="none">
          <path
            d="M33 15 A13 13 0 1 0 33 33"
            fill="none"
            stroke="#ffffff"
            strokeWidth="6"
            strokeLinecap="round"
            style={animate ? {
              strokeDasharray: 78,
              strokeDashoffset: 78,
              animation: `${id}-draw 1s cubic-bezier(0.35,0,0.2,1) 0.2s forwards`,
            } : {}}
          />
        </svg>
      </span>
    </>
  );
}
