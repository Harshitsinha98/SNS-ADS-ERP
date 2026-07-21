/**
 * Module 11: Platform Settings.
 * Global trial length, plan pricing, and platform config.
 */
import { useState, useEffect } from "react";
import PlatformShell from "./components/PlatformShell";
import SectionCard from "./components/SectionCard";
import { usePlatformAuth } from "./hooks/usePlatformAuth";
import { subscribePlatformConfig, savePlatformConfig } from "../../utils/platformConfig";
import { mergePlansWithConfig } from "../../data/plans";
import { Save, Loader2, Settings2 } from "lucide-react";

export default function SettingsPage() {
  const { user } = usePlatformAuth();
  const [config, setConfig] = useState(null);
  const [trialDays, setTrialDays] = useState(7);
  const [plansDraft, setPlansDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const unsub = subscribePlatformConfig((c) => {
      setConfig(c);
      setTrialDays(c?.trialDays || 7);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const { plans } = mergePlansWithConfig(config);
    const draft = {};
    plans.forEach((p) => { draft[p.id] = { monthlyPrice: p.monthlyPrice, yearlyPrice: p.yearlyPrice, includedSeats: p.includedSeats, leadsLimit: p.leadsLimit }; });
    setPlansDraft(draft);
  }, [config]);

  const handleSave = async () => {
    setSaving(true); setMsg("");
    try {
      await savePlatformConfig({ trialDays: Number(trialDays) || 7, plans: plansDraft }, user?.uid);
      setMsg("✓ Saved — applies immediately.");
    } catch (e) { setMsg("✗ " + (e?.message || "Save failed")); }
    finally { setSaving(false); }
  };

  return (
    <PlatformShell title="Platform Settings">
      <div className="space-y-6">
        <SectionCard title="Trial Configuration">
          <label className="block text-sm font-medium text-ink">
            Free trial days for new signups
            <input type="number" className="input mt-1 w-32" min={0} max={90} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} />
          </label>
        </SectionCard>

        <SectionCard title="Plan Pricing" subtitle="Changes apply to new signups and renewals immediately">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-cream-200">
                <th className="text-left py-2 text-xs text-ink-muted">Plan</th>
                <th className="text-left py-2 text-xs text-ink-muted">Monthly ₹</th>
                <th className="text-left py-2 text-xs text-ink-muted">Yearly ₹</th>
                <th className="text-left py-2 text-xs text-ink-muted">Seats</th>
                <th className="text-left py-2 text-xs text-ink-muted">Lead Limit</th>
              </tr></thead>
              <tbody>
                {Object.entries(plansDraft).map(([id, plan]) => (
                  <tr key={id} className="border-b border-cream-100">
                    <td className="py-2 font-medium capitalize">{id}</td>
                    <td><input type="number" className="input w-24" value={plan.monthlyPrice} onChange={(e) => setPlansDraft((d) => ({ ...d, [id]: { ...d[id], monthlyPrice: Number(e.target.value) } }))} /></td>
                    <td><input type="number" className="input w-24" value={plan.yearlyPrice} onChange={(e) => setPlansDraft((d) => ({ ...d, [id]: { ...d[id], yearlyPrice: Number(e.target.value) } }))} /></td>
                    <td><input type="number" className="input w-20" value={plan.includedSeats} onChange={(e) => setPlansDraft((d) => ({ ...d, [id]: { ...d[id], includedSeats: Number(e.target.value) } }))} /></td>
                    <td><input type="number" className="input w-24" value={plan.leadsLimit} onChange={(e) => setPlansDraft((d) => ({ ...d, [id]: { ...d[id], leadsLimit: Number(e.target.value) } }))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving} className="btn btn-primary disabled:opacity-60">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? "Saving…" : "Save Settings"}
          </button>
          {msg && <span className={`text-sm ${msg.startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}>{msg}</span>}
        </div>
      </div>
    </PlatformShell>
  );
}
