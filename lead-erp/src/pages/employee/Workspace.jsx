import { useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import StatCard from "../../components/StatCard";
import ConvBar from "../../components/charts/BarChart";
import { useData } from "../../context/DataContext";
import { useAuth } from "../../context/AuthContext";
import { StatusLamp, PriorityBadge } from "../../components/StatusLamp";
import { daysSince, last7DaysTrend, employeeRank, toWaNumber, sourceStats } from "../../utils/helpers";
import { Target, Flame, Clock, Trophy, Phone, MessageCircle, ListChecks, ChevronRight, AlertTriangle } from "lucide-react";

export default function Workspace() {
  const { user } = useAuth();
  const { leads, users, settings, notifications, markRead, updateLeadStatus, addNote, goals, setMyGoal, followUpTasks } = useData();

  const [goalInput, setGoalInput] = useState("");
  const [editingGoal, setEditingGoal] = useState(false);
  const employeeName = user?.displayName || user?.name || "there";

  const myLeads = leads.filter((l) => l.assignedTo === user.id && !l.blacklisted);
  const isClosed = (l) => ["Closed-Won", "Lost"].includes(l.status);
  const now = new Date();
  const tomorrow = new Date();
  tomorrow.setHours(24, 0, 0, 0);
  const leadsById = new Map(myLeads.map((lead) => [lead.id, lead]));
  const myOpenTasks = followUpTasks.filter((task) => task.status === "open");
  const taskLead = (task) => {
    const lead = leadsById.get(task.leadId);
    return lead ? { ...lead, taskDueAt: task.dueAt, taskType: task.type } : null;
  };

  const newToCall = myLeads.filter((l) => l.status === "New");
  const followToday = myOpenTasks.filter((task) => {
    const due = new Date(task.dueAt);
    return due >= now && due < tomorrow;
  }).map(taskLead).filter(Boolean);
  const overdue = myOpenTasks.filter((task) => new Date(task.dueAt) < now).map(taskLead).filter(Boolean);
  const hotLeads = myLeads.filter((l) => l.priority === "Hot" && !isClosed(l));
  const idleLeads = myLeads.filter((l) => !isClosed(l) && daysSince(l.lastUpdated) >= 2);
  const myNotifs = notifications.filter((n) => n.userId === user.id && !n.read);

  const won = myLeads.filter((l) => l.status === "Closed-Won").length;
  const convRate = myLeads.length ? Math.round((won / myLeads.length) * 100) : 0;

  const wonThisMonth = myLeads.filter(
    (l) => l.status === "Closed-Won" && new Date(l.lastUpdated).getMonth() === new Date().getMonth()
  ).length;
  const myGoal = goals[user.id] || 0;
  const goalProgress = myGoal ? Math.min(100, Math.round((wonThisMonth / myGoal) * 100)) : 0;

  const { rank, totalEmployees } = employeeRank(user.id, users, leads);
  const trend = last7DaysTrend(leads, user.id);
  const mySources = sourceStats(myLeads);

  const saveGoal = () => { setMyGoal(user.id, goalInput); setEditingGoal(false); setGoalInput(""); };

  const quickCall = (lead) => {
    addNote(lead.id, "Quick-call initiated from dashboard", "call", {
      authorId: user.id, authorName: employeeName, authorRole: user.role, visibility: "team",
    });
    window.location.href = `tel:${lead.phone}`;
  };
  const quickWhatsApp = (lead) => {
    addNote(lead.id, "WhatsApp opened from dashboard", "whatsapp", {
      authorId: user.id, authorName: employeeName, authorRole: user.role, visibility: "team",
    });
    window.open(`https://wa.me/${toWaNumber(lead.phone)}`, "_blank");
  };
  const quickStatus = (id, status) => updateLeadStatus(id, status, user);

  return (
    <Layout title={`Hi, ${employeeName.split(" ")[0]}`}>

      {/* ─── NOTIFICATION BANNER ─── */}
      {myNotifs.length > 0 && (
        <div className="card p-3 mb-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-blue-600">{myNotifs.length}</span>
          </div>
          <p className="text-xs text-ink-soft flex-1">new notification{myNotifs.length > 1 ? "s" : ""}</p>
          <button onClick={() => markRead(user.id)} className="text-xs font-semibold text-orange-600 press-scale">
            Clear
          </button>
        </div>
      )}

      {/* ─── MONTHLY GOAL ─── */}
      <div className="card p-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="eyebrow flex items-center gap-1"><Target size={11} /> Monthly goal</span>
          {!editingGoal && (
            <button onClick={() => setEditingGoal(true)} className="text-[11px] font-semibold text-orange-600 press-scale">
              {myGoal ? "Edit" : "Set goal"}
            </button>
          )}
        </div>
        {editingGoal ? (
          <div className="flex gap-2">
            <input type="number" placeholder="e.g. 10"
              className="input flex-1 py-2.5 text-sm"
              value={goalInput} onChange={(e) => setGoalInput(e.target.value)}
              inputMode="numeric"
            />
            <button onClick={saveGoal} className="btn btn-primary px-4 py-2.5 text-sm">Save</button>
          </div>
        ) : myGoal ? (
          <>
            <div className="flex justify-between text-xs mb-1.5 num text-ink-soft">
              <span>{wonThisMonth}/{myGoal} closed</span>
              <span className="font-semibold text-ink">{goalProgress}%</span>
            </div>
            <div className="w-full bg-cream-200 rounded-full h-2">
              <div className="bg-gradient-orange h-2 rounded-full transition-all duration-500" style={{ width: `${goalProgress}%` }} />
            </div>
          </>
        ) : (
          <p className="text-xs text-ink-muted">Tap "Set goal" to track your monthly target</p>
        )}
      </div>

      {/* ─── FOLLOW-UP TASKS CTA ─── */}
      {myOpenTasks.length > 0 && (
        <Link to="/app/tasks" className="card p-3.5 mb-3 flex items-center gap-3 press-scale">
          <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
            <ListChecks size={17} className="text-orange-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">{myOpenTasks.length} open task{myOpenTasks.length > 1 ? "s" : ""}</p>
            <p className="text-[11px] text-ink-muted">Tap to view follow-ups</p>
          </div>
          <ChevronRight size={16} className="text-ink-muted" />
        </Link>
      )}

      {/* ─── STATS GRID ─── */}
      <div className="grid grid-cols-2 gap-2.5 mb-3">
        <StatCard label="Pipeline" value={myLeads.length} tone="ink" />
        <StatCard label="New to call" value={newToCall.length} tone="info" />
        <StatCard label="Due today" value={followToday.length} tone="primary" icon={Clock} />
        <StatCard label="Overdue" value={overdue.length} tone="danger" icon={AlertTriangle} />
      </div>
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <StatCard label="Won" value={won} tone="ok" />
        <StatCard label="Rate" value={`${convRate}%`} tone="info" />
        <StatCard label="Rank" value={`#${rank}`} tone="signal" icon={Trophy} />
      </div>

      {/* ─── HOT LEADS ─── */}
      {hotLeads.length > 0 && (
        <div className="mb-4">
          <div className="section-header px-0 mb-1">
            <span className="section-title flex items-center gap-1"><Flame size={11} className="text-danger-500" /> Hot leads</span>
            <span className="text-[11px] text-ink-muted num">{hotLeads.length}</span>
          </div>
          <div className="space-y-2">
            {hotLeads.slice(0, 4).map((l) => (
              <LeadCard key={l.id} lead={l} settings={settings} onCall={quickCall} onWhatsApp={quickWhatsApp} onStatus={quickStatus} />
            ))}
            {hotLeads.length > 4 && (
              <Link to="/app/leads" className="text-xs font-semibold text-orange-600 flex items-center gap-1 px-1 press-scale">
                View all {hotLeads.length} hot leads <ChevronRight size={12} />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ─── IDLE LEADS WARNING ─── */}
      {idleLeads.length > 0 && (
        <div className="card p-3.5 mb-4 border-warning-200 bg-warning-50/50">
          <p className="eyebrow text-warning-700 mb-2">Idle 2+ days · {idleLeads.length} leads</p>
          <div className="space-y-1.5">
            {idleLeads.slice(0, 3).map((l) => (
              <Link key={l.id} to={`/app/lead/${l.id}`} className="flex items-center justify-between text-sm press-scale">
                <span className="text-ink font-medium truncate">{l.name}</span>
                <span className="text-[11px] num text-warning-700">{daysSince(l.lastUpdated)}d</span>
              </Link>
            ))}
            {idleLeads.length > 3 && (
              <Link to="/app/leads" className="text-xs font-semibold text-warning-700 flex items-center gap-1 mt-1">
                +{idleLeads.length - 3} more <ChevronRight size={12} />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ─── DAY CARDS (Horizontal scroll) ─── */}
      <div className="mb-4">
        <div className="section-header px-0 mb-2">
          <span className="section-title">Today's queue</span>
        </div>
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4" style={{ WebkitOverflowScrolling: 'touch' }}>
          <DayCard title="New to call" count={newToCall.length} list={newToCall} settings={settings} onCall={quickCall} onWhatsApp={quickWhatsApp} onStatus={quickStatus} />
          <DayCard title="Follow-ups" count={followToday.length} list={followToday} settings={settings} onCall={quickCall} onWhatsApp={quickWhatsApp} onStatus={quickStatus} />
          <DayCard title="Overdue" count={overdue.length} list={overdue} settings={settings} onCall={quickCall} onWhatsApp={quickWhatsApp} onStatus={quickStatus} danger />
        </div>
      </div>

      {/* ─── WEEKLY CHART ─── */}
      <div className="card p-4 mb-3">
        <p className="eyebrow mb-3">Weekly conversions</p>
        <ConvBar data={trend} />
      </div>

      {/* ─── SOURCE TABLE ─── */}
      <div className="card p-4 mb-2">
        <p className="eyebrow mb-3">Source performance</p>
        {mySources.length === 0 ? (
          <p className="text-xs text-ink-muted text-center py-4">No leads yet</p>
        ) : (
          <div className="space-y-2.5">
            {mySources.map((s) => (
              <div key={s.source} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-ink truncate">{s.source}</span>
                    <span className="text-[10px] num text-ink-muted">{s.won}/{s.total} · {s.rate}%</span>
                  </div>
                  <div className="w-full bg-cream-200 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-gradient-orange transition-all" style={{ width: `${s.rate}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

/* ─── DAY CARD (horizontally scrollable) ─── */
function DayCard({ title, count, list, danger, settings, onCall, onWhatsApp, onStatus }) {
  return (
    <div className={`card p-3.5 min-w-[260px] max-w-[280px] shrink-0 ${danger ? "border-danger-200" : ""}`}>
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-xs font-bold text-ink">{title}</p>
        <span className={`text-xs num font-bold ${danger && count > 0 ? "text-danger-600" : "text-ink-muted"}`}>{count}</span>
      </div>
      <div className="space-y-2">
        {list.length === 0 && <p className="text-xs text-ink-muted py-2">All clear!</p>}
        {list.slice(0, 3).map((l) => (
          <LeadCard key={l.id} lead={l} compact settings={settings} onCall={onCall} onWhatsApp={onWhatsApp} onStatus={onStatus} />
        ))}
        {list.length > 3 && (
          <p className="text-[11px] text-ink-muted text-center">+{list.length - 3} more</p>
        )}
      </div>
    </div>
  );
}

/* ─── LEAD CARD (touch-friendly) ─── */
function LeadCard({ lead, compact, settings, onCall, onWhatsApp, onStatus }) {
  return (
    <div className={`bg-cream-50 rounded-xl ${compact ? "p-2.5" : "p-3"}`}>
      <div className="flex items-center justify-between mb-1">
        <Link to={`/app/lead/${lead.id}`} className="text-sm font-semibold text-ink truncate flex-1 mr-2 press-scale">
          {lead.name}
        </Link>
        <PriorityBadge p={lead.priority} />
      </div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] text-ink-muted num">{lead.phone}</p>
        <StatusLamp status={lead.status} />
      </div>
      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onCall(lead)}
          className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold bg-success-50 text-success-700 border border-success-200 rounded-lg py-2 min-h-[36px] press-scale"
        >
          <Phone size={12} /> Call
        </button>
        <button
          onClick={() => onWhatsApp(lead)}
          className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold bg-success-50 text-success-700 border border-success-200 rounded-lg py-2 min-h-[36px] press-scale"
        >
          <MessageCircle size={12} /> WA
        </button>
        <select
          value={lead.status}
          onChange={(e) => onStatus(lead.id, e.target.value)}
          className="text-[11px] border border-cream-300 rounded-lg px-2 py-2 bg-white min-h-[36px] max-w-[90px]"
        >
          {settings.statuses.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
    </div>
  );
}
