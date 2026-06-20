import { useParams, useNavigate, Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { useData } from "../../context/DataContext";
import { employeeStats, fmtDate, daysSince, fmtMoney } from "../../utils/helpers";
import { PriorityBadge } from "../../components/StatusLamp";

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { users, leads, updateUser, reassignLead } = useData();

  const emp = users.find((u) => u.id === id);
  if (!emp) return <Layout title="Employee"><p className="text-danger">Employee not found.</p></Layout>;

  const stats = employeeStats(id, leads);
  const otherEmps = users.filter((u) => u.role === "employee" && u.id !== id);
  const revenue = stats.leads.filter((l) => l.status === "Closed-Won").reduce((s, l) => s + (l.value || 0), 0);

  const changeNumber = () => {
    const newPhone = prompt("Naya 10-digit mobile number daalo:", emp.phone);
    if (newPhone && /^\d{10}$/.test(newPhone)) {
      updateUser(emp.id, { phone: newPhone });
      alert("Mobile number updated!");
    } else if (newPhone) {
      alert("Sahi 10-digit number daalo.");
    }
  };

  return (
    <Layout title={`Employee Profile — ${emp.name}`}>
      <button onClick={() => navigate(-1)} className="text-sm text-ink/40 mb-4 hover:text-ink">← Back to leaderboard</button>

      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-card border border-paper-line p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-ink text-white flex items-center justify-center font-display font-semibold text-lg">
              {emp.name.charAt(0)}
            </div>
            <div>
              <p className="font-medium">{emp.name}</p>
              <p className="text-xs text-ink/40 num">{emp.phone}</p>
            </div>
          </div>
          <p className="text-sm"><span className="text-ink/40">Role</span> · {emp.role}</p>
          <p className="text-sm"><span className="text-ink/40">Status</span> · {emp.active === false ? "Inactive" : "Active"}</p>
          <div className="flex gap-2 mt-4">
            <button onClick={changeNumber} className="text-xs bg-paper border border-paper-line px-3 py-1.5 rounded">Change number</button>
            <button onClick={() => updateUser(emp.id, { active: !(emp.active !== false) })}
              className="text-xs bg-danger-soft text-danger px-3 py-1.5 rounded">
              {emp.active === false ? "Activate" : "Deactivate"}
            </button>
          </div>
        </div>

        <div className="col-span-2 grid grid-cols-3 gap-4">
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
        <table className="w-full text-sm">
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
                  <td className="num">{fmtMoney(l.value)}</td>
                  <td className={`num ${idle >= 3 ? "text-danger font-medium" : ""}`}>{idle}d</td>
                  <td>
                    <select defaultValue="" onChange={(e) => e.target.value && reassignLead(l.id, e.target.value)}
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