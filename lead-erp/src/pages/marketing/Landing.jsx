import { useNavigate } from "react-router-dom";
import {
  ArrowRight, MessageSquare, Users, Zap, BarChart3, Bell, ShieldCheck,
  Phone, Target, Workflow, Star, Check, Sparkles, TrendingUp, Clock,
  Brain, Bot, BookOpen, PhoneCall, Headphones, Rocket, Globe2,
  AlertTriangle, Crown, ChevronRight, Play, BadgeCheck, Timer,
  MessageCircle, GitBranch, Building2, CreditCard, Lock, Layers,
} from "lucide-react";
import MarketingNav from "../../components/marketing/MarketingNav";
import MarketingFooter from "../../components/marketing/MarketingFooter";
import { TRIAL_DAYS } from "../../data/plans";


const URGENCY_STATS = [
  { value: "3 sec", label: "AI reply time", icon: Timer },
  { value: "70%", label: "queries auto-resolved", icon: Bot },
  { value: "24/7", label: "availability", icon: Clock },
  { value: "₹0.04", label: "per AI reply", icon: Zap },
];

const COMPETITORS_MISSING = [
  "AI WhatsApp Auto-Reply",
  "Knowledge Base Training",
  "Workflow Automation Engine",
  "Auto-Dialer Call Center",
  "Real-time Lead Assignment",
  "Native Call Tracking",
];

const AI_FEATURES = [
  { icon: Brain, title: "AI Auto-Reply", desc: "Customer ka WhatsApp message aate hi 3 seconds me intelligent reply — 24/7, bina kisi employee ke.", badge: "LIVE" },
  { icon: BookOpen, title: "Knowledge Base Training", desc: "Apni pricing, FAQs, policies upload karo — AI exactly wohi info dega jo tum chahte ho. Galat info kabhi nahi.", badge: "SMART" },
  { icon: Target, title: "Intent Classification", desc: "AI har message ka intent samajhta hai — pricing, booking, complaint, support — aur accordingly respond karta hai.", badge: "AI" },
  { icon: Headphones, title: "Smart Escalation", desc: "Complex query? AI automatically human agent ko handover karta hai with full context. Customer ko repeat nahi karna padta.", badge: "HYBRID" },
];

const POWER_FEATURES = [
  { icon: MessageSquare, title: "WhatsApp Business API", desc: "Har enquiry instantly CRM me — koi lead kabhi miss nahi hoti." },
  { icon: Workflow, title: "Smart Auto-Assignment", desc: "Round-robin ya workload-based — sahi lead sahi rep ko milti hai." },
  { icon: Phone, title: "Native Call Tracking", desc: "Har call automatically log — employee ko kuch karna nahi padta." },
  { icon: GitBranch, title: "Workflow Automation", desc: "If-this-then-that rules — assign, escalate, remind, message — sab automatic." },
  { icon: Bell, title: "SLA Escalation", desc: "Idle lead? Manager ko auto-alert. Koi lead cold nahi hone denge." },
  { icon: BarChart3, title: "Live Analytics", desc: "Pipeline, conversion, revenue — ek dashboard me sab dikhai deta hai." },
  { icon: PhoneCall, title: "Auto-Dialer (Coming Soon)", desc: "System dial kare, employee baat kare. Manual dialing ki zaroorat nahi.", badge: "SOON" },
  { icon: Lock, title: "Enterprise Security", desc: "Bank-level encryption, role-based access, complete data isolation." },
  { icon: Building2, title: "Multi-Org Support", desc: "Multiple branches? Har ek ka data isolated, ek login se manage." },
];


