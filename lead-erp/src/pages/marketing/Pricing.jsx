import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X, ArrowRight, Sparkles, ChevronDown, PhoneForwarded, Bot, Wallet } from "lucide-react";
import MarketingNav from "../../components/marketing/MarketingNav";
import MarketingFooter from "../../components/marketing/MarketingFooter";
import { Reveal } from "../../components/marketing/Motion";
import { TRIAL_DAYS, mergePlansWithConfig } from "../../data/plans";
import { fetchPlatformConfig } from "../../utils/platformConfig";

// Codeskate Voice — prepaid, pay-as-you-go wallet packs.
const VOICE_PACKS = [
  {
    icon: PhoneForwarded,
    name: "Bridge Call Wallet",
    price: "₹1,999",
    unit: "1,000 minutes",
    rate: "≈ ₹2 / min",
    desc: "Masked & recorded agent-to-lead calls. Numbers stay private; recordings land on the lead.",
    plan: "Available on Growth & up",
  },
  {
    icon: Bot,
    name: "AI Voice Bot Wallet",
    price: "₹3,999",
    unit: "500 minutes",
    rate: "≈ ₹8 / min",
    desc: "AI calls, qualifies in Hindi & English, and warm-transfers hot leads to an available agent.",
    plan: "Available on Scale & up",
  },
];

const SALES_WHATSAPP_NUMBER = (import.meta.env.VITE_SALES_WHATSAPP_NUMBER || "919653043939").replace(/\D/g, "");
const salesWhatsAppUrl = `https://wa.me/${SALES_WHATSAPP_NUMBER}?text=${encodeURIComponent("Hi Codeskate CRM team, I need help with a custom CRM plan.")}`;

const buildFaqs = (trialDays) => [
  {
    q: `What happens after my ${trialDays}-day trial ends?`,
    a: "Your data is always preserved. If you haven't subscribed, your workspace downgrades to a read-only state until you pick a plan. Upgrade anytime to unlock everything again.",
  },
  {
    q: "Can I change my plan later?",
    a: "Absolutely. Upgrade or downgrade whenever you like. Upgrades apply instantly; downgrades take effect at the end of your current billing cycle.",
  },
  {
    q: "What payment methods do you accept?",
    a: "All major credit/debit cards, UPI, net banking, and popular wallets — securely processed through Razorpay.",
  },
  {
    q: "How does per-seat pricing work?",
    a: "Each plan includes a set number of seats. Need more team members? Add extra seats anytime at your plan's per-seat rate.",
  },
  {
    q: "Is my data secure and isolated?",
    a: "Yes. Codeskate CRM is fully multi-tenant with strict database-level isolation. Your organization's data is never accessible to any other tenant.",
  },
];

