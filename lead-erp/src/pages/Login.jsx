import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Phone, ShieldCheck, ArrowRight, ArrowLeft, Loader2, XCircle,
  MessageCircle, Smartphone, PhoneCall, CheckCircle2, Shield, Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getOtpConfig } from "../utils/otpApi";

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

    // Platform owner → platform console
    if (user.isPlatformOwner && !user.role) {
      navigate("/platform", { replace: true });
      return;
    }

    // No workspace found for this number
    if (user.needsSetup) {
      setAccountError("No account found for this number. Please sign up first, or use the number linked to your workspace.");
      logout();
      return;
    }

    const isAdminish = user.role === "admin" || user.role === "owner";

    // Already logged in (no portal chosen this session) → route normally.
    if (!portal) {
      navigate(isAdminish ? "/admin" : "/app", { replace: true });
      return;
    }

    // Portal ↔ role verification
    if (portal === "admin" && !isAdminish) {
      setAccountError("Access denied — this number is an employee account. Please use Employee login.");
      logout();
      return;
    }
    if (portal === "employee" && isAdminish) {
      setAccountError("Access denied — this number is an admin/owner account. Please use Admin login.");
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

  // Back to the portal selector, clearing everything.
  const resetToPortal = () => {
    setPortal(null); setStep("phone"); setPhone(""); setOtp("");
    setErr(""); setInfo(""); setAccountError(""); setConfirmation(null); setChannel(null);
  };

  return (
    <div className="login-screen">
      <div id="recaptcha-container" />

      {accountError ? (
        /* ─── ACCOUNT ERROR / ROLE MISMATCH ─── */
        <div className="login-content">
          <div className="flex-1 flex flex-col items-center justify-center px-8">
            <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
              <XCircle className="w-10 h-10 text-red-400" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2 text-center">Access denied</h1>
            <p className="text-sm text-white/60 mb-8 text-center">{accountError}</p>
            <button onClick={resetToPortal} className="login-btn w-full">Try again</button>
            <Link to="/signup" className="text-sm text-orange-400 font-semibold mt-5">Start free trial</Link>
          </div>
        </div>
      ) : (
        <div className="login-content">
          {/* ─── BRAND HEADER ─── */}
          <div className="pt-16 pb-10 flex flex-col items-center">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30 mb-5">
              <span className="text-white font-bold text-3xl font-display">C</span>
            </div>
            <h1 className="text-2xl font-bold text-white font-display">Codeskate CRM</h1>
            <p className="text-sm text-white/50 mt-1.5">
              {!portal
                ? "Choose how you want to sign in"
                : step === "phone" ? "Sign in to your account" : "Verify your number"}
            </p>
          </div>

          {/* ─── BODY ─── */}
          <div className="flex-1 px-6 flex flex-col">
            {!portal ? (
              /* ─── PORTAL SELECTOR ─── */
              <div className="flex-1 flex flex-col">
                <div className="space-y-3">
                  <button onClick={() => setPortal("admin")} className="login-role-card text-left">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/30">
                      <Shield className="text-white" size={22} />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-white">Admin / Owner login</p>
                      <p className="text-xs text-white/50">Manage organization, team & billing</p>
                    </div>
                    <ArrowRight size={18} className="text-white/40" />
                  </button>

                  <button onClick={() => setPortal("employee")} className="login-role-card text-left">
                    <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                      <Users className="text-orange-400" size={22} />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-white">Employee login</p>
                      <p className="text-xs text-white/50">Work on your assigned leads</p>
                    </div>
                    <ArrowRight size={18} className="text-white/40" />
                  </button>
                </div>

                <p className="text-center text-sm text-white/40 mt-8">
                  New here?{" "}
                  <Link to="/signup" className="text-orange-400 font-semibold">Start free trial</Link>
                </p>
              </div>
            ) : (
              <>
                {/* Back button */}
                <button
                  onClick={step === "otp"
                    ? () => { setStep("phone"); setOtp(""); setErr(""); setInfo(""); }
                    : resetToPortal}
                  className="flex items-center gap-1.5 text-sm text-white/60 press-scale mb-6 self-start"
                >
                  <ArrowLeft size={18} /> {step === "otp" ? "Change number" : "Back"}
                </button>

                {/* Role badge */}
                <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full mb-5 self-start ${
                  portal === "admin"
                    ? "bg-orange-500/20 text-orange-300"
                    : "bg-white/10 text-white/70"
                }`}>
                  {portal === "admin" ? <Shield size={13} /> : <Users size={13} />}
                  {portal === "admin" ? "Admin / Owner" : "Employee"} login
                </div>

                {/* Error / Info messages */}
                {err && (
                  <div className="bg-red-500/15 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-xl mb-4 flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" /><span>{err}</span>
                  </div>
                )}
                {info && !err && (
                  <div className="bg-green-500/15 border border-green-500/30 text-green-300 text-sm px-4 py-3 rounded-xl mb-4 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /><span>{info}</span>
                  </div>
                )}

                {step === "phone" ? (
                  /* ─── PHONE ENTRY ─── */
                  <form onSubmit={sendOtp} className="flex-1 flex flex-col">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
                      Mobile number
                    </label>
                    <div className="relative mb-3">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-white/60">
                        <Phone size={16} />
                        <span className="text-sm font-semibold">+91</span>
                        <div className="w-px h-5 bg-white/20" />
                      </div>
                      <input
                        type="tel"
                        className="login-input pl-[6rem]"
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
                    <p className="text-xs text-white/40 leading-relaxed">
                      We'll send a one-time code to verify it's you.
                    </p>

                    <div className="mt-auto pb-10">
                      <button disabled={loading || phone.length !== 10} className="login-btn w-full">
                        {loading
                          ? <><Loader2 size={18} className="animate-spin" /> Sending...</>
                          : <>Continue <ArrowRight size={18} /></>}
                      </button>
                    </div>
                  </form>
                ) : (
                  /* ─── OTP ENTRY ─── */
                  <div className="flex-1 flex flex-col">
                    <p className="text-sm text-white/50 mb-5">
                      Code sent to <span className="text-white font-semibold">+91 {phone}</span>
                      {channelLabel(channel) ? ` via ${channelLabel(channel)}` : ""}
                    </p>

                    <form onSubmit={confirmOtp} className="flex flex-col">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
                        Enter 6-digit code
                      </label>
                      <input
                        className="login-input text-center text-2xl tracking-[0.5em] font-mono mb-4"
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
                      <button disabled={loading || otp.length !== 6} className="login-btn w-full">
                        {loading
                          ? <><Loader2 size={18} className="animate-spin" /> Verifying...</>
                          : <>Verify & Sign In</>}
                      </button>
                    </form>

                    {/* Resend options */}
                    <div className="mt-auto pb-10 pt-6 border-t border-white/10">
                      <p className="text-xs text-white/40 mb-3">Didn't get the code?</p>
                      <div className="flex gap-2 flex-wrap">
                        <button type="button" onClick={() => resend("whatsapp")} disabled={!!resending || loading}
                          className="login-resend-btn">
                          {resending === "whatsapp" ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} className="text-green-400" />}
                          WhatsApp
                        </button>
                        <button type="button" onClick={() => resend("sms_firebase")} disabled={!!resending || loading}
                          className="login-resend-btn">
                          {resending === "sms_firebase" ? <Loader2 size={13} className="animate-spin" /> : <Smartphone size={13} />}
                          SMS
                        </button>
                        {voiceAvailable && (
                          <button type="button" onClick={() => resend("voice")} disabled={!!resending || loading}
                            className="login-resend-btn">
                            {resending === "voice" ? <Loader2 size={13} className="animate-spin" /> : <PhoneCall size={13} />}
                            Call me
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