const TESTIMONIALS = [
  {
    quote: "Pehle 3 employees sirf WhatsApp reply karte the. Ab AI handle karta hai — ₹40,000/month saved. Regret hai ki pehle kyun nahi liya.",
    name: "Vikram Saxena",
    role: "Director, Meridian Properties",
    metric: "₹40K/mo saved",
  },
  {
    quote: "Raat 11 baje bhi customer ko instant reply milta hai. Pehle subah tak lead cold ho jaati thi. Ab conversion 3x ho gaya.",
    name: "Ananya Reddy",
    role: "Sales Head, BrightHomes",
    metric: "3x conversions",
  },
  {
    quote: "Auto-assignment + follow-up automation ne meri team ki productivity double kar di. Ab koi lead idle nahi rehti.",
    name: "Rohan Mehta",
    role: "Founder, EduLeap Academy",
    metric: "2x productivity",
  },
  {
    quote: "Humne 5 different tools use kiye the — CRM, WhatsApp tool, calling, automation. Ab sab ek jagah hai. Simple.",
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
    desc: "Solo agents getting started",
    seats: "3 users",
    leads: "1,000 leads",
    cta: "Start free trial",
    features: ["WhatsApp lead capture", "Auto-assignment", "Mobile app", "Call tracking", "Basic analytics"],
    missing: ["AI Customer Care", "Workflow automation", "Priority support"],
  },
  {
    name: "Growth",
    price: "1,499",
    period: "/mo",
    desc: "Growing teams that want AI power",
    seats: "10 users",
    leads: "10,000 leads",
    popular: true,
    cta: "Start free trial",
    features: ["Everything in Starter", "AI Auto-Reply (2,000/mo)", "Workflow automation", "Goals & performance", "Full audit log", "Priority support"],
    missing: ["Unlimited AI", "Auto-dialer"],
  },
  {
    name: "Scale",
    price: "3,499",
    period: "/mo",
    desc: "Sales operations at full speed",
    seats: "25 users",
    leads: "50,000 leads",
    cta: "Contact sales",
    features: ["Everything in Growth", "Unlimited AI replies", "Auto-dialer (coming soon)", "API access & webhooks", "Dedicated account manager", "Custom onboarding"],
    missing: [],
  },
];

const FOMO_COUNTERS = [
  { label: "leads managed this month", value: "2,34,000+" },
  { label: "AI replies sent today", value: "12,400+" },
  { label: "businesses growing with us", value: "180+" },
];


