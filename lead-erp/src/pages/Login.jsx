import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Phone, ShieldCheck, ArrowRight, ArrowLeft, Loader2, Shield, Users, XCircle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Logo from "../components/marketing/Logo";

export default function Login() {
  const { user, requestOtp, verifyOtp, logout } = useAuth();
  const navigate = useNavigate();

  const [portal, setPortal] = useState(null); // 'admin' | 'employee' | null
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [roleError, setRoleError] = useState(""); // portal ↔ role mismatch

  // Route (or reject) once AuthContext resolves the user's real role.
  useEffect(() => {
    if (!user) return;

    // Platform owner always goes to the platform dashboard.
    if (user.isPlatformOwner && !user.role) {
      navigate("/platform", { replace: true });
      return;
    }

    // Authenticated but no workspace → not a valid login (must sign up).
    if (user.needsSetup) {
      setRoleError("No workspace found for this number. Please sign up first or use the correct number.");
      logout();
      return;
    }

    const isAdminish = user.role === "admin" || user.role === "owner";

    // If they didn't go through a portal (already logged in), route normally.
    if (!portal) {
      navigate(isAdminish ? "/admin" : "/app", { replace: true });
      return;
    }

    // Portal ↔ role verification (backend truth = membership role).
    if (portal === "admin" && !isAdminish) {
      setRoleError("Access denied — you're an employee. You can't use the admin login. Please choose employee login.");
      logout();
      return;
    }
    if (portal === "employee" && isAdminish) {
      setRoleError("Access denied — you're an admin. Please use the admin login.");
      logout();
      return;
    }

    // Match → go to the right dashboard.
    navigate(isAdminish ? "/admin" : "/app", { replace: true });
  }, [user, portal, navigate, logout]);

  const sendOtp = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    const res = await requestOtp(phone.trim());
    setLoading(false);
    if (res.ok) { setConfirmation(res.confirmation); setStep("otp"); }
    else setErr(res.error);
  };

  const confirmOtp = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    const res = await verifyOtp(confirmation, otp.trim());
    setLoading(false);
    if (!res.ok) setErr(res.error);
    // success → AuthContext sets user → useEffect routes/verifies
  };

  const resetToPortal = () => {
    setPortal(null); setStep("phone"); setPhone(""); setOtp("");
    setErr(""); setRoleError(""); setConfirmation(null);
  };

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center p-4 relative overflow-hidden texture-grain">
      <div className="absolute top-0 right-0 w-96 h-96 bg-orange-300/25 rounded-full blur-3xl -translate-y-1/3 translate-x-1/3 animate-blob pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-ember-300/20 rounded-full blur-3xl translate-y-1/3 -translate-x-1/3 animate-blob pointer-events-none" style={{ animationDelay: "4s" }} />
      <div className="absolute inset-0 pattern-dots opacity-40 pointer-events-none" />
      <div id="recaptcha-container" />

      <div className="w-full max-w-md relative z-10">
        <div className="flex justify-center mb-8"><Link to="/"><Logo size="lg" /></Link></div>

        {/* Role mismatch / no-account screen */}
        {roleError ? (
          <div className="bg-white rounded-3xl shadow-soft border border-cream-300/60 overflow-hidden">
            <div className="h-1.5 bg-danger-500" />
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-danger-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <XCircle className="w-9 h-9 text-danger-600" />
              </div>
              <h1 className="font-display font-bold text-xl text-ink mb-2">Access denied</h1>
              <p className="text-sm text-ink-soft mb-6">{roleError}</p>
              <button onClick={resetToPortal} className="btn btn-primary w-full">Try again</button>
            </div>
          </div>
        ) : !portal ? (
          /* Portal selector */
          <div className="bg-white rounded-3xl shadow-soft border border-cream-300/60 overflow-hidden">
            <div className="h-1.5 bg-gradient-orange" />
            <div className="p-7 sm:p-9">
              <h1 className="font-display font-bold text-2xl text-ink mb-1 text-center">Sign in to Codeskate CRM</h1>
              <p className="text-sm text-ink-soft mb-7 text-center">Which role are you signing in as?</p>
              <div className="space-y-3">
                <button onClick={() => setPortal("admin")}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border border-cream-300 hover:border-orange-300 hover:bg-orange-50 transition-all text-left group">
                  <div className="w-12 h-12 rounded-xl bg-gradient-orange flex items-center justify-center shrink-0 shadow-glow">
                    <Shield className="text-white" size={22} />
                  </div>
                  <div className="flex-1">
                    <p className="font-display font-semibold text-ink">Admin login</p>
                    <p className="text-xs text-ink-muted">Manage organization, team & billing</p>
                  </div>
                  <ArrowRight size={18} className="text-ink-muted group-hover:text-orange-600" />
                </button>

                <button onClick={() => setPortal("employee")}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border border-cream-300 hover:border-orange-300 hover:bg-orange-50 transition-all text-left group">
                  <div className="w-12 h-12 rounded-xl bg-ink flex items-center justify-center shrink-0">
                    <Users className="text-orange-400" size={22} />
                  </div>
                  <div className="flex-1">
                    <p className="font-display font-semibold text-ink">Employee login</p>
                    <p className="text-xs text-ink-muted">Work on your assigned leads</p>
                  </div>
                  <ArrowRight size={18} className="text-ink-muted group-hover:text-orange-600" />
                </button>
              </div>
              <p className="text-center text-sm text-ink-muted mt-6">
                New here? <Link to="/signup" className="text-orange-600 font-semibold hover:underline">Start free trial</Link>
              </p>
            </div>
          </div>
        ) : (
          /* Phone / OTP */
          <div className="bg-white rounded-3xl shadow-soft border border-cream-300/60 overflow-hidden">
            <div className="h-1.5 bg-gradient-orange" />
            <div className="p-7 sm:p-9">
              <button onClick={step === "otp" ? () => { setStep("phone"); setOtp(""); setErr(""); } : resetToPortal}
                className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-orange-600 mb-4">
                <ArrowLeft size={15} /> Back
              </button>

              <div className={`inline-flex items-center gap-2 badge mb-3 ${portal === "admin" ? "badge-primary" : "bg-ink text-orange-300"}`}>
                {portal === "admin" ? <Shield size={13} /> : <Users size={13} />}
                {portal === "admin" ? "Admin" : "Employee"} login
              </div>

              <h1 className="font-display font-bold text-2xl text-ink mb-1">
                {step === "phone" ? "Enter your number" : "Enter your code"}
              </h1>
              <p className="text-sm text-ink-soft mb-6">
                {step === "phone" ? "Secure sign in with OTP." : `Code sent to +91${phone}`}
              </p>

              {err && (
                <div className="bg-danger-50 text-danger-600 text-sm px-4 py-3 rounded-xl mb-4 border border-danger-100 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />{err}
                </div>
              )}

              {step === "phone" ? (
                <form onSubmit={sendOtp} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">Mobile number</label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" size={18} />
                      <span className="absolute left-11 top-1/2 -translate-y-1/2 text-ink-soft font-medium text-sm">+91</span>
                      <input type="tel" className="input pl-[4.5rem]" placeholder="98XXXXXXXX" value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} maxLength={10} required disabled={loading} />
                    </div>
                  </div>
                  <button disabled={loading || phone.length !== 10} className="btn btn-primary w-full py-3.5 text-base">
                    {loading ? <><Loader2 size={18} className="animate-spin" /> Sending…</> : <>Send code <ArrowRight size={18} /></>}
                  </button>
                </form>
              ) : (
                <form onSubmit={confirmOtp} className="space-y-5">
                  <input className="input text-center text-2xl tracking-[0.5em] font-mono" placeholder="000000" value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} maxLength={6} required autoFocus disabled={loading} />
                  <button disabled={loading || otp.length !== 6} className="btn btn-primary w-full py-3.5 text-base">
                    {loading ? <><Loader2 size={18} className="animate-spin" /> Verifying…</> : <>Verify & sign in <ArrowRight size={18} /></>}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-ink-muted mt-6">
          {portal ? "Wrong role? Go back and choose the other login." : "Your role is verified by the backend."}
        </p>
      </div>
    </div>
  );
}
