import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  Building2, User, Phone, ArrowRight, ArrowLeft, Loader2, ShieldCheck,
  CheckCircle2, Sparkles, Check,
} from "lucide-react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import { auth, db } from "../../firebase";
import Logo from "../../components/marketing/Logo";
import { PLANS, TRIAL_DAYS } from "../../data/plans";
import { withTimeout } from "../../utils/withTimeout";

const DEFAULT_STATUSES = [
  "New", "Ringing", "Meeting Fixed", "Negotiation", "Follow-up", "Closed-Won", "Lost",
];

export default function Signup() {
  const { user, requestOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // preselected plan coming from Pricing page
  const preselected = location.state?.planId || "growth";
  const preCycle = location.state?.cycle || "monthly";

  const [step, setStep] = useState("details"); // details -> otp -> done
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [planId, setPlanId] = useState(preselected);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const selectedPlan = PLANS.find((p) => p.id === planId) || PLANS[1];

  // If an already-authenticated user with an org lands here, send them in.
  useEffect(() => {
    if (user && !user.needsSetup) {
      const isAdminish = user.role === "admin" || user.role === "owner";
      navigate(isAdminish ? "/admin" : "/app", { replace: true });
    }
  }, [user, navigate]);

  const submitDetails = async (e) => {
    e.preventDefault();
    setErr("");
    if (!fullName.trim()) return setErr("Please enter your name.");
    if (!orgName.trim()) return setErr("Please enter your organization name.");
    if (phone.length !== 10) return setErr("Enter a valid 10-digit mobile number.");

    setLoading(true);
    const res = await requestOtp(phone.trim());
    setLoading(false);
    if (res.ok) {
      setConfirmation(res.confirmation);
      setStep("otp");
    } else {
      setErr(res.error);
    }
  };

  const createOrganization = async (uid) => {
    const orgId = `org_${Date.now()}`;
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // ---- CRITICAL writes: these MUST succeed for login to work ----
    // Each is guarded with a timeout so a stalled Firestore call surfaces an
    // error instead of spinning forever.
    // 1. Organization root
    console.log("[signup] creating organization…", orgId);
    await withTimeout(setDoc(doc(db, "organizations", orgId), {
      name: orgName.trim(),
      slug: orgName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      createdAt: serverTimestamp(),
      createdBy: uid,
      planName: selectedPlan.name,
      subscriptionStatus: "trialing",
      seatsUsed: 1,
      seatsLimit: selectedPlan.includedSeats,
      trialEndsAt,
    }), 15000, "create organization");

    // 2. Global user identity
    console.log("[signup] creating user identity…");
    await withTimeout(setDoc(
      doc(db, "users", uid),
      {
        phone: auth.currentUser?.phoneNumber || `+91${phone}`,
        displayName: fullName.trim(),
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        defaultOrgId: orgId,
      },
      { merge: true }
    ), 15000, "create user");

    // 3. Membership (owner) — required so security rules recognise this user as admin
    console.log("[signup] creating owner membership…");
    await withTimeout(setDoc(doc(db, "memberships", `${uid}_${orgId}`), {
      uid,
      orgId,
      role: "owner",
      displayName: fullName.trim(),
      active: true,
      invitedBy: uid,
      joinedAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
    }), 15000, "create membership");

    // ---- BEST-EFFORT writes: rely on isAdmin() which reads the membership we
    // just created. Firestore rules' get() can briefly lag behind that write,
    // so we don't let these block signup. DataContext falls back to defaults. ----
    try {
      await withTimeout(setDoc(doc(db, "organizations", orgId, "settings", "config"), {
        statuses: DEFAULT_STATUSES,
        autoAssign: "round-robin",
      }), 8000, "settings");
      await withTimeout(setDoc(doc(db, "organizations", orgId, "meta", "leadAssignment"), {
        lastIndex: 0,
      }), 8000, "meta");
      await withTimeout(setDoc(doc(db, "organizations", orgId, "activity", `welcome_${Date.now()}`), {
        text: `🎉 ${fullName.trim()} created ${orgName.trim()} on the ${selectedPlan.name} plan (${TRIAL_DAYS}-day trial)`,
        at: new Date().toISOString(),
        orgId,
      }), 8000, "activity");
    } catch (nonCritical) {
      // Non-fatal: workspace still usable; these self-heal from the app later.
      console.warn("[signup] optional workspace setup skipped:", nonCritical?.code || nonCritical?.message);
    }

    console.log("[signup] workspace ready:", orgId);
    return orgId;
  };

  const submitOtp = async (e) => {
    e.preventDefault();
    setErr("");
    if (otp.length !== 6) return setErr("Enter the 6-digit code.");

    setLoading(true);
    const res = await verifyOtp(confirmation, otp.trim());
    if (!res.ok) {
      setLoading(false);
      return setErr(res.error);
    }

    // Auth succeeded — create the tenant workspace
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("Authentication lost — please resend the code.");
      await createOrganization(uid);
      setStep("done");
      // Full reload so AuthContext re-reads membership and routes to dashboard
      setTimeout(() => {
        window.location.assign("/admin");
      }, 1600);
    } catch (e2) {
      console.error("[signup] org creation failed:", e2?.code, e2?.message);
      const code = e2?.code;
      let msg;
      if (code === "permission-denied") {
        msg = "Workspace nahi bana — Firestore Security Rules deploy nahi hui. Firebase Console → Firestore → Rules me publish karo. (permission-denied)";
      } else if (code === "deadline-exceeded") {
        msg = "Firestore respond nahi kar raha. Check karo ki Firebase me Firestore Database CREATE hui hai (Console → Firestore Database → Create database).";
      } else if (code === "unavailable" || code === "failed-precondition") {
        msg = "Firestore reach nahi ho raha. Internet/Firestore setup check karo.";
      } else {
        msg = `Workspace banane me error: ${code || e2?.message || "unknown"}`;
      }
      setErr(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream-100 flex flex-col lg:flex-row">
      {/* ===== LEFT: brand / value panel ===== */}
      <div className="relative lg:w-[45%] bg-ink texture-grain overflow-hidden hidden lg:flex flex-col justify-between p-10 xl:p-14">
        <div className="absolute -top-16 -right-16 w-80 h-80 bg-orange-600/25 rounded-full blur-3xl animate-blob" />
        <div className="absolute bottom-10 -left-16 w-72 h-72 bg-ember-500/20 rounded-full blur-3xl animate-blob" style={{ animationDelay: "3s" }} />
        <div className="absolute inset-0 pattern-grid opacity-20" />

        <div className="relative">
          <Link to="/"><Logo size="lg" onDark /></Link>
        </div>

        <div className="relative">
          <h2 className="font-display font-bold text-3xl xl:text-4xl text-white leading-tight mb-6">
            Launch your sales
            <br />
            workspace in minutes
          </h2>
          <ul className="space-y-4">
            {[
              `Free ${TRIAL_DAYS}-day trial, no card needed`,
              "Your own isolated, secure workspace",
              "WhatsApp lead capture out of the box",
              "Invite your whole team instantly",
            ].map((t) => (
              <li key={t} className="flex items-center gap-3 text-cream-200">
                <span className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
                  <Check size={14} className="text-orange-400" strokeWidth={3} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="flex gap-1 mb-2">
            {[...Array(5)].map((_, i) => (
              <Sparkles key={i} size={13} className="text-orange-400" fill="currentColor" />
            ))}
          </div>
          <p className="text-cream-200 text-sm leading-relaxed mb-3">
            "We set up CodeSkate and captured our first WhatsApp lead within the hour. Game changer."
          </p>
          <p className="text-xs text-cream-400/70">— Rohan Mehta, Founder at EduLeap</p>
        </div>
      </div>

      {/* ===== RIGHT: form ===== */}
      <div className="flex-1 flex items-center justify-center p-5 sm:p-8 relative">
        <div className="absolute inset-0 pattern-dots opacity-40 pointer-events-none lg:hidden" />
        <div id="recaptcha-container" />

        <div className="relative w-full max-w-md">
          {/* mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <Link to="/"><Logo /></Link>
          </div>

          {step === "done" ? (
            <div className="bg-white rounded-3xl shadow-soft border border-cream-300/60 p-10 text-center animate-fade-in">
              <div className="w-20 h-20 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-11 h-11 text-success-600" />
              </div>
              <h1 className="font-display font-bold text-2xl text-ink mb-2">
                Workspace ready! 🎉
              </h1>
              <p className="text-ink-soft mb-6">
                <span className="font-semibold text-ink">{orgName}</span> is all set up on the{" "}
                {selectedPlan.name} plan. Taking you to your dashboard…
              </p>
              <Loader2 className="w-6 h-6 animate-spin text-orange-500 mx-auto" />
            </div>
          ) : (
            <div className="bg-white rounded-3xl shadow-soft border border-cream-300/60 overflow-hidden">
              {/* progress */}
              <div className="flex">
                <div className="h-1.5 flex-1 bg-gradient-orange" />
                <div className={`h-1.5 flex-1 transition-colors ${step === "otp" ? "bg-gradient-orange" : "bg-cream-200"}`} />
              </div>

              <div className="p-7 sm:p-9">
                {step === "details" ? (
                  <>
                    <p className="eyebrow mb-2">Step 1 of 2</p>
                    <h1 className="font-display font-bold text-2xl text-ink mb-1">
                      Create your workspace
                    </h1>
                    <p className="text-sm text-ink-soft mb-6">
                      Start your free {TRIAL_DAYS}-day trial. No credit card required.
                    </p>

                    {err && (
                      <div className="bg-danger-50 text-danger-600 text-sm px-4 py-3 rounded-xl mb-4 border border-danger-100">
                        {err}
                      </div>
                    )}

                    <form onSubmit={submitDetails} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-ink mb-1.5">Your name</label>
                        <div className="relative">
                          <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" size={18} />
                          <input
                            className="input pl-11"
                            placeholder="Rohan Mehta"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            disabled={loading}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-ink mb-1.5">Organization name</label>
                        <div className="relative">
                          <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" size={18} />
                          <input
                            className="input pl-11"
                            placeholder="EduLeap Technologies"
                            value={orgName}
                            onChange={(e) => setOrgName(e.target.value)}
                            disabled={loading}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-ink mb-1.5">Mobile number</label>
                        <div className="relative">
                          <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" size={18} />
                          <span className="absolute left-11 top-1/2 -translate-y-1/2 text-ink-soft font-medium text-sm">+91</span>
                          <input
                            type="tel"
                            className="input pl-[4.5rem]"
                            placeholder="98XXXXXXXX"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                            maxLength={10}
                            disabled={loading}
                          />
                        </div>
                      </div>

                      {/* plan selector */}
                      <div>
                        <label className="block text-sm font-medium text-ink mb-1.5">Choose your plan</label>
                        <div className="grid grid-cols-3 gap-2">
                          {PLANS.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setPlanId(p.id)}
                              className={`rounded-xl border px-2 py-2.5 text-center transition-all ${
                                planId === p.id
                                  ? "border-orange-400 bg-orange-50 ring-2 ring-orange-100"
                                  : "border-cream-300 hover:border-orange-300"
                              }`}
                            >
                              <span className={`block text-xs font-bold ${planId === p.id ? "text-orange-700" : "text-ink"}`}>
                                {p.name}
                              </span>
                              <span className="block text-[10px] text-ink-muted mt-0.5">
                                ₹{p.monthlyPrice.toLocaleString("en-IN")}/mo
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <button type="submit" disabled={loading} className="btn btn-primary w-full py-3.5 text-base">
                        {loading ? (
                          <><Loader2 size={18} className="animate-spin" /> Sending code…</>
                        ) : (
                          <>Continue <ArrowRight size={18} /></>
                        )}
                      </button>
                    </form>

                    <p className="text-center text-sm text-ink-muted mt-5">
                      Already have an account?{" "}
                      <Link to="/login" className="text-orange-600 font-semibold hover:underline">
                        Sign in
                      </Link>
                    </p>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setStep("details"); setOtp(""); setErr(""); }}
                      className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-orange-600 mb-5"
                    >
                      <ArrowLeft size={16} /> Back
                    </button>

                    <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-4">
                      <ShieldCheck className="text-orange-600" size={24} />
                    </div>
                    <p className="eyebrow mb-2">Step 2 of 2</p>
                    <h1 className="font-display font-bold text-2xl text-ink mb-1">
                      Verify your number
                    </h1>
                    <p className="text-sm text-ink-soft mb-6">
                      We sent a 6-digit code to <span className="font-semibold text-ink">+91{phone}</span>
                    </p>

                    {err && (
                      <div className="bg-danger-50 text-danger-600 text-sm px-4 py-3 rounded-xl mb-4 border border-danger-100">
                        {err}
                      </div>
                    )}

                    <form onSubmit={submitOtp} className="space-y-4">
                      <input
                        className="input text-center text-2xl tracking-[0.5em] font-mono"
                        placeholder="000000"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                        maxLength={6}
                        autoFocus
                        disabled={loading}
                      />
                      <button type="submit" disabled={loading} className="btn btn-primary w-full py-3.5 text-base">
                        {loading ? (
                          <><Loader2 size={18} className="animate-spin" /> Creating workspace…</>
                        ) : (
                          <>Verify & create workspace <ArrowRight size={18} /></>
                        )}
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          )}

          <p className="text-center text-xs text-ink-muted mt-5">
            By continuing you agree to our Terms & Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}
