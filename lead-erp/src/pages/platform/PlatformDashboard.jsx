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
  TrendingUp, Search, Zap, RotateCcw, LogIn,
} from "lucide-react";

export default function PlatformDashboard() {
  const { user, authLoading, logout } = useAuth();
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
      setSavedMsg("✅ Saved — website aur naye signups par turant apply hoga.");
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
      setRowMsg(`✅ ${org.name || org.id} par ${days}-din ka trial set ho gaya.`);
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
      setRowMsg(`✅ Aap ab ${org.name || org.id} ke owner ho. Dashboard khol raha hoon…`);
      setTimeout(() => { window.location.assign("/admin"); }, 1200);
    } catch (e) {
      setRowMsg("❌ " + (e?.code || e?.message));
    } finally { setRowBusy(null); }
  };

  // ---- gates ----
  if (authLoading || checking) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-8 max-w-md text-center">
          <div className="w-14 h-14 rounded-2xl bg-danger-100 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="text-danger-600" size={26} />
          </div>
          <h1 className="font-display font-bold text-xl text-ink mb-2">Platform access only</h1>
          <p className="text-sm text-ink-soft mb-5">
            Ye dashboard sirf CodeSkate platform owners ke liye hai. Aapke account ko platform-admin access nahi hai.
          </p>
          <p className="text-xs text-ink-muted">
            Enable karne ke liye Firestore me <code className="bg-cream-200 px-1 rounded">platformAdmins/{user?.uid || "&lt;your-uid&gt;"}</code> document banao.
          </p>
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
        <p className="text-sm text-ink-soft mb-6">Saare organizations, subscriptions aur global settings ek jagah.</p>

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
            Yahan jo set karoge wahi website (pricing/signup) par dikhega aur naye workspaces me enforce hoga.
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
                  <tr><td colSpan="8" className="p-6 text-center text-ink-muted">Koi organization nahi mila.</td></tr>
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
