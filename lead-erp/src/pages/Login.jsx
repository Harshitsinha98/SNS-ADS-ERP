import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Phone, Shield, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";

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
      if (user.needsSetup) {
        navigate("/setup", { replace: true });
      } else {
        navigate(user.role === "admin" ? "/admin" : "/app", { replace: true });
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-primary-400/20 to-accent-400/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-accent-400/20 to-primary-400/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

      {/* Recaptcha container */}
      <div id="recaptcha-container"></div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 bg-gradient-to-br from-primary-600 to-accent-600 rounded-xl flex items-center justify-center shadow-glow">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <span className="font-display font-bold text-3xl bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent">
            CodeSkate
          </span>
        </div>

        {/* Main Card */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary-600 to-accent-600 px-6 py-5 text-white">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/70 mb-1">
              {step === "phone" ? "Welcome back" : "Verify your number"}
            </p>
            <h1 className="font-display font-semibold text-xl">
              {step === "phone" ? "Sign in to continue" : "Enter verification code"}
            </h1>
          </div>

          {/* Content */}
          <div className="p-6">
            {err && (
              <div className="bg-danger-50 text-danger-600 text-sm px-4 py-3 rounded-lg mb-4 border border-danger-100 flex items-start gap-2">
                <Shield className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {err}
              </div>
            )}

            {step === "phone" ? (
              <form onSubmit={sendOtp} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number
                  </label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                      <Phone className="w-5 h-5" />
                    </div>
                    <div className="absolute left-12 top-1/2 -translate-y-1/2 text-gray-600 font-medium text-sm">
                      +91
                    </div>
                    <input
                      type="tel"
                      className="input pl-20"
                      placeholder="98XXXXXXXX"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                      maxLength={10}
                      required
                      disabled={loading}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    We'll send a 6-digit verification code
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading || phone.length !== 10}
                  className="btn btn-primary w-full py-3.5 text-base"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Sending code...
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={confirmOtp} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Verification Code
                  </label>
                  <input
                    type="text"
                    className="input text-center text-2xl tracking-[0.5em] font-mono"
                    placeholder="000000"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    maxLength={6}
                    required
                    disabled={loading}
                    autoFocus
                  />
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    Code sent to +91{phone}
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="btn btn-primary w-full py-3.5 text-base"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      Verify & Sign In
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStep("phone");
                    setOtp("");
                    setErr("");
                    setConfirmation(null);
                  }}
                  className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Use a different number
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
