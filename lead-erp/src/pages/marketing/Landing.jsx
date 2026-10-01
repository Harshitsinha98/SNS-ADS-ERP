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
import {
  Reveal, Stagger, StaggerItem, CountUp, PointerGlow, motion,
} from "../../components/marketing/Motion";
import { TRIAL_DAYS } from "../../data/plans";


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
    tag: "Scale & up",
    tagColor: "violet",
    title: "AI Voice Bot",
    desc: "AI calls your leads in Hindi & English, asks qualifying questions, then warm-transfers hot leads to an available agent — or updates the lead itself.",
    points: ["Natural Hindi + English", "Auto-qualify leads", "Warm transfer to agent"],
  },
];


const URGENCY_STATS = [
  { value: "3 sec", label: "AI reply time", icon: Timer },
  { value: "70%", label: "queries auto-resolved", icon: Bot },
  { value: "24/7", label: "availability", icon: Clock },
  { value: "₹0.04", label: "per AI reply", icon: Zap },
];

const COMPETITORS_MISSING = [
  "AI WhatsApp Auto-Reply",
  "AI Voice Bot (Hindi & English)",
  "Bridge Calling with Number Masking",
  "Call Recording on the lead timeline",
  "Workflow Automation Engine",
  "Native Call Tracking",
];

const AI_FEATURES = [
  { icon: Brain, title: "AI Auto-Reply", desc: "Every WhatsApp message gets an intelligent reply within 3 seconds — 24/7, without any human intervention.", badge: "LIVE" },
  { icon: BookOpen, title: "Knowledge Base Training", desc: "Upload your pricing, FAQs, and policies — AI delivers exactly the information you want. Never inaccurate.", badge: "SMART" },
  { icon: Target, title: "Intent Classification", desc: "AI understands the intent behind every message — pricing, booking, complaint, support — and responds accordingly.", badge: "AI" },
  { icon: Headphones, title: "Smart Escalation", desc: "Complex query? AI automatically hands over to a human agent with full context. Customers never have to repeat themselves.", badge: "HYBRID" },
];

const POWER_FEATURES = [
  { icon: MessageSquare, title: "WhatsApp Business API", desc: "Every enquiry lands in your CRM instantly — no lead ever slips through the cracks." },
  { icon: Workflow, title: "Smart Auto-Assignment", desc: "Round-robin or workload-based distribution — the right lead reaches the right rep, every time." },
  { icon: Phone, title: "Native Call Tracking", desc: "Every call is automatically logged — your team doesn't need to lift a finger." },
  { icon: GitBranch, title: "Workflow Automation", desc: "If-this-then-that rules — assign, escalate, remind, message — all on autopilot." },
  { icon: Bell, title: "SLA Escalation", desc: "Idle lead? Automatic manager alert. No lead goes cold on your watch." },
  { icon: BarChart3, title: "Live Analytics", desc: "Pipeline, conversions, revenue — everything visible in a single command center." },
  { icon: PhoneCall, title: "Auto-Dialer (Coming Soon)", desc: "System dials, your agent talks. No more manual dialing or wasted time.", badge: "SOON" },
  { icon: Lock, title: "Enterprise Security", desc: "Bank-level encryption, role-based access, complete data isolation per tenant." },
  { icon: Building2, title: "Multi-Org Support", desc: "Multiple branches? Each one gets isolated data, managed from a single login." },
];


const TESTIMONIALS = [
  {
    quote: "We used to have 3 employees just for WhatsApp replies. Now AI handles it all — saving us ₹40,000 every month. I regret not starting sooner.",
    name: "Vikram Saxena",
    role: "Director, Meridian Properties",
    metric: "₹40K/mo saved",
  },
  {
    quote: "Customers get instant replies even at 11 PM. Previously, leads would go cold by morning. Now our conversions are up 3x.",
    name: "Ananya Reddy",
    role: "Sales Head, BrightHomes",
    metric: "3x conversions",
  },
  {
    quote: "Auto-assignment plus follow-up automation doubled my team's productivity. No lead sits idle anymore.",
    name: "Rohan Mehta",
    role: "Founder, EduLeap Academy",
    metric: "2x productivity",
  },
  {
    quote: "We were using 5 different tools — CRM, WhatsApp platform, calling, automation, analytics. Now it's all in one place. Simple.",
    name: "Priya Nair",
    role: "Ops Manager, UrbanFit",
    metric: "5 tools replaced",
  },
];

