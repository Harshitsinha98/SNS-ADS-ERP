import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock3, LoaderCircle, TriangleAlert } from "lucide-react";
import Layout from "../../components/Layout";
import { useData } from "../../context/DataContext";
import { fmtDate } from "../../utils/helpers";

const OUTCOMES = ["Connected", "No answer", "Follow-up required", "Meeting fixed", "Closed-won", "Lost"];
const TABS = ["Today", "Overdue", "Upcoming", "Completed"];

const toDatetimeLocal = (iso) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

function startOfTomorrow() {
  const date = new Date();
  date.setHours(24, 0, 0, 0);
  return date;
}

export default function Tasks() {
  const { followUpTasks, settings, completeFollowUp } = useData();
  const [tab, setTab] = useState("Today");
  const [taskToComplete, setTaskToComplete] = useState(null);

  const grouped = useMemo(() => {
    const now = new Date();
    const tomorrow = startOfTomorrow();
    const open = followUpTasks.filter((task) => task.status === "open");
    const completed = followUpTasks.filter((task) => task.status === "completed");
    return {
      Today: open.filter((task) => {
        const due = new Date(task.dueAt);
        return due >= now && due < tomorrow;
      }).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt)),
      Overdue: open.filter((task) => new Date(task.dueAt) < now).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt)),
      Upcoming: open.filter((task) => new Date(task.dueAt) >= tomorrow).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt)),
      Completed: completed.sort((a, b) => new Date(b.completedAt || b.updatedAt) - new Date(a.completedAt || a.updatedAt)),
    };
  }, [followUpTasks]);

  return (
    <Layout title="My Follow-ups">
      <section className="mb-6 rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 to-cream-50 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="eyebrow">Daily sales desk</p><h1 className="mt-1 text-xl font-bold text-ink">Finish every follow-up on time</h1><p className="mt-1 text-sm text-ink-soft">Complete a task with an outcome, note, and optional next follow-up.</p></div>
          <div className="flex gap-2"><Metric icon={TriangleAlert} label="Overdue" value={grouped.Overdue.length} danger /><Metric icon={Clock3} label="Today" value={grouped.Today.length} /></div>
        </div>
      </section>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((item) => <button key={item} onClick={() => setTab(item)} className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-medium ${tab === item ? "border-ink bg-ink text-white" : "border-paper-line bg-white text-ink-soft hover:bg-paper"}`}>{item} <span className="num">({grouped[item].length})</span></button>)}
      </div>

      <section className="overflow-x-auto rounded-xl border border-paper-line bg-white shadow-card">
        <table className="w-full min-w-[780px] text-sm">
          <thead><tr className="border-b border-paper-line bg-paper/60 text-left text-xs uppercase tracking-wide text-ink-muted"><th className="p-3 font-medium">Lead</th><th className="font-medium">Task</th><th className="font-medium">Due</th><th className="font-medium">Priority</th><th className="font-medium">Status</th><th className="font-medium">Action</th></tr></thead>
          <tbody>
            {grouped[tab].map((task) => <TaskRow key={task.id} task={task} onComplete={() => setTaskToComplete(task)} />)}
            {!grouped[tab].length && <tr><td colSpan="6" className="p-10 text-center text-ink-muted">{tab === "Overdue" ? "No overdue follow-ups. Great work." : `No ${tab.toLowerCase()} follow-ups.`}</td></tr>}
          </tbody>
        </table>
      </section>

      {taskToComplete && <CompleteTaskModal task={taskToComplete} statuses={settings.statuses || []} onClose={() => setTaskToComplete(null)} onComplete={completeFollowUp} />}
    </Layout>
  );
}

function Metric({ icon: Icon, label, value, danger = false }) {
  return <div className={`rounded-xl border px-4 py-2 text-center ${danger ? "border-danger-200 bg-danger-50 text-danger-700" : "border-orange-200 bg-white text-orange-700"}`}><div className="flex items-center justify-center gap-1 text-xs"><Icon size={13} />{label}</div><p className="num text-lg font-bold">{value}</p></div>;
}

function TaskRow({ task, onComplete }) {
  const overdue = task.status === "open" && new Date(task.dueAt) < new Date();
  const completed = task.status === "completed";
  return <tr className={`border-b border-paper-line last:border-0 ${overdue ? "bg-danger-50/40" : "hover:bg-paper/40"}`}>
    <td className="p-3"><Link to={`/app/lead/${task.leadId}`} className="font-medium text-ink hover:underline">{task.leadName || "Lead"}</Link><p className="mt-0.5 text-xs text-ink-muted num">{task.leadPhone || "—"}</p></td>
    <td><p className="font-medium text-ink">{task.type}</p><p className="max-w-56 truncate text-xs text-ink-muted">{task.title}</p></td>
    <td className={`num text-xs ${overdue ? "font-semibold text-danger-700" : "text-ink-soft"}`}>{fmtDate(completed ? task.completedAt : task.dueAt)}{overdue && <span className="ml-1">overdue</span>}</td>
    <td><span className={`rounded-full px-2 py-1 text-xs font-medium ${task.priority === "Hot" ? "bg-danger-50 text-danger-700" : task.priority === "Cold" ? "bg-blue-50 text-blue-700" : "bg-warning-50 text-warning-700"}`}>{task.priority || "Warm"}</span></td>
    <td>{completed ? <span className="inline-flex items-center gap-1 text-xs font-medium text-success-700"><CheckCircle2 size={14} />{task.outcome || "Completed"}</span> : <span className="text-xs font-medium text-orange-700">Open</span>}</td>
    <td>{completed ? <Link to={`/app/lead/${task.leadId}`} className="text-xs font-medium text-info hover:underline">View lead →</Link> : <button onClick={onComplete} className="rounded-md bg-success-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-success-700">Complete</button>}</td>
  </tr>;
}

export function CompleteTaskModal({ task, statuses, onClose, onComplete }) {
  const [outcome, setOutcome] = useState("Connected");
  const [note, setNote] = useState("");
  const [leadStatus, setLeadStatus] = useState("");
  const [nextDueAt, setNextDueAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const terminalStatus = outcome === "Closed-won" ? "Closed-Won" : outcome === "Lost" ? "Lost" : "";

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onComplete(task.id, {
        outcome,
        note,
        leadStatus: terminalStatus || leadStatus,
        nextDueAt: terminalStatus || !nextDueAt ? null : new Date(nextDueAt).toISOString(),
        expectedRevision: Number(task.revision || 1),
      });
      onClose();
    } catch (requestError) {
      setError(requestError.message || "Could not complete follow-up.");
    } finally {
      setSaving(false);
    }
  };

  const minNextDueAt = toDatetimeLocal(new Date(Date.now() + 60 * 1000).toISOString());

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"><form onSubmit={submit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"><div className="mb-4"><p className="eyebrow">Complete follow-up</p><h2 className="mt-1 text-lg font-bold text-ink">{task.leadName || "Lead"} · {task.type}</h2><p className="mt-1 text-sm text-ink-soft">Add the outcome. Set another task only if this lead needs another action.</p></div><div className="space-y-3"><label className="block text-sm font-medium text-ink">Outcome<select value={outcome} onChange={(event) => setOutcome(event.target.value)} className="input mt-1">{OUTCOMES.map((item) => <option key={item}>{item}</option>)}</select></label><label className="block text-sm font-medium text-ink">Lead status (optional)<select value={terminalStatus || leadStatus} disabled={Boolean(terminalStatus)} onChange={(event) => setLeadStatus(event.target.value)} className="input mt-1 disabled:cursor-not-allowed disabled:opacity-60">{terminalStatus ? <option value={terminalStatus}>{terminalStatus}</option> : <><option value="">Keep current status</option>{statuses.filter((status) => !["Closed-Won", "Lost"].includes(status)).map((status) => <option key={status}>{status}</option>)}</>}</select></label><label className="block text-sm font-medium text-ink">Conversation note (optional)<textarea value={note} onChange={(event) => setNote(event.target.value)} className="input mt-1 min-h-24 resize-y" placeholder="What happened on this follow-up?" /></label>{!terminalStatus && <label className="block text-sm font-medium text-ink">Next follow-up (optional)<input type="datetime-local" value={nextDueAt} onChange={(event) => setNextDueAt(event.target.value)} min={minNextDueAt} className="input mt-1" /></label>}{error && <p className="rounded-lg bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}</div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button><button disabled={saving} className="btn btn-primary disabled:opacity-60">{saving && <LoaderCircle size={15} className="animate-spin" />}{saving ? "Saving…" : "Complete follow-up"}</button></div></form></div>;
}
