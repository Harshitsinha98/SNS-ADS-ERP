import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  Building2, User, Phone, ArrowRight, ArrowLeft, Loader2, ShieldCheck,
  CheckCircle2, Sparkles, Check, CreditCard, Gift, Users, Inbox, Lock,
  Zap, Brain, MessageSquare, Star, Shield, Clock, Rocket, TrendingUp,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { auth } from "../../firebase";
import Logo from "../../components/marketing/Logo";
import { TRIAL_DAYS, mergePlansWithConfig } from "../../data/plans";
import { fetchPlatformConfig } from "../../utils/platformConfig";
import {
  getAccountStatus, getBillingConfig, createSignupOrder, verifySignupPayment, getSignupPayuHash,
  provisionTrialWorkspace, loadRazorpayScript, submitPayuForm,
} from "../../utils/billingApi";

export default function Signup() {
  const { user, requestOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState("details"); // details -> otp -> checkout -> done
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [planId, setPlanId] = useState(location.state?.planId || "starter");
  const [cycle, setCycle] = useState(location.state?.cycle || "monthly");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [checkingAccount, setCheckingAccount] = useState(false);
  const [existingAccount, setExistingAccount] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [config, setConfig] = useState(null);
  const [gateways, setGateways] = useState({ razorpay: false, payu: false });
  const [method, setMethod] = useState("razorpay");
  const [trialAvailable, setTrialAvailable] = useState(true);
  const [payBusy, setPayBusy] = useState(false);

  useEffect(() => {
    fetchPlatformConfig().then(setConfig);
    getBillingConfig().then((g) => {
      setGateways(g);
      setMethod(g.razorpay ? "razorpay" : g.payu ? "payu" : "razorpay");
    });
  }, []);

  // Already logged-in user with an org → send them in.
  useEffect(() => {
    if (user && !user.needsSetup && !user.isPlatformOwner) {
      const isAdminish = user.role === "admin" || user.role === "owner";
      navigate(isAdminish ? "/admin" : "/app", { replace: true });
    }
  }, [user, navigate]);

  const { plans } = mergePlansWithConfig(config);
  const plan = plans.find((p) => p.id === planId) || plans[0];
  const trialDays = config && Number.isFinite(config.trialDays) ? config.trialDays : TRIAL_DAYS;
  const price = cycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
  const planIsStarter = plan.id === "starter";
  const canFreeTrial = planIsStarter && plan.trial && trialAvailable;
  const anyGateway = gateways.razorpay || gateways.payu;

  const checkExistingPhone = async (value = phone) => {
    const normalizedPhone = String(value || "").replace(/\D/g, "");
    if (normalizedPhone.length !== 10) {
      setExistingAccount(false);
      return false;
    }
    setCheckingAccount(true);
    try {
      const result = await getAccountStatus(normalizedPhone);
      setExistingAccount(Boolean(result.registered));
      return Boolean(result.registered);
    } catch (error) {
      setErr(error.message || "Could not check this number. Please try again.");
      return null;
    } finally {
      setCheckingAccount(false);
    }
  };

  const handlePhoneChange = (value) => {
    setPhone(value.replace(/\D/g, ""));
    setExistingAccount(false);
    setErr("");
  };

  // ---- Step 1: details -> account check -> send OTP ----
  const submitDetails = async (e) => {
    e.preventDefault();
    setErr("");
    if (phone.length !== 10) return setErr("Please enter a valid 10-digit mobile number.");

    setLoading(true);
    const registered = await checkExistingPhone(phone);
    if (registered === null) {
      setLoading(false);
      return;
    }
    if (registered) {
      setLoading(false);
      setStep("registered");
      return;
    }
    if (!fullName.trim()) {
      setLoading(false);
      return setErr("Please enter your name.");
    }
    if (!orgName.trim()) {
      setLoading(false);
      return setErr("Please enter your organization name.");
    }
    const res = await requestOtp(phone.trim());
    setLoading(false);
    if (res.ok) { setConfirmation(res.confirmation); setStep("otp"); }
    else setErr(res.error);
  };

  // ---- Step 2: verify OTP -> go to checkout (no workspace yet) ----
  const submitOtp = async (e) => {
    e.preventDefault();
    setErr("");
    if (otp.length !== 6) return setErr("Please enter the 6-digit code.");
    setLoading(true);
    const res = await verifyOtp(confirmation, otp.trim());
    if (!res.ok) { setLoading(false); return setErr(res.error); }

    // The backend is authoritative for one-trial-per-phone enforcement. It
    // returns a clear error if this verified number has already used a trial.
    setTrialAvailable(true);
    setLoading(false);
    setStep("checkout");
  };

  // ---- Free trial (Starter only): create workspace client-side ----
  const startFreeTrial = async () => {
    setErr(""); setPayBusy(true);
    try {
      if (!auth.currentUser?.uid) throw new Error("Session expired — please sign in again.");
      await provisionTrialWorkspace({ orgName: orgName.trim(), fullName: fullName.trim() });
      setStep("done");
      setTimeout(() => window.location.assign("/admin"), 1600);
    } catch (e2) {
      console.error("[signup] trial create failed:", e2?.code, e2?.message);
      setErr(errMsg(e2));
      setPayBusy(false);
    }
  };

  // ---- Pay now: workspace is provisioned by the backend AFTER payment ----
  const payAndCreate = async () => {
    setErr(""); setPayBusy(true);
    try {
      if (!anyGateway) throw new Error("Payment gateway is not available yet. Please set VITE_BACKEND_URL.");

      if (method === "razorpay" && gateways.razorpay) {
        const ok = await loadRazorpayScript();
        if (!ok) throw new Error("Razorpay checkout failed to load.");
        const order = await createSignupOrder({ orgName: orgName.trim(), fullName: fullName.trim(), planId: plan.id, cycle });
        await new Promise((resolve, reject) => {
          const rzp = new window.Razorpay({
            key: order.keyId, amount: order.amount, currency: order.currency,
            name: "Codeskate CRM", description: `${plan.name} plan (${cycle})`, order_id: order.orderId,
            prefill: { name: fullName, contact: phone },
            theme: { color: "#F04E00" },
            handler: async (resp) => {
              try {
                await verifySignupPayment({
                  razorpay_order_id: resp.razorpay_order_id,
                  razorpay_payment_id: resp.razorpay_payment_id,
                  razorpay_signature: resp.razorpay_signature,
                });
                resolve();
              } catch (e) { reject(e); }
            },
            modal: { ondismiss: () => reject(new Error("Payment cancelled — no workspace was created.")) },
          });
          rzp.open();
        });
        setStep("done");
        setTimeout(() => window.location.assign("/admin"), 1600);
      } else if (method === "payu" && gateways.payu) {
        const { action, params } = await getSignupPayuHash({ orgName, fullName, planId: plan.id, cycle });
        submitPayuForm(action, params); // redirects to PayU; backend provisions on callback
      } else {
        throw new Error("This payment method is not configured.");
      }
    } catch (e2) {
      console.error("[signup] pay failed:", e2?.code, e2?.message);
      setErr(e2.message || "Payment failed.");
      setPayBusy(false);
    }
  };

  const errMsg = (e2) => {
    if (e2?.code === "permission-denied") return "Firestore rules are not published. Publish them in Console → Rules.";
    if (e2?.code === "deadline-exceeded") return "Can't reach Firestore. Check that the database has been created.";
    return e2?.message || "Something went wrong. Please try again.";
  };

  return (
    <div className="min-h-screen bg-cream-100 flex flex-col lg:flex-row">
      {/* LEFT brand panel — Premium showcase */}
      <div className="relative lg:w-[45%] bg-ink texture-grain overflow-hidden hidden lg:flex flex-col justify-between p-10 xl:p-14">
        {/* Animated background elements */}
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-orange-600/20 rounded-full blur-3xl animate-blob" />
        <div className="absolute bottom-20 -left-20 w-80 h-80 bg-purple-500/15 rounded-full blur-3xl animate-blob" style={{ animationDelay: "3s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30rem] h-[30rem] bg-ember-500/10 rounded-full blur-3xl animate-blob" style={{ animationDelay: "6s" }} />
        <div className="absolute inset-0 pattern-grid opacity-15" />

        {/* Logo */}
        <div className="relative"><Link to="/"><Logo size="lg" onDark /></Link></div>

        {/* Main headline */}
        <div className="relative space-y-8">
          <div>
            <div className="inline-flex items-center gap-2 bg-orange-500/15 border border-orange-400/30 rounded-full px-4 py-1.5 mb-5">
              <Rocket size={13} className="text-orange-400" />
              <span className="text-[11px] font-bold text-orange-300 uppercase tracking-wider">Join 180+ growing businesses</span>
            </div>
            <h2 className="font-display font-bold text-3xl xl:text-[2.5rem] text-white leading-tight mb-4">
              Your AI-powered sales engine starts here
            </h2>
            <p className="text-cream-300/80 text-sm leading-relaxed max-w-sm">
              Set up in 2 minutes. First lead captured in 10. First AI reply sent in under a minute. No technical skills required.
            </p>
          </div>

          {/* Feature highlights with icons */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Brain, label: "AI Auto-Reply", sub: "3-second responses" },
              { icon: MessageSquare, label: "WhatsApp API", sub: "Built-in integration" },
              { icon: Zap, label: "Workflow Engine", sub: "Automate everything" },
              { icon: TrendingUp, label: "Live Analytics", sub: "Real-time pipeline" },
            ].map((f) => (
              <div key={f.label} className="bg-white/5 border border-white/10 rounded-xl p-3.5 backdrop-blur-sm hover:bg-white/10 transition-colors">
                <f.icon size={16} className="text-orange-400 mb-1.5" />
                <p className="text-xs font-semibold text-white">{f.label}</p>
                <p className="text-[10px] text-cream-400/70">{f.sub}</p>
              </div>
            ))}
          </div>

          {/* Live stats */}
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="font-display font-bold text-2xl text-orange-400">12.4K+</p>
              <p className="text-[10px] text-cream-400/70">AI replies today</p>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div className="text-center">
              <p className="font-display font-bold text-2xl text-emerald-400">70%</p>
              <p className="text-[10px] text-cream-400/70">auto-resolved</p>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div className="text-center">
              <p className="font-display font-bold text-2xl text-purple-400">3s</p>
              <p className="text-[10px] text-cream-400/70">response time</p>
            </div>
          </div>
        </div>

        {/* Testimonial */}
        <div className="relative bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex gap-0.5 mb-2.5">
            {[...Array(5)].map((_, i) => <Star key={i} size={12} className="text-orange-400" fill="currentColor" />)}
          </div>
          <p className="text-cream-200 text-sm leading-relaxed mb-3">
            "We replaced 3 employees with Codeskate AI and our conversion rate went up 3x. Best decision this year."
          </p>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-xs font-bold text-orange-400">V</div>
            <div>
              <p className="text-xs font-semibold text-white">Vikram Saxena</p>
              <p className="text-[10px] text-cream-400/60">Director, Meridian Properties</p>
            </div>
          </div>
        </div>

        {/* Trust badges */}
        <div className="relative flex items-center gap-4">
          {[
            { icon: Shield, text: "Bank-level security" },
            { icon: Clock, text: "2-min setup" },
            { icon: Lock, text: "Data encrypted" },
          ].map((b) => (
            <div key={b.text} className="flex items-center gap-1.5 text-[10px] text-cream-400/60">
              <b.icon size={11} className="text-cream-500/50" />
              <span>{b.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT form */}
      <div className="flex-1 flex items-center justify-center p-5 sm:p-8 lg:p-12 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-cream-100 via-white to-orange-50/30 pointer-events-none" />
        <div className="absolute top-10 right-10 w-64 h-64 bg-orange-100/40 rounded-full blur-3xl pointer-events-none hidden lg:block" />
        <div className="absolute bottom-10 left-10 w-48 h-48 bg-purple-100/20 rounded-full blur-3xl pointer-events-none hidden lg:block" />
        <div id="recaptcha-container" />
        <div className="relative w-full max-w-[26rem]">
          <div className="lg:hidden flex justify-center mb-8"><Link to="/"><Logo /></Link></div>

          {step === "done" ? (
            <div className="bg-white rounded-3xl shadow-soft border border-cream-300/60 p-10 text-center animate-fade-in relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-emerald-50/50 to-transparent pointer-events-none" />
              <div className="relative">
                <div className="w-20 h-20 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-100">
                  <CheckCircle2 className="w-11 h-11 text-success-600" />
                </div>
                <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 mb-4">
                  <Sparkles size={12} className="text-emerald-600" />
                  <span className="text-[11px] font-bold text-emerald-700">Workspace Created Successfully</span>
                </div>
                <h1 className="font-display font-bold text-2xl text-ink mb-2">You're all set!</h1>
                <p className="text-ink-soft mb-6"><span className="font-semibold text-ink">{orgName}</span> is ready. Taking you to your dashboard now...</p>
                <div className="flex items-center justify-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
                  <span className="text-sm text-ink-muted">Loading your workspace...</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-3xl shadow-xl shadow-cream-300/30 border border-cream-200/80 overflow-hidden">
              {/* Progress bar with glow */}
              <div className="relative">
                <div className="flex">
                  <div className="h-1 flex-1 bg-gradient-orange" />
                  <div className={`h-1 flex-1 transition-colors duration-500 ${step === "otp" || step === "checkout" ? "bg-gradient-orange" : "bg-cream-100"}`} />
                  <div className={`h-1 flex-1 transition-colors duration-500 ${step === "checkout" ? "bg-gradient-orange" : "bg-cream-100"}`} />
                </div>
              </div>

              {/* Step indicators */}
              <div className="flex items-center justify-between px-9 pt-6 pb-0">
                {["Your details", "Verification", "Activate"].map((label, i) => {
                  const isActive = (i === 0 && step === "details") || (i === 1 && step === "otp") || (i === 2 && step === "checkout");
                  const isDone = (i === 0 && step !== "details") || (i === 1 && step === "checkout");
                  return (
                    <div key={label} className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-300 ${isDone ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200" : isActive ? "bg-orange-500 text-white shadow-sm shadow-orange-200" : "bg-cream-100 text-ink-muted"}`}>
                        {isDone ? <Check size={12} strokeWidth={3} /> : i + 1}
                      </span>
                      <span className={`text-xs font-medium hidden sm:inline ${isActive ? "text-ink" : isDone ? "text-emerald-600" : "text-ink-muted"}`}>{label}</span>
                    </div>
                  );
                })}
              </div>

              <div className="p-7 sm:p-9">
                {err && (
                  <div className="bg-danger-50 text-danger-600 text-sm px-4 py-3 rounded-xl mb-4 border border-danger-100">{err}</div>
                )}

                {step === "details" && (
                  <>
                    <h1 className="font-display font-bold text-2xl text-ink mb-1">Get started for free</h1>
                    <p className="text-sm text-ink-soft mb-7">Takes less than 2 minutes. No credit card needed.</p>
                    <form onSubmit={submitDetails} className="space-y-5">
                      <Field icon={User} label="Your name" value={fullName} onChange={setFullName} placeholder="e.g. Rohan Mehta" disabled={loading} />
                      <Field icon={Building2} label="Organization name" value={orgName} onChange={setOrgName} placeholder="e.g. Meridian Properties" disabled={loading} />
                      <div>
                        <label className="block text-sm font-medium text-ink mb-1.5">Mobile number</label>
                        <div className="relative">
                          <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" size={18} />
                          <span className="absolute left-11 top-1/2 -translate-y-1/2 text-ink-soft font-medium text-sm">+91</span>
                          <input type="tel" className="input pl-[4.5rem]" placeholder="98XXXXXXXX" value={phone}
                            onChange={(e) => handlePhoneChange(e.target.value)}
                            onBlur={() => checkExistingPhone()}
                            maxLength={10} disabled={loading || checkingAccount} />
                        </div>
                        {checkingAccount && <p className="mt-1.5 text-xs text-ink-muted flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Checking availability...</p>}
                        {existingAccount && (
                          <p className="mt-1.5 text-xs text-orange-700">
                            This number is already registered. <button type="button" onClick={() => navigate("/login")} className="font-semibold underline">Log in instead</button>.
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-ink mb-2">Choose your plan</label>
                        <div className="grid grid-cols-3 gap-2.5">
                          {plans.map((p) => (
                            <button key={p.id} type="button" onClick={() => setPlanId(p.id)}
                              className={`relative rounded-xl border px-3 py-3 text-center transition-all duration-200 ${planId === p.id ? "border-orange-400 bg-orange-50/70 shadow-sm shadow-orange-100" : "border-cream-200 hover:border-orange-200 hover:bg-cream-50"}`}>
                              {p.popular && <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full">POPULAR</span>}
                              <span className={`block text-sm font-bold ${planId === p.id ? "text-orange-700" : "text-ink"}`}>{p.name}</span>
                              <span className="block text-[11px] text-ink-muted mt-0.5">₹{p.monthlyPrice.toLocaleString("en-IN")}/mo</span>
                              <span className={`block text-[10px] mt-1 font-medium ${p.trial ? "text-emerald-600" : "text-ink-muted/60"}`}>{p.trial ? "7-day free trial" : "Paid plan"}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <button type="submit" disabled={loading || checkingAccount || existingAccount} className="btn btn-primary w-full py-3.5 text-base mt-2">
                        {loading || checkingAccount ? <><Loader2 size={18} className="animate-spin" /> Please wait...</> : existingAccount ? <>Account exists — log in instead</> : <>Continue <ArrowRight size={18} /></>}
                      </button>
                    </form>
                    <p className="text-center text-sm text-ink-muted mt-6">
                      Already have an account? <Link to="/login" className="text-orange-600 font-semibold hover:underline">Sign in</Link>
                    </p>
                  </>
                )}

                {step === "registered" && (
                  <>
                    <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-4"><ShieldCheck className="text-orange-600" size={24} /></div>
                    <p className="eyebrow mb-2">Account found</p>
                    <h1 className="font-display font-bold text-2xl text-ink mb-2">You are already registered</h1>
                    <p className="text-sm text-ink-soft mb-6">This mobile number already has a Codeskate CRM account. Please sign in to continue—no new OTP or purchase is needed here.</p>
                    <button onClick={() => navigate("/login")} className="btn btn-primary w-full py-3.5 text-base">
                      Go to login <ArrowRight size={18} />
                    </button>
                    <button onClick={() => { setExistingAccount(false); setStep("details"); }} className="w-full mt-3 text-sm font-medium text-ink-muted hover:text-orange-600">
                      Use a different number
                    </button>
                  </>
                )}

                {step === "otp" && (
                  <>
                    <button onClick={() => { setStep("details"); setOtp(""); setErr(""); }} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-orange-600 mb-6 transition-colors"><ArrowLeft size={16} /> Back</button>
                    <div className="w-14 h-14 bg-gradient-to-br from-orange-100 to-orange-50 rounded-2xl flex items-center justify-center mb-5 shadow-sm">
                      <ShieldCheck className="text-orange-600" size={26} />
                    </div>
                    <h1 className="font-display font-bold text-2xl text-ink mb-1">Verify your number</h1>
                    <p className="text-sm text-ink-soft mb-7">We sent a 6-digit code to <span className="font-semibold text-ink">+91 {phone.slice(0,5)} {phone.slice(5)}</span></p>
                    <form onSubmit={submitOtp} className="space-y-5">
                      <div>
                        <input className="input text-center text-2xl tracking-[0.6em] font-mono h-14 bg-cream-50/50 border-cream-200 focus:border-orange-300 focus:bg-white" placeholder="------" value={otp}
                          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} maxLength={6} autoFocus disabled={loading} />
                        <p className="text-xs text-ink-muted mt-2 text-center">Didn't receive it? Check your messages or wait 30 seconds.</p>
                      </div>
                      <button type="submit" disabled={loading} className="btn btn-primary w-full py-3.5 text-base">
                        {loading ? <><Loader2 size={18} className="animate-spin" /> Verifying...</> : <>Verify & continue <ArrowRight size={18} /></>}
                      </button>
                    </form>
                  </>
                )}

                {step === "checkout" && (
                  <>
                    <button onClick={() => { setStep("otp"); setErr(""); }} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-orange-600 mb-6 transition-colors"><ArrowLeft size={16} /> Back</button>
                    <h1 className="font-display font-bold text-2xl text-ink mb-1">Almost there!</h1>
                    <p className="text-sm text-ink-soft mb-6">Confirm your plan and you'll be inside your new workspace in seconds.</p>

                    {/* Plan summary card */}
                    <div className={`rounded-2xl border p-5 mb-6 transition-all ${plan.popular ? "border-orange-200 bg-gradient-to-br from-orange-50/60 to-cream-50 shadow-sm shadow-orange-100/50" : "border-cream-200 bg-cream-50/50"}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-display font-bold text-lg text-ink">{plan.name}</h3>
                            {plan.popular && <span className="text-[9px] font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full">POPULAR</span>}
                          </div>
                          <p className="text-xs text-ink-muted mt-0.5">{plan.tagline}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-display font-bold text-2xl text-ink">₹{price.toLocaleString("en-IN")}</p>
                          <p className="text-[11px] text-ink-muted">per {cycle === "monthly" ? "month" : "year"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-ink-soft border-t border-cream-200/80 pt-3">
                        <span className="flex items-center gap-1.5"><Users size={13} className="text-orange-500" /> {plan.includedSeats} seats</span>
                        <span className="flex items-center gap-1.5"><Inbox size={13} className="text-orange-500" /> {plan.leadsLimit >= 1000000 ? "Unlimited" : plan.leadsLimit.toLocaleString("en-IN")} leads</span>
                      </div>
                    </div>

                    {/* billing cycle toggle */}
                    <div className="flex items-center justify-between mb-5 bg-cream-50/50 rounded-xl p-3 border border-cream-100">
                      <span className="text-sm font-medium text-ink">Billing cycle</span>
                      <div className="inline-flex bg-white rounded-full p-0.5 text-sm border border-cream-200 shadow-sm">
                        <button onClick={() => setCycle("monthly")} className={`px-4 py-1.5 rounded-full font-medium transition-all ${cycle === "monthly" ? "bg-orange-500 text-white shadow-sm" : "text-ink-muted hover:text-ink"}`}>Monthly</button>
                        <button onClick={() => setCycle("yearly")} className={`px-4 py-1.5 rounded-full font-medium transition-all ${cycle === "yearly" ? "bg-orange-500 text-white shadow-sm" : "text-ink-muted hover:text-ink"}`}>Yearly <span className="text-[9px] font-bold ml-0.5">-20%</span></button>
                      </div>
                    </div>

                    {/* payment method (only relevant for paying) */}
                    {anyGateway && (
                      <div className="flex items-center justify-between mb-5">
                        <span className="text-sm font-medium text-ink">Pay with</span>
                        <div className="inline-flex bg-cream-200 rounded-full p-1 text-sm">
                          {gateways.razorpay && <button onClick={() => setMethod("razorpay")} className={`px-3 py-1.5 rounded-full font-medium ${method === "razorpay" ? "bg-white shadow-sm text-ink" : "text-ink-muted"}`}>Razorpay</button>}
                          {gateways.payu && <button onClick={() => setMethod("payu")} className={`px-3 py-1.5 rounded-full font-medium ${method === "payu" ? "bg-white shadow-sm text-ink" : "text-ink-muted"}`}>PayU</button>}
                        </div>
                      </div>
                    )}

                    {/* ACTIONS */}
                    <div className="space-y-3">
                      {canFreeTrial && (
                        <button onClick={startFreeTrial} disabled={payBusy} className="btn btn-secondary w-full py-3.5 text-base border-success-300 text-success-700 hover:bg-success-50">
                          {payBusy ? <><Loader2 size={18} className="animate-spin" /> Setting up…</> : <><Gift size={18} /> Start {trialDays}-day free trial</>}
                        </button>
                      )}

                      <button onClick={payAndCreate} disabled={payBusy || (!anyGateway)} className="btn btn-primary w-full py-3.5 text-base">
                        {payBusy ? <><Loader2 size={18} className="animate-spin" /> Processing…</>
                          : <><CreditCard size={18} /> Pay ₹{price.toLocaleString("en-IN")} & activate</>}
                      </button>

                      {planIsStarter && !canFreeTrial && (
                        <p className="text-xs text-warning-700 text-center">This number has already used its free trial — pay to activate.</p>
                      )}
                      {!planIsStarter && (
                        <p className="text-xs text-ink-muted text-center flex items-center justify-center gap-1.5">
                          <Lock size={12} /> {plan.name} is a paid plan — your workspace is created only after payment.
                        </p>
                      )}
                      {!anyGateway && (
                        <p className="text-xs text-danger-600 text-center">Payment gateway is unreachable (set VITE_BACKEND_URL).</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <p className="text-center text-xs text-ink-muted mt-5">By continuing you agree to our <Link to="/terms" className="underline hover:text-orange-600">Terms</Link> & <Link to="/privacy" className="underline hover:text-orange-600">Privacy Policy</Link></p>

          {/* Mobile trust badges (hidden on desktop — shown on left panel) */}
          <div className="lg:hidden flex items-center justify-center gap-4 mt-4">
            {[
              { icon: Shield, text: "Secure" },
              { icon: Clock, text: "2-min setup" },
              { icon: Lock, text: "Encrypted" },
            ].map((b) => (
              <div key={b.text} className="flex items-center gap-1 text-[10px] text-ink-muted">
                <b.icon size={10} className="text-ink-muted/60" />
                <span>{b.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ icon: Icon, label, value, onChange, placeholder, disabled }) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink mb-1.5">{label}</label>
      <div className="relative group">
        <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted/70 group-focus-within:text-orange-500 transition-colors" size={18} />
        <input className="input pl-11 bg-cream-50/30 border-cream-200 focus:border-orange-300 focus:bg-white focus:shadow-sm focus:shadow-orange-100/50 transition-all" placeholder={placeholder} value={value}
          onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      </div>
    </div>
  );
}
