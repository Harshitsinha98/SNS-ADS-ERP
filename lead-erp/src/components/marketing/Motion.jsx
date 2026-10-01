/**
 * Framer Motion helpers for the marketing site.
 *
 * Lightweight, reusable scroll-reveal wrappers so every section animates in
 * consistently without repeating variant boilerplate. All animations are
 * `whileInView` + `once` so they fire a single time as the user scrolls.
 */
import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion, animate } from "framer-motion";

// A smooth, slightly overshooting ease used across the site.
const EASE = [0.22, 1, 0.36, 1];

/** Fade + rise a single block into view on scroll. */
export function Reveal({
  children,
  delay = 0,
  y = 28,
  className = "",
  once = true,
}) {
  // Framer Motion drives transforms from JS, so the global
  // prefers-reduced-motion CSS rule can't stop it — opt out explicitly.
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Container that staggers its <StaggerItem> children as they enter. */
export function Stagger({ children, className = "", stagger = 0.09, once = true }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once, margin: "-60px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </motion.div>
  );
}

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

/** Individual child of a <Stagger>. */
export function StaggerItem({ children, className = "" }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div className={className} variants={ITEM_VARIANTS}>
      {children}
    </motion.div>
  );
}

/** Re-export motion (and the reduced-motion hook) for ad-hoc use in pages. */
export { motion, useReducedMotion };

/* ───────────────────────────────────────────────────────────────────────────
   Additional helpers for the dark marketing surface.
   Existing exports above are untouched.
   ─────────────────────────────────────────────────────────────────────────── */

const IN_FORMAT = new Intl.NumberFormat("en-IN");

/**
 * Counts a formatted stat up from zero when it scrolls into view.
 *
 * Accepts the already-formatted display string (e.g. "2,34,000+") and splits
 * it into prefix / digits / suffix, so the surrounding characters survive the
 * animation. Re-formats with Indian digit grouping, matching the source data.
 *
 * Falls back to rendering the raw string untouched when the value isn't a
 * plain number or when the user prefers reduced motion.
 */
export function CountUp({ value, duration = 1.6, className = "" }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduce = useReducedMotion();

  const raw = String(value);
  const parts = /^(\D*)([\d,]+)(\D*)$/.exec(raw);
  const prefix = parts?.[1] ?? "";
  const digits = parts?.[2] ?? "";
  const suffix = parts?.[3] ?? "";
  const target = digits ? Number(digits.replace(/,/g, "")) : NaN;
  const animatable = Boolean(parts) && Number.isFinite(target) && !reduce;

  const [shown, setShown] = useState("0");

  useEffect(() => {
    if (!animatable || !inView) return;
    const controls = animate(0, target, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setShown(IN_FORMAT.format(Math.round(v))),
    });
    return () => controls.stop();
  }, [animatable, inView, target, duration]);

  if (!animatable) {
    return (
      <span ref={ref} className={className}>
        {raw}
      </span>
    );
  }

  return (
    <span ref={ref} className={className}>
      {prefix}
      {shown}
      {suffix}
    </span>
  );
}

/**
 * Soft radial glow that follows the pointer across its container.
 *
 * Renders as a non-interactive overlay, so it listens on `window` and
 * measures against its own rect rather than capturing pointer events.
 * Disabled entirely for reduced-motion users and on touch-only devices,
 * where there is no pointer to track.
 */
export function PointerGlow({ className = "", size = 520, color = "rgba(255,138,61,0.14)" }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (reduce) return;
    if (typeof window === "undefined") return;
    // Touch-primary devices have no hover pointer to follow.
    if (!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) return;

    let frame = 0;
    const onMove = (e) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        // Only track while the pointer is over the container.
        if (
          e.clientX < r.left || e.clientX > r.right ||
          e.clientY < r.top || e.clientY > r.bottom
        ) {
          setPos(null);
          return;
        }
        setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
      });
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [reduce]);

  return (
    <div ref={ref} className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {pos && (
        <div
          className="absolute rounded-full transition-opacity duration-300"
          style={{
            left: pos.x - size / 2,
            top: pos.y - size / 2,
            width: size,
            height: size,
            background: `radial-gradient(circle, ${color} 0%, transparent 65%)`,
          }}
        />
      )}
    </div>
  );
}
