import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, MessageSquare, Users, Zap, BarChart3, Bell, ShieldCheck,
  Phone, Target, Workflow, Star, Check, Sparkles, TrendingUp, Clock,
  Brain, Bot, BookOpen, PhoneCall, Headphones, Rocket, Globe2,
  AlertTriangle, Crown, ChevronRight, Play, BadgeCheck, Timer,
  MessageCircle, GitBranch, Building2, CreditCard, Lock, Layers,
  PhoneForwarded, Mic, Voicemail, Wallet,
} from "lucide-react";
import MarketingNav from "../../components/marketing/MarketingNav";
import MarketingFooter from "../../components/marketing/MarketingFooter";
import AIChatWidget from "../../components/marketing/AIChatWidget";
import HeroShowcase from "../../components/marketing/HeroShowcase";
import {
  Reveal, Stagger, StaggerItem, CountUp, PointerGlow, motion, useReducedMotion,
} from "../../components/marketing/Motion";
import { mergePlansWithConfig, ADD_ONS } from "../../data/plans";
import { fetchPlatformConfig } from "../../utils/platformConfig";


/* ── Codeskate Voice — the three calling modes ───────────────────── */
const VOICE_MODES = [
  {
    icon: Phone,
    tag: "Every plan",
    tagColor: "emerald",
    title: "Native Call Tracking",
    desc: "Your telecaller dials the lead from the app — the call is auto-logged with duration and outcome, straight onto the lead's timeline. Zero manual entry.",
    points: ["Works on Android", "Auto call logging", "No extra telephony cost"],
  },
  {
    icon: PhoneForwarded,
    tag: "Growth & up",
    tagColor: "orange",
    title: "Bridge Calling",
    desc: "Connect agent and lead through a virtual number. Neither side sees the other's real number, and every call is recorded and stored for the owner.",
    points: ["Number masking (privacy)", "Call recording for owner", "Pay-as-you-go wallet"],
  },
  {
    icon: Bot,
    tag: "Coming soon",
    tagColor: "violet",
    title: "AI Voice Bot",
    desc: "In development: AI that calls your leads in Hindi and English, asks qualifying questions and hands hot leads to an available agent.",
    points: ["Planned for Scale & up", "Hindi + English", "Hand-off to an agent"],
  },
];


/* AI stats strip. Every value is a fact about the product, not a result:
   - 24/7: auto-reply runs server-side on each inbound webhook
   - 3 min: ESCALATION_THRESHOLD_MS in whatsapp-backend escalationService.js
   - AI replies / extra-reply price: derived from data/plans.js at render time */
const URGENCY_STATS_STATIC = [
  { value: "24/7", label: "AI auto-reply coverage", icon: Clock },
  { value: "3 min", label: "before an unanswered chat escalates", icon: Timer },
];

const AI_FEATURES = [
  { icon: Brain, title: "AI Auto-Reply", desc: "Replies to WhatsApp messages automatically, around the clock, using the answers in your knowledge base.", badge: "LIVE" },
  { icon: BookOpen, title: "Knowledge Base Training", desc: "Upload your pricing, FAQs and policies. The AI answers from what you give it, and you can update it any time.", badge: "SMART" },
  { icon: Target, title: "Intent Classification", desc: "AI understands the intent behind every message — pricing, booking, complaint, support — and responds accordingly.", badge: "AI" },
  { icon: Headphones, title: "Smart Escalation", desc: "When a query needs a person, the AI hands over to an agent, who sees the full conversation so far.", badge: "HYBRID" },
];

const POWER_FEATURES = [
  { icon: MessageSquare, title: "WhatsApp Business API", desc: "Every enquiry lands in your CRM instantly — no lead ever slips through the cracks." },
  { icon: Workflow, title: "Smart Auto-Assignment", desc: "Round-robin or workload-based distribution — the right lead reaches the right rep, every time." },
  { icon: Phone, title: "Native Call Tracking", desc: "Every call is automatically logged — your team doesn't need to lift a finger." },
  { icon: GitBranch, title: "Workflow Automation", desc: "If-this-then-that rules — assign, escalate, remind, message — all on autopilot." },
  { icon: Bell, title: "SLA Escalation", desc: "Idle lead? Automatic manager alert. No lead goes cold on your watch." },
  { icon: BarChart3, title: "Live Analytics", desc: "Pipeline, conversions, revenue — everything visible in a single command center." },
  { icon: PhoneCall, title: "Auto-Dialer (Coming Soon)", desc: "System dials, your agent talks. No more manual dialing or wasted time.", badge: "SOON" },
  { icon: Lock, title: "Enterprise Security", desc: "Role-based access, OTP sign-in, and each organisation's data isolated by database rules." },
  { icon: Building2, title: "Multi-Org Support", desc: "Multiple branches? Each one gets isolated data, managed from a single login." },
];


/* Marquee under the hero. Every entry is a capability that exists in the
   feature set below — nothing aspirational. */
const HERO_TICKER = [
  "WhatsApp Business API",
  "AI Auto-Reply",
  "Bridge Calling",
  "Workflow Automation",
  "Native Call Tracking",
  "SLA Escalation",
  "Live Analytics",
  "Multi-Org Support",
  "Knowledge Base Training",
];

