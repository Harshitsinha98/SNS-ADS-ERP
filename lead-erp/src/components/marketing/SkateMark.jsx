/**
 * CodeSkate "Signature C" brand mark.
 *
 * A single confident stroke forms an open "C" that reads as forward motion —
 * the "skate" in CodeSkate. Deliberately abstract so the same mark fronts the
 * agency (Studio), the CRM, and the Voice AI product.
 *
 * Renders the orange rounded tile + white glyph as one self-contained unit.
 *
 * Props:
 *   size    number  pixel size of the square tile (default 40)
 *   animate boolean draw the stroke in once on mount (default false)
 *   className string extra classes on the tile wrapper
 */
export default function SkateMark({ size = 40, animate = false, className = "" }) {
  const radius = Math.round(size * 0.28); // rounded-square corner radius

  return (
    <span
      className={`inline-flex items-center justify-center bg-gradient-orange shadow-glow ${className}`}
      style={{ width: size, height: size, borderRadius: radius }}
      aria-hidden="true"
    >
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <path
          d="M33 15 A13 13 0 1 0 33 33"
          fill="none"
          stroke="#ffffff"
          strokeWidth="6"
          strokeLinecap="round"
          className={animate ? "sk-draw" : ""}
        />
      </svg>
    </span>
  );
}