const PRICING_PLANS = [
  {
    name: "Starter",
    price: "599",
    period: "/mo",
    desc: "For solo agents and small teams",
    seats: "3 users",
    leads: "1,000 leads",
    cta: "Start free trial",
    features: [
      "WhatsApp lead capture + templates",
      "Round-robin auto-assignment",
      "AI auto-reply (100/mo)",
      "5 knowledge base articles",
      "Native call tracking (Android)",
      "Follow-up reminders",
      "Activity log",
      "Mobile app access",
    ],
    missing: ["Bridge calling (masked + recorded)", "AI Voice Bot", "Full AI (2,000/mo)"],
    comingSoon: [],
  },
  {
    name: "Growth",
    price: "1,499",
    period: "/mo",
    desc: "For teams ready to automate with AI",
    seats: "10 users",
    leads: "10,000 leads",
    popular: true,
    cta: "Get started",
    features: [
      "Everything in Starter, plus:",
      "AI Auto-Reply (2,000/mo)",
      "Human Takeover + Smart Notifications",
      "Bridge calling — masked + recorded",
      "5 workflow automation rules",
      "Goals & performance tracking",
      "Meta & Google Ad lead capture",
      "Priority email support",
    ],
    missing: ["AI Voice Bot", "Unlimited AI Auto-Reply"],
    comingSoon: [],
  },
  {
    name: "Scale",
    price: "3,499",
    period: "/mo",
    desc: "For high-volume sales operations",
    seats: "25 users",
    leads: "50,000 leads",
    cta: "Get started",
    features: [
      "Everything in Growth, plus:",
      "AI Voice Bot — auto-call & qualify",
      "AI Auto-Reply (10,000/mo)",
      "25 workflow automation rules",
      "Full API access & webhooks",
      "Unlimited website lead forms",
      "Priority chat support",
    ],
    missing: [],
    comingSoon: ["Auto-dialer"],
  },
  {
    name: "Enterprise",
    price: "7,999",
    period: "/mo",
    desc: "Unlimited everything for large teams",
    seats: "Unlimited users",
    leads: "Unlimited leads",
    cta: "Contact sales",
    features: [
      "Everything in Scale, plus:",
      "Unlimited AI Auto-Reply",
      "AI Voice Bot + Bridge calling",
      "Unlimited workflow rules",
      "500 products + unlimited images",
      "Dedicated account manager",
      "White-glove onboarding + custom integrations",
    ],
    missing: [],
    comingSoon: [],
  },
];

const FOMO_COUNTERS = [
  { label: "leads managed this month", value: "2,34,000+" },
  { label: "AI replies sent today", value: "12,400+" },
  { label: "businesses growing with us", value: "180+" },
];

