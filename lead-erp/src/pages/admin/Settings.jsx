import { useState } from "react";
import Layout from "../../components/Layout";
import { useData } from "../../context/DataContext";

export default function Settings() {
  const { settings, setSettings } = useData();
  const [newStatus, setNewStatus] = useState("");

  const addStatus = () => {
    if (newStatus && !settings.statuses.includes(newStatus)) {
      setSettings({ ...settings, statuses: [...settings.statuses, newStatus] });
      setNewStatus("");
    }
  };
  const removeStatus = (s) => setSettings({ ...settings, statuses: settings.statuses.filter((x) => x !== s) });

  return (
    <Layout title="System Settings & Workflow Automation">
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-card border border-paper-line p-5">
          <p className="eyebrow mb-3">Custom status configuration</p>
          <div className="flex gap-2 mb-3">
            <input className="border border-paper-line rounded-md p-2 text-sm flex-1" placeholder="Add stage e.g. Demo Done"
              value={newStatus} onChange={(e) => setNewStatus(e.target.value)} />
            <button onClick={addStatus} className="bg-ink text-white px-3 rounded-md text-sm">Add</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {settings.statuses.map((s) => (
              <span key={s} className="bg-paper border border-paper-line px-3 py-1 rounded text-sm flex items-center gap-2">
                {s} <button onClick={() => removeStatus(s)} className="text-danger">×</button>
              </span>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-card border border-paper-line p-5">
          <p className="eyebrow mb-3">Auto-assign logic</p>
          <p className="text-sm text-ink/50 mb-3">How should incoming leads (manual import + WhatsApp) be distributed?</p>
          {["round-robin", "workload"].map((mode) => (
            <label key={mode} className="flex items-center gap-2 mb-2 text-sm capitalize">
              <input type="radio" name="assign" checked={settings.autoAssign === mode}
                onChange={() => setSettings({ ...settings, autoAssign: mode })} />
              {mode === "round-robin" ? "Round-robin" : "Workload-balance"}
            </label>
          ))}
        </div>
      </div>
    </Layout>
  );
}