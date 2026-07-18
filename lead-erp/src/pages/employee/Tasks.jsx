import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { useData } from "../../context/DataContext";
import { useAuth } from "../../context/AuthContext";
import { isToday, fmtDate } from "../../utils/helpers";

const PRIORITIES = ["Hot", "Warm", "Cold"];
const TABS = ["All", "New to Call", "Follow-up Today", "Overdue"];

const priorityClass = (p) => {
  switch (p) {
    case "Hot": return "bg-red-50 text-red-700 border-red-200";
    case "Warm": return "bg-amber-50 text-amber-700 border-amber-200";
    case "Cold": return "bg-blue-50 text-blue-700 border-blue-200";
    default: return "border-paper-line";
  }
};

const toDatetimeLocal = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function Tasks() {
  const { user } = useAuth();
  const { leads, settings, updateLeadStatus, updatePriority, updateFollowUpDate } = useData();
  const [tab, setTab] = useState("All");

  const myLeads = useMemo(
    () => leads.filter((l) => l.assignedTo === user.id && !l.blacklisted),
    [leads, user.id]
  );

  const isClosed = (l) => ["Closed-Won", "Lost"].includes(l.status);
  // FIX: "overdue" was only a date-level check (!isToday), so even after the
  // follow-up time had passed — if it was still today's date — the lead stayed
  // stuck under "Follow-up Today" and never moved to "Overdue". Now it's a
  // time-based check: any follow-up whose time has passed is Overdue, whether it's today or older.
  const isPast = (l) => l.followUp && new Date(l.followUp) < new Date();

  const newToCall = myLeads.filter((l) => l.status === "New");
  const followToday = myLeads.filter((l) => isToday(l.followUp) && !isPast(l) && !isClosed(l));
  const overdue = myLeads.filter((l) => isPast(l) && !isClosed(l));

  const buckets = { "All": myLeads, "New to Call": newToCall, "Follow-up Today": followToday, "Overdue": overdue };

  const view = useMemo(
    () => [...buckets[tab]].sort((a, b) => (a.lastUpdated < b.lastUpdated ? 1 : -1)),
    [tab, myLeads]
  );

  return (
    <Layout title="My Leads">
      {/* Mobile fix: instead of squeezing 4 tabs, let them scroll horizontally */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`shrink-0 px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
              tab === t ? "bg-ink text-white border-ink" : "bg-white border-paper-line text-ink/60 hover:bg-paper"
            }`}>
            {t} <span className="num">({buckets[t].length})</span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-card border border-paper-line overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead><tr className="text-left text-ink/40 border-b border-paper-line bg-paper/60">
            <th className="p-3 font-medium">Name</th><th className="font-medium">Phone</th>
            <th className="font-medium">Priority</th><th className="font-medium">Status</th>
            <th className="font-medium">Follow-up</th><th className="font-medium">Updated</th><th className="font-medium">Action</th>
          </tr></thead>
          <tbody>
            {view.map((l) => {
              const rowOverdue = isPast(l) && !isClosed(l);
              return (
                <tr key={l.id} className="border-b border-paper-line last:border-0 hover:bg-paper/50">
                  <td className="p-3 font-medium">{l.name}</td>
                  <td className="num text-ink/60">{l.phone}</td>
                  <td>
                    <select value={l.priority || "Warm"} onChange={(e) => updatePriority(l.id, e.target.value, user)}
                      className={`border rounded p-1 text-xs font-medium ${priorityClass(l.priority)}`}>
                      {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={l.status} onChange={(e) => updateLeadStatus(l.id, e.target.value, user)}
                      className="border border-paper-line rounded p-1 text-xs">
                      {settings.statuses.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>
                    <input type="datetime-local" value={toDatetimeLocal(l.followUp)}
                      onChange={(e) => updateFollowUpDate(l.id, e.target.value ? new Date(e.target.value).toISOString() : null, user)}
                      className={`border rounded p-1 text-xs num ${rowOverdue ? "border-danger text-danger" : "border-paper-line"}`} />
                  </td>
                  <td className="text-xs num text-ink/40">{fmtDate(l.lastUpdated)}</td>
                  <td><Link to={`/app/lead/${l.id}`} className="text-info text-xs font-medium hover:underline">Open →</Link></td>
                </tr>
              );
            })}
            {view.length === 0 && <tr><td colSpan="7" className="text-ink/40 py-6 text-center">No leads in this tab.</td></tr>}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}