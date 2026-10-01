/**
 * HeroShowcase — the animated product panel in the landing hero.
 *
 * There is no product screenshot asset in the repo, so the hero "product
 * shot" is built in markup instead: a miniature Team Inbox that plays out
 * the core promise once, on mount — a lead messages in, AI starts typing,
 * and the reply lands with a 3-second stamp.
 *
 * Reduced-motion users skip straight to the resolved final state, so they
 * still see the full conversation without any animation.
 */
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Brain, Check, Zap, Clock, Bot, MessageSquare } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1];

const LEAD_ROWS = [
  { name: "Neha Gupta", source: "WhatsApp", time: "12:01", tone: "live" },
  { name: "Arjun Rao", source: "Meta Ads", time: "11:58", tone: "qualified" },
  { name: "Simran Kaur", source: "Website", time: "11:52", tone: "followup" },
];

const ROW_TONES = {
  live: { dot: "bg-emerald-400", label: "New", chip: "bg-emerald-500/15 text-emerald-300" },
  qualified: { dot: "bg-orange-400", label: "Qualified", chip: "bg-orange-500/15 text-orange-300" },
  followup: { dot: "bg-violet-400", label: "Follow-up", chip: "bg-violet-500/15 text-violet-300" },
};

const RAIL_STATS = [
  { icon: Zap, value: "3s", label: "avg reply" },
  { icon: Bot, value: "70%", label: "auto-resolved" },
  { icon: Clock, value: "24/7", label: "active" },
];

/* Phases: 0 idle → 1 lead message → 2 AI typing → 3 AI replied */
const PHASE_TIMINGS = [900, 700, 1500];

function TypingDots() {
  return (
    <span className="flex items-center gap-1">
      {[0, 150, 300].map((d) => (
        <span
          key={d}
          className="w-1.5 h-1.5 rounded-full bg-violet-300/70 animate-bounce"
          style={{ animationDelay: `${d}ms` }}
        />
      ))}
    </span>
  );
}

