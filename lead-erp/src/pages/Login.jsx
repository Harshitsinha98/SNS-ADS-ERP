import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Phone, ShieldCheck, ArrowRight, ArrowLeft, Loader2, XCircle,
  MessageCircle, Smartphone, PhoneCall, CheckCircle2,
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

  // Backend auto-detects the role — we just route wherever the user belongs.
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

    // Role decided by backend (membership): admin/owner → /admin, else → /app
    const isAdminish = user.role === "admin" || user.role === "owner";
    navigate(isAdminish ? "/admin" : "/app", { replace: true });
  }, [user, navigate, logout]);

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

  const reset = () => {
    setStep("phone"); setPhone(""); setOtp("");
    setErr(""); setInfo(""); setAccountError(""); setConfirmation(null); setChannel(null);
  };

  return (
    <div className="login-screen">
      <div id="recaptcha-container" />

      {accountError ? (
        /* ─── ACCOUNT ERROR ─── */
        <div className="login-content">
          <div className="flex-1 flex flex-col items-center justify-center px-8">
            <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
              <XCircle className="w-10 h-10 text-red-400" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2 text-center">Account not found</h1>
            <p className="text-sm text-white/60 mb-8 text-center">{accountError}</p>
            <button onClick={reset} className="login-btn w-full">Try again</button>
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
              {step === "phone" ? "Sign in to your account" : "Verify your number"}
            </p>
          </div>

          {/* ─── FORM AREA ─── */}
          <div className="flex-1 px-6 flex flex-col">
            {/* Back button (OTP step only) */}
            {step === "otp" && (
              <button
                onClick={() => { setStep("phone"); setOtp(""); setErr(""); setInfo(""); }}
                className="flex items-center gap-1.5 text-sm text-white/60 press-scale mb-6 self-start"
              >
                <ArrowLeft size={18} /> Change number
              </button>
            )}

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
                  We'll send a one-time code. Your role is detected automatically — no need to choose.
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
          </div>
        </div>
      )}
    </div>
  );
}
