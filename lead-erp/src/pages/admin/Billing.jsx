import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import Layout from "../../components/Layout";
import { useBilling } from "../../context/BillingContext";
import { useData } from "../../context/DataContext";
import { useAuth } from "../../context/AuthContext";
import { fetchPlatformConfig } from "../../utils/platformConfig";
import { mergePlansWithConfig, limitsForPlan, PLAN_ORDER, isUpgrade, getPlanById } from "../../data/plans";
import {
  getBillingConfig, createRazorpayOrder, verifyRazorpayPayment, getPayuHash,
  createSubscription, verifySubscription, cancelAutopay,
  loadRazorpayScript, submitPayuForm,
} from "../../utils/billingApi";
import {
  Check, Sparkles, Users, Inbox, Clock, ArrowRight, Loader2, ShieldCheck,
  CreditCard, RefreshCw, Zap, Lock, TrendingUp, X, AlertTriangle, Repeat, ChevronDown,
} from "lucide-react";

const fmtDate = (ms) => ms ? new Date(ms).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function Billing() {
  const b = useBilling();
  const { changePlan, scheduleDowngrade, cancelDowngrade } = useData();
  const { user } = useAuth();
  const location = useLocation();

  const [config, setConfig] = useState(null);
  const [gateways, setGateways] = useState({ razorpay: false, payu: false });
  const [cycle, setCycle] = useState(b.billingCycle || "monthly");
  const [method, setMethod] = useState("razorpay");
  const [autopayWanted, setAutopayWanted] = useState(false);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState("");
  const [downgradeModal, setDowngradeModal] = useState(null); // target plan
  const [showManage, setShowManage] = useState(false);

  useEffect(() => {
    fetchPlatformConfig().then(setConfig);
    getBillingConfig().then((g) => {
      setGateways(g);
      setMethod(g.razorpay ? "razorpay" : g.payu ? "payu" : "razorpay");
    });
    const params = new URLSearchParams(location.search);
    const payu = params.get("payu");
    if (payu === "success") setMsg("✅ Payment successful — your plan is now active!");
    else if (payu === "failed") setMsg("❌ PayU payment failed.");
    else if (payu === "error") setMsg("⚠️ Something went wrong with the PayU payment.");
  }, [location.search]);

  const { plans } = mergePlansWithConfig(config);
  const anyGateway = gateways.razorpay || gateways.payu;
  const currentPlan = plans.find((p) => p.id === b.planId) || plans[0];

  // Post-purchase = active or past_due → upgrade-only view.
  const hasPaid = b.isActive || b.isPastDue;
  const higherPlans = plans.filter((p) => isUpgrade(b.planId, p.id));
  const lowerPlans = plans.filter((p) => p.id !== b.planId && !isUpgrade(b.planId, p.id));

  const seatPct = b.seatsLimit > 0 ? Math.min(100, Math.round((b.seatsUsed / b.seatsLimit) * 100)) : 0;
  const leadPct = b.leadsLimit > 0 ? Math.min(100, Math.round((b.leadsUsed / b.leadsLimit) * 100)) : 0;

  // ---- payment ----
  const doPayment = async (plan, { autopay = false } = {}) => {
    if (!anyGateway) {
      const res = await changePlan(limitsForPlan(plan.id, config));
      setMsg(res?.ok ? `✅ (Dev) ${plan.name} activated — no payment gateway configured.` : (res?.error || "Could not activate."));
      return;
    }
    if (method === "razorpay" && gateways.razorpay) {
      const ok = await loadRazorpayScript();
      if (!ok) throw new Error("Razorpay checkout failed to load.");
      if (autopay) {
        const sub = await createSubscription({ orgId: b.org.id, planId: plan.id, cycle });
        await new Promise((resolve, reject) => {
          const rzp = new window.Razorpay({
            key: sub.keyId, subscription_id: sub.subscriptionId, name: "CodeSkate",
            description: `${plan.name} (${cycle}) · Autopay`,
            prefill: { name: user?.displayName || "", contact: (user?.phone || "").replace("+91", "") },
            theme: { color: "#F04E00" },
            handler: async (r) => {
              try {
                await verifySubscription({ orgId: b.org.id, planId: plan.id, cycle,
                  razorpay_payment_id: r.razorpay_payment_id, razorpay_subscription_id: r.razorpay_subscription_id, razorpay_signature: r.razorpay_signature });
                resolve();
              } catch (e) { reject(e); }
            },
            modal: { ondismiss: () => reject(new Error("Autopay setup was cancelled.")) },
          });
          rzp.open();
        });
      } else {
        const order = await createRazorpayOrder({ orgId: b.org.id, planId: plan.id, cycle });
        await new Promise((resolve, reject) => {
          const rzp = new window.Razorpay({
            key: order.keyId, amount: order.amount, currency: order.currency, order_id: order.orderId,
            name: "CodeSkate", description: `${plan.name} (${cycle})`,
            prefill: { name: user?.displayName || "", contact: (user?.phone || "").replace("+91", "") },
            theme: { color: "#F04E00" },
            handler: async (r) => {
              try {
                await verifyRazorpayPayment({ orgId: b.org.id, planId: plan.id, cycle,
                  razorpay_order_id: r.razorpay_order_id, razorpay_payment_id: r.razorpay_payment_id, razorpay_signature: r.razorpay_signature });
                resolve();
              } catch (e) { reject(e); }
            },
            modal: { ondismiss: () => reject(new Error("Payment was cancelled.")) },
          });
          rzp.open();
        });
      }
    } else if (method === "payu" && gateways.payu) {
      const { action, params } = await getPayuHash({ orgId: b.org.id, planId: plan.id, cycle,
        firstname: user?.displayName || "Customer", email: "customer@codeskate.app", phone: (user?.phone || "").replace("+91", "") });
      submitPayuForm(action, params);
      return "redirect";
    }
  };

  const handlePay = async (plan, opts) => {
    setMsg(""); setBusy(plan.id + (opts?.autopay ? "-auto" : ""));
    try {
      const r = await doPayment(plan, opts);
      if (r !== "redirect") setMsg(`✅ Done — the ${plan.name} plan is now active!`);
    } catch (e) { setMsg(e.message || "Payment failed."); }
    finally { setBusy(null); }
  };

  const handleRenew = () => handlePay(currentPlan, { autopay: false });

  const confirmDowngrade = async () => {
    const target = downgradeModal;
    setDowngradeModal(null); setBusy("downgrade"); setMsg("");
    const res = await scheduleDowngrade(target.id, cycle, b.currentPeriodEndMs);
    setBusy(null);
    setMsg(res?.ok
      ? `Downgrade to ${target.name} will apply on ${fmtDate(b.currentPeriodEndMs)}. Until then, enjoy ${currentPlan.name}!`
      : (res?.error || "Could not schedule downgrade."));
  };

  const undoDowngrade = async () => {
    setBusy("undo"); const res = await cancelDowngrade(); setBusy(null);
    setMsg(res?.ok ? `Great choice! You'll stay on ${currentPlan.name}. 🎉` : "");
  };

  const stopAutopay = async () => {
    setBusy("cancelauto"); setMsg("");
    try { await cancelAutopay({ orgId: b.org.id }); setMsg("Autopay turned off. Your plan stays active until the current period ends."); }
    catch (e) { setMsg(e.message || "Could not cancel."); }
    finally { setBusy(null); }
  };

  return (
    <Layout title="Billing & Subscription">
      {/* ===== Scheduled downgrade banner (retention) ===== */}
      {b.pendingPlanChange && (
        <div className="bg-warning-50 border border-warning-200 rounded-xl p-4 mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <TrendingUp className="text-warning-600 shrink-0" size={20} />
          <div className="flex-1 text-sm text-ink-soft">
            On <span className="font-semibold text-ink">{fmtDate(b.currentPeriodEndMs)}</span> you'll move to{" "}
            <span className="font-semibold">{getPlanById(b.pendingPlanChange.toPlanId)?.name}</span> —
            and lose the benefits of <span className="font-semibold text-ember-600">{currentPlan.name}</span>.
            Changed your mind?
          </div>
          <button onClick={undoDowngrade} disabled={busy === "undo"} className="btn btn-primary text-sm whitespace-nowrap">
            {busy === "undo" ? <Loader2 size={15} className="animate-spin" /> : <>Keep {currentPlan.name}</>}
          </button>
        </div>
      )}

      {/* ===== Past due / renewal banner ===== */}
      {b.isPastDue && (
        <div className="bg-danger-50 border border-danger-200 rounded-xl p-4 mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <AlertTriangle className="text-danger-600 shrink-0" size={20} />
          <p className="flex-1 text-sm text-danger-700">Your plan has expired — you're in the grace period. Renew now or your features will be locked.</p>
          <button onClick={handleRenew} disabled={busy} className="btn btn-primary text-sm whitespace-nowrap">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <><RefreshCw size={15} /> Renew now</>}
          </button>
        </div>
      )}

      {/* ===== Current plan card ===== */}
      <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <p className="eyebrow mb-1">Current plan</p>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="font-display font-bold text-2xl text-ink">{b.planName}</h2>
              {b.isActive && <span className="badge badge-success">Active</span>}
              {b.isPastDue && <span className="badge badge-danger">Past due</span>}
              {b.isTrialing && <span className="badge badge-warning">Trial · {b.trialDaysLeft}d left</span>}
              {b.isExpired && <span className="badge badge-danger">Expired</span>}
              {b.autopay && <span className="badge badge-primary flex items-center gap-1"><Repeat size={11} /> Autopay ON</span>}
            </div>
            {hasPaid && b.currentPeriodEndMs > 0 && (
              <p className="text-sm text-ink-soft mt-1.5 flex items-center gap-1.5">
                <Clock size={14} className="text-orange-500" />
                {b.autopay ? "Next auto-charge" : "Renews / expires"} on <span className="font-medium text-ink">{fmtDate(b.currentPeriodEndMs)}</span>
                {b.daysToRenewal != null && b.daysToRenewal >= 0 && <span className="text-ink-muted">({b.daysToRenewal}d)</span>}
              </p>
            )}
            {b.isTrialing && <p className="text-sm text-ink-soft mt-1">Free trial — activate a paid plan anytime from below.</p>}
          </div>
          <div className="w-14 h-14 rounded-2xl bg-gradient-orange flex items-center justify-center shadow-glow">
            <Sparkles className="text-white" size={26} />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <UsageMeter icon={Users} label="Team seats" used={b.seatsUsed} limit={b.seatsLimit} pct={seatPct} />
          <UsageMeter icon={Inbox} label="Leads this cycle" used={b.leadsUsed}
            limit={b.leadsLimit >= 1000000 ? "∞" : b.leadsLimit} pct={b.leadsLimit >= 1000000 ? 4 : leadPct} />
        </div>

        {/* Renew + manage row (only when paid) */}
        {hasPaid && (
          <div className="flex flex-wrap items-center gap-3 mt-5 pt-5 border-t border-cream-200">
            {(b.renewalDue || b.isPastDue) && !b.autopay && (
              <button onClick={handleRenew} disabled={busy} className="btn btn-primary text-sm">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <><RefreshCw size={15} /> Renew {currentPlan.name}</>}
              </button>
            )}
            {!b.autopay && gateways.razorpay && (
              <button onClick={() => handlePay(currentPlan, { autopay: true })} disabled={busy} className="btn btn-secondary text-sm">
                <Repeat size={15} /> Enable autopay
              </button>
            )}
            <button onClick={() => setShowManage((v) => !v)} className="text-sm text-ink-muted hover:text-ink flex items-center gap-1 ml-auto">
              Manage subscription <ChevronDown size={14} className={showManage ? "rotate-180" : ""} />
            </button>
          </div>
        )}

        {/* Manage panel: downgrade + cancel autopay */}
        {hasPaid && showManage && (
          <div className="mt-4 pt-4 border-t border-cream-200 space-y-3">
            {b.autopay && (
              <button onClick={stopAutopay} disabled={busy === "cancelauto"} className="text-sm text-ink-soft hover:text-danger-600">
                {busy === "cancelauto" ? "Cancelling…" : "Turn off autopay (stays active until the current period ends)"}
              </button>
            )}
            {lowerPlans.length > 0 && !b.pendingPlanChange && (
              <div>
                <p className="text-xs text-ink-muted mb-2">Downgrade to a smaller plan (applies at the end of the current period):</p>
                <div className="flex flex-wrap gap-2">
                  {lowerPlans.map((p) => (
                    <button key={p.id} onClick={() => setDowngradeModal(p)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-cream-300 text-ink-muted hover:border-danger-300 hover:text-danger-600">
                      Downgrade to {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {msg && <div className="bg-orange-50 border border-orange-200 text-ember-700 rounded-xl px-4 py-3 mb-6 text-sm">{msg}</div>}

      {/* ===== Cycle + method controls ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="eyebrow">{hasPaid ? "Upgrade your plan" : "Choose a plan"}</p>
        <div className="flex items-center gap-3">
          {anyGateway && (
            <div className="inline-flex bg-cream-200 rounded-full p-1 text-sm">
              {gateways.razorpay && <button onClick={() => setMethod("razorpay")} className={`px-3 py-1.5 rounded-full font-medium ${method === "razorpay" ? "bg-white shadow-sm text-ink" : "text-ink-muted"}`}>Razorpay</button>}
              {gateways.payu && <button onClick={() => setMethod("payu")} className={`px-3 py-1.5 rounded-full font-medium ${method === "payu" ? "bg-white shadow-sm text-ink" : "text-ink-muted"}`}>PayU</button>}
            </div>
          )}
          <div className="inline-flex bg-cream-200 rounded-full p-1 text-sm">
            <button onClick={() => setCycle("monthly")} className={`px-4 py-1.5 rounded-full font-medium ${cycle === "monthly" ? "bg-white shadow-sm text-ink" : "text-ink-muted"}`}>Monthly</button>
            <button onClick={() => setCycle("yearly")} className={`px-4 py-1.5 rounded-full font-medium ${cycle === "yearly" ? "bg-white shadow-sm text-ink" : "text-ink-muted"}`}>Yearly</button>
          </div>
        </div>
      </div>

      {!anyGateway && (
        <p className="text-xs text-warning-700 bg-warning-50 border border-warning-200 rounded-lg px-3 py-2 mb-4">
          Payment gateway is unreachable (set VITE_BACKEND_URL). Until then, you can test with "Activate (dev)".
        </p>
      )}

      {/* ===== Plans ===== */}
      {hasPaid ? (
        // Post-purchase: only higher plans as upgrades; cheaper greyed out.
        <>
          <div className="grid md:grid-cols-3 gap-5">
            {plans.map((plan) => {
              const price = cycle === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
              const isCurrent = plan.id === b.planId;
              const canUpgrade = isUpgrade(b.planId, plan.id);
              const locked = !isCurrent && !canUpgrade; // lower plan → greyed
              return (
                <PlanCard key={plan.id} plan={plan} price={price} cycle={cycle}
                  state={isCurrent ? "current" : canUpgrade ? "upgrade" : "locked"}
                  busy={busy === plan.id} anyGateway={anyGateway}
                  onPay={() => handlePay(plan)}
                  onDowngrade={() => setDowngradeModal(plan)} />
              );
            })}
          </div>
          {higherPlans.length === 0 && (
            <p className="text-center text-sm text-ink-muted mt-6">🎉 You're on the top plan — nothing higher!</p>
          )}
        </>
      ) : (
        // Trial / expired: full plan selection.
        <div className="grid md:grid-cols-3 gap-5">
          {plans.map((plan) => {
            const price = cycle === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
            return (
              <PlanCard key={plan.id} plan={plan} price={price} cycle={cycle}
                state="choose" busy={busy === plan.id} anyGateway={anyGateway}
                onPay={() => handlePay(plan)} />
            );
          })}
        </div>
      )}

      <p className="text-xs text-ink-muted mt-6 flex items-center gap-1.5">
        <ShieldCheck size={13} />
        Limits increase only after payment is verified. With autopay it renews automatically each cycle; otherwise you'll get a reminder before expiry.
      </p>

      {/* ===== Downgrade retention modal ===== */}
      {downgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-soft border border-cream-300/60 max-w-md w-full p-6 animate-slide-up">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-warning-100 flex items-center justify-center"><TrendingUp className="text-warning-600" size={22} /></div>
              <button onClick={() => setDowngradeModal(null)} className="text-ink-muted hover:text-ink"><X size={20} /></button>
            </div>
            <h3 className="font-display font-bold text-xl text-ink mb-2">Are you sure you want to move to {downgradeModal.name}?</h3>
            <p className="text-sm text-ink-soft mb-4">
              By leaving {currentPlan.name}, you'll lose:
            </p>
            <ul className="space-y-2 mb-5 text-sm">
              <li className="flex items-center gap-2 text-ink-soft"><X size={15} className="text-danger-500" /> {currentPlan.includedSeats - downgradeModal.includedSeats > 0 ? `${currentPlan.includedSeats - downgradeModal.includedSeats} team seats` : "Extra seats"}</li>
              <li className="flex items-center gap-2 text-ink-soft"><X size={15} className="text-danger-500" /> {(currentPlan.leadsLimit >= 1000000 ? "Unlimited" : currentPlan.leadsLimit.toLocaleString("en-IN"))} → {downgradeModal.leadsLimit.toLocaleString("en-IN")} leads/mo</li>
              {currentPlan.features?.filter((f) => f.included).slice(0, 3).map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-ink-soft"><X size={15} className="text-danger-500" /> {f.text}</li>
              ))}
            </ul>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-5 text-sm text-ember-700">
              💡 With {currentPlan.name}, your team closes more deals, faster. Stay?
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDowngradeModal(null)} className="btn btn-primary flex-1">
                Stay on {currentPlan.name}
              </button>
              <button onClick={confirmDowngrade} className="btn btn-secondary flex-1 text-ink-muted">
                Downgrade anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function PlanCard({ plan, price, cycle, state, busy, anyGateway, onPay, onDowngrade }) {
  const locked = state === "locked";
  return (
    <div className={`rounded-2xl border p-6 flex flex-col transition-all ${
      locked ? "border-cream-200 bg-cream-50 opacity-60"
        : plan.popular ? "border-orange-300 ring-2 ring-orange-100 bg-white shadow-card"
        : "border-cream-300/60 bg-white shadow-card"}`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-display font-bold text-lg text-ink">{plan.name}</h3>
        {state === "current" ? <span className="badge badge-success">Current</span>
          : plan.popular ? <span className="badge badge-primary">Popular</span> : null}
      </div>
      <p className="text-sm text-ink-muted mb-4">{plan.tagline}</p>
      <div className="mb-4">
        <span className="font-display font-bold text-3xl text-ink">₹{price.toLocaleString("en-IN")}</span>
        <span className="text-sm text-ink-muted">/{cycle === "monthly" ? "mo" : "yr"}</span>
      </div>
      <ul className="space-y-2 mb-6 text-sm">
        <li className="flex items-center gap-2 text-ink-soft"><Users size={15} className="text-orange-500" /> {plan.includedSeats} seats</li>
        <li className="flex items-center gap-2 text-ink-soft"><Inbox size={15} className="text-orange-500" /> {plan.leadsLimit >= 1000000 ? "Unlimited" : plan.leadsLimit.toLocaleString("en-IN")} leads/mo</li>
        {plan.features?.filter((f) => f.included).slice(0, 3).map((f, i) => (
          <li key={i} className="flex items-center gap-2 text-ink-soft"><Check size={15} className="text-success-500" /> {f.text}</li>
        ))}
      </ul>
      {state === "current" ? (
        <button disabled className="mt-auto btn w-full bg-cream-200 text-ink-muted cursor-default">Current plan</button>
      ) : locked ? (
        <button disabled className="mt-auto btn w-full bg-cream-100 text-ink-muted/60 cursor-not-allowed flex items-center justify-center gap-1.5">
          <Lock size={14} /> Lower plan
        </button>
      ) : (
        <button disabled={busy} onClick={onPay} className="mt-auto btn btn-primary w-full">
          {busy ? <><Loader2 size={16} className="animate-spin" /> Processing…</>
            : !anyGateway ? <>Activate (dev) <ArrowRight size={15} /></>
            : state === "upgrade" ? <><TrendingUp size={15} /> Upgrade</>
            : <><CreditCard size={15} /> Choose & pay</>}
        </button>
      )}
    </div>
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