export default function HeroShowcase() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState(reduce ? 3 : 0);

  useEffect(() => {
    if (reduce) return;
    const timers = [];
    let elapsed = 0;
    PHASE_TIMINGS.forEach((delay, i) => {
      elapsed += delay;
      timers.push(setTimeout(() => setPhase(i + 1), elapsed));
    });
    return () => timers.forEach(clearTimeout);
  }, [reduce]);

  // Entrance animation props, collapsed to a no-op under reduced motion.
  const rise = (delay, y = 24) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, delay, ease: EASE },
        };

  return (
    <div className="relative mx-auto w-full max-w-4xl">
      {/* Glow pooled beneath the panel so it reads as lifted off the page. */}
      <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-[80%] h-28 bg-orange-500/25 mkt-bloom" />

      {/* Two nested elements on purpose: CSS animations outrank inline styles
          in the cascade, so letting `animate-float` and Framer Motion's
          entrance both drive `transform` on one node would make the float
          swallow the entrance. Entrance lives here, float lives on the card. */}
      <motion.div {...rise(0.42, 34)}>
        <div
          className={`relative rounded-2xl border border-white/[0.12] bg-midnight-900/80 backdrop-blur-xl overflow-hidden shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)] ${
            reduce ? "" : "animate-float"
          }`}
        >
          <div className="absolute inset-0 mkt-grain pointer-events-none" />

          {/* ── Panel header ──
              Deliberately NOT dressed up as an OS window. The macOS traffic
              lights that were here read as "this is a screenshot", which this
              isn't — the real Team Inbox is light-themed and laid out
              differently. What's depicted (lead queue, conversation, AI reply
              latency) is real; the chrome was not. */}
          <div className="relative flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.08] bg-white/[0.03]">
            <span className="w-5 h-5 rounded-md bg-gradient-orange flex items-center justify-center shrink-0">
              <MessageSquare size={11} className="text-white" />
            </span>
            <p className="flex-1 text-[11px] font-semibold text-midnight-200/80 truncate">
              Team Inbox
            </p>
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-300">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
              </span>
              LIVE
            </span>
          </div>

          {/* ── Body ── */}
          <div className="relative grid sm:grid-cols-[0.8fr_1.2fr]">
            {/* Lead list */}
            <div className="hidden sm:block border-r border-white/[0.08] p-3 space-y-1.5">
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-midnight-300/80">
                Leads
              </p>
              {LEAD_ROWS.map((row, i) => {
                const tone = ROW_TONES[row.tone];
                const active = i === 0;
                return (
                  <motion.div
                    key={row.name}
                    {...rise(0.58 + i * 0.1, 12)}
                    className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors ${
                      active ? "bg-white/[0.07] ring-1 ring-orange-400/25" : "hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-white truncate">{row.name}</p>
                      <p className="text-[10px] text-midnight-300/80 truncate">{row.source}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${tone.chip}`}>
                      {tone.label}
                    </span>
                  </motion.div>
                );
              })}
            </div>

            {/* Conversation */}
            <div className="p-4 sm:p-5 min-h-[15rem] flex flex-col">
              <div className="flex items-center gap-2 pb-3 mb-3 border-b border-white/[0.07]">
                <span className="w-6 h-6 rounded-full bg-gradient-orange flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                  N
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-white truncate">Neha Gupta</p>
                  <p className="text-[10px] text-midnight-300/80 flex items-center gap-1">
                    <MessageSquare size={8} /> WhatsApp · Whitefield enquiry
                  </p>
                </div>
              </div>

              <div className="flex-1 space-y-2.5">
                {/* Inbound */}
                <motion.div
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                  transition={{ duration: 0.45, ease: EASE }}
                  className="flex justify-end"
                >
                  <div className="max-w-[88%] rounded-2xl rounded-tr-md bg-emerald-500/12 border border-emerald-400/20 px-3.5 py-2.5">
                    <p className="text-[12px] leading-relaxed text-midnight-100">
                      Do you have 3BHK options under ₹80L in Whitefield?
                    </p>
                    <p className="text-[10px] text-midnight-300/80 mt-1 text-right">12:01 PM</p>
                  </div>
                </motion.div>

                {/* Typing — only while AI is composing */}
                {phase === 2 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex justify-start"
                  >
                    <div className="rounded-2xl rounded-tl-md bg-white/[0.06] border border-white/10 px-3.5 py-3">
                      <TypingDots />
                    </div>
                  </motion.div>
                )}

                {/* AI reply */}
                <motion.div
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                  transition={{ duration: 0.5, ease: EASE }}
                  className="flex justify-start"
                >
                  <div className="max-w-[92%] rounded-2xl rounded-tl-md bg-white/[0.06] border border-white/10 px-3.5 py-2.5 backdrop-blur">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Brain size={9} className="text-violet-300" />
                      <span className="text-[10px] font-bold text-violet-300">AI Auto-Reply</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
                        3 SEC
                      </span>
                    </div>
                    <p className="text-[12px] leading-relaxed text-midnight-100">
                      Yes — 3 units in Whitefield from ₹72L, with covered parking and clubhouse
                      access. Shall I block a site visit this weekend?
                    </p>
                    <p className="text-[10px] text-midnight-300/80 mt-1 flex items-center gap-1">
                      <Check size={8} className="text-emerald-400" /> Sent from your business number
                    </p>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>

          {/* ── Stat rail ── */}
          <motion.div
            {...rise(0.95, 10)}
            className="relative grid grid-cols-3 border-t border-white/[0.08] bg-white/[0.02] divide-x divide-white/[0.06]"
          >
            {RAIL_STATS.map((s) => (
              <div key={s.label} className="flex items-center justify-center gap-2 py-3">
                <s.icon size={13} className="text-orange-400 shrink-0" />
                <p className="text-[11px] text-midnight-300/80">
                  <span className="font-display font-bold text-white">{s.value}</span> {s.label}
                </p>
              </div>
            ))}
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