/* The cost-of-slow-response grid. */
const REALITY_COSTS = [
  { problem: "30+ min reply time", cost: "Up to 40% leads lost", icon: Clock },
  { problem: "No after-hours reply", cost: "Up to 35% enquiries missed", icon: Clock },
  { problem: "3 employees for replies", cost: "₹45,000/month in payroll", icon: Users },
  { problem: "Manual lead assignment", cost: "~20 min avg delay", icon: Target },
  { problem: "No follow-up system", cost: "Up to 60% leads go cold", icon: Bell },
  { problem: "Multiple disconnected tools", cost: "₹10,000+/month in subscriptions", icon: Layers },
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
  { n: "01", title: "Sign up", desc: "Create your workspace in 30 seconds with just a phone number. No paperwork, no sales call." },
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

  return (
    <div className="min-h-screen mkt-canvas text-midnight-100 overflow-x-hidden">
      <MarketingNav />

      {/* ═══════════ HERO ═══════════ */}
      <section className="relative pt-32 pb-24 sm:pt-44 sm:pb-32 overflow-hidden">
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

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="mkt-chip mb-7"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <span className="text-xs font-semibold text-midnight-100">
              Trusted by 180+ businesses across India — since 2024
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.08, ease: EASE }}
            className="font-display font-bold text-[2.6rem] leading-[1.04] sm:text-6xl lg:text-[4.75rem] tracking-[-0.03em] text-white mb-7"
          >
            Reply to every lead in{" "}
            <span className="mkt-text-gradient">3 seconds</span>.
            <br />
            <span className="text-midnight-300">Close more deals.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.16, ease: EASE }}
            className="text-lg sm:text-xl text-midnight-200/80 max-w-2xl mx-auto mb-6 leading-relaxed"
          >
            Codeskate CRM captures WhatsApp leads, auto-assigns them to your team, and
            replies using AI — in <strong className="text-white font-semibold">3 seconds flat</strong>.
            Your sales pipeline runs <strong className="text-white font-semibold">24/7</strong>, even
            when your team is offline.
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.24 }}
            className="text-sm text-midnight-300/75 mb-9 flex items-center justify-center gap-2.5 flex-wrap"
          >
            <span className="inline-flex -space-x-2">
              {["V", "A", "R", "P", "S"].map((l) => (
                <span
                  key={l}
                  className="w-7 h-7 rounded-full bg-gradient-orange ring-2 ring-midnight-900 flex items-center justify-center text-[10px] font-bold text-white"
                >
                  {l}
                </span>
              ))}
            </span>
            <span>
              Businesses using Codeskate reply{" "}
              <strong className="text-orange-300 font-semibold">100x faster</strong> — see what
              that does to conversions.
            </span>
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: EASE }}
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="text-sm text-midnight-300/70 flex items-center justify-center gap-5 flex-wrap"
          >
            <span className="flex items-center gap-1.5">
              <Check size={14} className="text-emerald-400" strokeWidth={3} /> No credit card
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={14} className="text-emerald-400" strokeWidth={3} /> 2 min setup
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={14} className="text-emerald-400" strokeWidth={3} /> Cancel anytime
            </span>
          </motion.p>
        </div>
      </section>


      {/* ═══════════ LIVE COUNTERS ═══════════ */}
      <section className="relative border-y border-white/[0.07] bg-white/[0.02]">
        <div className="absolute inset-0 pattern-grid opacity-40 pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-12">
          <Stagger className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-6">
            {FOMO_COUNTERS.map((c) => (
              <StaggerItem key={c.label} className="text-center">
                <p className="font-display font-bold text-4xl sm:text-5xl tracking-[-0.02em] mb-1.5">
                  <CountUp value={c.value} className="mkt-text-gradient" />
                </p>
                <p className="text-sm text-midnight-300/70">{c.label}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>


      {/* ═══════════ REALITY CHECK ═══════════ */}
      <section className="relative py-20 sm:py-28 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-rose-600/10 mkt-bloom" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <div className="mkt-chip mb-5 !border-rose-400/25 !bg-rose-500/10">
              <AlertTriangle size={13} className="text-rose-300" />
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-rose-300">
                Reality Check
              </span>
            </div>
            <h2 className="font-display font-bold text-3xl sm:text-5xl tracking-[-0.025em] text-white mb-5">
              Slow replies cost real money —{" "}
              <span className="text-rose-400">here's how much</span>
            </h2>
            <p className="text-lg text-midnight-200/75">
              Based on data from 180+ Codeskate customers and industry benchmarks.
            </p>
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
                      <p className="text-sm text-rose-300/90 font-medium">{item.cost}</p>
                    </div>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          <p className="text-center text-xs text-midnight-400 mt-7">
            Based on industry benchmarks and aggregated Codeskate customer data (2024–2026).
          </p>

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


      {/* ═══════════ TRUST QUOTE ═══════════ */}
      <section className="pb-20 sm:pb-28">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <Reveal>
            <figure className="mkt-card mkt-sheen rounded-3xl p-7 sm:p-10">
              <div className="flex flex-col sm:flex-row items-center gap-7">
                <div className="flex gap-0.5 shrink-0">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={18} className="text-orange-400" fill="currentColor" />
                  ))}
                </div>
                <div className="text-center sm:text-left">
                  <blockquote className="text-midnight-100/90 text-lg leading-relaxed">
                    “We used to have 3 employees just for WhatsApp replies. Codeskate AI handles
                    it now — saving us ₹40,000 every month and our response time went from 30
                    minutes to 3 seconds.”
                  </blockquote>
                  <figcaption className="mt-4 text-sm font-semibold text-white">
                    Vikram Saxena{" "}
                    <span className="font-normal text-midnight-300/70">
                      · Director, Meridian Properties
                    </span>
                  </figcaption>
                </div>
              </div>
            </figure>
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
              A customer sends a WhatsApp message.{" "}
              <strong className="text-white font-semibold">3 seconds later</strong>, they get an
              accurate, context-aware reply drawn from your knowledge base. No delays, no missed
              hours, no training required.
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
                  <p className="text-xs text-midnight-300/70 mt-1">{s.label}</p>
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

          {/* Live demo */}
          <Reveal delay={0.1}>
            <div className="mt-12 relative rounded-3xl border border-white/10 bg-midnight-950/60 p-6 sm:p-9 overflow-hidden">
              <div className="absolute inset-0 pattern-grid opacity-50 pointer-events-none" />
              <div className="absolute -top-20 right-10 w-72 h-72 bg-violet-600/15 mkt-bloom" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-6">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-400" />
                  </span>
                  <p className="text-[11px] font-bold text-violet-300 uppercase tracking-[0.14em]">
                    Live AI Demo
                  </p>
                </div>

                <div className="space-y-3 max-w-lg">
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, ease: EASE }}
                    className="flex justify-end"
                  >
                    <div className="bg-emerald-500/12 border border-emerald-400/25 rounded-2xl rounded-tr-md px-4 py-3 max-w-xs">
                      <p className="text-sm text-midnight-100">
                        Hi, what's the price for a 2BHK in Sector 150?
                      </p>
                      <p className="text-[10px] text-midnight-400 mt-1 text-right">
                        Customer — 12:01 PM
                      </p>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.25, ease: EASE }}
                    className="flex justify-start"
                  >
                    <div className="bg-white/[0.06] border border-white/12 rounded-2xl rounded-tl-md px-4 py-3 max-w-sm backdrop-blur">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Brain size={10} className="text-violet-300" />
                        <span className="text-[10px] font-bold text-violet-300">
                          AI Reply — 3 sec
                        </span>
                      </div>
                      <p className="text-sm text-midnight-100">
                        Hello! Our 2BHK apartments in Sector 150 start at ₹45 Lakhs. EMI options
                        available from ₹25,000/month. Would you like to schedule a site visit?
                      </p>
                      <p className="text-[10px] text-midnight-400 mt-1">
                        AI Customer Care — 12:01 PM
                      </p>
                    </div>
                  </motion.div>
                </div>

                <p className="text-xs text-midnight-300/70 mt-5 flex items-center gap-1.5">
                  <BadgeCheck size={13} className="text-emerald-400" />
                  Indistinguishable from a human agent — trained on your actual business knowledge
                </p>
              </div>
            </div>
          </Reveal>
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
            <p className="text-sm text-midnight-300/70 mb-5 flex items-center justify-center gap-2">
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
                  Bridge from ₹2/min · AI Voice Bot from ₹8/min. Top up anytime, minutes never
                  expire while your plan is active.
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
            <p className="mkt-eyebrow mb-4">90+ Features, One Platform</p>
            <h2 className="font-display font-bold text-3xl sm:text-5xl tracking-[-0.025em] text-white mb-5">
              Everything you need — <span className="mkt-text-gradient">one platform</span>
            </h2>
            <p className="text-lg text-midnight-200/75">
              CRM + WhatsApp + AI + Voice + Automation — 5 tools replaced by 1. Simple. Powerful.
              Affordable.
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


      {/* ═══════════ COMPARISON ═══════════ */}
      <section className="relative py-20 sm:py-28">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <Reveal className="text-center mb-14">
            <h2 className="font-display font-bold text-3xl sm:text-5xl tracking-[-0.025em] text-white mb-5">
              What other CRMs <span className="text-rose-400">can't offer</span>
            </h2>
            <p className="text-lg text-midnight-200/75">
              Only on Codeskate CRM — everything on a single platform.
            </p>
          </Reveal>

          <Reveal>
            <div className="mkt-card mkt-sheen rounded-3xl overflow-hidden">
              <div className="grid grid-cols-3 border-b border-white/[0.08] bg-white/[0.03]">
                <div className="p-4 sm:p-5 text-sm font-semibold text-midnight-300">Feature</div>
                <div className="p-4 sm:p-5 text-sm font-bold text-center text-orange-300 border-x border-white/[0.08] bg-orange-500/[0.07]">
                  Codeskate CRM
                </div>
                <div className="p-4 sm:p-5 text-sm font-semibold text-center text-midnight-400">
                  Others
                </div>
              </div>
              {COMPETITORS_MISSING.map((feature, i) => (
                <div
                  key={feature}
                  className={`grid grid-cols-3 transition-colors hover:bg-white/[0.02] ${
                    i < COMPETITORS_MISSING.length - 1 ? "border-b border-white/[0.05]" : ""
                  }`}
                >
                  <div className="p-4 sm:p-5 text-sm text-midnight-100 font-medium">{feature}</div>
                  <div className="p-4 sm:p-5 text-center border-x border-white/[0.05] bg-orange-500/[0.04]">
                    <Check size={18} className="mx-auto text-emerald-400" strokeWidth={3} />
                  </div>
                  <div className="p-4 sm:p-5 text-center">
                    <span className="text-rose-400/70 text-lg leading-none">✗</span>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
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
              Starting at ₹599/month — a full AI-powered CRM for{" "}
              <strong className="text-white font-semibold">₹20/day</strong>. Starter plan includes
              a {TRIAL_DAYS}-day free trial.
            </p>
          </Reveal>

          <Stagger className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 items-start">
            {PRICING_PLANS.map((plan) => (
              <StaggerItem key={plan.name}>
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
                    <p className="text-sm text-midnight-300/75 mt-1">{plan.desc}</p>
                  </div>

                  <div className="mb-6">
                    <span className="font-display font-bold text-4xl text-white tracking-[-0.02em]">
                      ₹{plan.price}
                    </span>
                    <span className="text-midnight-400 text-sm">{plan.period}</span>
                    <div className="flex gap-2.5 mt-2.5 text-xs text-midnight-300/70">
                      <span>{plan.seats}</span>
                      <span className="text-midnight-500">•</span>
                      <span>{plan.leads}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => navigate("/signup")}
                    className={`btn w-full py-3 rounded-xl font-semibold text-sm ${
                      plan.popular ? "mkt-btn-ember" : "mkt-btn-glass"
                    }`}
                  >
                    {plan.cta} <ArrowRight size={15} />
                  </button>

                  <div className="mt-6 space-y-3">
                    {plan.features.map((f) => (
                      <div key={f} className="flex items-start gap-2.5 text-sm">
                        <Check
                          size={15}
                          className="text-emerald-400 shrink-0 mt-0.5"
                          strokeWidth={3}
                        />
                        <span className="text-midnight-200/80">{f}</span>
                      </div>
                    ))}
                    {plan.comingSoon?.map((f) => (
                      <div key={f} className="flex items-start gap-2.5 text-sm">
                        <Clock size={15} className="text-amber-400 shrink-0 mt-0.5" />
                        <span className="text-midnight-300/75">
                          {f}{" "}
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 ml-1">
                            COMING SOON
                          </span>
                        </span>
                      </div>
                    ))}
                    {plan.missing.map((f) => (
                      <div key={f} className="flex items-start gap-2.5 text-sm opacity-35">
                        <span className="w-[15px] text-center text-rose-400 shrink-0">—</span>
                        <span className="text-midnight-300">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          <p className="text-center text-sm text-midnight-300/70 mt-10 leading-relaxed">
            Starter plan includes a {TRIAL_DAYS}-day free trial. No credit card required.
            <br />
            Save <strong className="text-white font-semibold">20%</strong> with yearly billing ·
            Voice calling is a prepaid wallet — pay only for minutes you use.
          </p>
        </div>
      </section>


      {/* ═══════════ TESTIMONIALS ═══════════ */}
      <section className="relative py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <p className="mkt-eyebrow mb-4">Results that speak</p>
            <h2 className="font-display font-bold text-3xl sm:text-5xl tracking-[-0.025em] text-white">
              Real results from <span className="mkt-text-gradient">real teams</span>
            </h2>
          </Reveal>

          <Stagger className="grid sm:grid-cols-2 gap-5">
            {TESTIMONIALS.map((t) => (
              <StaggerItem key={t.name}>
                <figure className="h-full mkt-card mkt-card-hover mkt-sheen rounded-2xl p-7">
                  <div className="flex items-center gap-2.5 mb-5">
                    <div className="flex gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} size={14} className="text-orange-400" fill="currentColor" />
                      ))}
                    </div>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/12 text-emerald-300 border border-emerald-400/20">
                      {t.metric}
                    </span>
                  </div>
                  <blockquote className="text-midnight-100/85 leading-relaxed mb-6">
                    “{t.quote}”
                  </blockquote>
                  <figcaption className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-orange flex items-center justify-center font-bold text-white text-sm shrink-0">
                      {t.name[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-white text-sm">{t.name}</p>
                      <p className="text-xs text-midnight-300/70">{t.role}</p>
                    </div>
                  </figcaption>
                </figure>
              </StaggerItem>
            ))}
          </Stagger>
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
            <p className="mkt-eyebrow mb-4">2 minute setup</p>
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
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
                  <span className="text-xs font-semibold text-white">
                    12,400+ AI replies sent just today
                  </span>
                </div>

                <h2 className="font-display font-bold text-3xl sm:text-5xl lg:text-[3.5rem] leading-[1.08] tracking-[-0.03em] text-white mb-6">
                  Your next customer is messaging right now.
                  <br />
                  <span className="mkt-text-gradient">Be the one who replies first.</span>
                </h2>

                <p className="text-lg text-midnight-200/80 max-w-xl mx-auto mb-9 leading-relaxed">
                  The average business takes 30 minutes to reply. Codeskate customers reply in 3
                  seconds.
                  <br />
                  That gap is where deals are won.
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

                <p className="text-sm text-midnight-300/70 mt-7">
                  {TRIAL_DAYS}-day free trial. No credit card. 2 minute setup. Cancel anytime.
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