/* The cost-of-slow-response grid. */
const REALITY_COSTS = [
  { problem: "Enquiries that arrive after hours", fix: "AI auto-reply answers from your knowledge base, any time of day.", icon: Clock },
  { problem: "Leads waiting to be assigned", fix: "Round-robin or workload-based assignment the moment a lead arrives.", icon: Target },
  { problem: "Follow-ups that get forgotten", fix: "Reminders, overdue alerts and an escalation if a chat sits unanswered.", icon: Bell },
  { problem: "Calls nobody logged", fix: "Native call tracking on Android records each call on the lead timeline.", icon: Phone },
  { problem: "Agents' personal numbers exposed", fix: "Bridge calling connects through a virtual number and records the call.", icon: ShieldCheck },
  { problem: "Leads spread across tools", fix: "WhatsApp, website forms and Meta & Google ad leads land in one inbox.", icon: Layers },
];

const TAKEOVER_FLOW = [
  { step: "01", icon: Bot, title: "AI Handles", desc: "AI answers FAQs, pricing, availability — instantly, 24/7" },
  { step: "02", icon: Headphones, title: "Customer Asks for Human", desc: "Customer says 'talk to agent' — AI detects intent immediately" },
  { step: "03", icon: Bell, title: "Agent Notified", desc: "Your employee gets instant notification with full context & chat history" },
  { step: "04", icon: MessageCircle, title: "Seamless Takeover", desc: "Agent replies from business number — customer sees no difference" },
];

const TAKEOVER_USE_CASES = [
  { industry: "Real Estate", scenario: "Customer wants to negotiate price or schedule visit — AI can't do that. Human takes over instantly." },
  { industry: "Education", scenario: "Parent has complex admission query or wants counselor — seamless handoff, no repeat." },
  { industry: "Healthcare", scenario: "Patient needs urgent appointment or has sensitive question — immediate human connection." },
  { industry: "E-commerce", scenario: "Customer has refund dispute or custom order request — your support team jumps in." },
  { industry: "Services", scenario: "Client needs custom quote or has a complaint — human empathy + AI efficiency." },
];

const NOTIFICATIONS = [
  { who: "Employee", what: "Instant popup + sound + browser notification when chat is assigned", icon: MessageCircle, tone: "cyan" },
  { who: "Admin", what: "Real-time alert when chat is escalated from AI to human", icon: AlertTriangle, tone: "orange" },
  { who: "Admin", what: "Escalation alert if employee doesn't reply within 3 minutes", icon: Clock, tone: "rose" },
  { who: "Employee", what: "Session-private view — only sees messages during their session, not full history", icon: ShieldCheck, tone: "violet" },
  { who: "Admin", what: "Full audit trail — sees complete conversation across all sessions", icon: Crown, tone: "orange" },
];

const BRIDGE_FLOW = [
  { icon: Users, title: "Agent clicks call", desc: "One tap on the lead in your CRM." },
  { icon: PhoneCall, title: "We call the agent", desc: "Codeskate Voice rings your agent first." },
  { icon: PhoneForwarded, title: "Bridge to the lead", desc: "We dial the lead & connect both — via a virtual number." },
  { icon: Voicemail, title: "Recorded & logged", desc: "Recording + duration saved to the lead automatically." },
];

const SETUP_STEPS = [
  { n: "01", title: "Sign up", desc: "Create your workspace with just a phone number. No paperwork, no sales call." },
  { n: "02", title: "Connect WhatsApp", desc: "One-click WhatsApp Business integration. Enable AI and fill your knowledge base." },
  { n: "03", title: "Close deals", desc: "Leads flow in automatically, AI replies instantly, your team follows up. You just watch the growth." },
];

/* ── Static tone maps ─────────────────────────────────────────────────────
   Tailwind compiles class names statically, so interpolated strings like
   `bg-${tone}-500/15` never make it into the stylesheet. These lookup maps
   keep every utility literal and therefore actually generated.
   ──────────────────────────────────────────────────────────────────────── */
const VOICE_TONES = {
  emerald: { tag: "bg-emerald-500/12 text-emerald-300 border-emerald-400/25", icon: "bg-emerald-500/12 text-emerald-300" },
  orange:  { tag: "bg-orange-500/12 text-orange-300 border-orange-400/25",   icon: "bg-orange-500/12 text-orange-300" },
  violet:  { tag: "bg-violet-500/12 text-violet-300 border-violet-400/25",   icon: "bg-violet-500/12 text-violet-300" },
};

const NOTIF_TONES = {
  cyan:   { chip: "bg-cyan-500/12 text-cyan-300",     label: "text-cyan-300" },
  orange: { chip: "bg-orange-500/12 text-orange-300", label: "text-orange-300" },
  rose:   { chip: "bg-rose-500/12 text-rose-300",     label: "text-rose-300" },
  violet: { chip: "bg-violet-500/12 text-violet-300", label: "text-violet-300" },
};

const EASE = [0.22, 1, 0.36, 1];


