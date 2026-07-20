import { useEffect, useMemo, useState } from "react";
import { CalendarClock, LoaderCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import { fmtDate } from "../utils/helpers";

const TASK_TYPES = ["Call", "WhatsApp", "Meeting", "Email", "Other"];

const toDatetimeLocal = (iso) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function FollowUpTaskControls({ lead, compact = false }) {
  const { user } = useAuth();
  const { users, followUpTasks, scheduleFollowUp } = useData();
  const isAdmin = user?.activeOrgRole === "admin" || user?.activeOrgRole === "owner";
  const teamMembers = users.filter((member) => member.active !== false && !member.pending);
  const task = useMemo(
    () => followUpTasks.find((item) => item.leadId === lead.id && item.status === "open"),
    [followUpTasks, lead.id]
  );
  const [dueAt, setDueAt] = useState("");
  const [type, setType] = useState("Call");
  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDueAt(toDatetimeLocal(task?.dueAt || lead.followUp));
    setType(task?.type || "Call");
    setTitle(task?.title && task.title !== `${task.type} follow-up` ? task.title : "");
    setAssignedTo(task?.assignedTo || lead.assignedTo || "");
  }, [task?.dueAt, task?.type, task?.title, task?.assignedTo, lead.followUp, lead.assignedTo]);

  const closed = ["Closed-Won", "Lost"].includes(lead.status) || lead.blacklisted;
  const minimumDueAt = toDatetimeLocal(new Date(Date.now() + 60 * 1000).toISOString());
  const messageIsError = Boolean(message) && !["Follow-up scheduled.", "Follow-up updated."].includes(message);

  const submit = async (event) => {
    event.preventDefault();
    if (!dueAt) {
      setMessage("Choose a follow-up date and time.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const result = await scheduleFollowUp({
        leadId: lead.id,
        dueAt: new Date(dueAt).toISOString(),
        type,
        title,
        assignedTo: isAdmin ? assignedTo : "",
      });
      setMessage(result?.task?.createdAt === result?.task?.updatedAt ? "Follow-up scheduled." : "Follow-up updated.");
    } catch (error) {
      setMessage(error.message || "Could not schedule follow-up.");
    } finally {
      setSaving(false);
    }
  };

  if (closed) return null;

  return (
    <form onSubmit={submit} className={`rounded-lg border border-orange-200 bg-orange-50/60 ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-center gap-2"><CalendarClock size={15} className="text-orange-600" /><p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Follow-up task</p></div>
      {task && <p className="mt-1 text-xs text-orange-800">Open: <strong>{task.type}</strong> due {fmtDate(task.dueAt)}{task.assignedToName ? ` · ${task.assignedToName}` : ""}</p>}
      <div className={`mt-3 grid gap-2 ${compact ? "" : "sm:grid-cols-2"}`}>
        <label className="text-xs font-medium text-ink-soft">Type
          <select value={type} onChange={(event) => setType(event.target.value)} className="input mt-1 py-2 text-sm">
            {TASK_TYPES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-ink-soft">Due date and time
          <input required type="datetime-local" min={minimumDueAt} value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="input mt-1 py-2 text-sm" />
        </label>
        {isAdmin && <label className="text-xs font-medium text-ink-soft">Assign to
          <select required value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} className="input mt-1 py-2 text-sm">
            <option value="">Select team member</option>
            {teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name || member.phone || member.id}</option>)}
          </select>
        </label>}
        <label className={`text-xs font-medium text-ink-soft ${isAdmin ? "" : "sm:col-span-2"}`}>Task note (optional)
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength="180" className="input mt-1 py-2 text-sm" placeholder="e.g. Discuss proposal" />
        </label>
      </div>
      {message && <p className={`mt-2 text-xs ${messageIsError ? "text-danger-700" : "text-success-700"}`}>{message}</p>}
      <button disabled={saving} className="btn btn-primary mt-3 w-full py-2.5 disabled:cursor-not-allowed disabled:opacity-60">
        {saving && <LoaderCircle size={15} className="animate-spin" />}{saving ? "Saving…" : task ? "Update follow-up" : "Schedule follow-up"}
      </button>
    </form>
  );
}
