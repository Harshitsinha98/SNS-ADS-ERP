import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Phone, ShieldCheck, ArrowRight, ArrowLeft, Loader2, Shield, Users, XCircle,
  MessageCircle, Smartphone, PhoneCall, CheckCircle2,
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

  const [portal, setPortal] = useState(null);
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
  const [roleError, setRoleError] = useState("");

  useEffect(() => {
    getOtpConfig()
      .then((cfg) => setVoiceAvailable(Array.isArray(cfg?.availableChannels) && cfg.availableChannels.includes("voice")))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.isPlatformOwner && !user.role) {
      navigate("/platform", { replace: true });
      return;
    }
    if (user.needsSetup) {
      setRoleError("No workspace found for this number. Please sign up first.");
      logout();
      return;
    }
    const isAdminish = user.role === "admin" || user.role === "owner";
    if (!portal) {
      navigate(isAdminish ? "/admin" : "/app", { replace: true });
      return;
    }
    if (portal === "admin" && !isAdminish) {
      setRoleError("Access denied — you're an employee. Choose employee login.");
      logout();
      return;
    }
    if (portal === "employee" && isAdminish) {
      setRoleError("Access denied — you're an admin. Use admin login.");
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
      setConfirmation(res.confirmation || null);
      setChannel(res.channel || null);
      setOtp("");
      const label = channelLabel(res.channel);
      setInfo(label ? `New code sent via ${label}` : "New code sent");
    } else {
      setErr(res.error);
    }
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
    setErr(""); setInfo(""); setRoleError(""); setConfirmation(null); setChannel(null);
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-cream-100 flex flex-col pt-safe">
      <div id="recaptcha-container" />

      {/* Top section — Logo */}
      <div className="flex-shrink-0 pt-12 pb-6 flex flex-col items-center px-6">
        <Link to="/"><Logo size="lg" animate /></Link>
      </div>

      {/* Main content card */}
      <div className="flex-1 flex flex-col px-5 pb-8">

        {/* Role mismatch error */}
        {roleError ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-danger-50 rounded-full flex items-center justify-center mb-5 animate-bounce-in">
              <XCircle className="w-8 h-8 text-danger-600" />
            </div>
            <h1 className="font-display font-bold text-xl text-ink mb-2 text-center">Access Denied</h1>
            <p className="text-sm text-ink-soft mb-8 text-center max-w-[260px]">{roleError}</p>
            <button onClick={resetToPortal} className="btn btn-primary w-full max-w-[280px]">Try again</button>
          </div>
        ) : !portal ? (
          /* ─── PORTAL SELECTOR ─── */
          <div className="flex-1 flex flex-col">
            <div className="mb-8">
              <h1 className="font-display font-bold text-2xl text-ink text-center">Welcome back</h1>
              <p className="text-sm text-ink-muted mt-1 text-center">Choose your role to sign in</p>
            </div>

            <div className="space-y-3 flex-1">
              {/* Admin Card */}
              <button
                onClick={() => setPortal("admin")}
                className="card w-full p-5 flex items-center gap-4 text-left press-scale"
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-orange flex items-center justify-center shadow-glow shrink-0">
                  <Shield className="text-white" size={24} />
                </div>
                <div className="flex-1">
                  <p className="font-display font-bold text-base text-ink">Admin</p>
                  <p className="text-xs text-ink-muted mt-0.5">Manage organization & team</p>
                </div>
                <ArrowRight size={18} className="text-ink-muted" />
              </button>

              {/* Employee Card */}
              <button
                onClick={() => setPortal("employee")}
                className="card w-full p-5 flex items-center gap-4 text-left press-scale"
              >
                <div className="w-14 h-14 rounded-2xl bg-ink flex items-center justify-center shrink-0">
                  <Users className="text-orange-400" size={24} />
                </div>
                <div className="flex-1">
                  <p className="font-display font-bold text-base text-ink">Employee</p>
                  <p className="text-xs text-ink-muted mt-0.5">Work on assigned leads</p>
                </div>
                <ArrowRight size={18} className="text-ink-muted" />
              </button>
            </div>

            <p className="text-center text-sm text-ink-muted mt-8">
              New here? <Link to="/signup" className="text-orange-600 font-bold">Start free trial</Link>
            </p>
          </div>
        ) : (
          /* ─── PHONE / OTP ─── */
          <div className="flex-1 flex flex-col">
            {/* Back button */}
            <button
              onClick={step === "otp" ? () => { setStep("phone"); setOtp(""); setErr(""); setInfo(""); } : resetToPortal}
              className="flex items-center gap-1 text-sm text-ink-muted mb-6 self-start press-scale"
            >
              <ArrowLeft size={16} /> Back
            </button>

            {/* Role badge */}
            <div className={`inline-flex items-center gap-1.5 badge self-start mb-4 ${
              portal === "admin" ? "badge-primary" : "bg-ink text-orange-300"
            }`}>
              {portal === "admin" ? <Shield size={12} /> : <Users size={12} />}
              {portal === "admin" ? "Admin" : "Employee"}
            </div>

            <h1 className="font-display font-bold text-2xl text-ink mb-1">
              {step === "phone" ? "Enter your number" : "Verify code"}
            </h1>
            <p className="text-sm text-ink-muted mb-6">
              {step === "phone"
                ? "We'll send you a one-time code"
                : channelLabel(channel)
                  ? <>Code sent to <span className="font-semibold text-ink">+91{phone}</span> via {channelLabel(channel)}</>
                  : <>Code sent to <span className="font-semibold text-ink">+91{phone}</span></>}
            </p>

            {/* Error */}
            {err && (
              <div className="bg-danger-50 text-danger-700 text-sm px-4 py-3 rounded-xl mb-4 border border-danger-100 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" /><span>{err}</span>
              </div>
            )}

            {/* Success info */}
            {info && !err && (
              <div className="bg-success-50 text-success-700 text-sm px-4 py-3 rounded-xl mb-4 border border-success-100 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /><span>{info}</span>
              </div>
            )}

            {step === "phone" ? (
              <form onSubmit={sendOtp} className="flex-1 flex flex-col">
                <div className="mb-6">
                  <label className="block text-sm font-medium text-ink mb-2">Mobile number</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-ink-soft">
                      <Phone size={16} />
                      <span className="text-sm font-medium">+91</span>
                    </div>
                    <input
                      type="tel"
                      className="input pl-[5rem] text-lg font-medium"
                      placeholder="98XXXXXXXX"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                      maxLength={10}
                      required
                      disabled={loading}
                      autoFocus
                    />
                  </div>
                </div>
                <div className="mt-auto">
                  <button
                    disabled={loading || phone.length !== 10}
                    className="btn btn-primary w-full py-4 text-base"
                  >
                    {loading
                      ? <><Loader2 size={18} className="animate-spin" /> Sending…</>
                      : <>Send code <ArrowRight size={18} /></>}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex-1 flex flex-col">
                <form onSubmit={confirmOtp} className="flex-1 flex flex-col">
                  {/* OTP Input */}
                  <input
                    className="input text-center text-3xl tracking-[0.6em] font-mono py-4 mb-6"
                    placeholder="000000"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    maxLength={6}
                    required
                    autoFocus
                    disabled={loading}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />

                  <div className="mt-auto">
                    <button
                      disabled={loading || otp.length !== 6}
                      className="btn btn-primary w-full py-4 text-base"
                    >
                      {loading
                        ? <><Loader2 size={18} className="animate-spin" /> Verifying…</>
                        : <>Verify & sign in</>}
                    </button>
                  </div>
                </form>

                {/* Resend options */}
                <div className="mt-5 pt-4 border-t border-cream-200">
                  <p className="text-xs text-ink-muted mb-3">Didn't receive the code?</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => resend("whatsapp")}
                      disabled={!!resending || loading}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-cream-200 text-ink-soft disabled:opacity-50 min-h-touch press-scale"
                    >
                      {resending === "whatsapp" ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} className="text-green-600" />}
                      WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => resend("sms_firebase")}
                      disabled={!!resending || loading}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-cream-200 text-ink-soft disabled:opacity-50 min-h-touch press-scale"
                    >
                      {resending === "sms_firebase" ? <Loader2 size={13} className="animate-spin" /> : <Smartphone size={13} />}
                      SMS
                    </button>
                    {voiceAvailable && (
                      <button
                        type="button"
                        onClick={() => resend("voice")}
                        disabled={!!resending || loading}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-cream-200 text-ink-soft disabled:opacity-50 min-h-touch press-scale"
                      >
                        {resending === "voice" ? <Loader2 size={13} className="animate-spin" /> : <PhoneCall size={13} />}
                        Call
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
