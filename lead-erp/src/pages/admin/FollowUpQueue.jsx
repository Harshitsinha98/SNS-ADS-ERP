import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, Clock3, UsersRound } from "lucide-react";
import Layout from "../../components/Layout";
import { useData } from "../../context/DataContext";
import { daysSince, fmtDate } from "../../utils/helpers";
import { CompleteTaskModal } from "../employee/Tasks";

const TABS = ["Overdue", "Today", "Upcoming", "Completed"];

function tomorrowStart() {
  const date = new Date();
  date.setHours(24, 0, 0, 0);
  return date;
}

export default function FollowUpQueue() {
  const { followUpTasks, leads, settings, completeFollowUp } = useData();
  const [tab, setTab] = useState("Overdue");
  const [taskToComplete, setTaskToComplete] = useState(null);

  const grouped = useMemo(() => {
    const now = new Date();
    const tomorrow = tomorrowStart();
    const open = followUpTasks.filter((task) => task.status === "open");
    return {
      Overdue: open.filter((task) => new Date(task.dueAt) < now).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt)),
      Today: open.filter((task) => { const due = new Date(task.dueAt); return due >= now && due < tomorrow; }).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt)),
      Upcoming: open.filter((task) => new Date(task.dueAt) >= tomorrow).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt)),
      Completed: followUpTasks.filter((task) => task.status === "completed").sort((a, b) => new Date(b.completedAt || b.updatedAt) - new Date(a.completedAt || a.updatedAt)),
    };
  }, [followUpTasks]);

  const untouchedLeads = leads.filter((lead) => !lead.blacklisted && !["Closed-Won", "Lost"].includes(lead.status) && daysSince(lead.lastUpdated) >= 3);
  const employeeBreakdown = useMemo(() => {
    const count = new Map();
    grouped.Overdue.forEach((task) => {
      const current = count.get(task.assignedTo) || { name: task.assignedToName || "Unassigned", overdue: 0, today: 0 };
      current.overdue += 1;
      count.set(task.assignedTo, current);
    });
    grouped.Today.forEach((task) => {
      const current = count.get(task.assignedTo) || { name: task.assignedToName || "Unassigned", overdue: 0, today: 0 };
      current.today += 1;
      count.set(task.assignedTo, current);
    });
    return [...count.values()].sort((a, b) => b.overdue - a.overdue || b.today - a.today);
  }, [grouped.Overdue, grouped.Today]);

  return <Layout title="Follow-up Control Center">
    <section className="mb-6 rounded-2xl border border-danger-200 bg-gradient-to-r from-danger-50 via-orange-50 to-cream-50 p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="eyebrow text-danger-600">Sales SLA control</p><h1 className="mt-1 text-2xl font-bold text-ink">No lead should wait unnoticed</h1><p className="mt-2 text-sm text-ink-soft">Monitor overdue follow-ups, team workload, and leads untouched for three or more days.</p></div><div className="flex flex-wrap gap-2"><Metric icon={AlertTriangle} label="Overdue" value={grouped.Overdue.length} danger /><Metric icon={Clock3} label="Due today" value={grouped.Today.length} /><Metric icon={UsersRound} label="Untouched 3+ days" value={untouchedLeads.length} danger /></div></div></section>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section><div className="mb-4 flex gap-2 overflow-x-auto pb-1">{TABS.map((item) => <button key={item} onClick={() => setTab(item)} className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-medium ${tab === item ? "border-ink bg-ink text-white" : "border-paper-line bg-white text-ink-soft hover:bg-paper"}`}>{item} <span className="num">({grouped[item].length})</span></button>)}</div><div className="overflow-x-auto rounded-xl border border-paper-line bg-white shadow-card"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-paper-line bg-paper/60 text-left text-xs uppercase tracking-wide text-ink-muted"><th className="p-3 font-medium">Lead</th><th className="font-medium">Assigned</th><th className="font-medium">Task</th><th className="font-medium">Due / completed</th><th className="font-medium">Action</th></tr></thead><tbody>{grouped[tab].map((task) => <tr key={task.id} className={`border-b border-paper-line last:border-0 ${tab === "Overdue" ? "bg-danger-50/40" : "hover:bg-paper/40"}`}><td className="p-3"><Link to={`/admin/leads/${task.leadId}`} className="font-medium hover:underline">{task.leadName || "Lead"}</Link><p className="num text-xs text-ink-muted">{task.leadPhone || "—"}</p></td><td>{task.assignedToName || "—"}</td><td><strong>{task.type}</strong><p className="max-w-56 truncate text-xs text-ink-muted">{task.title}</p></td><td className={`num text-xs ${tab === "Overdue" ? "font-semibold text-danger-700" : "text-ink-soft"}`}>{fmtDate(tab === "Completed" ? task.completedAt : task.dueAt)}{tab === "Completed" && task.outcome ? ` · ${task.outcome}` : ""}</td><td>{tab === "Completed" ? <Link to={`/admin/leads/${task.leadId}`} className="text-xs font-medium text-info hover:underline">View lead →</Link> : <button onClick={() => setTaskToComplete(task)} className="rounded-md bg-success-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-success-700">Complete</button>}</td></tr>)}{!grouped[tab].length && <tr><td colSpan="5" className="p-10 text-center text-ink-muted">No {tab.toLowerCase()} follow-ups.</td></tr>}</tbody></table></div></section>
      <aside className="space-y-6"><section className="card p-5"><div className="flex items-center gap-2"><CalendarClock size={18} className="text-orange-600" /><h2 className="font-semibold text-ink">Team workload</h2></div><div className="mt-4 space-y-3">{employeeBreakdown.map((employee) => <div key={employee.name} className="rounded-lg bg-cream-50 p-3"><p className="text-sm font-medium text-ink">{employee.name}</p><p className="mt-1 text-xs text-ink-soft"><span className="font-semibold text-danger-700">{employee.overdue} overdue</span> · {employee.today} due today</p></div>)}{!employeeBreakdown.length && <p className="text-sm text-ink-muted">No open follow-ups yet.</p>}</div></section><section className="card p-5"><div className="flex items-center gap-2"><AlertTriangle size={18} className="text-danger-600" /><h2 className="font-semibold text-ink">Untouched leads</h2></div><p className="mt-1 text-xs text-ink-muted">No CRM update for 3+ days.</p><div className="mt-4 space-y-2">{untouchedLeads.slice(0, 6).map((lead) => <Link key={lead.id} to={`/admin/leads/${lead.id}`} className="block rounded-lg border border-danger-100 bg-danger-50/50 p-3 hover:bg-danger-50"><p className="text-sm font-medium text-ink">{lead.name}</p><p className="text-xs text-danger-700">{daysSince(lead.lastUpdated)}d idle · {lead.assignedToName || "Unassigned"}</p></Link>)}{!untouchedLeads.length && <p className="text-sm text-success-700">No untouched leads.</p>}</div></section></aside>
    </div>
    {taskToComplete && <CompleteTaskModal task={taskToComplete} statuses={settings.statuses || []} onClose={() => setTaskToComplete(null)} onComplete={completeFollowUp} />}
  </Layout>;
}

function Metric({ icon: Icon, label, value, danger = false }) {
  return <div className={`rounded-xl border px-4 py-2 text-center ${danger ? "border-danger-200 bg-danger-50 text-danger-700" : "border-orange-200 bg-white text-orange-700"}`}><div className="flex items-center justify-center gap-1 text-xs"><Icon size={13} />{label}</div><p className="num text-lg font-bold">{value}</p></div>;
}
