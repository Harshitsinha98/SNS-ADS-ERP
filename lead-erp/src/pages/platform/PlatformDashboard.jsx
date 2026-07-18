import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, doc, getDoc, onSnapshot, updateDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import { subscribePlatformConfig, savePlatformConfig } from "../../utils/platformConfig";
import { mergePlansWithConfig, limitsForPlan } from "../../data/plans";
import { PLATFORM_OWNER_PHONE } from "../../data/constants";
import Logo from "../../components/marketing/Logo";
import {
  Building2, Users, IndianRupee, Clock, ShieldAlert, LogOut, Save, Loader2,
  TrendingUp, Search, Zap, RotateCcw, LogIn, Phone, ArrowRight, ArrowLeft, Lock, Crown,
} from "lucide-react";

export default function PlatformDashboard() {
  const { user, authLoading, logout, requestOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [orgs, setOrgs] = useState([]);
  const [config, setConfig] = useState(null);
  const [q, setQ] = useState("");
  const [rowBusy, setRowBusy] = useState(null);
  const [rowMsg, setRowMsg] = useState("");

  // config editor state
  const [trialDays, setTrialDays] = useState(14);
  const [plansDraft, setPlansDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  // 1. Verify the signed-in user is a platform super-admin.
  //    The hardcoded platform owner phone always qualifies (matches rules).
  useEffect(() => {
    if (authLoading) return;
    if (!user?.uid) { setChecking(false); return; }
    if (user.isPlatformOwner || user.phone === PLATFORM_OWNER_PHONE) {
      setIsPlatformAdmin(true);
      setChecking(false);
      return;
    }
    getDoc(doc(db, "platformAdmins", user.uid))
      .then((snap) => setIsPlatformAdmin(snap.exists()))
      .catch(() => setIsPlatformAdmin(false))
      .finally(() => setChecking(false));
  }, [user, authLoading]);

  // 2. Subscribe to all orgs + platform config (only if platform admin)
  useEffect(() => {
    if (!isPlatformAdmin) return;
    const unsubOrgs = onSnapshot(collection(db, "organizations"), (snap) => {
      setOrgs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("orgs listener:", err?.code));
    const unsubCfg = subscribePlatformConfig((c) => {
      setConfig(c);
      setTrialDays(c && Number.isFinite(c.trialDays) ? c.trialDays : 14);
    });
    return () => { unsubOrgs(); unsubCfg(); };
  }, [isPlatformAdmin]);

  const { plans } = mergePlansWithConfig(config);

  useEffect(() => {
    // seed the editable plan draft from merged plans
    const draft = {};
    plans.forEach((p) => {
      draft[p.id] = {
        monthlyPrice: p.monthlyPrice,
        includedSeats: p.includedSeats,
        leadsLimit: p.leadsLimit,
      };
    });
    setPlansDraft(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const saveConfig = async () => {
    setSaving(true);
    setSavedMsg("");
    try {
      await savePlatformConfig(
        { trialDays: Number(trialDays) || 14, plans: plansDraft },
        user.uid
      );
      setSavedMsg("✅ Saved — applies immediately to the website and new signups.");
    } catch (e) {
      setSavedMsg("❌ Save failed: " + (e?.code || e?.message));
    } finally {
      setSaving(false);
    }
  };

  // ---- per-org owner actions (platform admin can manage any org) ----
  const activateOrg = async (org) => {
    setRowBusy(org.id); setRowMsg("");
    try {
      const limits = limitsForPlan(org.planId || "growth", config);
      await updateDoc(doc(db, "organizations", org.id), {
        planId: limits.planId,
        planName: limits.planName,
        seatsLimit: limits.seatsLimit,
        leadsLimit: limits.leadsLimit,
        subscriptionStatus: "active",
        trialEndsAt: null,
        trialEndsAtMs: 0,
      });
      setRowMsg(`✅ ${org.name || org.id} activated (${limits.planName}).`);
    } catch (e) {
      setRowMsg("❌ " + (e?.code || e?.message));
    } finally { setRowBusy(null); }
  };

  const startTrialOrg = async (org) => {
    setRowBusy(org.id); setRowMsg("");
    try {
      const days = config && Number.isFinite(config.trialDays) ? config.trialDays : 14;
      const endMs = Date.now() + days * 24 * 60 * 60 * 1000;
      const limits = limitsForPlan(org.planId || "growth", config);
      await updateDoc(doc(db, "organizations", org.id), {
        subscriptionStatus: "trialing",
        seatsLimit: limits.seatsLimit,
        leadsLimit: limits.leadsLimit,
        trialEndsAt: new Date(endMs).toISOString(),
        trialEndsAtMs: endMs,
      });
      setRowMsg(`✅ A ${days}-day trial has been set for ${org.name || org.id}.`);
    } catch (e) {
      setRowMsg("❌ " + (e?.code || e?.message));
    } finally { setRowBusy(null); }
  };

  // Create an owner membership for the current platform admin, then jump into
  // that org's admin dashboard. Lets the owner get into any workspace.
  const joinAsOwner = async (org) => {
    setRowBusy(org.id); setRowMsg("");
    try {
      await setDoc(doc(db, "memberships", `${user.uid}_${org.id}`), {
        uid: user.uid,
        orgId: org.id,
        role: "owner",
        displayName: user.displayName || "Owner",
        active: true,
        invitedBy: user.uid,
        joinedAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
      }, { merge: true });
      await setDoc(doc(db, "users", user.uid), { defaultOrgId: org.id }, { merge: true });
      localStorage.setItem("activeOrgId", org.id);
      setRowMsg(`✅ You're now the owner of ${org.name || org.id}. Opening the dashboard…`);
      setTimeout(() => { window.location.assign("/admin"); }, 1200);
    } catch (e) {
      setRowMsg("❌ " + (e?.code || e?.message));
    } finally { setRowBusy(null); }
  };

  // ---- gates ----
  if (authLoading) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  // Not signed in → dedicated OWNER login (phone + OTP).
  if (!user) {
    return <OwnerLogin requestOtp={requestOtp} verifyOtp={verifyOtp} />;
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  // Signed in but not the platform owner → access denied.
  if (!isPlatformAdmin) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center p-4 texture-grain">
        <div className="bg-white rounded-2xl shadow-soft border border-cream-300/60 p-8 max-w-md text-center">
          <div className="w-14 h-14 rounded-2xl bg-danger-100 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="text-danger-600" size={26} />
          </div>
          <h1 className="font-display font-bold text-xl text-ink mb-2">Owner access only</h1>
          <p className="text-sm text-ink-soft mb-5">
            This portal is only for the CodeSkate owner. Your number doesn't have access.
          </p>
          <button onClick={logout} className="btn btn-secondary w-full">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </div>
    );
  }

  // ---- aggregate stats ----
  const priceOf = (planId) => plans.find((p) => p.id === planId)?.monthlyPrice || 0;
  const total = orgs.length;
  const trialing = orgs.filter((o) => o.subscriptionStatus === "trialing").length;
  const active = orgs.filter((o) => o.subscriptionStatus === "active").length;
  const expired = orgs.filter((o) => o.subscriptionStatus === "expired").length;
  const mrr = orgs
    .filter((o) => o.subscriptionStatus === "active")
    .reduce((s, o) => s + priceOf(o.planId), 0);

  const filtered = orgs.filter(
    (o) =>
      !q ||
      o.name?.toLowerCase().includes(q.toLowerCase()) ||
      o.ownerPhone?.includes(q)
  );

  const fmtDate = (v) => {
    if (!v) return "—";
    try {
      const d = v.toDate ? v.toDate() : new Date(v);
      return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
    } catch { return "—"; }
  };

  const StatusPill = ({ s }) => {
    const map = {
      active: "badge-success", trialing: "badge-warning", expired: "badge-danger",
    };
    return <span className={`badge ${map[s] || "badge-primary"}`}>{s || "—"}</span>;
  };

  return (
    <div className="min-h-screen bg-cream-100">
      {/* Top bar */}
      <header className="bg-ink text-cream-100 texture-grain">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo onDark />
            <span className="badge bg-orange-500/20 text-orange-300 ml-2">Platform</span>
          </div>
          <button onClick={logout} className="flex items-center gap-2 text-sm text-cream-300 hover:text-white">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="font-display font-bold text-2xl text-ink mb-1">Platform Control Center</h1>
        <p className="text-sm text-ink-soft mb-6">All organizations, subscriptions and global settings in one place.</p>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <PlatStat icon={Building2} label="Total orgs" value={total} tone="orange" />
          <PlatStat icon={Clock} label="On trial" value={trialing} tone="warning" />
          <PlatStat icon={TrendingUp} label="Active (paid)" value={active} tone="success" />
          <PlatStat icon={ShieldAlert} label="Expired" value={expired} tone="danger" />
          <PlatStat icon={IndianRupee} label="Est. MRR" value={`₹${mrr.toLocaleString("en-IN")}`} tone="ink" />
        </div>

        {/* Global config editor */}
        <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6 mb-8">
          <h2 className="font-display font-semibold text-lg text-ink mb-1">Global settings</h2>
          <p className="text-sm text-ink-soft mb-5">
            Whatever you set here appears on the website (pricing/signup) and is enforced for new workspaces.
          </p>

          <div className="mb-6 max-w-xs">
            <label className="block text-sm font-medium text-ink mb-1.5">Free trial length (days)</label>
            <input
              type="number"
              min="0"
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value)}
              className="input"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-ink-muted border-b border-cream-300">
                  <th className="py-2 font-medium">Plan</th>
                  <th className="font-medium">Monthly price (₹)</th>
                  <th className="font-medium">Seats</th>
                  <th className="font-medium">Leads / month</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className="border-b border-cream-200 last:border-0">
                    <td className="py-2.5 font-medium capitalize">{p.name}</td>
                    <td>
                      <input type="number" className="w-28 border border-cream-400/70 rounded-lg px-2 py-1.5"
                        value={plansDraft[p.id]?.monthlyPrice ?? p.monthlyPrice}
                        onChange={(e) => setPlansDraft((d) => ({ ...d, [p.id]: { ...d[p.id], monthlyPrice: Number(e.target.value) } }))} />
                    </td>
                    <td>
                      <input type="number" className="w-20 border border-cream-400/70 rounded-lg px-2 py-1.5"
                        value={plansDraft[p.id]?.includedSeats ?? p.includedSeats}
                        onChange={(e) => setPlansDraft((d) => ({ ...d, [p.id]: { ...d[p.id], includedSeats: Number(e.target.value) } }))} />
                    </td>
                    <td>
                      <input type="number" className="w-28 border border-cream-400/70 rounded-lg px-2 py-1.5"
                        value={plansDraft[p.id]?.leadsLimit ?? p.leadsLimit}
                        onChange={(e) => setPlansDraft((d) => ({ ...d, [p.id]: { ...d[p.id], leadsLimit: Number(e.target.value) } }))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3 mt-5">
            <button onClick={saveConfig} disabled={saving} className="btn btn-primary">
              {saving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : <><Save size={16} /> Save settings</>}
            </button>
            {savedMsg && <span className="text-sm text-ink-soft">{savedMsg}</span>}
          </div>
        </div>

        {/* Orgs table */}
        <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 overflow-hidden">
          <div className="p-4 flex items-center justify-between gap-3 border-b border-cream-200">
            <h2 className="font-display font-semibold text-lg text-ink">All organizations ({total})</h2>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / phone"
                className="pl-9 pr-3 py-2 text-sm border border-cream-400/70 rounded-lg" />
            </div>
          </div>
          {rowMsg && (
            <div className="px-4 py-2.5 bg-cream-50 border-b border-cream-200 text-sm text-ink-soft">{rowMsg}</div>
          )}
          <div className="px-4 py-2 text-xs text-ink-muted flex items-center gap-4 border-b border-cream-100">
            <span className="flex items-center gap-1"><Zap size={12} className="text-success-600" /> Activate</span>
            <span className="flex items-center gap-1"><RotateCcw size={12} className="text-warning-600" /> Fresh trial</span>
            <span className="flex items-center gap-1"><LogIn size={12} className="text-orange-600" /> Join as owner</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-left text-ink-muted bg-cream-50 border-b border-cream-200">
                  <th className="p-3 font-medium">Organization</th>
                  <th className="font-medium">Owner phone</th>
                  <th className="font-medium">Plan</th>
                  <th className="font-medium">Status</th>
                  <th className="font-medium">Seats</th>
                  <th className="font-medium">Trial ends</th>
                  <th className="font-medium">Created</th>
                  <th className="font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} className="border-b border-cream-100 last:border-0 hover:bg-cream-50">
                    <td className="p-3 font-medium text-ink">{o.name || o.id}</td>
                    <td className="font-mono text-ink-soft">{o.ownerPhone || "—"}</td>
                    <td className="capitalize">{o.planName || "—"}</td>
                    <td><StatusPill s={o.subscriptionStatus} /></td>
                    <td className="font-mono">{(o.seatsUsed ?? "—")}/{(o.seatsLimit ?? "—")}</td>
                    <td>{fmtDate(o.trialEndsAt)}</td>
                    <td>{fmtDate(o.createdAt)}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <button title="Activate (paid)" disabled={rowBusy === o.id}
                          onClick={() => activateOrg(o)}
                          className="p-1.5 rounded-lg bg-success-100 text-success-700 hover:bg-success-200 disabled:opacity-50">
                          {rowBusy === o.id ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                        </button>
                        <button title="Start fresh trial" disabled={rowBusy === o.id}
                          onClick={() => startTrialOrg(o)}
                          className="p-1.5 rounded-lg bg-warning-100 text-warning-700 hover:bg-warning-200 disabled:opacity-50">
                          <RotateCcw size={14} />
                        </button>
                        <button title="Join as owner & open" disabled={rowBusy === o.id}
                          onClick={() => joinAsOwner(o)}
                          className="p-1.5 rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 disabled:opacity-50">
                          <LogIn size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan="8" className="p-6 text-center text-ink-muted">No organizations found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlatStat({ icon: Icon, label, value, tone }) {
  const tones = {
    orange: "bg-orange-100 text-orange-600",
    warning: "bg-warning-100 text-warning-600",
    success: "bg-success-100 text-success-600",
    danger: "bg-danger-100 text-danger-600",
    ink: "bg-cream-200 text-ink",
  };
  return (
    <div className="bg-white rounded-xl shadow-card border border-cream-300/60 p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${tones[tone] || tones.ink}`}>
        <Icon size={18} />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">{label}</p>
      <p className="text-2xl font-display font-bold text-ink">{value}</p>
    </div>
  );
}

// Dedicated OWNER login — separate from the tenant login. Any number can enter
// OTP, but only the platform owner phone passes the gate afterwards (checked by
// the parent). Non-owners land on the "Owner access only" screen.
function OwnerLogin({ requestOtp, verifyOtp }) {
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const send = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    const res = await requestOtp(phone.trim());
    setLoading(false);
    if (res.ok) { setConfirmation(res.confirmation); setStep("otp"); }
    else setErr(res.error);
  };

  const verify = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    const res = await verifyOtp(confirmation, otp.trim());
    setLoading(false);
    if (!res.ok) setErr(res.error);
    // success → AuthContext sets user → parent re-renders & gates by owner phone
  };

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center p-4 relative overflow-hidden texture-grain">
      <div className="absolute -top-20 -right-20 w-96 h-96 bg-orange-600/25 rounded-full blur-3xl animate-blob" />
      <div className="absolute -bottom-24 -left-20 w-96 h-96 bg-ember-500/20 rounded-full blur-3xl animate-blob" style={{ animationDelay: "3s" }} />
      <div className="absolute inset-0 pattern-grid opacity-20" />
      <div id="recaptcha-container" />

      <div className="relative w-full max-w-md">
        <div className="flex justify-center mb-6"><Logo size="lg" onDark /></div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden">
          <div className="h-1.5 bg-gradient-orange" />
          <div className="p-7 sm:p-9">
            <div className="inline-flex items-center gap-2 bg-orange-500/15 text-orange-300 rounded-full px-3 py-1 text-xs font-semibold mb-5">
              <Crown size={13} /> Owner Portal
            </div>
            <h1 className="font-display font-bold text-2xl text-white mb-1">
              {step === "phone" ? "Owner sign in" : "Enter your code"}
            </h1>
            <p className="text-sm text-cream-300/70 mb-6">
              {step === "phone"
                ? "Only the CodeSkate owner's number is allowed."
                : `Code sent to +91${phone}`}
            </p>

            {err && (
              <div className="bg-danger-500/15 text-danger-300 text-sm px-4 py-3 rounded-xl mb-4 border border-danger-500/20">
                {err}
              </div>
            )}

            {step === "phone" ? (
              <form onSubmit={send} className="space-y-5">
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cream-400/50" size={18} />
                  <span className="absolute left-11 top-1/2 -translate-y-1/2 text-cream-300/70 font-medium text-sm">+91</span>
                  <input
                    type="tel"
                    className="w-full bg-white/5 border border-white/15 rounded-xl pl-[4.5rem] pr-4 py-3 text-white placeholder:text-cream-400/40 focus:border-orange-400 focus:ring-4 focus:ring-orange-500/20 outline-none"
                    placeholder="98XXXXXXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                    maxLength={10}
                    required
                    disabled={loading}
                  />
                </div>
                <button disabled={loading || phone.length !== 10} className="btn btn-primary w-full py-3.5 text-base">
                  {loading ? <><Loader2 size={18} className="animate-spin" /> Sending…</> : <>Send code <ArrowRight size={18} /></>}
                </button>
              </form>
            ) : (
              <form onSubmit={verify} className="space-y-5">
                <input
                  className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-white text-center text-2xl tracking-[0.5em] font-mono placeholder:text-cream-400/30 focus:border-orange-400 focus:ring-4 focus:ring-orange-500/20 outline-none"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  maxLength={6}
                  required
                  autoFocus
                  disabled={loading}
                />
                <button disabled={loading || otp.length !== 6} className="btn btn-primary w-full py-3.5 text-base">
                  {loading ? <><Loader2 size={18} className="animate-spin" /> Verifying…</> : <>Verify & enter <ArrowRight size={18} /></>}
                </button>
                <button type="button" onClick={() => { setStep("phone"); setOtp(""); setErr(""); setConfirmation(null); }}
                  className="w-full flex items-center justify-center gap-1.5 text-sm text-cream-400/60 hover:text-cream-200">
                  <ArrowLeft size={15} /> Use a different number
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-cream-400/40 mt-6 flex items-center justify-center gap-1.5">
          <Lock size={12} /> Restricted — CodeSkate platform owner only
        </p>
      </div>
    </div>
  );
}
