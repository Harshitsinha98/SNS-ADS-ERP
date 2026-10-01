import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X, ArrowRight, Sparkles, ChevronDown, PhoneForwarded, Bot, Wallet } from "lucide-react";
import MarketingNav from "../../components/marketing/MarketingNav";
import MarketingFooter from "../../components/marketing/MarketingFooter";
import { Reveal, Stagger, StaggerItem, PointerGlow, motion } from "../../components/marketing/Motion";
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

const INCLUDED_EVERYWHERE = [
  "Unlimited team invites",
  "WhatsApp integration",
  "Mobile app access",
  "Bank-level security",
  "Real-time sync",
  "Data export",
  "Email support",
  "Free updates",
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
      className={`relative h-full rounded-3xl p-7 flex flex-col transition-all duration-300 overflow-hidden ${
        plan.popular
          ? "bg-white/[0.07] border border-orange-400/40 shadow-[0_0_70px_-20px_rgba(255,107,26,0.5)] lg:-translate-y-3"
          : "mkt-card mkt-card-hover"
      }`}
    >
      {plan.popular && (
        <>
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-40 bg-orange-500/25 mkt-bloom" />
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-orange text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-glow flex items-center gap-1.5 whitespace-nowrap z-10">
            <Sparkles size={13} />
            MOST POPULAR
          </div>
        </>
      )}

      <div className="relative mb-5">
        <h3 className="font-display font-bold text-xl mb-1 text-white">{plan.name}</h3>
        <p className="text-sm text-midnight-300/75">{plan.tagline}</p>
      </div>

      <div className="relative mb-6">
        <div className="flex items-end gap-1">
          <span
            className={`font-display font-bold text-4xl tracking-[-0.02em] ${
              plan.popular ? "mkt-text-gradient" : "text-white"
            }`}
          >
            ₹{price.toLocaleString("en-IN")}
          </span>
          <span className="text-sm mb-1.5 text-midnight-400">
            /{cycle === "monthly" ? "mo" : "yr"}
          </span>
        </div>
        {cycle === "yearly" ? (
          <p className="text-xs text-emerald-400 font-semibold mt-1.5">
            Save ₹{yearlySaving.toLocaleString("en-IN")} a year
          </p>
        ) : (
          <p className="text-xs mt-1.5 text-midnight-400">
            {plan.includedSeats < 0 ? "Unlimited" : plan.includedSeats} seats included
          </p>
        )}
      </div>

      <button
        onClick={() => onSelect(plan)}
        className={`btn relative w-full mb-6 font-semibold ${
          plan.popular ? "mkt-btn-ember" : "mkt-btn-glass"
        }`}
      >
        {plan.trial ? "Start free trial" : "Get started"}
        <ArrowRight size={16} />
      </button>
      {plan.trial ? (
        <p className="relative text-center text-xs text-emerald-400 -mt-4 mb-5 font-medium">
          7-day free trial included
        </p>
      ) : (
        <p className="relative text-center text-xs text-midnight-400 -mt-4 mb-5">
          Paid plan · no trial
        </p>
      )}

      <ul className="relative space-y-3 mt-auto">
        {plan.features.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            {f.included ? (
              <span
                className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  plan.popular ? "bg-orange-500/20" : "bg-emerald-500/15"
                }`}
              >
                <Check
                  size={12}
                  className={plan.popular ? "text-orange-300" : "text-emerald-400"}
                  strokeWidth={3}
                />
              </span>
            ) : (
              <span className="mt-0.5 w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0">
                <X size={12} className="text-midnight-500" strokeWidth={3} />
              </span>
            )}
            <span className={f.included ? "text-midnight-200/85" : "text-midnight-400/60"}>
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
    <div className="mkt-card mkt-sheen rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-white/[0.03]"
        aria-expanded={open}
      >
        <span className="font-semibold text-white">{q}</span>
        <ChevronDown
          size={20}
          className={`text-orange-400 shrink-0 transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="px-6 pb-5 text-midnight-200/75 text-sm leading-relaxed animate-fade-in">
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
    <div className="min-h-screen mkt-canvas text-midnight-100 overflow-x-hidden">
      <MarketingNav />

      {/* ===== HERO ===== */}
      <section className="relative pt-32 pb-16 sm:pt-40 overflow-hidden">
        <div className="absolute inset-0 mkt-grid-fade pointer-events-none" />
        <div className="absolute inset-0 mkt-grain pointer-events-none" />
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[40rem] h-80 bg-orange-500/18 mkt-bloom animate-aurora" />
        <div className="absolute top-24 -right-16 w-80 h-80 bg-ember-500/12 mkt-bloom animate-blob" />
        <PointerGlow size={560} />

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mkt-chip mb-7"
          >
            <Sparkles size={14} className="text-orange-400" />
            <span className="text-xs font-semibold text-midnight-100">
              {TRIAL_DAYS} days free · No credit card
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="font-display font-bold text-[2.6rem] sm:text-6xl tracking-[-0.03em] text-white mb-6 leading-[1.06]"
          >
            Simple, transparent <span className="mkt-text-gradient">pricing</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="text-lg text-midnight-200/80 mb-10 leading-relaxed"
          >
            Pick the plan that fits your team. Every plan starts with a {TRIAL_DAYS}-day free
            trial — upgrade, downgrade, or cancel anytime.
          </motion.p>

          {/* Billing toggle */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex items-center rounded-full p-1.5 border border-white/[0.1] bg-white/[0.04] backdrop-blur"
          >
            <button
              onClick={() => setCycle("monthly")}
              className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${
                cycle === "monthly"
                  ? "bg-gradient-orange text-white shadow-glow"
                  : "text-midnight-200/75 hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setCycle("yearly")}
              className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all flex items-center gap-2 ${
                cycle === "yearly"
                  ? "bg-gradient-orange text-white shadow-glow"
                  : "text-midnight-200/75 hover:text-white"
              }`}
            >
              Yearly
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  cycle === "yearly"
                    ? "bg-white/25 text-white"
                    : "bg-emerald-500/15 text-emerald-300"
                }`}
              >
                SAVE 17%
              </span>
            </button>
          </motion.div>
        </div>
      </section>

      {/* ===== PLANS ===== */}
      <section className="pb-20 sm:pb-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid md:grid-cols-3 gap-6 lg:gap-8 items-stretch">
          {PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} cycle={cycle} onSelect={selectPlan} />
          ))}
        </div>

        <p className="text-center text-sm text-midnight-300/75 mt-12 px-4">
          All prices in INR and exclusive of applicable taxes. Need a custom plan?{" "}
          <a
            href={salesWhatsAppUrl}
            target="_blank"
            rel="noreferrer"
            className="text-orange-300 font-semibold hover:underline"
          >
            Talk to sales →
          </a>
        </p>
      </section>

      {/* ===== CODESKATE VOICE — pay-as-you-go wallets ===== */}
      <section className="relative pb-20 sm:pb-24 overflow-hidden">
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-violet-600/10 mkt-bloom" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6">
          <Reveal className="text-center max-w-2xl mx-auto mb-12">
            <div className="mkt-chip mb-5">
              <Wallet size={14} className="text-orange-400" />
              <span className="text-[11px] font-bold text-orange-300 uppercase tracking-[0.14em]">
                Codeskate Voice
              </span>
            </div>
            <h2 className="font-display font-bold text-2xl sm:text-4xl tracking-[-0.025em] text-white mb-4">
              Add calling, <span className="mkt-text-gradient">pay only for what you use</span>
            </h2>
            <p className="text-midnight-200/75 leading-relaxed">
              Voice is a prepaid wallet on top of any eligible plan — no fixed monthly commitment.
              Top up anytime; minutes never expire while your plan is active.
            </p>
          </Reveal>

          <Stagger className="grid sm:grid-cols-2 gap-5 max-w-3xl mx-auto">
            {VOICE_PACKS.map((p) => (
              <StaggerItem key={p.name}>
                <div className="group h-full mkt-card mkt-card-hover mkt-sheen rounded-2xl p-7">
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-11 h-11 rounded-xl bg-orange-500/12 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                      <p.icon size={20} className="text-orange-300" />
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.1] text-midnight-200">
                      {p.plan}
                    </span>
                  </div>
                  <h3 className="font-display font-bold text-lg text-white">{p.name}</h3>
                  <div className="flex items-end gap-2 mt-2 mb-1">
                    <span className="font-display font-bold text-3xl text-white tracking-[-0.02em]">
                      {p.price}
                    </span>
                    <span className="text-sm text-midnight-400 mb-1">/ {p.unit}</span>
                  </div>
                  <p className="text-xs font-semibold text-orange-300 mb-3">{p.rate}</p>
                  <p className="text-sm text-midnight-200/75 leading-relaxed">{p.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          <p className="text-center text-xs text-midnight-400 mt-7">
            Native call tracking (Android) is included free on every plan. Bridge &amp; AI Voice
            Bot are billed from your voice wallet.
          </p>
        </div>
      </section>

      {/* ===== FEATURE COMPARISON STRIP ===== */}
      <section className="relative py-16 sm:py-20 border-y border-white/[0.07] bg-midnight-950/50">
        <div className="absolute inset-0 pattern-grid opacity-40 pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <Reveal>
            <h2 className="font-display font-bold text-2xl sm:text-3xl tracking-[-0.02em] text-white mb-10">
              Every plan includes
            </h2>
          </Reveal>
          <Stagger className="grid grid-cols-2 sm:grid-cols-4 gap-5" stagger={0.05}>
            {INCLUDED_EVERYWHERE.map((f) => (
              <StaggerItem key={f}>
                <div className="flex items-center gap-2.5 text-sm text-midnight-200/85">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                    <Check size={12} className="text-emerald-400" strokeWidth={3} />
                  </span>
                  <span className="text-left">{f}</span>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="py-20 sm:py-28 scroll-mt-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <Reveal className="text-center mb-14">
            <p className="mkt-eyebrow mb-4">Got questions?</p>
            <h2 className="font-display font-bold text-3xl sm:text-5xl tracking-[-0.025em] text-white">
              Frequently asked questions
            </h2>
          </Reveal>
          <Stagger className="space-y-4" stagger={0.07}>
            {FAQS.map((f) => (
              <StaggerItem key={f.q}>
                <FaqItem q={f.q} a={f.a} />
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="pb-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <Reveal>
            <div className="relative rounded-[2rem] border border-orange-400/25 bg-gradient-to-br from-orange-500/[0.18] via-ember-600/[0.12] to-midnight-950/60 p-10 sm:p-14 text-center overflow-hidden">
              <div className="absolute inset-0 mkt-grain pointer-events-none" />
              <div className="absolute -top-20 -right-16 w-72 h-72 bg-orange-400/25 mkt-bloom animate-blob" />
              <PointerGlow size={460} color="rgba(255,172,112,0.16)" />
              <div className="relative">
                <h2 className="font-display font-bold text-3xl sm:text-5xl tracking-[-0.025em] text-white mb-5">
                  Start closing more deals today
                </h2>
                <p className="text-midnight-200/80 mb-9 max-w-lg mx-auto leading-relaxed">
                  Try Codeskate CRM free for {TRIAL_DAYS} days. No credit card, no commitment.
                </p>
                <button
                  onClick={() => navigate("/signup")}
                  className="btn bg-white text-midnight-900 hover:bg-midnight-50 text-base px-8 py-3.5 font-bold transition-colors"
                >
                  Create your workspace
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
