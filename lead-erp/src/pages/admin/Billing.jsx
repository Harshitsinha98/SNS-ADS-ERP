import { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import { useBilling } from "../../context/BillingContext";
import { useData } from "../../context/DataContext";
import { fetchPlatformConfig } from "../../utils/platformConfig";
import { mergePlansWithConfig, limitsForPlan } from "../../data/plans";
import {
  Check, Sparkles, Users, Inbox, Clock, TrendingUp, ArrowRight, Loader2, ShieldCheck,
} from "lucide-react";

export default function Billing() {
  const {
    planId, planName, status, seatsUsed, seatsLimit, leadsUsed, leadsLimit,
    trialDaysLeft, isTrialing, isActive, isExpired,
  } = useBilling();
  const { changePlan } = useData();

  const [config, setConfig] = useState(null);
  const [cycle, setCycle] = useState("monthly");
  const [busyPlan, setBusyPlan] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetchPlatformConfig().then(setConfig);
  }, []);

  const { plans } = mergePlansWithConfig(config);

  const seatPct = seatsLimit > 0 ? Math.min(100, Math.round((seatsUsed / seatsLimit) * 100)) : 0;
  const leadPct = leadsLimit > 0 ? Math.min(100, Math.round((leadsUsed / leadsLimit) * 100)) : 0;

  const statusBadge = () => {
    if (isActive) return <span className="badge badge-success">Active</span>;
    if (isExpired) return <span className="badge badge-danger">Expired</span>;
    if (isTrialing) return <span className="badge badge-warning">Trial · {trialDaysLeft}d left</span>;
    return <span className="badge badge-primary">{status}</span>;
  };

  const handleChoose = async (plan) => {
    setMsg("");
    setBusyPlan(plan.id);
    const limits = limitsForPlan(plan.id, config);
    const res = await changePlan(limits);
    setBusyPlan(null);
    if (res?.ok) {
      setMsg(`✅ You're now on the ${plan.name} plan — ${plan.includedSeats} seats & ${plan.leadsLimit.toLocaleString("en-IN")} leads unlocked.`);
    } else {
      setMsg(res?.error || "Could not change plan.");
    }
  };

  return (
    <Layout title="Billing & Subscription">
      {/* Current plan summary */}
      <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <p className="eyebrow mb-1">Current plan</p>
            <div className="flex items-center gap-3">
              <h2 className="font-display font-bold text-2xl text-ink">{planName}</h2>
              {statusBadge()}
            </div>
            {isTrialing && (
              <p className="text-sm text-ink-soft mt-1 flex items-center gap-1.5">
                <Clock size={14} className="text-orange-500" />
                {trialDaysLeft} din ka trial bacha hai
              </p>
            )}
            {isExpired && (
              <p className="text-sm text-danger-600 mt-1">
                Trial/subscription khatam — plan choose karke activate karo.
              </p>
            )}
          </div>
          <div className="w-14 h-14 rounded-2xl bg-gradient-orange flex items-center justify-center shadow-glow">
            <Sparkles className="text-white" size={26} />
          </div>
        </div>

        {/* Usage meters */}
        <div className="grid sm:grid-cols-2 gap-5">
          <UsageMeter
            icon={Users}
            label="Team seats"
            used={seatsUsed}
            limit={seatsLimit}
            pct={seatPct}
          />
          <UsageMeter
            icon={Inbox}
            label="Leads this cycle"
            used={leadsUsed}
            limit={leadsLimit >= 1000000 ? "∞" : leadsLimit}
            pct={leadsLimit >= 1000000 ? 4 : leadPct}
          />
        </div>
      </div>

      {msg && (
        <div className="bg-orange-50 border border-orange-200 text-ember-700 rounded-xl px-4 py-3 mb-6 text-sm">
          {msg}
        </div>
      )}

      {/* Plan chooser */}
      <div className="flex items-center justify-between mb-4">
        <p className="eyebrow">Choose your plan</p>
        <div className="inline-flex bg-cream-200 rounded-full p-1 text-sm">
          <button
            onClick={() => setCycle("monthly")}
            className={`px-4 py-1.5 rounded-full font-medium ${cycle === "monthly" ? "bg-white shadow-sm text-ink" : "text-ink-muted"}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setCycle("yearly")}
            className={`px-4 py-1.5 rounded-full font-medium ${cycle === "yearly" ? "bg-white shadow-sm text-ink" : "text-ink-muted"}`}
          >
            Yearly
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {plans.map((plan) => {
          const isCurrent = plan.id === planId && (isActive || isTrialing);
          const price = cycle === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
          return (
            <div
              key={plan.id}
              className={`rounded-2xl border p-6 flex flex-col ${
                plan.popular ? "border-orange-300 ring-2 ring-orange-100" : "border-cream-300/60"
              } bg-white shadow-card`}
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-display font-bold text-lg text-ink">{plan.name}</h3>
                {plan.popular && <span className="badge badge-primary">Popular</span>}
              </div>
              <p className="text-sm text-ink-muted mb-4">{plan.tagline}</p>
              <div className="mb-4">
                <span className="font-display font-bold text-3xl text-ink">₹{price.toLocaleString("en-IN")}</span>
                <span className="text-sm text-ink-muted">/{cycle === "monthly" ? "mo" : "yr"}</span>
              </div>
              <ul className="space-y-2 mb-6 text-sm">
                <li className="flex items-center gap-2 text-ink-soft">
                  <Users size={15} className="text-orange-500" /> {plan.includedSeats} seats
                </li>
                <li className="flex items-center gap-2 text-ink-soft">
                  <Inbox size={15} className="text-orange-500" />
                  {plan.leadsLimit >= 1000000 ? "Unlimited" : plan.leadsLimit.toLocaleString("en-IN")} leads/mo
                </li>
                {plan.features.filter((f) => f.included).slice(0, 3).map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-ink-soft">
                    <Check size={15} className="text-success-500" /> {f.text}
                  </li>
                ))}
              </ul>
              <button
                disabled={isCurrent || busyPlan === plan.id}
                onClick={() => handleChoose(plan)}
                className={`mt-auto btn w-full ${isCurrent ? "bg-cream-200 text-ink-muted cursor-default" : "btn-primary"}`}
              >
                {busyPlan === plan.id ? (
                  <><Loader2 size={16} className="animate-spin" /> Updating…</>
                ) : isCurrent ? (
                  "Current plan"
                ) : (
                  <>Switch to {plan.name} <ArrowRight size={15} /></>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-ink-muted mt-6 flex items-center gap-1.5">
        <ShieldCheck size={13} />
        Plan change karte hi aapke seat & lead limits turant badh jaate hain. (Payment gateway abhi wire nahi hai — Razorpay Phase 2 me.)
      </p>
    </Layout>
  );
}

function UsageMeter({ icon: Icon, label, used, limit, pct }) {
  return (
    <div className="bg-cream-50 rounded-xl border border-cream-300/50 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-ink flex items-center gap-2">
          <Icon size={16} className="text-orange-500" /> {label}
        </span>
        <span className="text-sm font-mono text-ink-soft">{used} / {limit}</span>
      </div>
      <div className="w-full bg-cream-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${pct >= 100 ? "bg-danger-500" : "bg-gradient-orange"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
