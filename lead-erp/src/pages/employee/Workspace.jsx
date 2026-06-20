import { useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import StatCard from "../../components/StatCard";
import ConvBar from "../../components/charts/BarChart";
import { useData } from "../../context/DataContext";
import { useAuth } from "../../context/AuthContext";
import { StatusLamp, PriorityBadge } from "../../components/StatusLamp";
import { isToday, fmtDate, daysSince, last7DaysTrend, employeeRank, toWaNumber, sourceStats } from "../../utils/helpers";
import { Target, Flame, Clock, Trophy, Phone, MessageCircle } from "lucide-react";

export default function Workspace() {
  const { user } = useAuth();
  const { leads, users, settings, notifications, markRead, updateLead, addNote, goals, setMyGoal } = useData();

  const [goalInput, setGoalInput] = useState("");
  const [editingGoal, setEditingGoal] = useState(false);

  const myLeads = leads.filter((l) => l.assignedTo === user.id && !l.blacklisted);
  const newToCall = myLeads.filter((l) => l.status === "New");
  const followToday = myLeads.filter((l) => isToday(l.followUp));
  const overdue = myLeads.filter((l) => l.followUp && new Date(l.followUp) < new Date() && !isToday(l.followUp));
  const hotLeads = myLeads.filter((l) => l.priority === "Hot" && !["Closed-Won", "Lost"].includes(l.status));
  const idleLeads = myLeads.filter((l) => !["Closed-Won", "Lost"].includes(l.status) && daysSince(l.lastUpdated) >= 2);
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
    addNote(lead.id, `📱 Quick-call initiated from dashboard at ${fmtDate(new Date().toISOString())}`);
    window.location.href = `tel:${lead.phone}`;
  };
  const quickWhatsApp = (lead) => {
    addNote(lead.id, `💬 WhatsApp opened from dashboard at ${fmtDate(new Date().toISOString())}`);
    window.open(`https://wa.me/${toWaNumber(lead.phone)}`, "_blank");
  };

  return (
    <Layout title={`Welcome, ${user.name}`}>
      {myNotifs.length > 0 && (
        <div className="bg-info-soft border border-info/20 rounded-lg p-4 mb-5 flex justify-between">
          <div>
            <b className="text-info">{myNotifs.length} new notification(s)</b>
            <ul className="text-sm text-ink/70 mt-1 space-y-0.5">{myNotifs.map((n) => <li key={n.id}>{n.text}</li>)}</ul>
          </div>
          <button onClick={() => markRead(user.id)} className="text-xs text-info self-start hover:underline">Mark read</button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-card border border-paper-line p-5 mb-6">
        <div className="flex justify-between items-center mb-2">
          <p className="eyebrow flex items-center gap-1.5"><Target size={13} /> Monthly goal</p>
          {!editingGoal && (
            <button onClick={() => setEditingGoal(true)} className="text-xs text-info hover:underline">
              {myGoal ? "Edit" : "Set goal"}
            </button>
          )}
        </div>
        {editingGoal ? (
          <div className="flex gap-2">
            <input type="number" placeholder="e.g. 10 deals this month"
              className="border border-paper-line rounded-md p-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-signal/30"
              value={goalInput} onChange={(e) => setGoalInput(e.target.value)} />
            <button onClick={saveGoal} className="bg-ink text-white px-4 rounded-md text-sm">Save</button>
          </div>
        ) : myGoal ? (
          <>
            <div className="flex justify-between text-sm mb-1.5 num">
              <span>{wonThisMonth} / {myGoal} closed this month</span>
              <span>{goalProgress}%</span>
            </div>
            <div className="w-full bg-paper rounded-full h-2">
              <div className="bg-ok h-2 rounded-full transition-all" style={{ width: `${goalProgress}%` }} />
            </div>
          </>
        ) : (
          <p className="text-sm text-ink/40">No goal set yet — tap "Set goal" and pick a monthly target.</p>
        )}
      </div>

      <div className="grid grid-cols-4 gap-4 mb-4">
        <StatCard label="Active pipeline" value={myLeads.length} tone="ink" />
        <StatCard label="New to call" value={newToCall.length} tone="info" />
        <StatCard label="Follow-ups today" value={followToday.length} tone="signal" icon={Clock} />
        <StatCard label="Overdue" value={overdue.length} tone="danger" />
      </div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Conversions" value={won} tone="ok" />
        <StatCard label="Conversion rate" value={`${convRate}%`} tone="info" />
        <StatCard label="My rank" value={`#${rank} of ${totalEmployees}`} tone="signal" icon={Trophy} />
      </div>

      {hotLeads.length > 0 && (
        <div className="bg-danger/[0.04] border border-danger/20 rounded-lg p-4 mb-6">
          <p className="eyebrow text-danger flex items-center gap-1.5 mb-3"><Flame size={13} /> Hot leads — focus first ({hotLeads.length})</p>
          <div className="space-y-2">
            {hotLeads.map((l) => (
              <LeadRow key={l.id} lead={l} settings={settings} onCall={quickCall} onWhatsApp={quickWhatsApp} onStatus={updateLead} />
            ))}
          </div>
        </div>
      )}

      {idleLeads.length > 0 && (
        <div className="bg-signal-soft border border-signal/25 rounded-lg p-4 mb-6">
          <p className="eyebrow text-signal mb-2">Needs attention — idle 2+ days</p>
          <ul className="text-sm text-ink/70 space-y-1">
            {idleLeads.map((l) => (
              <li key={l.id}>
                <Link to={`/app/lead/${l.id}`} className="hover:underline">
                  {l.name} <span className="num text-ink/40">{l.phone}</span> — <span className="num">{daysSince(l.lastUpdated)}d</span> idle
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6 mb-6">
        <DayCard title="New to call" list={newToCall} settings={settings} onCall={quickCall} onWhatsApp={quickWhatsApp} onStatus={updateLead} />
        <DayCard title="Follow-ups today" list={followToday} settings={settings} onCall={quickCall} onWhatsApp={quickWhatsApp} onStatus={updateLead} />
        <DayCard title="Overdue" list={overdue} settings={settings} danger onCall={quickCall} onWhatsApp={quickWhatsApp} onStatus={updateLead} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-card border border-paper-line p-5">
          <p className="eyebrow mb-3">My weekly conversions</p>
          <ConvBar data={trend} />
        </div>
        <div className="bg-white rounded-lg shadow-card border border-paper-line p-5">
          <p className="eyebrow mb-3">My source performance</p>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-ink/40 border-b border-paper-line">
              <th className="py-2 font-medium">Source</th><th className="font-medium">Leads</th>
              <th className="font-medium">Won</th><th className="font-medium">Rate</th>
            </tr></thead>
            <tbody>
              {mySources.map((s) => (
                <tr key={s.source} className="border-b border-paper-line last:border-0">
                  <td className="py-2">{s.source}</td><td className="num">{s.total}</td>
                  <td className="num text-ok">{s.won}</td><td className="num">{s.rate}%</td>
                </tr>
              ))}
              {mySources.length === 0 && <tr><td colSpan="4" className="text-ink/40 py-3">No leads yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

function DayCard({ title, list, danger, settings, onCall, onWhatsApp, onStatus }) {
  return (
    <div className={`bg-white rounded-lg shadow-card border p-5 ${danger ? "border-danger/25" : "border-paper-line"}`}>
      <p className="eyebrow mb-3">{title} ({list.length})</p>
      <div className="space-y-3">
        {list.length === 0 && <p className="text-sm text-ink/35">Nothing here.</p>}
        {list.map((l) => (
          <LeadRow key={l.id} lead={l} settings={settings} onCall={onCall} onWhatsApp={onWhatsApp} onStatus={onStatus} />
        ))}
      </div>
    </div>
  );
}

function LeadRow({ lead, settings, onCall, onWhatsApp, onStatus }) {
  return (
    <div className="border-b border-paper-line last:border-0 pb-2.5">
      <div className="flex justify-between items-start">
        <Link to={`/app/lead/${lead.id}`} className="text-sm font-medium hover:underline">{lead.name}</Link>
        <PriorityBadge p={lead.priority} />
      </div>
      <div className="flex items-center justify-between mt-0.5">
        <p className="text-xs text-ink/40 num">{lead.phone}</p>
        <StatusLamp status={lead.status} />
      </div>
      <div className="flex items-center gap-2 mt-2">
        <button onClick={() => onCall(lead)} className="flex items-center gap-1 text-xs bg-ok-soft text-ok px-2 py-1 rounded">
          <Phone size={11} /> Call
        </button>
        <button onClick={() => onWhatsApp(lead)} className="flex items-center gap-1 text-xs bg-info-soft text-info px-2 py-1 rounded">
          <MessageCircle size={11} /> WhatsApp
        </button>
        <select value={lead.status} onChange={(e) => onStatus(lead.id, { status: e.target.value })}
          className="text-xs border border-paper-line rounded px-1 py-1">
          {settings.statuses.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
    </div>
  );
}