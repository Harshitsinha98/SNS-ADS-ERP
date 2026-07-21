import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Workflow as WorkflowIcon, Plus, Zap, Pause, Archive, PlayCircle, RefreshCw } from "lucide-react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { listWorkflows, createWorkflow, setWorkflowStatus } from "../../utils/workflowApi";
import { TRIGGERS } from "../../data/workflowVocabulary";

const STATUS_BADGE = {
  active: "badge-success",
  paused: "badge-warning",
  draft: "badge-primary",
  archived: "badge-danger",
};

function triggerLabel(value) {
  return TRIGGERS.find((t) => t.value === value)?.label || value;
}

export default function Workflows() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTrigger, setNewTrigger] = useState(TRIGGERS[0].value);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listWorkflows(user.activeOrgId);
      setWorkflows(result.workflows || []);
    } catch (e) {
      setError(e.message || "Could not load workflows");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user.activeOrgId]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const trigger of TRIGGERS) map.set(trigger.value, []);
    for (const wf of workflows) {
      if (!map.has(wf.triggerType)) map.set(wf.triggerType, []);
      map.get(wf.triggerType).push(wf);
    }
    return map;
  }, [workflows]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const result = await createWorkflow({ orgId: user.activeOrgId, name: newName.trim(), triggerType: newTrigger });
      setNewName("");
      navigate(`/admin/workflows/${result.workflow.id}`);
    } catch (e) {
      setError(e.message || "Could not create workflow");
    } finally {
      setCreating(false);
    }
  };

  const toggleStatus = async (workflow) => {
    const nextStatus = workflow.status === "active" ? "paused" : "active";
    setBusyId(workflow.id);
    setError("");
    try {
      await setWorkflowStatus(workflow.id, { orgId: user.activeOrgId, status: nextStatus });
      await load();
    } catch (e) {
      setError(e.message || "Could not change workflow status");
    } finally {
      setBusyId(null);
    }
  };

  const archiveWorkflow = async (workflow) => {
    setBusyId(workflow.id);
    setError("");
    try {
      await setWorkflowStatus(workflow.id, { orgId: user.activeOrgId, status: "archived" });
      await load();
    } catch (e) {
      setError(e.message || "Could not archive workflow");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Layout title="Workflow Automation">
      <section className="mb-6 rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 via-white to-cream-100 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="eyebrow">Database-driven automation</p>
            <h1 className="mt-1 text-2xl font-bold text-ink">Build rules without writing code</h1>
            <p className="mt-2 max-w-2xl text-sm text-ink-soft">
              Define triggers, conditions, and actions. Every workflow is versioned — publishing
              creates an immutable snapshot you can roll back to at any time.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={load} className="btn btn-secondary" disabled={loading}>
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        </div>
      </section>

      <section className="card mb-6 p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-orange-100 p-2 text-orange-700"><Plus size={18} /></div>
          <h2 className="font-semibold text-ink">Create a new workflow</h2>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm font-medium text-ink">
            Name
            <input
              className="input mt-1"
              placeholder="e.g. Auto-assign hot Website leads"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-ink sm:w-64">
            Trigger
            <select className="input mt-1" value={newTrigger} onChange={(e) => setNewTrigger(e.target.value)}>
              {TRIGGERS.map((trigger) => (
                <option key={trigger.value} value={trigger.value}>{trigger.label}</option>
              ))}
            </select>
          </label>
          <button onClick={handleCreate} disabled={creating || !newName.trim()} className="btn btn-primary disabled:opacity-60">
            {creating ? "Creating…" : "Create workflow"}
          </button>
        </div>
      </section>

      {error && (
        <p className="mb-5 rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">{error}</p>
      )}

      {loading ? (
        <div className="card p-10 text-center text-sm text-ink-muted">Loading workflows…</div>
      ) : workflows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-ink-muted">
          <WorkflowIcon size={28} className="mx-auto mb-3 text-orange-300" />
          No workflows yet. Create one above to get started.
        </div>
      ) : (
        <div className="space-y-6">
          {[...grouped.entries()].filter(([, list]) => list.length > 0).map(([triggerType, list]) => (
            <section key={triggerType} className="card p-5">
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-ink">
                <Zap size={16} className="text-orange-500" /> {triggerLabel(triggerType)}
              </h3>
              <div className="space-y-2">
                {list.map((wf) => (
                  <div
                    key={wf.id}
                    className="flex flex-col gap-2 rounded-xl border border-cream-300 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <button
                      className="text-left"
                      onClick={() => navigate(`/admin/workflows/${wf.id}`)}
                    >
                      <p className="font-medium text-ink hover:text-orange-600">{wf.name}</p>
                      <p className="mt-1 text-xs text-ink-muted">
                        Priority {wf.priority}
                        {wf.stopOnMatch ? " · Stops lower-priority workflows on match" : ""}
                        {wf.lastRunAt ? ` · Last run ${new Date(wf.lastRunAt).toLocaleString("en-IN")} (${wf.lastRunStatus})` : " · Never run"}
                        {` · ${wf.runCount || 0} run(s)`}
                      </p>
                    </button>
                    <div className="flex items-center gap-2">
                      <span className={`badge ${STATUS_BADGE[wf.status] || "badge-primary"}`}>{wf.status}</span>
                      {wf.status !== "archived" && wf.currentVersion && (
                        <button
                          onClick={() => toggleStatus(wf)}
                          disabled={busyId === wf.id}
                          className="btn btn-ghost px-3 py-2 text-xs"
                          title={wf.status === "active" ? "Pause" : "Activate"}
                        >
                          {wf.status === "active" ? <Pause size={14} /> : <PlayCircle size={14} />}
                          {wf.status === "active" ? "Pause" : "Activate"}
                        </button>
                      )}
                      {wf.status !== "archived" && (
                        <button
                          onClick={() => archiveWorkflow(wf)}
                          disabled={busyId === wf.id}
                          className="btn btn-ghost px-3 py-2 text-xs text-danger-600"
                        >
                          <Archive size={14} /> Archive
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Layout>
  );
}
