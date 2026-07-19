import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { useData } from "../../context/DataContext";
import { useAuth } from "../../context/AuthContext";
import { employeeStats, fmtDate, daysSince, fmtMoney } from "../../utils/helpers";
import { PriorityBadge } from "../../components/StatusLamp";

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { users, leads, financials, deactivateUser, activateUser, reassignLead, reassignAllLeads } = useData();
  const [bulkTarget, setBulkTarget] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const toggleActive = async (currentlyActive) => {
    const res = currentlyActive ? await deactivateUser(emp) : await activateUser(emp.uid || emp.id);
    if (!res?.ok && res?.error) alert(res.error);
  };

  const emp = users.find((u) => u.id === id);
  if (!emp) return <Layout title="Employee"><p className="text-danger">Employee not found.</p></Layout>;

  const stats = employeeStats(id, leads);
  const otherEmps = users.filter((u) => u.role === "employee" && u.id !== id);

  // FIX: revenue now comes from financials (leads/{id}/private/data). l.value
  // never actually existed on the lead doc — that's why revenue always showed
  // as ₹0. The financials map comes from context (admin-only listener).
  const revenue = stats.leads
    .filter((l) => l.status === "Closed-Won")
    .reduce((s, l) => s + (financials[l.id]?.revenue || 0), 0);

  const openLeadsCount = stats.leads.filter((l) => !["Closed-Won", "Lost"].includes(l.status)).length;

  const changeNumber = () => {
    alert("For security, a member's verified phone number cannot be changed in place. Deactivate the old member and send a new invitation to the verified number.");
  };

  // NEW (Q3 fix): before deactivating (or at any time) move all OPEN leads to
  // another employee in one click — so that no lead is orphaned.
  const handleBulkReassign = async () => {
    if (!bulkTarget) return;
    setBulkBusy(true);
    const target = otherEmps.find((o) => o.id === bulkTarget);
    const count = await reassignAllLeads(emp.id, bulkTarget, target?.name, user);
    setBulkBusy(false);
    setBulkTarget("");
    alert(count > 0 ? `${count} open lead(s) reassigned to ${target?.name}.` : "There were no open leads to reassign.");
  };

  return (
    <Layout title={`Employee Profile — ${emp.name}`}>
      <button onClick={() => navigate(-1)} className="text-sm text-ink/40 mb-4 hover:text-ink">← Back to leaderboard</button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-card border border-paper-line p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-ink text-white flex items-center justify-center font-display font-semibold text-lg shrink-0">
              {emp.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="font-medium truncate">{emp.name}</p>
              <p className="text-xs text-ink/40 num">{emp.phone}</p>
            </div>
          </div>
          <p className="text-sm"><span className="text-ink/40">Role</span> · {emp.role}</p>
          <p className="text-sm"><span className="text-ink/40">Status</span> · {emp.active === false ? "Inactive" : "Active"}</p>
          <div className="flex flex-wrap gap-2 mt-4">
            <button onClick={changeNumber} className="text-xs bg-paper border border-paper-line px-3 py-1.5 rounded">Change number</button>
            <button onClick={() => toggleActive(emp.active !== false)}
              className="text-xs bg-danger-soft text-danger px-3 py-1.5 rounded">
              {emp.active === false ? "Activate" : "Deactivate"}
            </button>
          </div>

          {openLeadsCount > 0 && (
            <div className="mt-4 pt-4 border-t border-paper-line">
              <p className="eyebrow mb-2">Open leads — {openLeadsCount}</p>
              <p className="text-xs text-ink/40 mb-2">Before deactivating (or at any time), move all open leads to another employee so that no lead is orphaned.</p>
              <select value={bulkTarget} onChange={(e) => setBulkTarget(e.target.value)}
                className="w-full border border-paper-line rounded-md p-2 text-xs mb-2">
                <option value="">Move all open leads to…</option>
                {otherEmps.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <button onClick={handleBulkReassign} disabled={!bulkTarget || bulkBusy}
                className="w-full bg-ink text-white rounded-md p-2 text-xs disabled:opacity-40">
                {bulkBusy ? "Reassigning…" : `Reassign all ${openLeadsCount} open lead(s)`}
              </button>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Metric label="Total assigned" value={stats.total} tone="ink" />
          <Metric label="Active pipeline" value={stats.active} tone="info" />
          <Metric label="Converted" value={stats.won} tone="ok" />
          <Metric label="Conversion rate" value={`${stats.convRate}%`} tone="signal" />
          <Metric label="Revenue generated" value={fmtMoney(revenue)} tone="ok" />
          <Metric label="SLA breaches" value={stats.stale} tone="danger" />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-card border border-paper-line overflow-x-auto">
        <p className="eyebrow p-4 pb-2">Assigned leads ({stats.leads.length})</p>
        <table className="w-full text-sm min-w-[640px]">
          <thead><tr className="text-left text-ink/40 border-b border-paper-line">
            <th className="p-3 font-medium">ID</th><th className="font-medium">Name</th><th className="font-medium">Priority</th>
            <th className="font-medium">Status</th><th className="font-medium">Value</th><th className="font-medium">Idle</th><th className="font-medium">Reassign</th>
          </tr></thead>
          <tbody>
            {stats.leads.map((l) => {
              const idle = daysSince(l.lastUpdated);
              return (
                <tr key={l.id} className="border-b border-paper-line last:border-0 hover:bg-paper/50">
                  <td className="p-3 num text-ink/50">{l.id}</td>
                  <td><Link to={`/admin/leads/${l.id}`} className="font-medium hover:underline">{l.name}</Link></td>
                  <td><PriorityBadge p={l.priority} /></td>
                  <td className="text-xs">{l.status}</td>
                  <td className="num">{fmtMoney(financials[l.id]?.revenue || 0)}</td>
                  <td className={`num ${idle >= 3 ? "text-danger font-medium" : ""}`}>{idle}d</td>
                  <td>
                    {/* FIX: pass employeeName + user; previously only 2 args were passed */}
                    <select defaultValue="" onChange={(e) => e.target.value && reassignLead(l.id, e.target.value, otherEmps.find((o) => o.id === e.target.value)?.name, user)}
                      className="border border-paper-line rounded p-1 text-xs">
                      <option value="">Move to…</option>
                      {otherEmps.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
            {stats.leads.length === 0 && <tr><td colSpan="7" className="text-ink/40 p-4">No leads assigned yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}

function Metric({ label, value, tone }) {
  const TONE = { ink: "text-ink", info: "text-info", ok: "text-ok", signal: "text-signal", danger: "text-danger" };
  return (
    <div className="bg-white rounded-lg shadow-card border border-paper-line p-4">
      <p className="eyebrow mb-1">{label}</p>
      <p className={`text-2xl font-display font-semibold num ${TONE[tone]}`}>{value}</p>
    </div>
  );
}