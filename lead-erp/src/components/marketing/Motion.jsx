/**
 * Framer Motion helpers for the marketing site.
 *
 * Lightweight, reusable scroll-reveal wrappers so every section animates in
 * consistently without repeating variant boilerplate. All animations are
 * `whileInView` + `once` so they fire a single time as the user scrolls.
 */
import { motion } from "framer-motion";

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
  return (
    <motion.div className={className} variants={ITEM_VARIANTS}>
      {children}
    </motion.div>
  );
}

/** Re-export motion for ad-hoc use in pages. */
export { motion };
