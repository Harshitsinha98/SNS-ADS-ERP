import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Radio, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";

export default function Login() {
  const { requestOtp, verifyOtp } = useAuth();
  const { users } = useData();
  const navigate = useNavigate();

  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [matchedUser, setMatchedUser] = useState(null);
  const [devOtp, setDevOtp] = useState("");

  const sendOtp = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    const res = await requestOtp(phone.trim(), users);
    setLoading(false);
    if (res.ok) { setMatchedUser(res.matchedUser); setDevOtp(res.devOtp || ""); setStep("otp"); }
    else setErr(res.error);
  };

  const confirmOtp = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    const res = await verifyOtp(phone.trim(), otp.trim(), matchedUser);
    setLoading(false);
    if (res.ok) navigate(res.role === "admin" ? "/admin" : "/app");
    else setErr(res.error);
  };

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center font-body px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <Radio size={20} className="text-signal" />
          <span className="font-display font-semibold text-white text-lg tracking-tight">SNS ADS ERP</span>
        </div>

        <div className="bg-ink-soft border border-ink-line rounded-xl p-7">
          <p className="eyebrow text-white/40 mb-1">{step === "phone" ? "Sign in" : "Verify"}</p>
          <h1 className="text-white font-display font-semibold text-xl mb-1">
            {step === "phone" ? "Enter your mobile number" : "Enter the code"}
          </h1>
          <p className="text-white/40 text-sm mb-6">
            {step === "phone" ? "We'll send a one-time code to verify it's you." : `Code sent to ${phone}`}
          </p>

          {err && <p className="text-danger text-sm mb-4 bg-danger/10 border border-danger/20 rounded px-3 py-2">{err}</p>}

          {step === "phone" ? (
            <form onSubmit={sendOtp} className="space-y-4">
              <input
                className="w-full bg-ink border border-ink-line rounded-md px-3 py-2.5 text-white num tracking-wide placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-signal/40 focus:border-signal"
                placeholder="98XXXXXXXX" value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} maxLength={10} required />
              <button disabled={loading}
                className="w-full bg-signal text-ink font-semibold rounded-md py-2.5 text-sm hover:brightness-110 transition disabled:opacity-50">
                {loading ? "Sending…" : "Send code"}
              </button>
            </form>
          ) : (
            <form onSubmit={confirmOtp} className="space-y-4">
              <input
                className="w-full bg-ink border border-ink-line rounded-md px-3 py-2.5 text-white num text-center text-lg tracking-[0.4em] placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-signal/40 focus:border-signal"
                placeholder="······" value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} maxLength={6} required />
              {devOtp && (
                <p className="text-xs text-signal flex items-center gap-1.5">
                  <ShieldCheck size={13} /> Dev mode code: <span className="num font-semibold">{devOtp}</span>
                </p>
              )}
              <button disabled={loading}
                className="w-full bg-signal text-ink font-semibold rounded-md py-2.5 text-sm hover:brightness-110 transition disabled:opacity-50">
                {loading ? "Verifying…" : "Verify & sign in"}
              </button>
              <button type="button" onClick={() => { setStep("phone"); setOtp(""); setErr(""); }}
                className="w-full text-xs text-white/35 hover:text-white/60 transition">
                Use a different number
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}