export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-cream-100 overflow-x-hidden">
      <MarketingNav />

      {/* ============ HERO — FOMO DRIVEN ============ */}
      <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 texture-grain">
        <div className="absolute top-20 -right-20 w-[28rem] h-[28rem] bg-orange-300/30 rounded-full blur-3xl animate-blob pointer-events-none" />
        <div className="absolute -bottom-10 -left-24 w-[26rem] h-[26rem] bg-ember-300/25 rounded-full blur-3xl animate-blob pointer-events-none" style={{ animationDelay: "4s" }} />
        <div className="absolute inset-0 pattern-dots opacity-60 pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 text-center">
          {/* Urgency badge */}
          <div className="inline-flex items-center gap-2 bg-red-50 border border-red-200 rounded-full px-4 py-1.5 mb-4 shadow-sm animate-fade-in">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <span className="text-xs font-bold text-red-700">
              Abhi bhi manually reply kar rahe ho? Har minute ek lead cold ho rahi hai.
            </span>
          </div>

          <h1 className="font-display font-bold text-4xl sm:text-6xl lg:text-7xl leading-[1.05] text-ink mb-6 animate-slide-up">
            Tumhara competitor <span className="text-gradient">AI</span> use kar raha hai.
            <br />
            <span className="text-gradient">Tum kab shuru karoge?</span>
          </h1>

          <p className="text-lg sm:text-xl text-ink-soft max-w-2xl mx-auto mb-5 leading-relaxed animate-slide-up-delay">
            Codeskate CRM — India ka pehla AI-powered sales platform jo <strong>3 seconds</strong> me WhatsApp reply karta hai,
            leads auto-assign karta hai, aur tumhare liye <strong>24/7 kaam karta hai</strong> — bina kisi extra employee ke.
          </p>

          {/* Social proof line */}
          <p className="text-sm text-ink-muted mb-8 animate-slide-up-delay flex items-center justify-center gap-2 flex-wrap">
            <span className="inline-flex -space-x-2">
              {["V", "A", "R", "P", "S"].map((l, i) => (
                <span key={i} className="w-7 h-7 rounded-full bg-gradient-orange/20 border-2 border-white flex items-center justify-center text-[10px] font-bold text-orange-700">{l}</span>
              ))}
            </span>
            <span><strong>180+ businesses</strong> already growing — join before your market does.</span>
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6 animate-slide-up-delay">
            <button onClick={() => navigate("/signup")} className="btn btn-primary text-base px-8 py-4 w-full sm:w-auto shadow-glow">
              <Rocket size={18} />
              Shuru Karo — {TRIAL_DAYS} Din Free
              <ArrowRight size={18} />
            </button>
            <button onClick={() => navigate("/pricing")} className="btn btn-secondary text-base px-7 py-3.5 w-full sm:w-auto">
              Pricing Dekho
            </button>
          </div>

          <p className="text-sm text-ink-muted flex items-center justify-center gap-4">
            <span className="flex items-center gap-1"><Check size={14} className="text-success-500" /> No credit card</span>
            <span className="flex items-center gap-1"><Check size={14} className="text-success-500" /> 2 min setup</span>
            <span className="flex items-center gap-1"><Check size={14} className="text-success-500" /> Cancel anytime</span>
          </p>
        </div>
      </section>


      {/* ============ LIVE COUNTER BAR — FOMO ============ */}
      <section className="relative bg-ink texture-grain py-10">
        <div className="absolute inset-0 pattern-grid opacity-20" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {FOMO_COUNTERS.map((c) => (
              <div key={c.label} className="text-center">
                <p className="font-display font-bold text-3xl sm:text-4xl text-orange-400 mb-1">{c.value}</p>
                <p className="text-sm text-cream-300/80">{c.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FEAR SECTION — What You're Losing ============ */}
      <section className="py-16 sm:py-24 bg-red-50/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-red-100 rounded-full px-4 py-1.5 mb-4">
              <AlertTriangle size={14} className="text-red-600" />
              <span className="text-xs font-bold text-red-700">Reality Check</span>
            </div>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-ink mb-4">
              Har din bina AI ke = <span className="text-red-600">paise barbaad</span>
            </h2>
            <p className="text-lg text-ink-soft max-w-2xl mx-auto">
              Ye numbers jhooth nahi bolte. Jab tak tum manually kaam kar rahe ho, tumhare competitors aage nikal rahe hain.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { problem: "30 min reply time", cost: "40% leads lost", icon: Clock },
              { problem: "No after-hours reply", cost: "35% enquiries wasted", icon: Clock },
              { problem: "3 employees for replies", cost: "₹45,000/month burnt", icon: Users },
              { problem: "Manual lead assignment", cost: "20 min avg delay", icon: Target },
              { problem: "No follow-up system", cost: "60% leads go cold", icon: Bell },
              { problem: "Multiple disconnected tools", cost: "₹10,000+/month extra", icon: Layers },
            ].map((item) => (
              <div key={item.problem} className="bg-white rounded-2xl border border-red-100 p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                    <AlertTriangle size={18} className="text-red-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-ink mb-1">{item.problem}</p>
                    <p className="text-sm text-red-600 font-medium">{item.cost}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-10">
            <button onClick={() => navigate("/signup")} className="btn btn-primary text-base px-8 py-3.5">
              <Zap size={18} />
              Ye Problems Aaj Hi Solve Karo
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>


      {/* ============ AI SECTION — Hero Feature ============ */}
      <section className="py-20 sm:py-28 relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-200/30 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-full px-4 py-1.5 mb-4">
              <Brain size={14} className="text-purple-600" />
              <span className="text-xs font-bold text-purple-700">AI-Powered — India's First</span>
            </div>
            <h2 className="font-display font-bold text-3xl sm:text-5xl text-ink mb-5">
              AI jo tumhare liye <span className="text-gradient">baat karta hai</span>
            </h2>
            <p className="text-lg text-ink-soft">
              Customer ne WhatsApp pe message kiya → <strong>3 seconds</strong> me AI ne intelligent reply de diya.
              Employee ko pata bhi nahi chala. Customer ko laga human reply kar raha hai. <strong>Magic.</strong>
            </p>
          </div>

          {/* AI Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12">
            {URGENCY_STATS.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="bg-white rounded-2xl border border-purple-100 p-5 text-center shadow-sm">
                  <Icon size={20} className="mx-auto text-purple-500 mb-2" />
                  <p className="font-display font-bold text-2xl text-ink">{s.value}</p>
                  <p className="text-xs text-ink-muted mt-1">{s.label}</p>
                </div>
              );
            })}
          </div>

          {/* AI Feature Cards */}
          <div className="grid sm:grid-cols-2 gap-6">
            {AI_FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="group bg-white rounded-2xl border border-cream-300/60 p-7 shadow-card hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                  {f.badge && (
                    <span className="absolute top-4 right-4 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">{f.badge}</span>
                  )}
                  <div className="w-12 h-12 rounded-xl bg-purple-100 group-hover:bg-purple-600 flex items-center justify-center mb-5 transition-colors duration-300">
                    <Icon size={22} className="text-purple-600 group-hover:text-white transition-colors duration-300" />
                  </div>
                  <h3 className="font-display font-semibold text-lg text-ink mb-2">{f.title}</h3>
                  <p className="text-sm text-ink-soft leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>

          {/* AI Demo Visual */}
          <div className="mt-12 bg-ink rounded-3xl p-6 sm:p-8 texture-grain shadow-soft relative overflow-hidden">
            <div className="pattern-grid absolute inset-0 opacity-20 rounded-3xl" />
            <div className="relative">
              <p className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-4">Live AI Demo</p>
              <div className="space-y-3 max-w-lg">
                <div className="flex justify-end">
                  <div className="bg-emerald-600/20 border border-emerald-500/30 rounded-2xl rounded-tr-md px-4 py-2.5 max-w-xs">
                    <p className="text-sm text-cream-100">Hi, 2BHK ka price kya hai Sector 150 me?</p>
                    <p className="text-[10px] text-cream-400 mt-1 text-right">Customer — 12:01 PM</p>
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="bg-white/10 border border-white/20 rounded-2xl rounded-tl-md px-4 py-2.5 max-w-sm">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Brain size={10} className="text-purple-400" />
                      <span className="text-[10px] font-bold text-purple-400">AI Reply — 3 sec</span>
                    </div>
                    <p className="text-sm text-cream-100">Namaste! Sector 150 me humare 2BHK flats ₹45 Lakh se start hain. EMI ₹25,000/month se available hai. Kya aap site visit schedule karna chahenge?</p>
                    <p className="text-[10px] text-cream-400 mt-1">AI Customer Care — 12:01 PM</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-cream-500 mt-4 flex items-center gap-1.5">
                <BadgeCheck size={12} className="text-emerald-400" />
                Customer ko pata nahi chalta AI reply kar raha hai — natural conversation
              </p>
            </div>
          </div>
        </div>
      </section>


      {/* ============ ALL FEATURES ============ */}
      <section id="features" className="relative py-20 sm:py-28 bg-cream-50 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="eyebrow mb-3">86+ Features, One Platform</p>
            <h2 className="font-display font-bold text-3xl sm:text-5xl text-ink mb-4">
              Sab kuch jo chahiye — <span className="text-gradient">ek jagah</span>
            </h2>
            <p className="text-lg text-ink-soft">
              CRM + WhatsApp + AI + Automation + Call Center — 5 tools ki jagah 1. Simple. Powerful. Affordable.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {POWER_FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="group bg-white rounded-2xl border border-cream-300/60 p-6 shadow-card hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 relative">
                  {f.badge && (
                    <span className="absolute top-3 right-3 text-[9px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{f.badge}</span>
                  )}
                  <div className="w-11 h-11 rounded-xl bg-gradient-orange/10 group-hover:bg-gradient-orange flex items-center justify-center mb-4 transition-colors duration-300">
                    <Icon size={20} className="text-orange-600 group-hover:text-white transition-colors duration-300" />
                  </div>
                  <h3 className="font-display font-semibold text-base text-ink mb-1.5">{f.title}</h3>
                  <p className="text-sm text-ink-soft leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ COMPARISON — What competitors don't have ============ */}
      <section className="py-16 sm:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-ink mb-4">
              Doosre CRMs me ye <span className="text-red-500">nahi milega</span>
            </h2>
            <p className="text-lg text-ink-soft">Sirf Codeskate CRM me — sab ek platform pe.</p>
          </div>

          <div className="bg-white rounded-3xl border border-cream-300/60 overflow-hidden shadow-card">
            <div className="grid grid-cols-3 gap-0 border-b border-cream-200 bg-cream-50">
              <div className="p-4 text-sm font-semibold text-ink-muted">Feature</div>
              <div className="p-4 text-sm font-bold text-center text-orange-600 border-x border-cream-200 bg-orange-50/50">Codeskate CRM</div>
              <div className="p-4 text-sm font-semibold text-center text-ink-muted">Others</div>
            </div>
            {COMPETITORS_MISSING.map((feature, i) => (
              <div key={feature} className={`grid grid-cols-3 gap-0 ${i < COMPETITORS_MISSING.length - 1 ? "border-b border-cream-100" : ""}`}>
                <div className="p-4 text-sm text-ink font-medium">{feature}</div>
                <div className="p-4 text-center border-x border-cream-100 bg-orange-50/30">
                  <Check size={18} className="mx-auto text-emerald-500" />
                </div>
                <div className="p-4 text-center">
                  <span className="text-red-400 text-lg">✗</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ============ PRICING ============ */}
      <section id="pricing" className="py-20 sm:py-28 bg-cream-50 texture-grain scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="eyebrow mb-3">Simple pricing</p>
            <h2 className="font-display font-bold text-3xl sm:text-5xl text-ink mb-4">
              Ek employee se <span className="text-gradient">sasta</span>
            </h2>
            <p className="text-lg text-ink-soft">
              ₹599/month se shuru — matlab <strong>₹20/din</strong> me poora AI-powered CRM. Ek chai se bhi sasta.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {PRICING_PLANS.map((plan) => (
              <div key={plan.name} className={`relative bg-white rounded-3xl border p-7 shadow-card transition-all hover:-translate-y-1 hover:shadow-card-hover ${plan.popular ? "border-orange-300 ring-2 ring-orange-200" : "border-cream-300/60"}`}>
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-gradient-orange text-white text-[11px] font-bold px-4 py-1 rounded-full shadow-glow">MOST POPULAR</span>
                  </div>
                )}
                <div className="mb-5">
                  <h3 className="font-display font-bold text-xl text-ink">{plan.name}</h3>
                  <p className="text-sm text-ink-muted mt-1">{plan.desc}</p>
                </div>
                <div className="mb-5">
                  <span className="font-display font-bold text-4xl text-ink">₹{plan.price}</span>
                  <span className="text-ink-muted text-sm">{plan.period}</span>
                  <div className="flex gap-3 mt-2 text-xs text-ink-muted">
                    <span>{plan.seats}</span>
                    <span>•</span>
                    <span>{plan.leads}</span>
                  </div>
                </div>
                <button onClick={() => navigate("/signup")} className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${plan.popular ? "btn btn-primary" : "btn btn-secondary"}`}>
                  {plan.cta} <ArrowRight size={15} />
                </button>
                <div className="mt-5 space-y-2.5">
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-start gap-2 text-sm">
                      <Check size={15} className="text-emerald-500 shrink-0 mt-0.5" />
                      <span className="text-ink-soft">{f}</span>
                    </div>
                  ))}
                  {plan.missing.map((f) => (
                    <div key={f} className="flex items-start gap-2 text-sm opacity-40">
                      <span className="w-[15px] text-center text-red-400 shrink-0">—</span>
                      <span className="text-ink-muted">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-ink-muted mt-8">
            Sab plans me {TRIAL_DAYS}-day free trial included. No credit card required.
            <br />Yearly billing pe <strong>20% discount</strong>.
          </p>
        </div>
      </section>


      {/* ============ TESTIMONIALS ============ */}
      <section className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="eyebrow mb-3">Results that speak</p>
            <h2 className="font-display font-bold text-3xl sm:text-5xl text-ink">
              Log <span className="text-gradient">regret</span> kar rahe hain ki pehle kyun nahi liya
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="bg-white rounded-2xl border border-cream-300/60 p-7 shadow-card hover:shadow-card-hover transition-shadow">
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} size={14} className="text-orange-400" fill="currentColor" />
                    ))}
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{t.metric}</span>
                </div>
                <p className="text-ink-soft leading-relaxed mb-5 italic">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-orange/15 flex items-center justify-center font-bold text-orange-700 text-sm">
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

      {/* ============ HOW IT WORKS ============ */}
      <section id="how" className="relative py-20 sm:py-28 bg-gradient-warm texture-grain scroll-mt-16">
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="eyebrow mb-3">2 minute setup</p>
            <h2 className="font-display font-bold text-3xl sm:text-5xl text-ink mb-4">
              Itna <span className="text-gradient">simple</span> hai ki samjhane ki zaroorat nahi
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {[
              { n: "01", title: "Sign up karo", desc: "Phone number se 30 second me workspace ready. Koi paperwork nahi, koi call nahi." },
              { n: "02", title: "WhatsApp connect karo", desc: "Ek click me WhatsApp Business connect. AI enable karo aur knowledge base fill karo." },
              { n: "03", title: "Deals close karo", desc: "Leads auto-aayengi, AI reply karega, team follow-up karegi. Tum sirf growth dekho." },
            ].map((s, i) => (
              <div key={s.n} className="relative">
                <div className="bg-white rounded-2xl border border-cream-300/60 p-8 shadow-card h-full">
                  <div className="font-display font-bold text-5xl text-orange-200 mb-4">{s.n}</div>
                  <h3 className="font-display font-semibold text-xl text-ink mb-3">{s.title}</h3>
                  <p className="text-ink-soft leading-relaxed">{s.desc}</p>
                </div>
                {i < 2 && (
                  <ArrowRight className="hidden md:block absolute top-1/2 -right-5 -translate-y-1/2 text-orange-300 z-10" size={28} />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ============ FINAL CTA — Maximum FOMO ============ */}
      <section className="py-20 sm:py-28">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="relative bg-gradient-ember rounded-3xl p-10 sm:p-16 text-center overflow-hidden texture-grain shadow-glow-lg">
            <div className="absolute -top-16 -right-16 w-64 h-64 bg-orange-300/30 rounded-full blur-3xl" />
            <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-cream-200/20 rounded-full blur-3xl" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-1.5 mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                </span>
                <span className="text-xs font-bold text-white">12,400+ AI replies sent just today</span>
              </div>

              <h2 className="font-display font-bold text-3xl sm:text-5xl text-white mb-5">
                Tumhara agla customer abhi message kar raha hai.
                <br />
                <span className="text-orange-200">Kaun reply karega?</span>
              </h2>
              <p className="text-lg text-cream-100/90 max-w-xl mx-auto mb-9">
                Tum? (30 min baad, jab wo already competitor se baat kar chuka hoga)
                <br />
                Ya <strong>tumhara AI?</strong> (3 seconds me, perfect reply, 24/7)
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => navigate("/signup")}
                  className="btn bg-white text-ember-700 hover:bg-cream-100 text-base px-8 py-4 w-full sm:w-auto font-bold shadow-lg"
                >
                  <Rocket size={18} />
                  Abhi Shuru Karo — Free
                  <ArrowRight size={18} />
                </button>
                <button
                  onClick={() => navigate("/pricing")}
                  className="btn bg-white/15 text-white border border-white/30 hover:bg-white/25 text-base px-8 py-3.5 w-full sm:w-auto"
                >
                  Plans Compare Karo
                </button>
              </div>
              <p className="text-sm text-cream-200/70 mt-6">
                {TRIAL_DAYS} din free. No credit card. 2 minute setup. Cancel anytime.
              </p>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
