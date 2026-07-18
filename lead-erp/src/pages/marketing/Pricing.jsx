import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X, ArrowRight, Sparkles, ChevronDown } from "lucide-react";
import MarketingNav from "../../components/marketing/MarketingNav";
import MarketingFooter from "../../components/marketing/MarketingFooter";
import { PLANS, TRIAL_DAYS } from "../../data/plans";

const FAQS = [
  {
    q: `What happens after my ${TRIAL_DAYS}-day trial ends?`,
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
    a: "Yes. CodeSkate is fully multi-tenant with strict database-level isolation. Your organization's data is never accessible to any other tenant.",
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
            {plan.includedSeats} seats included
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
        Start free trial
        <ArrowRight size={16} />
      </button>

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
  const navigate = useNavigate();

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
          <span className="text-orange-600 font-semibold cursor-pointer hover:underline">Talk to sales →</span>
        </p>
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
                Try CodeSkate free for {TRIAL_DAYS} days. No credit card, no commitment.
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
