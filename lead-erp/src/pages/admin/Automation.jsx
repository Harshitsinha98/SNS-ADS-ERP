import { useEffect, useMemo, useState } from "react";
import { BellRing, CheckCircle2, Clock3, RefreshCw, Send, ShieldCheck, TriangleAlert } from "lucide-react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { useData } from "../../context/DataContext";
import { runFollowUpAutomation, syncWhatsAppTemplates } from "../../utils/billingApi";

const DEFAULT_AUTOMATION = {
  enabled: true,
  reminderMinutesBefore: 30,
  overdueEscalationMinutes: 60,
};

function bounded(value, fallback, minimum = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(1440, Math.round(number))) : fallback;
}

export default function Automation() {
  const { user } = useAuth();
  const { settings, setSettings, followUpTasks, whatsappTemplates } = useData();
  const [automation, setAutomation] = useState(DEFAULT_AUTOMATION);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setAutomation({ ...DEFAULT_AUTOMATION, ...(settings.followUpAutomation || {}) });
  }, [settings.followUpAutomation]);

  const taskCounts = useMemo(() => {
    const now = new Date();
    const open = followUpTasks.filter((task) => task.status === "open");
    return {
      open: open.length,
      dueSoon: open.filter((task) => {
        const due = new Date(task.dueAt).getTime();
        return due > now.getTime() && due <= now.getTime() + bounded(automation.reminderMinutesBefore, 30, 5) * 60 * 1000;
      }).length,
      overdue: open.filter((task) => new Date(task.dueAt) < now).length,
    };
  }, [followUpTasks, automation.reminderMinutesBefore]);

  const availableTemplates = whatsappTemplates.filter((template) => template.available && template.status === "APPROVED" && template.supported);

  const saveAutomation = async () => {
    setSaving(true);
    setMessage("");
    try {
      const next = {
        enabled: Boolean(automation.enabled),
        reminderMinutesBefore: bounded(automation.reminderMinutesBefore, 30, 5),
        overdueEscalationMinutes: bounded(automation.overdueEscalationMinutes, 60),
      };
      await setSettings({ ...settings, followUpAutomation: next });
      setAutomation(next);
      if (next.enabled) {
        const result = await runFollowUpAutomation({ orgId: user.activeOrgId, reenrollPaused: true });
        setMessage(`Automation settings saved. ${result.reenrolled ? `${result.reenrolled} paused task(s) re-enrolled. ` : ""}${result.reenrollmentPending ? "More paused tasks will be re-enrolled when you run this check again." : "The worker checks follow-ups every five minutes."}`);
      } else {
        setMessage("Automation settings saved. Due tasks are paused safely until automation is enabled again.");
      }
    } catch (error) {
      setMessage(error.message || "Could not save automation settings.");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    setMessage("");
    try {
      const result = await runFollowUpAutomation({ orgId: user.activeOrgId, reenrollPaused: true });
      setMessage(`Automation checked ${result.scanned} task(s): ${result.reminders} reminder(s), ${result.escalations} escalation(s). ${result.backfilled ? `${result.backfilled} legacy task(s) enrolled. ` : ""}${result.reenrolled ? `${result.reenrolled} paused task(s) re-enrolled. ` : ""}${result.migrationPending ? "Legacy enrollment will continue safely in background runs. " : ""}${result.reenrollmentPending ? "Run this check again to enroll the next paused-task batch." : ""}`);
    } catch (error) {
      setMessage(error.message || "Could not run follow-up automation.");
    } finally {
      setRunning(false);
    }
  };

  const syncTemplates = async () => {
    setSyncing(true);
    setMessage("");
    try {
      const result = await syncWhatsAppTemplates({ orgId: user.activeOrgId });
      setMessage(`${result.available} approved, supported template(s) are ready to send.`);
    } catch (error) {
      setMessage(error.message || "Could not sync templates. Confirm WhatsApp Business is connected.");
    } finally {
      setSyncing(false);
    }
  };

  return <Layout title="Automation Center">
    <section className="mb-6 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-teal-50 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="eyebrow text-violet-700">Phase 4A automation</p><h1 className="mt-1 text-2xl font-bold text-ink">Keep sales moving, automatically</h1><p className="mt-2 max-w-2xl text-sm text-ink-soft">Codeskate CRM reminds the owner before a task is due and escalates overdue work to the assigned salesperson and administrators.</p></div>
        <div className="flex flex-wrap gap-2"><Metric icon={Clock3} label="Open tasks" value={taskCounts.open} /><Metric icon={BellRing} label="Due soon" value={taskCounts.dueSoon} /><Metric icon={TriangleAlert} label="Overdue" value={taskCounts.overdue} danger /></div>
      </div>
    </section>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <section className="card p-6"><div className="flex items-start gap-3"><div className="rounded-xl bg-violet-100 p-2 text-violet-700"><BellRing size={20} /></div><div><h2 className="font-semibold text-ink">Follow-up reminders & SLA escalation</h2><p className="mt-1 text-sm text-ink-soft">Notifications are server-created, deduplicated, and cannot be changed by employees.</p></div></div>
          <div className="mt-5 space-y-5"><label className="flex cursor-pointer items-center justify-between rounded-xl border border-paper-line p-4"><span><span className="block font-medium text-ink">Enable follow-up automation</span><span className="mt-1 block text-xs text-ink-muted">Run due reminders and overdue escalation for this workspace.</span></span><input type="checkbox" checked={automation.enabled} onChange={(event) => setAutomation((current) => ({ ...current, enabled: event.target.checked }))} className="h-5 w-5 accent-violet-600" /></label>
            <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-ink">Remind before due<input type="number" min="5" max="1440" value={automation.reminderMinutesBefore} onChange={(event) => setAutomation((current) => ({ ...current, reminderMinutesBefore: event.target.value }))} className="input mt-1" /><span className="mt-1 block text-xs font-normal text-ink-muted">5–1,440 minutes before a task is due.</span></label><label className="text-sm font-medium text-ink">Escalate overdue after<input type="number" min="0" max="1440" value={automation.overdueEscalationMinutes} onChange={(event) => setAutomation((current) => ({ ...current, overdueEscalationMinutes: event.target.value }))} className="input mt-1" /><span className="mt-1 block text-xs font-normal text-ink-muted">Minutes after the due time.</span></label></div>
            <div className="flex flex-wrap gap-2"><button onClick={saveAutomation} disabled={saving} className="btn btn-primary disabled:opacity-60">{saving ? "Saving…" : "Save automation settings"}</button><button onClick={runNow} disabled={running} className="btn btn-secondary disabled:opacity-60">{running ? <RefreshCw size={15} className="animate-spin" /> : <BellRing size={15} />}{running ? "Checking…" : "Run now"}</button></div>
          </div>
        </section>

        <section className="card p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-3"><div className="rounded-xl bg-teal-100 p-2 text-teal-700"><Send size={20} /></div><div><h2 className="font-semibold text-ink">Approved WhatsApp templates</h2><p className="mt-1 text-sm text-ink-soft">Create and get templates approved in Meta WhatsApp Manager, then sync them here. Approved templates can be sent even after the 24-hour reply window.</p></div></div><button onClick={syncTemplates} disabled={syncing} className="btn btn-secondary shrink-0 disabled:opacity-60">{syncing ? <RefreshCw size={15} className="animate-spin" /> : <RefreshCw size={15} />}{syncing ? "Syncing…" : "Sync templates"}</button></div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">{whatsappTemplates.map((template) => <article key={template.id} className={`rounded-xl border p-4 ${template.available ? "border-teal-200 bg-teal-50/40" : "border-paper-line bg-paper/40"}`}><div className="flex items-start justify-between gap-2"><div><p className="font-medium text-ink">{template.name}</p><p className="mt-1 text-xs text-ink-muted">{template.language} · {template.category || "Template"}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${template.available ? "bg-teal-100 text-teal-800" : "bg-paper text-ink-muted"}`}>{template.status || "Unknown"}</span></div><p className="mt-3 text-sm text-ink-soft">{template.preview}</p><p className="mt-3 text-xs text-ink-muted">{template.supported ? `${template.parameterCount || 0} value(s) required` : "Unsupported media/header/button variables"}</p></article>)}{!whatsappTemplates.length && <div className="rounded-xl border border-dashed border-paper-line p-6 text-sm text-ink-muted md:col-span-2">No templates have been synced yet. Connect WhatsApp Business, approve a template in Meta, then click <strong>Sync templates</strong>.</div>}</div>
        </section>
      </div>

      <aside className="space-y-6"><section className="card p-5"><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-success-700" /><h2 className="font-semibold text-ink">What is protected</h2></div><ul className="mt-4 space-y-3 text-sm text-ink-soft"><li>• The backend owns reminder and escalation events.</li><li>• Every task is reminded once per due time, even across server restarts.</li><li>• Overdue alerts reach the owner/admin and assigned salesperson.</li><li>• Only Meta-approved templates can be sent outside the 24-hour window.</li></ul></section><section className="rounded-xl border border-teal-200 bg-teal-50 p-5"><div className="flex items-center gap-2 text-teal-800"><CheckCircle2 size={18} /><h2 className="font-semibold">{availableTemplates.length} ready-to-send template(s)</h2></div><p className="mt-2 text-sm text-teal-800/80">Open any lead record to select an approved template and enter its values.</p></section></aside>
    </div>
    {message && <p className={`mt-5 rounded-xl border p-4 text-sm ${message.startsWith("Could not") ? "border-danger-200 bg-danger-50 text-danger-700" : "border-success-200 bg-success-50 text-success-700"}`}>{message}</p>}
  </Layout>;
}

function Metric({ icon: Icon, label, value, danger = false }) {
  return <div className={`rounded-xl border px-4 py-2 text-center ${danger ? "border-danger-200 bg-danger-50 text-danger-700" : "border-violet-200 bg-white text-violet-700"}`}><div className="flex items-center justify-center gap-1 text-xs"><Icon size={13} />{label}</div><p className="num text-lg font-bold">{value}</p></div>;
}
