import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { provisionTrialWorkspace } from "../utils/billingApi";
import { Building2, User, Phone, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import Logo from "../components/marketing/Logo";

// Fallback for an authenticated number that reaches /setup directly. Workspace
// provisioning is server-owned; this page never creates organizations, owners,
// trial records, or plan limits from the browser.
export default function Setup() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState(user?.displayName || "");

  const handleSetup = async (event) => {
    event.preventDefault();
    if (!orgName.trim()) return setError("Organization name is required.");
    if (!fullName.trim()) return setError("Your name is required.");
    setLoading(true);
    setError("");
    try {
      await provisionTrialWorkspace({ orgName: orgName.trim(), fullName: fullName.trim() });
      setSuccess(true);
      setTimeout(() => window.location.assign("/admin"), 1200);
    } catch (err) {
      setError(err.message || "Could not create your workspace. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center p-4 relative overflow-hidden texture-grain">
      <div className="absolute top-0 right-0 w-96 h-96 bg-orange-300/25 rounded-full blur-3xl -translate-y-1/3 translate-x-1/3 animate-blob pointer-events-none" />
      <div className="absolute inset-0 pattern-dots opacity-40 pointer-events-none" />
      <div className="w-full max-w-md relative z-10">
        <div className="flex justify-center mb-8"><Logo size="lg" /></div>
        <div className="bg-white rounded-3xl shadow-soft border border-cream-300/60 overflow-hidden">
          <div className="h-1.5 bg-gradient-orange" />
          <div className="p-7 sm:p-9">
            {success ? (
              <div className="text-center py-6 animate-fade-in">
                <div className="w-20 h-20 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-5"><CheckCircle2 className="w-11 h-11 text-success-600" /></div>
                <h2 className="font-display font-bold text-2xl text-ink mb-2">Workspace ready!</h2>
                <p className="text-ink-soft mb-5">Taking you to your dashboard…</p>
                <Loader2 className="w-6 h-6 animate-spin text-orange-500 mx-auto" />
              </div>
            ) : (
              <>
                <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-4"><Building2 className="text-orange-600" size={24} /></div>
                <h1 className="font-display font-bold text-2xl text-ink mb-1">Create your workspace</h1>
                <p className="text-sm text-ink-soft mb-6">Your Starter trial is created securely after this verified sign-in.</p>
                <form onSubmit={handleSetup} className="space-y-5">
                  <div className="bg-cream-100 rounded-xl p-4 flex items-center gap-3 border border-cream-300/60">
                    <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center shrink-0"><Phone className="w-5 h-5 text-orange-600" /></div>
                    <div><p className="text-xs text-ink-muted">Verified number</p><p className="text-sm font-medium text-ink font-mono">{user?.phone}</p></div>
                  </div>
                  <label className="block text-sm font-medium text-ink">Your name
                    <div className="relative mt-1.5"><User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" size={18} /><input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input pl-11" disabled={loading} /></div>
                  </label>
                  <label className="block text-sm font-medium text-ink">Organization name
                    <div className="relative mt-1.5"><Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" size={18} /><input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="e.g., CodeSkate Technologies" className="input pl-11" disabled={loading} /></div>
                  </label>
                  {error && <div className="bg-danger-50 text-danger-600 text-sm px-4 py-3 rounded-xl border border-danger-100">{error}</div>}
                  <button type="submit" disabled={loading} className="btn btn-primary w-full py-3.5 text-base">
                    {loading ? <><Loader2 size={18} className="animate-spin" /> Creating…</> : <>Create & continue <ArrowRight size={18} /></>}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
