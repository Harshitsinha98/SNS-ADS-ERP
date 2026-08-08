import { useRef, useEffect } from "react";

/**
 * CodeSkate "Signature C" brand mark.
 *
 * Renders the orange rounded tile + white "C" arc as one self-contained unit.
 * Animation uses inline styles only (no injected <style> tags that cause
 * re-render loops in React strict mode).
 */

const ANIM_INJECTED = { current: false };

function injectKeyframes() {
  if (ANIM_INJECTED.current || typeof document === "undefined") return;
  ANIM_INJECTED.current = true;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes sk-tile-in { from { opacity:0; transform:scale(0.55) rotate(-10deg); } to { opacity:1; transform:scale(1) rotate(0deg); } }
    @keyframes sk-draw { from { stroke-dashoffset:78; } to { stroke-dashoffset:0; } }
    @keyframes sk-glow { 0%,100% { box-shadow:0 4px 14px rgba(249,115,22,0.35); } 50% { box-shadow:0 6px 24px rgba(249,115,22,0.6); } }
  `;
  document.head.appendChild(style);
}

export default function SkateMark({ size = 40, animate = true, className = "" }) {
  const radius = Math.round(size * 0.28);

  useEffect(() => {
    if (animate) injectKeyframes();
  }, [animate]);

  return (
    <span
      className={`inline-flex items-center justify-center bg-gradient-orange shadow-glow ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        ...(animate ? {
          animation: "sk-tile-in 0.65s cubic-bezier(0.2,0.8,0.2,1) forwards, sk-glow 3.5s ease-in-out 1.3s infinite",
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
            animation: "sk-draw 1s cubic-bezier(0.35,0,0.2,1) 0.2s forwards",
          } : {}}
        />
      </svg>
    </span>
  );
}
