/**
 * Module 10: Feature Flags.
 * Toggle features globally or per-scope without deploying.
 */
import { useState, useEffect } from "react";
import PlatformShell from "./components/PlatformShell";
import SectionCard from "./components/SectionCard";
import StatusBadge from "./components/StatusBadge";
import { listFeatureFlags, toggleFeatureFlag, createFeatureFlag } from "../../utils/platformApi";
import { ToggleLeft, Plus, Loader2 } from "lucide-react";

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = () => { setLoading(true); listFeatureFlags().then((r) => setFlags(r.flags || [])).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  const handleToggle = async (flag) => {
    setBusy(flag.id);
    try { await toggleFeatureFlag(flag.id, !flag.enabled); load(); } catch {} finally { setBusy(null); }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try { await createFeatureFlag({ name: newName.trim(), description: newDesc.trim() }); setNewName(""); setNewDesc(""); load(); }
    catch {} finally { setCreating(false); }
  };

  return (
    <PlatformShell title="Feature Flags">
      <div className="space-y-6">
        <SectionCard title="Create Flag" actions={<button onClick={handleCreate} disabled={creating || !newName.trim()} className="btn btn-primary text-xs disabled:opacity-50"><Plus size={14} /> Create</button>}>
          <div className="flex flex-col sm:flex-row gap-3">
            <input className="input flex-1" placeholder="Flag name (e.g. enable_ai_scoring)" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <input className="input flex-1" placeholder="Description (optional)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
          </div>
        </SectionCard>

        <SectionCard title="All Flags">
          {loading ? <div className="text-center py-8"><Loader2 className="animate-spin mx-auto text-orange-500" size={24} /></div> :
           flags.length === 0 ? <p className="text-sm text-ink-muted text-center py-8">No feature flags defined</p> : (
            <div className="space-y-2">
              {flags.map((flag) => (
                <div key={flag.id} className="flex items-center justify-between p-3 rounded-xl border border-cream-200 hover:bg-cream-50">
                  <div>
                    <p className="text-sm font-medium text-ink font-mono">{flag.name}</p>
                    {flag.description && <p className="text-[11px] text-ink-muted">{flag.description}</p>}
                    <p className="text-[10px] text-ink-muted mt-0.5">Scope: {flag.scope || "global"}</p>
                  </div>
                  <button
                    onClick={() => handleToggle(flag)}
                    disabled={busy === flag.id}
                    className={`relative w-11 h-6 rounded-full transition-colors ${flag.enabled ? "bg-emerald-500" : "bg-gray-300"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${flag.enabled ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </PlatformShell>
  );
}
