import { useNavigate } from "react-router-dom";
import {
  ArrowRight, MessageSquare, Users, Zap, BarChart3, Bell, ShieldCheck,
  Phone, Target, Workflow, Star, Check, Sparkles, TrendingUp, Clock,
} from "lucide-react";
import MarketingNav from "../../components/marketing/MarketingNav";
import MarketingFooter from "../../components/marketing/MarketingFooter";
import { TRIAL_DAYS } from "../../data/plans";

const FEATURES = [
  {
    icon: MessageSquare,
    title: "WhatsApp Lead Capture",
    desc: "Every enquiry from your WhatsApp Business number lands in CodeSkate instantly — no lead ever slips through.",
  },
  {
    icon: Workflow,
    title: "Smart Auto-Assignment",
    desc: "Round-robin or workload-based distribution routes each lead to the right rep the moment it arrives.",
  },
  {
    icon: Phone,
    title: "Native Call Tracking",
    desc: "Our Android app logs every call automatically, so follow-ups and outcomes are captured hands-free.",
  },
  {
    icon: BarChart3,
    title: "Live Sales Analytics",
    desc: "Pipeline value, conversion rates and source performance — all on one beautiful command center.",
  },
  {
    icon: Target,
    title: "Goals & Performance",
    desc: "Set targets per rep, track progress in real time, and celebrate wins with leaderboards.",
  },
  {
    icon: Bell,
    title: "SLA Escalations",
    desc: "Idle leads get flagged automatically so nothing goes cold. Stay on top of every opportunity.",
  },
];

const STEPS = [
  { n: "01", title: "Create your workspace", desc: "Sign up with your phone in seconds and spin up an isolated organization for your team." },
  { n: "02", title: "Connect your channels", desc: "Plug in your WhatsApp number and invite your sales reps to their own seats." },
  { n: "03", title: "Close more deals", desc: "Leads flow in, get assigned, and your team works them from a single, delightful workspace." },
];

const STATS = [
  { value: "40%", label: "faster response time" },
  { value: "2.5x", label: "more leads converted" },
  { value: "10k+", label: "leads managed monthly" },
  { value: "99.9%", label: "uptime guarantee" },
];

