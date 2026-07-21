import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Save, Rocket, History, FlaskConical, X } from "lucide-react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { useData } from "../../context/DataContext";
import {
  getWorkflow, saveWorkflowDraft, publishWorkflow, rollbackWorkflow,
  testRunWorkflow, updateWorkflowMeta,
} from "../../utils/workflowApi";
import {
  CONDITIONS, ACTIONS, operatorsForCondition, operatorNeedsValue,
  operatorTakesMultipleValues, actionFieldDefs, defaultParamsForAction,
} from "../../data/workflowVocabulary";

// ── Small building blocks ────────────────────────────────────────────

function ConditionRow({ condition, onChange, onRemove }) {
  const operators = operatorsForCondition(condition.type);
  const needsValue = operatorNeedsValue(condition.operator);
  const multi = operatorTakesMultipleValues(condition.operator);
  const conditionMeta = CONDITIONS.find((c) => c.value === condition.type);

  const valueAsText = Array.isArray(condition.value) ? condition.value.join(", ") : (condition.value || "");

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-cream-300 p-3 sm:flex-row sm:items-center">
      <select
        className="input sm:w-44"
        value={condition.type}
        onChange={(e) => {
          const nextType = e.target.value;
          const nextOperators = operatorsForCondition(nextType);
          onChange({ ...condition, type: nextType, operator: nextOperators[0]?.value || "equals", value: "" });
        }}
      >
        {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      <select
        className="input sm:w-48"
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value })}
      >
        {operators.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
      </select>
      {needsValue && (
        <input
          className="input flex-1"
          placeholder={multi ? `${conditionMeta?.placeholder || ""} (comma-separated)` : conditionMeta?.placeholder}
          value={valueAsText}
          onChange={(e) => {
            const raw = e.target.value;
            onChange({ ...condition, value: multi ? raw.split(",").map((v) => v.trim()).filter(Boolean) : raw });
          }}
        />
      )}
      <button onClick={onRemove} className="btn btn-ghost px-2 py-2 text-danger-600" title="Remove condition">
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function ActionField({ field, value, onChange, employees, whatsappTemplates, statuses }) {
  if (field.type === "select") {
    return (
      <select className="input" value={value ?? field.default ?? ""} onChange={(e) => onChange(e.target.value)}>
        {field.options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    );
  }
  if (field.type === "employee-select") {
    return (
      <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose an employee…</option>
        {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name || emp.phone}</option>)}
      </select>
    );
  }
  if (field.type === "whatsapp-template-select") {
    return (
      <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose a template…</option>
        {whatsappTemplates.filter((t) => t.available).map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    );
  }
  if (field.type === "status-select") {
    return (
      <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose a status…</option>
        {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    );
  }
  if (field.type === "tags") {
    const asText = Array.isArray(value) ? value.join(", ") : "";
    return (
      <input
        className="input"
        placeholder={field.placeholder}
        value={asText}
        onChange={(e) => onChange(e.target.value.split(",").map((v) => v.trim()).filter(Boolean))}
      />
    );
  }
  if (field.type === "textarea") {
    return (
      <textarea
        className="input min-h-[80px]"
        placeholder={field.placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (field.type === "number") {
    return (
      <input
        type="number"
        className="input"
        min={field.min}
        max={field.max}
        value={value ?? field.default ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    );
  }
  return (
    <input
      className="input"
      placeholder={field.placeholder}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function ActionCard({ action, onChange, onRemove, employees, whatsappTemplates, statuses }) {
  const meta = ACTIONS.find((a) => a.value === action.type);
  const fields = actionFieldDefs(action.type);

  const setParam = (name, value) => onChange({ ...action, params: { ...action.params, [name]: value } });

  return (
    <div className="rounded-xl border border-cream-300 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <select
            className="input"
            value={action.type}
            onChange={(e) => onChange({ type: e.target.value, params: defaultParamsForAction(e.target.value) })}
          >
            {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          {meta?.description && <p className="mt-1 text-xs text-ink-muted">{meta.description}</p>}
        </div>
        <button onClick={onRemove} className="btn btn-ghost px-2 py-2 text-danger-600" title="Remove action">
          <Trash2 size={15} />
        </button>
      </div>
      {fields.length > 0 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {fields
            .filter((field) => !field.showWhen || action.params?.[field.showWhen.field] === field.showWhen.equals)
            .map((field) => (
              <label key={field.name} className="text-sm font-medium text-ink">
                {field.label}
                <div className="mt-1">
                  <ActionField
                    field={field}
                    value={action.params?.[field.name]}
                    onChange={(value) => setParam(field.name, value)}
                    employees={employees}
                    whatsappTemplates={whatsappTemplates}
                    statuses={statuses}
                  />
                </div>
              </label>
            ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────

export default function WorkflowBuilder() {
  const { workflowId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { users, whatsappTemplates, settings } = useData();

  const employees = useMemo(() => users.filter((u) => u.role === "employee"), [users]);
  const statuses = settings?.statuses || [];

  const [head, setHead] = useState(null);
  const [versions, setVersions] = useState([]);
  const [conditionLogic, setConditionLogic] = useState("ALL");
  const [conditions, setConditions] = useState([]);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testEntityJson, setTestEntityJson] = useState('{\n  "status": "New",\n  "source": "Website"\n}');
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getWorkflow(user.activeOrgId, workflowId);
      setHead(result.workflow);
      setVersions(result.versions || []);
      const liveVersionNum = result.workflow.draftVersion || result.workflow.currentVersion;
      const liveVersion = result.versions.find((v) => v.version === liveVersionNum);
      const definition = liveVersion?.definition || { conditionLogic: "ALL", conditions: [], actions: [] };
      setConditionLogic(definition.conditionLogic || "ALL");
      setConditions(definition.conditions || []);
      setActions(definition.actions || []);
    } catch (e) {
      setError(e.message || "Could not load workflow");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [workflowId]);

  const addCondition = () => setConditions((prev) => [...prev, { type: "status", operator: "equals", value: "" }]);
  const addAction = () => setActions((prev) => [...prev, { type: "activity", params: defaultParamsForAction("activity") }]);

  const buildDefinition = () => ({ conditionLogic, conditions, actions });

  const handleSaveDraft = async () => {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await saveWorkflowDraft(workflowId, { orgId: user.activeOrgId, definition: buildDefinition() });
      setMessage("Draft saved.");
      await load();
    } catch (e) {
      setError(e.message || "Could not save draft");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setMessage("");
    setError("");
    try {
      await saveWorkflowDraft(workflowId, { orgId: user.activeOrgId, definition: buildDefinition() });
      const result = await publishWorkflow(workflowId, { orgId: user.activeOrgId });
      setMessage(`Published as v${result.version}. Workflow is now ${result.status}.`);
      await load();
    } catch (e) {
      setError(e.message || "Could not publish workflow");
    } finally {
      setPublishing(false);
    }
  };

  const handleRollback = async (toVersion) => {
    setError("");
    setMessage("");
    try {
      const result = await rollbackWorkflow(workflowId, { orgId: user.activeOrgId, toVersion });
      setMessage(`Rolled back to a copy of v${toVersion}, published as v${result.version}.`);
      setShowHistory(false);
      await load();
    } catch (e) {
      setError(e.message || "Could not roll back");
    }
  };

  const handleTestRun = async () => {
    setTesting(true);
    setTestResult(null);
    setError("");
    try {
      const sampleEntity = JSON.parse(testEntityJson);
      const result = await testRunWorkflow(workflowId, { orgId: user.activeOrgId, sampleEntity });
      setTestResult(result);
    } catch (e) {
      setError(e.message?.includes("JSON") ? "Sample entity must be valid JSON" : (e.message || "Test run failed"));
    } finally {
      setTesting(false);
    }
  };

  const renameWorkflow = async (name) => {
    try {
      await updateWorkflowMeta(workflowId, { orgId: user.activeOrgId, name });
      setHead((prev) => ({ ...prev, name }));
    } catch (e) {
      setError(e.message || "Could not rename workflow");
    }
  };

  if (loading) {
    return <Layout title="Workflow Builder"><div className="card p-10 text-center text-sm text-ink-muted">Loading…</div></Layout>;
  }
  if (!head) {
    return <Layout title="Workflow Builder"><div className="card p-10 text-center text-sm text-danger-600">{error || "Workflow not found"}</div></Layout>;
  }

  return (
    <Layout title="Workflow Builder">
      <button onClick={() => navigate("/admin/workflows")} className="btn btn-ghost mb-4 px-3 py-2 text-sm">
        <ArrowLeft size={15} /> Back to workflows
      </button>

      <section className="card mb-6 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            className="input text-lg font-semibold sm:max-w-md"
            value={head.name}
            onChange={(e) => setHead((prev) => ({ ...prev, name: e.target.value }))}
            onBlur={(e) => renameWorkflow(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <span className="badge badge-primary">{head.triggerType}</span>
            <span className={`badge ${head.status === "active" ? "badge-success" : head.status === "paused" ? "badge-warning" : "badge-primary"}`}>
              {head.status}
            </span>
            {head.currentVersion && <span>Live: v{head.currentVersion}</span>}
            {head.draftVersion && <span>Draft: v{head.draftVersion}</span>}
            <button onClick={() => setShowHistory(true)} className="btn btn-ghost px-2 py-1 text-xs">
              <History size={14} /> Version history
            </button>
          </div>
        </div>
      </section>

      {message && <p className="mb-5 rounded-xl border border-success-200 bg-success-50 p-4 text-sm text-success-700">{message}</p>}
      {error && <p className="mb-5 rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">{error}</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {/* Conditions */}
          <section className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink">Conditions</h2>
              <select className="input w-40" value={conditionLogic} onChange={(e) => setConditionLogic(e.target.value)}>
                <option value="ALL">Match ALL</option>
                <option value="ANY">Match ANY</option>
              </select>
            </div>
            <p className="mt-1 text-xs text-ink-muted">No conditions means this workflow matches every event of its trigger type.</p>
            <div className="mt-4 space-y-2">
              {conditions.map((condition, index) => (
                <ConditionRow
                  key={index}
                  condition={condition}
                  onChange={(next) => setConditions((prev) => prev.map((c, i) => (i === index ? next : c)))}
                  onRemove={() => setConditions((prev) => prev.filter((_, i) => i !== index))}
                />
              ))}
            </div>
            <button onClick={addCondition} className="btn btn-secondary mt-3">
              <Plus size={15} /> Add condition
            </button>
          </section>

          {/* Actions */}
          <section className="card p-5">
            <h2 className="font-semibold text-ink">Actions</h2>
            <p className="mt-1 text-xs text-ink-muted">Actions run in order. Use {"{{field}}"} in text fields to reference the triggering record.</p>
            <div className="mt-4 space-y-3">
              {actions.map((action, index) => (
                <ActionCard
                  key={index}
                  action={action}
                  onChange={(next) => setActions((prev) => prev.map((a, i) => (i === index ? next : a)))}
                  onRemove={() => setActions((prev) => prev.filter((_, i) => i !== index))}
                  employees={employees}
                  whatsappTemplates={whatsappTemplates}
                  statuses={statuses}
                />
              ))}
            </div>
            <button onClick={addAction} className="btn btn-secondary mt-3">
              <Plus size={15} /> Add action
            </button>
          </section>

          <div className="flex flex-wrap gap-2">
            <button onClick={handleSaveDraft} disabled={saving} className="btn btn-secondary disabled:opacity-60">
              <Save size={15} /> {saving ? "Saving…" : "Save draft"}
            </button>
            <button onClick={handlePublish} disabled={publishing || actions.length === 0} className="btn btn-primary disabled:opacity-60">
              <Rocket size={15} /> {publishing ? "Publishing…" : "Publish"}
            </button>
          </div>
        </div>

        {/* Test run sidebar */}
        <aside className="space-y-4">
          <section className="card p-5">
            <div className="flex items-center gap-2">
              <FlaskConical size={16} className="text-orange-600" />
              <h2 className="font-semibold text-ink">Test this workflow</h2>
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Runs your saved conditions against a sample record. No actions are executed.
            </p>
            <textarea
              className="input mt-3 min-h-[140px] font-mono text-xs"
              value={testEntityJson}
              onChange={(e) => setTestEntityJson(e.target.value)}
            />
            <button onClick={handleTestRun} disabled={testing} className="btn btn-secondary mt-3 w-full disabled:opacity-60">
              {testing ? "Testing…" : "Run test"}
            </button>
            {testResult && (
              <div className={`mt-3 rounded-xl border p-3 text-sm ${testResult.matched ? "border-success-200 bg-success-50 text-success-700" : "border-cream-300 bg-cream-50 text-ink-soft"}`}>
                <p className="font-semibold">{testResult.matched ? "Matched ✓" : "Did not match"}</p>
                <ul className="mt-2 space-y-1 text-xs">
                  {testResult.results.map((r, i) => (
                    <li key={i} className={r.passed ? "text-success-700" : "text-danger-600"}>
                      {r.passed ? "✓" : "✗"} {r.condition.type} {r.condition.operator} {JSON.stringify(r.condition.value)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </aside>
      </div>

      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setShowHistory(false)}>
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-ink">Version history</h3>
              <button onClick={() => setShowHistory(false)}><X size={18} /></button>
            </div>
            <div className="space-y-2">
              {versions.length === 0 && <p className="text-sm text-ink-muted">No versions yet.</p>}
              {versions.map((v) => (
                <div key={v.version} className="flex items-center justify-between rounded-xl border border-cream-300 p-3">
                  <div>
                    <p className="text-sm font-medium text-ink">v{v.version} · {v.status}</p>
                    <p className="text-xs text-ink-muted">
                      {v.publishedAt ? `Published ${new Date(v.publishedAt).toLocaleString("en-IN")}` : `Created ${new Date(v.createdAt).toLocaleString("en-IN")}`}
                    </p>
                    {v.changeNote && <p className="text-xs text-ink-muted">{v.changeNote}</p>}
                  </div>
                  {v.status === "published" || v.status === "superseded" ? (
                    <button onClick={() => handleRollback(v.version)} className="btn btn-secondary px-3 py-1.5 text-xs">
                      Roll back to this
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