function PlanCard({ plan, cycle, onSelect }) {
  const price = cycle === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
  const yearlySaving = plan.monthlyPrice * 12 - plan.yearlyPrice;

  return (
    <div
      className={`relative rounded-3xl p-7 flex flex-col transition-all duration-300 ${
        plan.popular
          ? "bg-ink text-cream-100 shadow-glow-lg scale-[1.02] lg:-translate-y-3 texture-grain"
          : "bg-white border border-cream-300/60 shadow-card hover:shadow-card-hover hover:-translate-y-1"
      }`}
    >
      {plan.popular && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-orange text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-glow flex items-center gap-1.5 whitespace-nowrap">
          <Sparkles size={13} />
          MOST POPULAR
        </div>
      )}

      <div className="mb-5">
        <h3 className={`font-display font-bold text-xl mb-1 ${plan.popular ? "text-white" : "text-ink"}`}>
          {plan.name}
        </h3>
        <p className={`text-sm ${plan.popular ? "text-cream-300/80" : "text-ink-muted"}`}>
          {plan.tagline}
        </p>
      </div>

      <div className="mb-6">
        <div className="flex items-end gap-1">
          <span className={`font-display font-bold text-4xl ${plan.popular ? "text-orange-400" : "text-ink"}`}>
            ₹{price.toLocaleString("en-IN")}
          </span>
          <span className={`text-sm mb-1.5 ${plan.popular ? "text-cream-300/70" : "text-ink-muted"}`}>
            /{cycle === "monthly" ? "mo" : "yr"}
          </span>
        </div>
        {cycle === "yearly" ? (
          <p className="text-xs text-success-500 font-semibold mt-1">
            Save ₹{yearlySaving.toLocaleString("en-IN")} a year
          </p>
        ) : (
          <p className={`text-xs mt-1 ${plan.popular ? "text-cream-300/60" : "text-ink-muted"}`}>
            {plan.includedSeats < 0 ? "Unlimited" : plan.includedSeats} seats included
          </p>
        )}
      </div>

      <button
        onClick={() => onSelect(plan)}
        className={`btn w-full mb-6 ${
          plan.popular
            ? "bg-gradient-orange text-white shadow-button hover:shadow-button-hover hover:-translate-y-0.5"
            : "btn-secondary"
        }`}
      >
        {plan.trial ? "Start free trial" : "Get started"}
        <ArrowRight size={16} />
      </button>
      {plan.trial ? (
        <p className="text-center text-xs text-success-600 -mt-4 mb-5 font-medium">7-day free trial included</p>
      ) : (
        <p className="text-center text-xs text-ink-muted -mt-4 mb-5">Paid plan · no trial</p>
      )}

      <ul className="space-y-3 mt-auto">
        {plan.features.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            {f.included ? (
              <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${plan.popular ? "bg-orange-500/20" : "bg-success-100"}`}>
                <Check size={12} className={plan.popular ? "text-orange-400" : "text-success-600"} strokeWidth={3} />
              </span>
            ) : (
              <span className="mt-0.5 w-5 h-5 rounded-full bg-cream-200/50 flex items-center justify-center shrink-0">
                <X size={12} className="text-ink-muted/50" strokeWidth={3} />
              </span>
            )}
            <span className={f.included ? (plan.popular ? "text-cream-100" : "text-ink-soft") : (plan.popular ? "text-cream-300/40" : "text-ink-muted/60")}>
              {f.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl border border-cream-300/60 overflow-hidden shadow-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <span className="font-semibold text-ink">{q}</span>
        <ChevronDown
          size={20}
          className={`text-orange-500 shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-6 pb-5 text-ink-soft text-sm leading-relaxed animate-fade-in">
          {a}
        </div>
      )}
    </div>
  );
}

