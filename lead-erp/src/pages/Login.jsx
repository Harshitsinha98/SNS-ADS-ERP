import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Phone, ShieldCheck, ArrowRight, ArrowLeft, Loader2, Shield, Users, XCircle,
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
    if (user.isPlatformOwner && !user.role) { navigate("/platform", { replace: true }); return; }
    if (user.needsSetup) { setRoleError("No workspace found. Please sign up first."); logout(); return; }
    const isAdminish = user.role === "admin" || user.role === "owner";
    if (!portal) { navigate(isAdminish ? "/admin" : "/app", { replace: true }); return; }
    if (portal === "admin" && !isAdminish) { setRoleError("Access denied — you're an employee."); logout(); return; }
    if (portal === "employee" && isAdminish) { setRoleError("Access denied — you're an admin."); logout(); return; }
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
    setErr(""); setInfo(""); setRoleError(""); setConfirmation(null); setChannel(null);
  };

  return (
    <div className="login-screen">
      <div id="recaptcha-container" />

      {/* ─── ROLE ERROR ─── */}
      {roleError ? (
        <div className="login-content">
          <div className="flex-1 flex flex-col items-center justify-center px-8">
            <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
              <XCircle className="w-10 h-10 text-red-400" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2 text-center">Access Denied</h1>
            <p className="text-sm text-white/60 mb-8 text-center">{roleError}</p>
            <button onClick={resetToPortal} className="login-btn w-full">Try again</button>
          </div>
        </div>
      ) : !portal ? (
        /* ─── PORTAL SELECTOR ─── */
        <div className="login-content">
          {/* Brand */}
          <div className="pt-16 pb-8 flex flex-col items-center">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30 mb-5">
              <span className="text-white font-bold text-2xl font-display">C</span>
            </div>
            <h1 className="text-2xl font-bold text-white font-display">Codeskate CRM</h1>
            <p className="text-sm text-white/50 mt-1">Sign in to continue</p>
          </div>

          {/* Role Selection */}
          <div className="flex-1 px-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-4 px-1">Choose your role</p>

            <button
              onClick={() => setPortal("admin")}
              className="login-role-card mb-3"
            >
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shrink-0">
                <Shield className="text-white" size={22} />
              </div>
              <div className="flex-1 text-left">
                <p className="font-bold text-white text-[15px]">Admin</p>
                <p className="text-xs text-white/50 mt-0.5">Manage team & business</p>
              </div>
              <ArrowRight size={18} className="text-white/30" />
            </button>

            <button
              onClick={() => setPortal("employee")}
              className="login-role-card"
            >
              <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
                <Users className="text-orange-400" size={22} />
              </div>
              <div className="flex-1 text-left">
                <p className="font-bold text-white text-[15px]">Employee</p>
                <p className="text-xs text-white/50 mt-0.5">Work on your leads</p>
              </div>
              <ArrowRight size={18} className="text-white/30" />
            </button>
          </div>

          {/* Footer */}
          <div className="pb-10 pt-6 text-center">
            <p className="text-sm text-white/40">
              New here? <Link to="/signup" className="text-orange-400 font-semibold">Start free trial</Link>
            </p>
          </div>
        </div>
      ) : (
        /* ─── PHONE / OTP ENTRY ─── */
        <div className="login-content">
          {/* Top bar with back */}
          <div className="pt-14 px-6 pb-4">
            <button
              onClick={step === "otp" ? () => { setStep("phone"); setOtp(""); setErr(""); setInfo(""); } : resetToPortal}
              className="flex items-center gap-1.5 text-sm text-white/60 press-scale mb-8"
            >
              <ArrowLeft size={18} /> Back
            </button>

            {/* Role indicator */}
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold mb-5 ${
              portal === "admin" ? "bg-orange-500/20 text-orange-400" : "bg-white/10 text-white/70"
            }`}>
              {portal === "admin" ? <Shield size={12} /> : <Users size={12} />}
              {portal === "admin" ? "Admin" : "Employee"}
            </div>

            <h1 className="text-2xl font-bold text-white font-display mb-1.5">
              {step === "phone" ? "Enter your number" : "Enter OTP"}
            </h1>
            <p className="text-sm text-white/50">
              {step === "phone"
                ? "We'll send a verification code"
                : <>Sent to <span className="text-white font-medium">+91 {phone}</span>{channelLabel(channel) ? ` via ${channelLabel(channel)}` : ""}</>}
            </p>
          </div>

          {/* Error / Info */}
          <div className="px-6">
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
          </div>

          {/* Forms */}
          <div className="flex-1 px-6 flex flex-col">
            {step === "phone" ? (
              <form onSubmit={sendOtp} className="flex-1 flex flex-col">
                <div className="mb-8">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Phone number</label>
                  <div className="relative">
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
                </div>

                <div className="mt-auto pb-10">
                  <button disabled={loading || phone.length !== 10} className="login-btn w-full">
                    {loading
                      ? <><Loader2 size={18} className="animate-spin" /> Sending...</>
                      : <>Get OTP <ArrowRight size={18} /></>}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex-1 flex flex-col">
                <form onSubmit={confirmOtp} className="flex-1 flex flex-col">
                  <div className="mb-8">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">6-digit code</label>
                    <input
                      className="login-input text-center text-2xl tracking-[0.5em] font-mono"
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
                  </div>

                  <div className="mt-auto pb-4">
                    <button disabled={loading || otp.length !== 6} className="login-btn w-full">
                      {loading
                        ? <><Loader2 size={18} className="animate-spin" /> Verifying...</>
                        : <>Verify & Sign In</>}
                    </button>
                  </div>
                </form>

                {/* Resend */}
                <div className="pb-10 pt-3 border-t border-white/10">
                  <p className="text-xs text-white/40 mb-3">Didn't get the code?</p>
                  <div className="flex gap-2">
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
                        Call
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
