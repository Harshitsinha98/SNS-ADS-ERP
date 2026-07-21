/**
 * Platform Owner Login — self-contained OTP login for the platform console.
 *
 * This is intentionally separate from the org-level Login page. It has:
 * 1. Its own dark-themed branding ("Platform Console").
 * 2. No signup CTA or org-related flows.
 * 3. Post-login redirect stays within /platform/*.
 */

import { useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { Shield, Phone, ArrowRight, Loader2, ShieldAlert, LogOut } from "lucide-react";
import { PLATFORM_OWNER_PHONE } from "../../../data/constants";

export default function PlatformLogin() {
  const { user, requestOtp, verifyOtp, logout } = useAuth();
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState(user ? "denied" : "phone"); // phone → otp → denied
  const [otp, setOtp] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!phone.trim() || phone.replace(/\D/g, "").length < 10) {
      setError("Enter a valid 10-digit phone number");
      return;
    }
    setLoading(true);
    setError("");
    const result = await requestOtp(phone.replace(/\D/g, "").slice(-10));
    setLoading(false);
    if (result.ok) {
      setConfirmation(result.confirmation);
      setStep("otp");
    } else {
      setError(result.error);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otp.length < 6) { setError("Enter the 6-digit OTP"); return; }
    setLoading(true);
    setError("");
    const result = await verifyOtp(confirmation, otp);
    setLoading(false);
    if (!result.ok) setError(result.error);
    // If successful, the auth state change will trigger usePlatformAuth
    // which will either show the console (if platform admin) or show denied.
  };

  // User is signed in but NOT a platform admin
  if (user && step !== "otp") {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-cream-200 p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-2xl bg-danger-100 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="text-danger-600" size={26} />
          </div>
          <h1 className="font-display font-bold text-xl text-ink mb-2">Access Denied</h1>
          <p className="text-sm text-ink-soft mb-5">
            This console is restricted to the platform owner. Your account doesn't have access.
          </p>
          <button onClick={logout} className="btn btn-secondary w-full">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-cream-200 p-8 max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center mx-auto mb-4">
            <Shield className="text-white" size={26} />
          </div>
          <h1 className="font-display font-bold text-2xl text-ink">Platform Console</h1>
          <p className="text-sm text-ink-soft mt-1">Sign in with the owner phone number</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-danger-50 border border-danger-200 text-sm text-danger-700">
            {error}
          </div>
        )}

        {step === "phone" && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <label className="block text-sm font-medium text-ink">
              Phone Number
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm text-ink-soft">+91</span>
                <input
                  type="tel"
                  className="input flex-1"
                  placeholder="10-digit mobile number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={10}
                  autoFocus
                />
              </div>
            </label>
            <button type="submit" disabled={loading} className="btn btn-primary w-full disabled:opacity-60">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Phone size={16} />}
              {loading ? "Sending OTP…" : "Send OTP"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <label className="block text-sm font-medium text-ink">
              Enter OTP
              <input
                type="text"
                className="input mt-1"
                placeholder="6-digit OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                autoFocus
              />
            </label>
            <button type="submit" disabled={loading} className="btn btn-primary w-full disabled:opacity-60">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              {loading ? "Verifying…" : "Verify & Sign In"}
            </button>
            <button type="button" onClick={() => { setStep("phone"); setOtp(""); }} className="btn btn-ghost w-full text-sm">
              ← Use a different number
            </button>
          </form>
        )}

        <div id="recaptcha-container" className="mt-4" />
      </div>
    </div>
  );
}