export default function Landing() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  // Prices, limits and trial length come from data/plans.js merged with the
  // platform owner's overrides — the same path /pricing uses — so the landing
  // page can never drift from what customers are actually charged.
  const [config, setConfig] = useState(null);
  useEffect(() => {
    fetchPlatformConfig().then(setConfig).catch(() => {});
  }, []);
  const { plans, trialDays: TRIAL_DAYS } = mergePlansWithConfig(config);
  const fmtInr = (n) => Number(n).toLocaleString("en-IN");
  const startingPrice = Math.min(...plans.map((p) => p.monthlyPrice));
  const perDay = Math.round(startingPrice / 30);
  const yearlySavingPct = Math.round(
    Math.min(...plans.map((p) => (1 - p.yearlyPrice / (p.monthlyPrice * 12)) * 100))
  );
  const growthPlan = plans.find((p) => p.id === "growth") || plans[1];
  const aiAddOn = ADD_ONS.find((a) => a.id === "ai_messages");
  const URGENCY_STATS = [
    ...URGENCY_STATS_STATIC,
    { value: `₹${fmtInr(startingPrice)}`, label: "per month, Starter plan", icon: Wallet },
    ...(aiAddOn ? [{ value: `₹${fmtInr(aiAddOn.price)}`, label: `add-on: ${aiAddOn.unit} more AI replies`, icon: Zap }] : []),
  ];
  const PRODUCT_FACTS = [
    { value: `₹${fmtInr(startingPrice)}`, label: "per month, Starter plan" },
    { value: `${TRIAL_DAYS} days`, label: "free trial on Starter, no card" },
    { value: fmtInr(growthPlan.leadsLimit), label: "leads / month on Growth" },
  ];

  // Hero entrance props, collapsed to a no-op when reduced motion is on.
  // These run on mount rather than on scroll, so <Reveal>'s guard doesn't cover them.
  const intro = (delay, y = 20) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, delay, ease: EASE },
        };

  return (
    <div className="min-h-screen mkt-canvas text-midnight-100 overflow-x-hidden">
      <MarketingNav />

      {/* ═══════════ HERO ═══════════ */}
      <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-24 overflow-hidden">
        {/* Ambient structure */}
        <div className="absolute inset-0 mkt-grid-fade pointer-events-none" />
        <div className="absolute inset-0 mkt-grain pointer-events-none" />
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[46rem] h-[34rem] bg-orange-500/20 mkt-bloom animate-aurora" />
        <div className="absolute top-40 -right-32 w-[28rem] h-[28rem] bg-ember-500/15 mkt-bloom animate-blob" />
        <div
          className="absolute -bottom-24 -left-32 w-[26rem] h-[26rem] bg-violet-600/10 mkt-bloom animate-blob"
          style={{ animationDelay: "6s" }}
        />
        <PointerGlow size={620} />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          {/* ── Headline ── */}
          <div className="text-center max-w-4xl mx-auto">
            <motion.div {...intro(0, 14)} className="mkt-chip mb-7">
              <Sparkles size={13} className="text-orange-400" />
              <span className="text-xs font-semibold text-midnight-100">
                Built for WhatsApp-first sales teams in India
              </span>
            </motion.div>

            <motion.h1
              {...intro(0.08, 24)}
              className="font-display font-bold text-[2.85rem] leading-[1.04] sm:text-[4.2rem] sm:leading-[0.99] lg:text-[5.25rem] tracking-[-0.035em] text-white mb-7"
            >
              Reply to every lead,{" "}
              <span className="relative inline-block whitespace-nowrap">
                <span className="mkt-text-gradient">automatically</span>
                {/* Underline draws itself in just after the headline settles. */}
                <svg
                  className="absolute -bottom-1 left-0 w-full h-[0.26em] overflow-visible"
                  viewBox="0 0 200 14"
                  fill="none"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <motion.path
                    d="M3 10.5C42 3.5 96 1.5 197 6"
                    stroke="url(#heroUnderline)"
                    strokeWidth="4"
                    strokeLinecap="round"
                    initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 0.9, delay: 0.7, ease: EASE }}
                  />
                  <defs>
                    <linearGradient
                      id="heroUnderline"
                      x1="0"
                      y1="0"
                      x2="200"
                      y2="0"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop stopColor="#FFAC70" />
                      <stop offset="0.55" stopColor="#FF6B1A" />
                      <stop offset="1" stopColor="#FF8A3D" />
                    </linearGradient>
                  </defs>
                </svg>
              </span>
              .
              <br />
              <span className="text-midnight-300">Close more deals.</span>
            </motion.h1>

            <motion.p
              {...intro(0.16, 18)}
              className="text-lg sm:text-xl text-midnight-200/80 max-w-2xl mx-auto mb-6 leading-relaxed"
            >
              Codeskate CRM captures WhatsApp leads, auto-assigns them to your team, and replies
              using AI that answers from your own knowledge base. It keeps working{" "}
              <strong className="text-white font-semibold">24/7</strong>, even when your team is offline.
            </motion.p>

            <motion.div
              {...intro(0.3, 16)}
              className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-7"
            >
              <button
                onClick={() => navigate("/signup")}
                className="btn mkt-btn-ember text-base px-8 py-4 w-full sm:w-auto font-semibold"
              >
                <Rocket size={18} />
                Get Started — {TRIAL_DAYS} Days Free
                <ArrowRight size={18} />
              </button>
              <button
                onClick={() => navigate("/pricing")}
                className="btn mkt-btn-glass text-base px-7 py-3.5 w-full sm:w-auto font-semibold"
              >
                View Pricing
              </button>
            </motion.div>

            <motion.p
              {...intro(0.38, 0)}
              className="text-sm text-midnight-300/80 flex items-center justify-center gap-5 flex-wrap"
            >
              <span className="flex items-center gap-1.5">
                <Check size={14} className="text-emerald-400" strokeWidth={3} /> No credit card for the trial
              </span>
              <span className="flex items-center gap-1.5">
                <Check size={14} className="text-emerald-400" strokeWidth={3} /> Sign up with your phone number
              </span>
              <span className="flex items-center gap-1.5">
                <Check size={14} className="text-emerald-400" strokeWidth={3} /> Plans from ₹{fmtInr(startingPrice)}/month
              </span>
            </motion.p>
          </div>

          {/* ── Product panel: the promise, playing out live ── */}
          <div className="mt-16 sm:mt-20">
            <HeroShowcase />
          </div>

          {/* ── Capability marquee ── */}
          <div className="mt-20 sm:mt-24">
            <p className="text-center text-[11px] font-bold uppercase tracking-[0.16em] text-midnight-300/80 mb-6">
              One platform, every channel
            </p>
            <div className="mkt-edge-fade overflow-hidden">
              <div className={`flex w-max gap-3 ${reduce ? "flex-wrap justify-center" : "animate-ticker"}`}>
                {(reduce ? HERO_TICKER : [...HERO_TICKER, ...HERO_TICKER]).map((t, i) => (
                  <span
                    key={`${t}-${i}`}
                    className="shrink-0 rounded-full border border-white/[0.09] bg-white/[0.03] px-4 py-2 text-xs font-medium text-midnight-200/80"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* ═══════════ PRODUCT FACTS (from the price list, not usage) ═══════════ */}
      <section className="relative border-y border-white/[0.07] bg-white/[0.02]">
        <div className="absolute inset-0 pattern-grid opacity-40 pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-12">
          <Stagger className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-6">
            {PRODUCT_FACTS.map((c) => (
              <StaggerItem key={c.label} className="text-center">
                <p className="font-display font-bold text-4xl sm:text-5xl tracking-[-0.02em] mb-1.5">
                  <CountUp value={c.value} className="mkt-text-gradient" />
                </p>
                <p className="text-sm text-midnight-300/80">{c.label}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>


      {/* ═══════════ WHERE LEADS SLIP AWAY ═══════════ */}
      <section className="relative py-20 sm:py-28 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-rose-600/10 mkt-bloom" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <div className="mkt-chip mb-5 !border-rose-400/25 !bg-rose-500/10">
              <AlertTriangle size={13} className="text-rose-300" />
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-rose-300">
                Where leads slip away
              </span>
            </div>
            <h2 className="font-display font-bold text-3xl sm:text-5xl tracking-[-0.025em] text-white mb-5">
              The gaps that lose leads —{" "}
              <span className="text-rose-400">and how we close them</span>
            </h2>
          </Reveal>

          <Stagger className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {REALITY_COSTS.map((item) => (
              <StaggerItem key={item.problem}>
                <div className="group h-full mkt-card mkt-card-hover mkt-sheen rounded-2xl p-6">
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/12 flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110">
                      <item.icon size={18} className="text-rose-300" />
                    </div>
                    <div>
                      <p className="font-semibold text-white mb-1.5">{item.problem}</p>
                      <p className="text-sm text-midnight-200/80 leading-relaxed">{item.fix}</p>
                    </div>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          <Reveal className="text-center mt-9">
            <button
              onClick={() => navigate("/signup")}
              className="btn mkt-btn-ember text-base px-8 py-3.5 font-semibold"
            >
              <Zap size={18} />
              Fix These Problems Today
              <ArrowRight size={18} />
            </button>
          </Reveal>
        </div>
      </section>


      {/* ═══════════ AI — HERO FEATURE ═══════════ */}
      <section className="relative py-20 sm:py-28 overflow-hidden">
        <div className="absolute top-0 right-0 w-[32rem] h-[32rem] bg-violet-600/12 mkt-bloom animate-blob" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <Reveal className="text-center max-w-3xl mx-auto mb-16">
            <div className="mkt-chip mb-5 !border-violet-400/25 !bg-violet-500/10">
              <Brain size={13} className="text-violet-300" />
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-300">
                Built for WhatsApp-first teams
              </span>
            </div>
            <h2 className="font-display font-bold text-3xl sm:text-5xl tracking-[-0.025em] text-white mb-5">
              AI that replies, qualifies, and{" "}
              <span className="mkt-text-gradient">converts</span>
            </h2>
            <p className="text-lg text-midnight-200/75">
              A customer sends a WhatsApp message. The AI replies with an answer drawn from your
              knowledge base, without waiting for someone on your team to come online.
            </p>
          </Reveal>

          {/* Stats strip */}
          <Stagger className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12" stagger={0.07}>
            {URGENCY_STATS.map((s) => (
              <StaggerItem key={s.label}>
                <div className="group h-full mkt-card mkt-card-hover rounded-2xl p-5 text-center">
                  <s.icon
                    size={20}
                    className="mx-auto text-violet-300 mb-2.5 transition-transform duration-300 group-hover:scale-110"
                  />
                  <p className="font-display font-bold text-2xl text-white tracking-[-0.02em]">
                    {s.value}
                  </p>
                  <p className="text-xs text-midnight-300/80 mt-1">{s.label}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          {/* Feature cards */}
          <Stagger className="grid sm:grid-cols-2 gap-5">
            {AI_FEATURES.map((f) => (
              <StaggerItem key={f.title}>
                <div className="group relative h-full mkt-card mkt-card-hover mkt-sheen rounded-2xl p-7 overflow-hidden">
                  {f.badge && (
                    <span className="absolute top-5 right-5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-violet-500/15 text-violet-300 border border-violet-400/20">
                      {f.badge}
                    </span>
                  )}
                  <div className="w-12 h-12 rounded-xl bg-violet-500/12 group-hover:bg-violet-500/25 flex items-center justify-center mb-5 transition-all duration-300 group-hover:scale-110">
                    <f.icon size={22} className="text-violet-300" />
                  </div>
                  <h3 className="font-display font-semibold text-lg text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-midnight-200/75 leading-relaxed">{f.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>


      {/* ═══════════ HUMAN TAKEOVER ═══════════ */}
      <section className="relative py-20 sm:py-28 overflow-hidden border-t border-white/[0.06]">
        <div className="absolute top-0 left-0 w-96 h-96 bg-cyan-500/10 mkt-bloom animate-blob" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <Reveal className="text-center max-w-3xl mx-auto mb-14">
            <div className="mkt-chip mb-5 !border-cyan-400/25 !bg-cyan-500/10">
              <Headphones size={13} className="text-cyan-300" />
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-300">
                AI + Human = Perfect Customer Care
              </span>
            </div>
            <h2 className="font-display font-bold text-3xl sm:text-5xl tracking-[-0.025em] text-white mb-5">
              AI handles routine. Your team handles{" "}
              <span className="mkt-text-gradient">important</span>.
            </h2>
            <p className="text-lg text-midnight-200/75 max-w-2xl mx-auto">
              When a customer says “I want to talk to a real person” — AI instantly steps aside,
              assigns a team member, and they take over the chat{" "}
              <strong className="text-white font-semibold">from your business number</strong>. No
              switching apps.
            </p>
          </Reveal>

          {/* Flow */}
          <Stagger className="grid md:grid-cols-4 gap-4 mb-14" stagger={0.08}>
            {TAKEOVER_FLOW.map((s, i) => (
              <StaggerItem key={s.step} className="relative">
                <div className="group h-full mkt-card mkt-card-hover rounded-2xl p-5">
                  <div className="flex items-center gap-2.5 mb-3.5">
                    <div className="w-9 h-9 rounded-lg bg-cyan-500/12 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                      <s.icon size={16} className="text-cyan-300" />
                    </div>
                    <span className="font-mono text-[10px] font-bold text-cyan-400/60">
                      {s.step}
                    </span>
                  </div>
                  <h4 className="font-semibold text-white text-sm mb-1.5">{s.title}</h4>
                  <p className="text-xs text-midnight-200/70 leading-relaxed">{s.desc}</p>
                </div>
                {i < TAKEOVER_FLOW.length - 1 && (
                  <ChevronRight
                    className="hidden md:block absolute top-1/2 -right-3 -translate-y-1/2 text-white/15"
                    size={16}
                  />
                )}
              </StaggerItem>
            ))}
          </Stagger>

          {/* Use cases + notifications */}
          <div className="grid md:grid-cols-2 gap-5">
            <Reveal>
              <div className="h-full mkt-card mkt-sheen rounded-2xl p-7">
                <h3 className="font-display font-semibold text-lg text-white mb-5 flex items-center gap-2">
                  <Target size={18} className="text-orange-400" />
                  Why your business needs this
                </h3>
                <div className="space-y-4">
                  {TAKEOVER_USE_CASES.map((uc) => (
                    <div key={uc.industry} className="flex items-start gap-3">
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-orange-500/12 text-orange-300 border border-orange-400/20 shrink-0 mt-0.5">
                        {uc.industry}
                      </span>
                      <p className="text-sm text-midnight-200/75 leading-relaxed">{uc.scenario}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <div className="h-full mkt-card mkt-sheen rounded-2xl p-7">
                <h3 className="font-display font-semibold text-lg text-white mb-5 flex items-center gap-2">
                  <Bell size={18} className="text-cyan-300" />
                  Smart Notification System
                </h3>
                <div className="space-y-3">
                  {NOTIFICATIONS.map((n, i) => {
                    const tone = NOTIF_TONES[n.tone];
                    return (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.07]"
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tone.chip}`}
                        >
                          <n.icon size={14} />
                        </div>
                        <div>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider ${tone.label}`}
                          >
                            {n.who}
                          </span>
                          <p className="text-sm text-midnight-200/75 mt-0.5 leading-relaxed">
                            {n.what}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Reveal>
          </div>

          <Reveal className="text-center mt-10">
            <p className="text-sm text-midnight-300/80 mb-5 flex items-center justify-center gap-2">
              <Sparkles size={14} className="text-orange-400" />
              Available on Growth plan and above — included with AI Customer Care
            </p>
            <button
              onClick={() => navigate("/signup")}
              className="btn mkt-btn-ember text-base px-8 py-3.5 font-semibold"
            >
              <Headphones size={18} />
              Try AI + Human Takeover Free
              <ArrowRight size={18} />
            </button>
          </Reveal>
        </div>
      </section>


      {/* ═══════════ CODESKATE VOICE ═══════════ */}
      <section
        id="voice"
        className="relative py-20 sm:py-28 overflow-hidden scroll-mt-16 border-t border-white/[0.06] bg-midnight-950/50"
      >
        <div className="absolute inset-0 pattern-grid opacity-40 pointer-events-none" />
        <div className="absolute -top-24 right-0 w-[30rem] h-[30rem] bg-orange-500/15 mkt-bloom animate-blob" />
        <div
          className="absolute -bottom-24 -left-16 w-96 h-96 bg-violet-600/12 mkt-bloom animate-blob"
          style={{ animationDelay: "5s" }}
        />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <Reveal className="text-center max-w-3xl mx-auto mb-16">
            <div className="mkt-chip mb-5">
              <PhoneCall size={13} className="text-orange-400" />
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-orange-300">
                Codeskate Voice
              </span>
            </div>
            <h2 className="font-display font-bold text-3xl sm:text-5xl tracking-[-0.025em] text-white mb-5">
              Calling that closes —{" "}
              <span className="mkt-text-gradient">masked, recorded &amp; AI-powered</span>
            </h2>
            <p className="text-lg text-midnight-200/75">
              Three ways to call your leads, right inside the CRM. Protect your team's numbers,
              record every conversation, and let AI make the first call for you.
            </p>
          </Reveal>

          <Stagger className="grid md:grid-cols-3 gap-5 mb-14">
            {VOICE_MODES.map((m) => {
              const tone = VOICE_TONES[m.tagColor];
              return (
                <StaggerItem key={m.title}>
                  <div className="group h-full mkt-card mkt-card-hover mkt-sheen rounded-2xl p-7">
                    <div className="flex items-center justify-between mb-5">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 ${tone.icon}`}
                      >
                        <m.icon size={22} />
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${tone.tag}`}
                      >
                        {m.tag}
                      </span>
                    </div>
                    <h3 className="font-display font-semibold text-xl text-white mb-2.5">
                      {m.title}
                    </h3>
                    <p className="text-sm text-midnight-200/75 leading-relaxed mb-5">{m.desc}</p>
                    <ul className="space-y-2.5">
                      {m.points.map((p) => (
                        <li
                          key={p}
                          className="flex items-center gap-2 text-sm text-midnight-100/85"
                        >
                          <Check size={14} className="text-emerald-400 shrink-0" strokeWidth={3} />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                </StaggerItem>
              );
            })}
          </Stagger>

          {/* Bridge flow */}
          <Reveal>
            <div className="mkt-card mkt-sheen rounded-3xl p-6 sm:p-9">
              <div className="flex items-center gap-2 mb-7">
                <PhoneForwarded size={16} className="text-orange-400" />
                <p className="text-[11px] font-bold text-orange-300 uppercase tracking-[0.14em]">
                  How a bridge call works
                </p>
              </div>
              <div className="grid sm:grid-cols-4 gap-5">
                {BRIDGE_FLOW.map((s, i) => (
                  <div key={s.title} className="relative">
                    <div className="w-9 h-9 rounded-lg bg-orange-500/12 flex items-center justify-center mb-3.5">
                      <s.icon size={17} className="text-orange-300" />
                    </div>
                    <p className="font-semibold text-white text-sm mb-1.5">{s.title}</p>
                    <p className="text-xs text-midnight-200/70 leading-relaxed">{s.desc}</p>
                    {i < BRIDGE_FLOW.length - 1 && (
                      <ChevronRight
                        className="hidden sm:block absolute top-1 -right-3 text-white/15"
                        size={16}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Wallet */}
          <Reveal delay={0.1}>
            <div className="mt-5 flex flex-col sm:flex-row items-center gap-5 rounded-2xl border border-orange-400/20 bg-gradient-to-r from-orange-500/12 via-ember-500/8 to-violet-600/8 px-6 py-5">
              <div className="w-11 h-11 rounded-xl bg-orange-500/18 flex items-center justify-center shrink-0">
                <Wallet size={20} className="text-orange-300" />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <p className="font-semibold text-white text-sm">
                  Prepaid voice wallet — pay only for what you use
                </p>
                <p className="text-xs text-midnight-200/70 mt-1">
                  Top up from ₹100. Bridge calls are billed per connected minute; recordings are saved
                  to the lead. Available on Growth and above.
                </p>
              </div>
              <button
                onClick={() => navigate("/signup")}
                className="btn bg-white text-midnight-900 hover:bg-midnight-50 text-sm px-5 py-2.5 shrink-0 font-semibold transition-colors"
              >
                Get Started
                <ArrowRight size={15} />
              </button>
            </div>
          </Reveal>
        </div>
      </section>


      {/* ═══════════ ALL FEATURES ═══════════ */}
      <section
        id="features"
        className="relative py-20 sm:py-28 scroll-mt-16 border-t border-white/[0.06]"
      >
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <Reveal className="text-center max-w-2xl mx-auto mb-16">
            <p className="mkt-eyebrow mb-4">One platform</p>
            <h2 className="font-display font-bold text-3xl sm:text-5xl tracking-[-0.025em] text-white mb-5">
              Everything you need — <span className="mkt-text-gradient">one platform</span>
            </h2>
            <p className="text-lg text-midnight-200/75">
              CRM, WhatsApp, AI replies, calling and automation, in one place.
            </p>
          </Reveal>

          <Stagger className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" stagger={0.05}>
            {POWER_FEATURES.map((f) => (
              <StaggerItem key={f.title}>
                <div className="group relative h-full mkt-card mkt-card-hover mkt-sheen rounded-2xl p-6">
                  {f.badge && (
                    <span className="absolute top-4 right-4 text-[9px] font-bold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 border border-orange-400/20">
                      {f.badge}
                    </span>
                  )}
                  <div className="w-11 h-11 rounded-xl bg-orange-500/12 group-hover:bg-gradient-orange flex items-center justify-center mb-4 transition-all duration-300 group-hover:scale-110">
                    <f.icon
                      size={20}
                      className="text-orange-300 group-hover:text-white transition-colors duration-300"
                    />
                  </div>
                  <h3 className="font-display font-semibold text-base text-white mb-2">
                    {f.title}
                  </h3>
                  <p className="text-sm text-midnight-200/75 leading-relaxed">{f.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>


      {/* ═══════════ PRICING ═══════════ */}
      <section
        id="pricing"
        className="relative py-20 sm:py-28 scroll-mt-16 border-t border-white/[0.06] bg-midnight-950/50 overflow-hidden"
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[40rem] h-80 bg-orange-500/12 mkt-bloom" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <p className="mkt-eyebrow mb-4">Simple pricing</p>
            <h2 className="font-display font-bold text-3xl sm:text-5xl tracking-[-0.025em] text-white mb-5">
              The full AI sales stack —{" "}
              <span className="mkt-text-gradient">one subscription</span>
            </h2>
            <p className="text-lg text-midnight-200/75">
              Starting at ₹{fmtInr(startingPrice)}/month — about{" "}
              <strong className="text-white font-semibold">₹{perDay}/day</strong>. Starter includes a{" "}
              {TRIAL_DAYS}-day free trial.
            </p>
          </Reveal>

          <Stagger className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 items-start">
            {plans.map((plan) => (
              <StaggerItem key={plan.id}>
                <div
                  className={`relative h-full rounded-3xl p-7 transition-all duration-300 ${
                    plan.popular
                      ? "bg-white/[0.07] border border-orange-400/40 shadow-[0_0_60px_-20px_rgba(255,107,26,0.45)] lg:-translate-y-3"
                      : "mkt-card mkt-card-hover"
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span className="bg-gradient-orange text-white text-[11px] font-bold px-4 py-1 rounded-full shadow-glow whitespace-nowrap">
                        MOST POPULAR
                      </span>
                    </div>
                  )}

                  <div className="mb-5">
                    <h3 className="font-display font-bold text-xl text-white">{plan.name}</h3>
                    <p className="text-sm text-midnight-300/80 mt-1">{plan.tagline}</p>
                  </div>

                  <div className="mb-6">
                    <span className="font-display font-bold text-4xl text-white tracking-[-0.02em]">
                      ₹{fmtInr(plan.monthlyPrice)}
                    </span>
                    <span className="text-midnight-300/80 text-sm">/mo</span>
                    <div className="flex gap-2.5 mt-2.5 text-xs text-midnight-300/80">
                      <span>{plan.includedSeats < 0 ? "Unlimited" : plan.includedSeats} users</span>
                      <span className="text-midnight-300/80">•</span>
                      <span>
                        {plan.leadsLimit < 0 ? "Unlimited" : fmtInr(plan.leadsLimit)} leads/mo
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => navigate("/signup")}
                    className={`btn w-full py-3 rounded-xl font-semibold text-sm ${
                      plan.popular ? "mkt-btn-ember" : "mkt-btn-glass"
                    }`}
                  >
                    {plan.trial ? "Start free trial" : "Get started"} <ArrowRight size={15} />
                  </button>

                  <div className="mt-6 space-y-3">
                    {plan.features.map((f) => {
                      const soon = /coming soon/i.test(f.text);
                      if (!f.included) {
                        return (
                          <div key={f.text} className="flex items-start gap-2.5 text-sm opacity-35">
                            <span className="w-[15px] text-center text-rose-400 shrink-0">—</span>
                            <span className="text-midnight-300">{f.text}</span>
                          </div>
                        );
                      }
                      return (
                        <div key={f.text} className="flex items-start gap-2.5 text-sm">
                          {soon ? (
                            <Clock size={15} className="text-amber-400 shrink-0 mt-0.5" />
                          ) : (
                            <Check size={15} className="text-emerald-400 shrink-0 mt-0.5" strokeWidth={3} />
                          )}
                          <span className={soon ? "text-midnight-300/80" : "text-midnight-200/80"}>
                            {f.text}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          <p className="text-center text-sm text-midnight-300/80 mt-10 leading-relaxed">
            Starter plan includes a {TRIAL_DAYS}-day free trial. No credit card required.
            <br />
            Save about <strong className="text-white font-semibold">{yearlySavingPct}%</strong> with
            yearly billing · Calling uses a prepaid wallet, billed per connected minute.
          </p>
        </div>
      </section>


      {/* ═══════════ HOW IT WORKS ═══════════ */}
      <section
        id="how"
        className="relative py-20 sm:py-28 scroll-mt-16 border-t border-white/[0.06] overflow-hidden"
      >
        <div className="absolute inset-0 mkt-grain pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-ember-500/10 mkt-bloom" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <p className="mkt-eyebrow mb-4">How it works</p>
            <h2 className="font-display font-bold text-3xl sm:text-5xl tracking-[-0.025em] text-white mb-5">
              So <span className="mkt-text-gradient">simple</span>, it needs no explanation
            </h2>
          </Reveal>

          <Stagger className="grid md:grid-cols-3 gap-6" stagger={0.12}>
            {SETUP_STEPS.map((s, i) => (
              <StaggerItem key={s.n} className="relative">
                <div className="h-full mkt-card mkt-card-hover mkt-sheen rounded-2xl p-8">
                  <div className="font-display font-bold text-5xl mkt-text-gradient opacity-60 mb-5">
                    {s.n}
                  </div>
                  <h3 className="font-display font-semibold text-xl text-white mb-3">{s.title}</h3>
                  <p className="text-midnight-200/75 leading-relaxed">{s.desc}</p>
                </div>
                {i < SETUP_STEPS.length - 1 && (
                  <ArrowRight
                    className="hidden md:block absolute top-1/2 -right-5 -translate-y-1/2 text-orange-400/40 z-10"
                    size={26}
                  />
                )}
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>


      {/* ═══════════ FINAL CTA ═══════════ */}
      <section className="relative py-20 sm:py-28">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <Reveal>
            <div className="relative rounded-[2rem] border border-orange-400/25 bg-gradient-to-br from-orange-500/[0.18] via-ember-600/[0.12] to-midnight-950/60 p-10 sm:p-16 text-center overflow-hidden">
              <div className="absolute inset-0 mkt-grain pointer-events-none" />
              <div className="absolute -top-24 -right-20 w-80 h-80 bg-orange-400/25 mkt-bloom animate-blob" />
              <div
                className="absolute -bottom-24 -left-20 w-80 h-80 bg-violet-500/15 mkt-bloom animate-blob"
                style={{ animationDelay: "4s" }}
              />
              <PointerGlow size={520} color="rgba(255,172,112,0.16)" />

              <div className="relative">
                <div className="mkt-chip mb-7">
                  <Sparkles size={13} className="text-orange-300" />
                  <span className="text-xs font-semibold text-white">
                    Plans from ₹{fmtInr(startingPrice)}/month
                  </span>
                </div>

                <h2 className="font-display font-bold text-3xl sm:text-5xl lg:text-[3.5rem] leading-[1.08] tracking-[-0.03em] text-white mb-6">
                  Your next customer is messaging right now.
                  <br />
                  <span className="mkt-text-gradient">Be the one who replies first.</span>
                </h2>

                <p className="text-lg text-midnight-200/80 max-w-xl mx-auto mb-9 leading-relaxed">
                  Leads message at all hours. Codeskate's AI replies even when your team is offline,
                  and hands over to a person when it matters.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    onClick={() => navigate("/signup")}
                    className="btn bg-white text-midnight-900 hover:bg-midnight-50 text-base px-8 py-4 w-full sm:w-auto font-bold transition-colors"
                  >
                    <Rocket size={18} />
                    Start Now — It's Free
                    <ArrowRight size={18} />
                  </button>
                  <button
                    onClick={() => navigate("/pricing")}
                    className="btn mkt-btn-glass text-base px-8 py-3.5 w-full sm:w-auto font-semibold"
                  >
                    Compare Plans
                  </button>
                </div>

                <p className="text-sm text-midnight-300/80 mt-7">
                  {TRIAL_DAYS}-day free trial on Starter. No credit card needed.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <MarketingFooter />
      <AIChatWidget />
    </div>
  );
}