const TESTIMONIALS = [
  {
    quote: "CodeSkate transformed how our team handles WhatsApp enquiries. We stopped losing leads overnight.",
    name: "Ananya Reddy",
    role: "Sales Head, BrightHomes",
  },
  {
    quote: "The auto-assignment and call tracking alone paid for the subscription in the first week.",
    name: "Rohan Mehta",
    role: "Founder, EduLeap",
  },
  {
    quote: "Finally a CRM that feels built for Indian sales teams. Beautiful, fast, and dead simple.",
    name: "Priya Nair",
    role: "Ops Manager, UrbanFit",
  },
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-cream-100 overflow-x-hidden">
      <MarketingNav />

      {/* ============ HERO ============ */}
      <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 texture-grain">
        {/* decorative blobs */}
        <div className="absolute top-20 -right-20 w-[28rem] h-[28rem] bg-orange-300/30 rounded-full blur-3xl animate-blob pointer-events-none" />
        <div className="absolute -bottom-10 -left-24 w-[26rem] h-[26rem] bg-ember-300/25 rounded-full blur-3xl animate-blob pointer-events-none" style={{ animationDelay: "4s" }} />
        <div className="absolute inset-0 pattern-dots opacity-60 pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-white/70 backdrop-blur border border-orange-200 rounded-full px-4 py-1.5 mb-7 shadow-sm animate-fade-in">
            <Sparkles size={14} className="text-orange-500" />
            <span className="text-xs font-semibold text-ember-700">
              The lead engine for modern sales teams
            </span>
          </div>

          <h1 className="font-display font-bold text-4xl sm:text-6xl lg:text-7xl leading-[1.05] text-ink mb-6 animate-slide-up">
            Turn every enquiry
            <br />
            into a <span className="text-gradient">closed deal</span>
          </h1>

          <p className="text-lg sm:text-xl text-ink-soft max-w-2xl mx-auto mb-9 leading-relaxed animate-slide-up-delay">
            CodeSkate captures leads from WhatsApp, assigns them intelligently, tracks
            every call, and shows your whole pipeline — so your team can focus on selling.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6 animate-slide-up-delay">
            <button onClick={() => navigate("/signup")} className="btn btn-primary text-base px-7 py-3.5 w-full sm:w-auto">
              Start your {TRIAL_DAYS}-day free trial
              <ArrowRight size={18} />
            </button>
            <button onClick={() => navigate("/pricing")} className="btn btn-secondary text-base px-7 py-3.5 w-full sm:w-auto">
              View pricing
            </button>
          </div>

          <p className="text-sm text-ink-muted flex items-center justify-center gap-2">
            <Check size={15} className="text-success-500" />
            No credit card required · Cancel anytime
          </p>

          {/* Hero mockup card */}
          <div className="relative mt-16 max-w-4xl mx-auto animate-slide-up-delay">
            <div className="absolute inset-x-8 -top-6 h-24 bg-gradient-orange/30 blur-2xl rounded-full" />
            <div className="relative bg-white rounded-3xl shadow-soft border border-cream-300/70 overflow-hidden">
              {/* window bar */}
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-cream-200 bg-cream-50">
                <span className="w-3 h-3 rounded-full bg-danger-400" />
                <span className="w-3 h-3 rounded-full bg-warning-400" />
                <span className="w-3 h-3 rounded-full bg-success-400" />
                <span className="ml-3 text-xs text-ink-muted font-mono">app.codeskate.io/dashboard</span>
              </div>
              {/* fake dashboard */}
              <div className="p-6 bg-cream-50/50">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  {[
                    { l: "Revenue Won", v: "₹12.4L", t: "text-success-600" },
                    { l: "Pipeline", v: "₹31.8L", t: "text-orange-600" },
                    { l: "Conversion", v: "28.5%", t: "text-ember-600" },
                    { l: "Hot Leads", v: "47", t: "text-danger-600" },
                  ].map((s) => (
                    <div key={s.l} className="bg-white rounded-xl border border-cream-300/60 p-3 text-left shadow-sm">
                      <p className="text-[10px] uppercase tracking-wider text-ink-muted font-semibold mb-1">{s.l}</p>
                      <p className={`text-lg font-bold font-mono ${s.t}`}>{s.v}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-xl border border-cream-300/60 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-ink">Recent Leads</span>
                    <span className="badge badge-primary">Live</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { n: "Rahul Sharma", s: "WhatsApp", st: "New", c: "badge-primary" },
                      { n: "Priya Patel", s: "Referral", st: "Qualified", c: "badge-success" },
                      { n: "Amit Kumar", s: "Website", st: "Follow-up", c: "badge-warning" },
                    ].map((r) => (
                      <div key={r.n} className="flex items-center justify-between text-sm py-1.5 border-b border-cream-100 last:border-0">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-gradient-orange/15 flex items-center justify-center text-xs font-bold text-orange-700">
                            {r.n[0]}
                          </div>
                          <span className="font-medium text-ink">{r.n}</span>
                          <span className="text-ink-muted text-xs hidden sm:inline">via {r.s}</span>
                        </div>
                        <span className={`badge ${r.c}`}>{r.st}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ STATS BAR ============ */}
      <section className="relative bg-ink texture-grain py-12">
        <div className="absolute inset-0 pattern-grid opacity-20" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="font-display font-bold text-3xl sm:text-4xl text-orange-400 mb-1">{s.value}</p>
              <p className="text-sm text-cream-300/80">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ FEATURES ============ */}
      <section id="features" className="relative py-20 sm:py-28 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="eyebrow mb-3">Everything you need</p>
            <h2 className="font-display font-bold text-3xl sm:text-5xl text-ink mb-4">
              One platform for your entire{" "}
              <span className="text-gradient">sales workflow</span>
            </h2>
            <p className="text-lg text-ink-soft">
              From the first WhatsApp message to the closed deal, CodeSkate handles it all
              with tools built for how Indian sales teams actually work.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="group bg-white rounded-2xl border border-cream-300/60 p-7 shadow-card hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-orange/10 group-hover:bg-gradient-orange flex items-center justify-center mb-5 transition-colors duration-300">
                    <Icon size={22} className="text-orange-600 group-hover:text-white transition-colors duration-300" />
                  </div>
                  <h3 className="font-display font-semibold text-lg text-ink mb-2">{f.title}</h3>
                  <p className="text-sm text-ink-soft leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section id="how" className="relative py-20 sm:py-28 bg-gradient-warm texture-grain scroll-mt-16">
        <div className="absolute top-10 right-10 w-72 h-72 bg-orange-300/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="eyebrow mb-3">Live in minutes</p>
            <h2 className="font-display font-bold text-3xl sm:text-5xl text-ink mb-4">
              Get started in <span className="text-gradient">3 simple steps</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {STEPS.map((s, i) => (
              <div key={s.n} className="relative">
                <div className="bg-white rounded-2xl border border-cream-300/60 p-8 shadow-card h-full">
                  <div className="font-display font-bold text-5xl text-orange-200 mb-4">{s.n}</div>
                  <h3 className="font-display font-semibold text-xl text-ink mb-3">{s.title}</h3>
                  <p className="text-ink-soft leading-relaxed">{s.desc}</p>
                </div>
                {i < STEPS.length - 1 && (
                  <ArrowRight className="hidden md:block absolute top-1/2 -right-5 -translate-y-1/2 text-orange-300 z-10" size={28} />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ WHAT YOU GET / VALUE ============ */}
      <section className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <p className="eyebrow mb-3">Built for growth</p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-ink mb-6 leading-tight">
              Everything your team gets from day one
            </h2>
            <div className="space-y-4">
              {[
                { icon: Users, t: "Multi-tenant workspaces", d: "Your data is fully isolated and secure — invite your whole team with role-based access." },
                { icon: TrendingUp, t: "Real-time pipeline visibility", d: "See exactly where every deal stands and where revenue is coming from." },
                { icon: Clock, t: "Never miss a follow-up", d: "Automatic reminders and SLA alerts keep every lead warm." },
                { icon: ShieldCheck, t: "Enterprise-grade security", d: "Bank-level encryption and strict tenant isolation on every record." },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.t} className="flex gap-4">
                    <div className="w-11 h-11 shrink-0 rounded-xl bg-orange-100 flex items-center justify-center">
                      <Icon size={20} className="text-orange-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-ink mb-0.5">{item.t}</h4>
                      <p className="text-sm text-ink-soft leading-relaxed">{item.d}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={() => navigate("/signup")} className="btn btn-primary mt-8">
              Get started free
              <ArrowRight size={18} />
            </button>
          </div>

          {/* Value visual */}
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-orange/20 blur-3xl rounded-full" />
            <div className="relative bg-ink rounded-3xl p-8 texture-grain shadow-soft">
              <div className="pattern-grid absolute inset-0 opacity-20 rounded-3xl" />
              <div className="relative space-y-4">
                <div className="flex items-center justify-between bg-white/5 rounded-xl p-4 border border-white/10">
                  <span className="text-cream-200 text-sm">Leads captured today</span>
                  <span className="font-mono font-bold text-orange-400 text-xl">128</span>
                </div>
                <div className="flex items-center justify-between bg-white/5 rounded-xl p-4 border border-white/10">
                  <span className="text-cream-200 text-sm">Avg. response time</span>
                  <span className="font-mono font-bold text-success-400 text-xl">2m 14s</span>
                </div>
                <div className="flex items-center justify-between bg-gradient-orange rounded-xl p-4 shadow-glow">
                  <span className="text-white text-sm font-medium">Deals closed this month</span>
                  <span className="font-mono font-bold text-white text-xl">₹8.2L</span>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-2">
                  {[70, 45, 90].map((h, i) => (
                    <div key={i} className="bg-white/5 rounded-lg p-2 flex items-end h-24 border border-white/10">
                      <div className="w-full bg-gradient-orange rounded" style={{ height: `${h}%` }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ TESTIMONIALS ============ */}
      <section className="py-20 sm:py-28 bg-cream-50 texture-grain">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="eyebrow mb-3">Loved by sales teams</p>
            <h2 className="font-display font-bold text-3xl sm:text-5xl text-ink">
              Teams close faster with CodeSkate
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="bg-white rounded-2xl border border-cream-300/60 p-7 shadow-card">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={16} className="text-orange-400" fill="currentColor" />
                  ))}
                </div>
                <p className="text-ink-soft leading-relaxed mb-6">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-orange/15 flex items-center justify-center font-bold text-orange-700">
                    {t.name[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-ink text-sm">{t.name}</p>
                    <p className="text-xs text-ink-muted">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="py-20 sm:py-28">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="relative bg-gradient-ember rounded-3xl p-10 sm:p-16 text-center overflow-hidden texture-grain shadow-glow-lg">
            <div className="absolute -top-16 -right-16 w-64 h-64 bg-orange-300/30 rounded-full blur-3xl" />
            <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-cream-200/20 rounded-full blur-3xl" />
            <div className="relative">
              <h2 className="font-display font-bold text-3xl sm:text-5xl text-white mb-5">
                Ready to close more deals?
              </h2>
              <p className="text-lg text-cream-100/90 max-w-xl mx-auto mb-9">
                Join growing teams using CodeSkate to capture, assign, and convert leads faster.
                Start your free {TRIAL_DAYS}-day trial today.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => navigate("/signup")}
                  className="btn bg-white text-ember-700 hover:bg-cream-100 text-base px-8 py-3.5 w-full sm:w-auto font-bold shadow-lg"
                >
                  Start free trial
                  <ArrowRight size={18} />
                </button>
                <button
                  onClick={() => navigate("/pricing")}
                  className="btn bg-white/15 text-white border border-white/30 hover:bg-white/25 text-base px-8 py-3.5 w-full sm:w-auto"
                >
                  Compare plans
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
