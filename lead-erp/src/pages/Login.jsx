import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Phone, ShieldCheck, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Logo from "../components/marketing/Logo";

export default function Login() {
  const { user, requestOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    if (user) {
      if (user.isPlatformOwner && !user.role) {
        navigate("/platform", { replace: true });
      } else if (user.needsSetup) {
        navigate("/setup", { replace: true });
      } else {
        const isAdminish = user.role === "admin" || user.role === "owner";
        navigate(isAdminish ? "/admin" : "/app", { replace: true });
      }
    }
  }, [user, navigate]);

  const sendOtp = async (e) => {
    e.preventDefault();
    setErr("");
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

  const confirmOtp = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const res = await verifyOtp(confirmation, otp.trim());
    setLoading(false);
    if (!res.ok) setErr(res.error);
  };

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center p-4 relative overflow-hidden texture-grain">
      {/* decorative blobs */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-orange-300/25 rounded-full blur-3xl -translate-y-1/3 translate-x-1/3 animate-blob pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-ember-300/20 rounded-full blur-3xl translate-y-1/3 -translate-x-1/3 animate-blob pointer-events-none" style={{ animationDelay: "4s" }} />
      <div className="absolute inset-0 pattern-dots opacity-40 pointer-events-none" />

      <div id="recaptcha-container" />

      <div className="w-full max-w-md relative z-10">
        <div className="flex justify-center mb-8">
          <Link to="/"><Logo size="lg" /></Link>
        </div>

        <div className="bg-white rounded-3xl shadow-soft border border-cream-300/60 overflow-hidden">
          {/* accent bar */}
          <div className="h-1.5 bg-gradient-orange" />

          <div className="p-7 sm:p-9">
            <p className="eyebrow mb-2">{step === "phone" ? "Welcome back" : "Verify"}</p>
            <h1 className="font-display font-bold text-2xl text-ink mb-1">
              {step === "phone" ? "Sign in to CodeSkate" : "Enter your code"}
            </h1>
            <p className="text-sm text-ink-soft mb-6">
              {step === "phone"
                ? "We'll text you a one-time code to sign in."
                : `Code sent to +91${phone}`}
            </p>

            {err && (
              <div className="bg-danger-50 text-danger-600 text-sm px-4 py-3 rounded-xl mb-4 border border-danger-100 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
                {err}
              </div>
            )}

            {step === "phone" ? (
              <form onSubmit={sendOtp} className="space-y-5">
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
                      required
                      disabled={loading}
                    />
                  </div>
                </div>
                <button disabled={loading || phone.length !== 10} className="btn btn-primary w-full py-3.5 text-base">
                  {loading ? (
                    <><Loader2 size={18} className="animate-spin" /> Sending…</>
                  ) : (
                    <>Send code <ArrowRight size={18} /></>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={confirmOtp} className="space-y-5">
                <input
                  className="input text-center text-2xl tracking-[0.5em] font-mono"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  maxLength={6}
                  required
                  autoFocus
                  disabled={loading}
                />
                <button disabled={loading || otp.length !== 6} className="btn btn-primary w-full py-3.5 text-base">
                  {loading ? (
                    <><Loader2 size={18} className="animate-spin" /> Verifying…</>
                  ) : (
                    <>Verify & sign in <ArrowRight size={18} /></>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setStep("phone"); setOtp(""); setErr(""); setConfirmation(null); }}
                  className="w-full flex items-center justify-center gap-1.5 text-sm text-ink-muted hover:text-orange-600 transition-colors"
                >
                  <ArrowLeft size={15} /> Use a different number
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-sm text-ink-muted mt-6">
          New to CodeSkate?{" "}
          <Link to="/signup" className="text-orange-600 font-semibold hover:underline">
            Start your free trial
          </Link>
        </p>
      </div>
    </div>
  );
}