export default function Pricing() {
  const [cycle, setCycle] = useState("monthly");
  const [config, setConfig] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPlatformConfig().then(setConfig);
  }, []);

  // Dynamic: reflect the platform owner's configured prices/limits/trial days.
  const { plans: PLANS, trialDays: TRIAL_DAYS } = mergePlansWithConfig(config);
  const FAQS = buildFaqs(TRIAL_DAYS);

  const selectPlan = (plan) => {
    navigate("/signup", { state: { planId: plan.id, cycle } });
  };

  return (
    <div className="min-h-screen bg-cream-100 overflow-x-hidden">
      <MarketingNav />

      {/* ===== HERO ===== */}
      <section className="relative pt-32 pb-16 sm:pt-40 texture-grain">
        <div className="absolute top-24 -right-16 w-80 h-80 bg-orange-300/25 rounded-full blur-3xl animate-blob pointer-events-none" />
        <div className="absolute inset-0 pattern-dots opacity-50 pointer-events-none" />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-white/70 backdrop-blur border border-orange-200 rounded-full px-4 py-1.5 mb-6 shadow-sm">
            <Sparkles size={14} className="text-orange-500" />
            <span className="text-xs font-semibold text-ember-700">
              {TRIAL_DAYS} days free · No credit card
            </span>
          </div>
          <h1 className="font-display font-bold text-4xl sm:text-6xl text-ink mb-5 leading-tight">
            Simple, transparent <span className="text-gradient">pricing</span>
          </h1>
          <p className="text-lg text-ink-soft mb-10">
            Pick the plan that fits your team. Every plan starts with a {TRIAL_DAYS}-day
            free trial — upgrade, downgrade, or cancel anytime.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center bg-white rounded-full p-1.5 border border-cream-300/70 shadow-sm">
            <button
              onClick={() => setCycle("monthly")}
              className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${
                cycle === "monthly" ? "bg-gradient-orange text-white shadow-sm" : "text-ink-soft hover:text-orange-600"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setCycle("yearly")}
              className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all flex items-center gap-2 ${
                cycle === "yearly" ? "bg-gradient-orange text-white shadow-sm" : "text-ink-soft hover:text-orange-600"
              }`}
            >
              Yearly
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cycle === "yearly" ? "bg-white/25 text-white" : "bg-success-100 text-success-700"}`}>
                SAVE 17%
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* ===== PLANS ===== */}
      <section className="pb-20 sm:pb-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid md:grid-cols-3 gap-6 lg:gap-8 items-center">
          {PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} cycle={cycle} onSelect={selectPlan} />
          ))}
        </div>

        <p className="text-center text-sm text-ink-muted mt-10 px-4">
          All prices in INR and exclusive of applicable taxes. Need a custom plan?{" "}
          <a href={salesWhatsAppUrl} target="_blank" rel="noreferrer" className="text-orange-600 font-semibold hover:underline">Talk to sales →</a>
        </p>
      </section>

      {/* ===== CODESKATE VOICE — pay-as-you-go wallets ===== */}
      <section className="pb-20 sm:pb-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <Reveal className="text-center max-w-2xl mx-auto mb-10">
            <div className="inline-flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-full px-4 py-1.5 mb-4">
              <Wallet size={14} className="text-orange-600" />
              <span className="text-xs font-bold text-orange-700 uppercase tracking-wider">Codeskate Voice</span>
            </div>
            <h2 className="font-display font-bold text-2xl sm:text-4xl text-ink mb-3">
              Add calling, <span className="text-gradient">pay only for what you use</span>
            </h2>
            <p className="text-ink-soft">
              Voice is a prepaid wallet on top of any eligible plan — no fixed monthly commitment.
              Top up anytime; minutes never expire while your plan is active.
            </p>
          </Reveal>

          <div className="grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {VOICE_PACKS.map((p) => {
              const Icon = p.icon;
              return (
                <Reveal key={p.name}>
                  <div className="h-full bg-white rounded-2xl border border-cream-300/60 p-7 shadow-card hover:shadow-card-hover hover:-translate-y-1 transition-all">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-11 h-11 rounded-xl bg-gradient-orange/10 flex items-center justify-center">
                        <Icon size={20} className="text-orange-600" />
                      </div>
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-cream-200 text-ink-soft">{p.plan}</span>
                    </div>
                    <h3 className="font-display font-bold text-lg text-ink">{p.name}</h3>
                    <div className="flex items-end gap-2 mt-2 mb-1">
                      <span className="font-display font-bold text-3xl text-ink">{p.price}</span>
                      <span className="text-sm text-ink-muted mb-1">/ {p.unit}</span>
                    </div>
                    <p className="text-xs font-semibold text-orange-600 mb-3">{p.rate}</p>
                    <p className="text-sm text-ink-soft leading-relaxed">{p.desc}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
          <p className="text-center text-xs text-ink-muted mt-6">
            Native call tracking (Android) is included free on every plan. Bridge &amp; AI Voice Bot are billed from your voice wallet.
          </p>
        </div>
      </section>

      {/* ===== FEATURE COMPARISON STRIP ===== */}
      <section className="py-16 bg-gradient-warm texture-grain">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-10">
            Every plan includes
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {[
              "Unlimited team invites",
              "WhatsApp integration",
              "Mobile app access",
              "Bank-level security",
              "Real-time sync",
              "Data export",
              "Email support",
              "Free updates",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm text-ink-soft">
                <span className="w-5 h-5 rounded-full bg-success-100 flex items-center justify-center shrink-0">
                  <Check size={12} className="text-success-600" strokeWidth={3} />
                </span>
                <span className="text-left">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="py-20 sm:py-28 scroll-mt-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="eyebrow mb-3">Got questions?</p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-ink">
              Frequently asked questions
            </h2>
          </div>
          <div className="space-y-4">
            {FAQS.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="pb-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="relative bg-gradient-ember rounded-3xl p-10 sm:p-14 text-center overflow-hidden texture-grain shadow-glow-lg">
            <div className="absolute -top-16 -right-16 w-56 h-56 bg-orange-300/30 rounded-full blur-3xl" />
            <div className="relative">
              <h2 className="font-display font-bold text-3xl sm:text-4xl text-white mb-4">
                Start closing more deals today
              </h2>
              <p className="text-cream-100/90 mb-8 max-w-lg mx-auto">
                Try Codeskate CRM free for {TRIAL_DAYS} days. No credit card, no commitment.
              </p>
              <button
                onClick={() => navigate("/signup")}
                className="btn bg-white text-ember-700 hover:bg-cream-100 text-base px-8 py-3.5 font-bold shadow-lg"
              >
                Create your workspace
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
