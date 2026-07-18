import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import Layout from "../../components/Layout";
import { useBilling } from "../../context/BillingContext";
import { useData } from "../../context/DataContext";
import { useAuth } from "../../context/AuthContext";
import { fetchPlatformConfig } from "../../utils/platformConfig";
import { mergePlansWithConfig, limitsForPlan } from "../../data/plans";
import {
  getBillingConfig, createRazorpayOrder, verifyRazorpayPayment,
  getPayuHash, loadRazorpayScript, submitPayuForm,
} from "../../utils/billingApi";
import {
  Check, Sparkles, Users, Inbox, Clock, ArrowRight, Loader2, ShieldCheck,
  CreditCard,
} from "lucide-react";

export default function Billing() {
  const {
    planId, planName, status, seatsUsed, seatsLimit, leadsUsed, leadsLimit,
    trialDaysLeft, isTrialing, isActive, isExpired, org,
  } = useBilling();
  const { changePlan } = useData();
  const { user } = useAuth();
  const location = useLocation();

  const [config, setConfig] = useState(null);
  const [gateways, setGateways] = useState({ razorpay: false, payu: false });
  const [cycle, setCycle] = useState("monthly");
  const [method, setMethod] = useState("razorpay");
  const [busyPlan, setBusyPlan] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetchPlatformConfig().then(setConfig);
    getBillingConfig().then((g) => {
      setGateways(g);
      setMethod(g.razorpay ? "razorpay" : g.payu ? "payu" : "razorpay");
    });
    // PayU redirect result
    const params = new URLSearchParams(location.search);
    const payu = params.get("payu");
    if (payu === "success") setMsg("✅ Payment successful — aapka plan activate ho gaya!");
    else if (payu === "failed") setMsg("❌ PayU payment fail hua. Dobara try karo.");
    else if (payu === "error") setMsg("⚠️ PayU payment me error aaya.");
  }, [location.search]);

  const { plans } = mergePlansWithConfig(config);
  const anyGateway = gateways.razorpay || gateways.payu;

  const seatPct = seatsLimit > 0 ? Math.min(100, Math.round((seatsUsed / seatsLimit) * 100)) : 0;
  const leadPct = leadsLimit > 0 ? Math.min(100, Math.round((leadsUsed / leadsLimit) * 100)) : 0;

  const statusBadge = () => {
    if (isActive) return <span className="badge badge-success">Active</span>;
    if (isExpired) return <span className="badge badge-danger">Expired</span>;
    if (isTrialing) return <span className="badge badge-warning">Trial · {trialDaysLeft}d left</span>;
    return <span className="badge badge-primary">{status}</span>;
  };

  const payWithRazorpay = async (plan) => {
    const ok = await loadRazorpayScript();
    if (!ok) throw new Error("Razorpay checkout load nahi hua.");
    const order = await createRazorpayOrder({ orgId: org.id, planId: plan.id, cycle });

    await new Promise((resolve, reject) => {
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "CodeSkate",
        description: `${plan.name} plan (${cycle})`,
        order_id: order.orderId,
        prefill: { name: user?.displayName || "", contact: (user?.phone || "").replace("+91", "") },
        theme: { color: "#F04E00" },
        handler: async (resp) => {
          try {
            await verifyRazorpayPayment({
              orgId: org.id, planId: plan.id, cycle,
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            resolve();
          } catch (e) { reject(e); }
        },
        modal: { ondismiss: () => reject(new Error("Payment cancel kiya gaya.")) },
      });
      rzp.open();
    });
  };

  const payWithPayu = async (plan) => {
    const { action, params } = await getPayuHash({
      orgId: org.id, planId: plan.id, cycle,
      firstname: user?.displayName || "Customer",
      email: "customer@codeskate.app",
      phone: (user?.phone || "").replace("+91", ""),
    });
    submitPayuForm(action, params); // redirects away
  };

  const handleUpgrade = async (plan) => {
    setMsg("");
    setBusyPlan(plan.id);
    try {
      if (!anyGateway) {
        // No gateway configured (backend not deployed) — dev activate fallback.
        const res = await changePlan(limitsForPlan(plan.id, config));
        setMsg(res?.ok
          ? `✅ (Dev) ${plan.name} activate ho gaya — payment gateway configure nahi hai.`
          : (res?.error || "Activate nahi hua."));
      } else if (method === "razorpay" && gateways.razorpay) {
        await payWithRazorpay(plan);
        setMsg(`✅ Payment successful — ${plan.name} plan activate ho gaya!`);
      } else if (method === "payu" && gateways.payu) {
        await payWithPayu(plan);
        return; // page redirects to PayU
      } else {
        setMsg("Ye payment method configure nahi hai.");
      }
    } catch (e) {
      setMsg(e.message || "Payment fail hua.");
    } finally {
      setBusyPlan(null);
    }
  };

  return (
    <Layout title="Billing & Subscription">
      {/* Current plan */}
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
                <Clock size={14} className="text-orange-500" /> {trialDaysLeft} din ka trial bacha hai
              </p>
            )}
            {isExpired && (
              <p className="text-sm text-danger-600 mt-1">Trial/subscription khatam — neeche plan choose karke pay karo.</p>
            )}
          </div>
          <div className="w-14 h-14 rounded-2xl bg-gradient-orange flex items-center justify-center shadow-glow">
            <Sparkles className="text-white" size={26} />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <UsageMeter icon={Users} label="Team seats" used={seatsUsed} limit={seatsLimit} pct={seatPct} />
          <UsageMeter icon={Inbox} label="Leads this cycle" used={leadsUsed}
            limit={leadsLimit >= 1000000 ? "∞" : leadsLimit} pct={leadsLimit >= 1000000 ? 4 : leadPct} />
        </div>
      </div>

      {msg && (
        <div className="bg-orange-50 border border-orange-200 text-ember-700 rounded-xl px-4 py-3 mb-6 text-sm">{msg}</div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="eyebrow">Choose your plan</p>
        <div className="flex items-center gap-3">
          {/* payment method */}
          {anyGateway && (
            <div className="inline-flex bg-cream-200 rounded-full p-1 text-sm">
              {gateways.razorpay && (
                <button onClick={() => setMethod("razorpay")}
                  className={`px-3 py-1.5 rounded-full font-medium ${method === "razorpay" ? "bg-white shadow-sm text-ink" : "text-ink-muted"}`}>
                  Razorpay
                </button>
              )}
              {gateways.payu && (
                <button onClick={() => setMethod("payu")}
                  className={`px-3 py-1.5 rounded-full font-medium ${method === "payu" ? "bg-white shadow-sm text-ink" : "text-ink-muted"}`}>
                  PayU
                </button>
              )}
            </div>
          )}
          {/* billing cycle */}
          <div className="inline-flex bg-cream-200 rounded-full p-1 text-sm">
            <button onClick={() => setCycle("monthly")}
              className={`px-4 py-1.5 rounded-full font-medium ${cycle === "monthly" ? "bg-white shadow-sm text-ink" : "text-ink-muted"}`}>
              Monthly
            </button>
            <button onClick={() => setCycle("yearly")}
              className={`px-4 py-1.5 rounded-full font-medium ${cycle === "yearly" ? "bg-white shadow-sm text-ink" : "text-ink-muted"}`}>
              Yearly
            </button>
          </div>
        </div>
      </div>

      {!anyGateway && (
        <p className="text-xs text-warning-700 bg-warning-50 border border-warning-200 rounded-lg px-3 py-2 mb-4">
          Payment gateway abhi reachable nahi hai (backend deploy + VITE_BACKEND_URL set karo). Tab tak "Activate (dev)" se test kar sakte ho.
        </p>
      )}

      <div className="grid md:grid-cols-3 gap-5">
        {plans.map((plan) => {
          const isCurrent = plan.id === planId && (isActive || isTrialing);
          const price = cycle === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
          return (
            <div key={plan.id}
              className={`rounded-2xl border p-6 flex flex-col ${plan.popular ? "border-orange-300 ring-2 ring-orange-100" : "border-cream-300/60"} bg-white shadow-card`}>
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
                <li className="flex items-center gap-2 text-ink-soft"><Users size={15} className="text-orange-500" /> {plan.includedSeats} seats</li>
                <li className="flex items-center gap-2 text-ink-soft"><Inbox size={15} className="text-orange-500" />
                  {plan.leadsLimit >= 1000000 ? "Unlimited" : plan.leadsLimit.toLocaleString("en-IN")} leads/mo</li>
                {plan.features.filter((f) => f.included).slice(0, 3).map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-ink-soft"><Check size={15} className="text-success-500" /> {f.text}</li>
                ))}
              </ul>
              <button disabled={isCurrent || busyPlan === plan.id} onClick={() => handleUpgrade(plan)}
                className={`mt-auto btn w-full ${isCurrent ? "bg-cream-200 text-ink-muted cursor-default" : "btn-primary"}`}>
                {busyPlan === plan.id ? (
                  <><Loader2 size={16} className="animate-spin" /> Processing…</>
                ) : isCurrent ? (
                  "Current plan"
                ) : !anyGateway ? (
                  <>Activate (dev) <ArrowRight size={15} /></>
                ) : (
                  <><CreditCard size={15} /> Pay & upgrade</>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-ink-muted mt-6 flex items-center gap-1.5">
        <ShieldCheck size={13} />
        Payment verify hone ke baad backend aapke seat & lead limits turant badha deta hai. Secrets sirf server par hain.
      </p>
    </Layout>
  );
}

function UsageMeter({ icon: Icon, label, used, limit, pct }) {
  return (
    <div className="bg-cream-50 rounded-xl border border-cream-300/50 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-ink flex items-center gap-2"><Icon size={16} className="text-orange-500" /> {label}</span>
        <span className="text-sm font-mono text-ink-soft">{used} / {limit}</span>
      </div>
      <div className="w-full bg-cream-200 rounded-full h-2">
        <div className={`h-2 rounded-full ${pct >= 100 ? "bg-danger-500" : "bg-gradient-orange"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
