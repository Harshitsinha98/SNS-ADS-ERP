import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Phone, ShieldCheck, ArrowRight, ArrowLeft, Loader2, XCircle,
  MessageCircle, Smartphone, PhoneCall, CheckCircle2, Shield, Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getOtpConfig } from "../utils/otpApi";
import Logo from "../components/marketing/Logo";

function channelLabel(ch) {
  if (ch === "whatsapp_meta" || ch === "whatsapp") return "WhatsApp";
  if (ch === "sms") return "SMS";
  if (ch === "voice") return "call";
  return "";
}

export default function Login() {
  const { user, requestOtp, verifyOtp, logout } = useAuth();
  const navigate = useNavigate();

  const [portal, setPortal] = useState(null); // 'admin' | 'employee' | null
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [channel, setChannel] = useState(null);
  const [resending, setResending] = useState(null);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [accountError, setAccountError] = useState("");

  useEffect(() => {
    getOtpConfig()
      .then((cfg) => setVoiceAvailable(Array.isArray(cfg?.availableChannels) && cfg.availableChannels.includes("voice")))
      .catch(() => {});
  }, []);

  // Backend is the source of truth for role. We verify the chosen portal
  // matches the real role, then route accordingly.
  useEffect(() => {
    if (!user) return;

    if (user.isPlatformOwner && !user.role) {
      navigate("/platform", { replace: true });
      return;
    }

    if (user.needsSetup) {
      setAccountError("No account found for this number. Please sign up first, or use the number linked to your workspace.");
      logout();
      return;
    }

    const isAdminish = user.role === "admin" || user.role === "owner";

    if (!portal) {
      navigate(isAdminish ? "/admin" : "/app", { replace: true });
      return;
    }

    if (portal === "admin" && !isAdminish) {
      setAccountError("This number is an employee account. Please use Employee login.");
      logout();
      return;
    }
    if (portal === "employee" && isAdminish) {
      setAccountError("This number is an admin/owner account. Please use Admin login.");
      logout();
      return;
    }

    navigate(isAdminish ? "/admin" : "/app", { replace: true });
  }, [user, portal, navigate, logout]);

  const sendOtp = async (e) => {
    e.preventDefault();
    setErr(""); setInfo(""); setLoading(true);
    const res = await requestOtp(phone.trim());
    setLoading(false);
    if (res.ok) { setConfirmation(res.confirmation || null); setChannel(res.channel || null); setStep("otp"); }
    else setErr(res.error);
  };

  const resend = async (via) => {
    if (resending || loading) return;
    setErr(""); setInfo(""); setResending(via);
    const res = await requestOtp(phone.trim(), via);
    setResending(null);
    if (res.ok) {
      setConfirmation(res.confirmation || null); setChannel(res.channel || null); setOtp("");
      setInfo(channelLabel(res.channel) ? `Code sent via ${channelLabel(res.channel)}` : "Code sent");
    } else { setErr(res.error); }
  };

  const confirmOtp = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    const res = await verifyOtp(confirmation, otp.trim(), phone.trim());
    setLoading(false);
    if (!res.ok) setErr(res.error);
  };

  const resetToPortal = () => {
    setPortal(null); setStep("phone"); setPhone(""); setOtp("");
    setErr(""); setInfo(""); setAccountError(""); setConfirmation(null); setChannel(null);
  };

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-orange-300/20 rounded-full blur-3xl -translate-y-1/3 translate-x-1/3 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-ember-300/15 rounded-full blur-3xl translate-y-1/3 -translate-x-1/3 pointer-events-none" />
      <div id="recaptcha-container" />

      <div className="w-full max-w-sm relative z-10">
        <div className="flex justify-center mb-6">
          <Link to="/"><Logo size="lg" /></Link>
        </div>

        <div className="card !rounded-3xl shadow-soft">
          <div className="h-1 bg-gradient-orange" />

          {accountError ? (
            /* ─── ACCOUNT ERROR / ROLE MISMATCH ─── */
            <div className="p-7 text-center">
              <div className="w-14 h-14 bg-danger-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-8 h-8 text-danger-600" />
              </div>
              <h1 className="font-display font-bold text-lg text-ink mb-1.5">Access denied</h1>
              <p className="text-sm text-ink-soft mb-6">{accountError}</p>
              <button onClick={resetToPortal} className="btn btn-primary w-full">Try again</button>
              <Link to="/signup" className="inline-block text-sm text-orange-600 font-semibold mt-4">Start free trial</Link>
            </div>
          ) : !portal ? (
            /* ─── PORTAL SELECTOR ─── */
            <div className="p-6">
              <h1 className="font-display font-bold text-xl text-ink mb-1 text-center">Sign in to CodeSkate</h1>
              <p className="text-sm text-ink-muted mb-6 text-center">How do you want to sign in?</p>

              <div className="space-y-2.5">
                <button onClick={() => setPortal("admin")}
                  className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl border border-cream-300 hover:border-orange-300 hover:bg-orange-50 active:scale-[0.98] transition-all text-left group">
                  <div className="w-11 h-11 rounded-xl bg-gradient-orange flex items-center justify-center shrink-0 shadow-button">
                    <Shield className="text-white" size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-semibold text-ink text-[15px]">Admin / Owner</p>
                    <p className="text-xs text-ink-muted">Manage team, billing & settings</p>
                  </div>
                  <ArrowRight size={17} className="text-ink-muted group-hover:text-orange-600 transition-colors" />
                </button>

                <button onClick={() => setPortal("employee")}
                  className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl border border-cream-300 hover:border-orange-300 hover:bg-orange-50 active:scale-[0.98] transition-all text-left group">
                  <div className="w-11 h-11 rounded-xl bg-ink flex items-center justify-center shrink-0">
                    <Users className="text-orange-400" size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-semibold text-ink text-[15px]">Employee</p>
                    <p className="text-xs text-ink-muted">Work on your assigned leads</p>
                  </div>
                  <ArrowRight size={17} className="text-ink-muted group-hover:text-orange-600 transition-colors" />
                </button>
              </div>

              <p className="text-center text-sm text-ink-muted mt-6">
                New here?{" "}
                <Link to="/signup" className="text-orange-600 font-semibold hover:underline">Start free trial</Link>
              </p>
            </div>
          ) : (
            /* ─── PHONE / OTP ─── */
            <div className="p-6">
              <button
                onClick={step === "otp"
                  ? () => { setStep("phone"); setOtp(""); setErr(""); setInfo(""); }
                  : resetToPortal}
                className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-orange-600 mb-4"
              >
                <ArrowLeft size={16} /> {step === "otp" ? "Change number" : "Back"}
              </button>

              <div className={`inline-flex items-center gap-1.5 badge mb-3 ${
                portal === "admin" ? "badge-primary" : "bg-ink text-orange-300"
              }`}>
                {portal === "admin" ? <Shield size={12} /> : <Users size={12} />}
                {portal === "admin" ? "Admin / Owner" : "Employee"} login
              </div>

              <h1 className="font-display font-bold text-xl text-ink mb-1">
                {step === "phone" ? "Enter your number" : "Enter your code"}
              </h1>
              <p className="text-sm text-ink-soft mb-5">
                {step === "phone"
                  ? "We'll send a one-time code to verify it's you."
                  : <>Code sent to <span className="font-semibold text-ink">+91 {phone}</span>{channelLabel(channel) ? ` via ${channelLabel(channel)}` : ""}</>}
              </p>

              {err && (
                <div className="bg-danger-50 text-danger-600 text-sm px-4 py-3 rounded-xl mb-4 border border-danger-100 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" /><span>{err}</span>
                </div>
              )}
              {info && !err && (
                <div className="bg-success-50 text-success-700 text-sm px-4 py-3 rounded-xl mb-4 border border-success-100 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /><span>{info}</span>
                </div>
              )}

              {step === "phone" ? (
                <form onSubmit={sendOtp} className="space-y-4">
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-ink-muted">
                      <Phone size={16} />
                      <span className="text-sm font-semibold">+91</span>
                      <div className="w-px h-4 bg-cream-400" />
                    </div>
                    <input
                      type="tel"
                      className="input pl-[5.25rem]"
                      placeholder="98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                      maxLength={10}
                      required
                      disabled={loading}
                      autoFocus
                      inputMode="numeric"
                    />
                  </div>
                  <button disabled={loading || phone.length !== 10} className="btn btn-primary w-full disabled:opacity-50">
                    {loading
                      ? <><Loader2 size={17} className="animate-spin" /> Sending...</>
                      : <>Continue <ArrowRight size={17} /></>}
                  </button>
                </form>
              ) : (
                <>
                  <form onSubmit={confirmOtp} className="space-y-4">
                    <input
                      className="input text-center text-2xl tracking-[0.4em] font-mono"
                      placeholder="● ● ● ● ● ●"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      maxLength={6}
                      required
                      autoFocus
                      disabled={loading}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                    <button disabled={loading || otp.length !== 6} className="btn btn-primary w-full disabled:opacity-50">
                      {loading
                        ? <><Loader2 size={17} className="animate-spin" /> Verifying...</>
                        : <>Verify & Sign In</>}
                    </button>
                  </form>

                  <div className="mt-5 pt-4 border-t border-cream-200">
                    <p className="text-xs text-ink-muted mb-2.5">Didn't get the code?</p>
                    <div className="flex gap-2 flex-wrap">
                      <button type="button" onClick={() => resend("whatsapp")} disabled={!!resending || loading}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-cream-300 text-ink-soft hover:bg-cream-100 disabled:opacity-40 transition-colors">
                        {resending === "whatsapp" ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} className="text-success-500" />}
                        WhatsApp
                      </button>
                      <button type="button" onClick={() => resend("sms_firebase")} disabled={!!resending || loading}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-cream-300 text-ink-soft hover:bg-cream-100 disabled:opacity-40 transition-colors">
                        {resending === "sms_firebase" ? <Loader2 size={13} className="animate-spin" /> : <Smartphone size={13} />}
                        SMS
                      </button>
                      {voiceAvailable && (
                        <button type="button" onClick={() => resend("voice")} disabled={!!resending || loading}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-cream-300 text-ink-soft hover:bg-cream-100 disabled:opacity-40 transition-colors">
                          {resending === "voice" ? <Loader2 size={13} className="animate-spin" /> : <PhoneCall size={13} />}
                          Call me
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-ink-muted mt-5">
          Secured with one-time password verification
        </p>
      </div>
    </div>
  );
}
