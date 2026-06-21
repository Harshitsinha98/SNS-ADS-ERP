import { useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { useData } from "../../context/DataContext";
import { employeeStats } from "../../utils/helpers";

export default function Employees() {
  const { users, leads, addUser } = useData();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", role: "employee" });

  const employees = users.filter((u) => u.role === "employee");

  const create = (e) => {
    e.preventDefault();
    const cleanPhone = form.phone.replace(/\D/g, "");
    if (cleanPhone.length !== 10) { alert("Sahi 10-digit mobile number daalo."); return; }
    if (users.some((u) => u.phone === cleanPhone)) { alert("Ye number already registered hai."); return; }
    addUser({ ...form, phone: cleanPhone, active: true });
    setForm({ name: "", phone: "", role: "employee" });
    setShowForm(false);
  };

  const ranked = employees
    .map((u) => ({ user: u, stats: employeeStats(u.id, leads) }))
    .sort((a, b) => b.stats.won - a.stats.won);

  const teamWon = ranked.reduce((s, r) => s + r.stats.won, 0);
  const teamTotal = ranked.reduce((s, r) => s + r.stats.total, 0);

  return (
    <Layout title="Employee Performance & Management">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Total employees" value={employees.length} />
        <Stat label="Team leads handled" value={teamTotal} />
        <Stat label="Team conversions" value={teamWon} />
        <Stat label="Team conv. rate" value={`${teamTotal ? Math.round((teamWon / teamTotal) * 100) : 0}%`} />
      </div>

      <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
        <p className="eyebrow">Performance leaderboard</p>
        <button onClick={() => setShowForm((s) => !s)} className="bg-ink text-white px-4 py-2 rounded-md text-sm">
          {showForm ? "Close" : "+ Add employee"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={create} className="bg-white rounded-lg shadow-card border border-paper-line p-5 mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <input className="border border-paper-line rounded-md p-2 text-sm" placeholder="Full Name"
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="border border-paper-line rounded-md p-2 text-sm" placeholder="10-digit Mobile" maxLength={10}
            value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "") })} required />
          <select className="border border-paper-line rounded-md p-2 text-sm" value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
          </select>
          <button className="bg-ink text-white rounded-md p-2 text-sm">Provision user</button>
        </form>
      )}

      <div className="bg-white rounded-lg shadow-card border border-paper-line overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead><tr className="text-left text-ink/40 border-b border-paper-line bg-paper/60">
            <th className="p-3 font-medium">Rank</th><th className="font-medium">Employee</th><th className="font-medium">Mobile</th>
            <th className="font-medium">Assigned</th><th className="font-medium">Won</th><th className="font-medium">Conv. rate</th>
            <th className="font-medium">SLA breaches</th><th className="font-medium">Status</th><th></th>
          </tr></thead>
          <tbody>
            {ranked.map(({ user: u, stats }, i) => (
              <tr key={u.id} className="border-b border-paper-line last:border-0 hover:bg-paper/50">
                <td className="p-3 num text-ink/40">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</td>
                <td className="font-medium">{u.name}</td>
                <td className="num">{u.phone}</td>
                <td className="num">{stats.total}</td>
                <td className="num text-ok font-medium">{stats.won}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-paper rounded-full h-1.5">
                      <div className="bg-signal h-1.5 rounded-full" style={{ width: `${stats.convRate}%` }} />
                    </div>
                    <span className="num text-xs">{stats.convRate}%</span>
                  </div>
                </td>
                <td className="num">{stats.stale > 0 ? <span className="text-danger font-medium">{stats.stale}</span> : "0"}</td>
                <td>{u.active === false ? <span className="text-danger text-xs">Inactive</span> : <span className="text-ok text-xs">Active</span>}</td>
                <td><Link to={`/admin/employees/${u.id}`} className="text-info text-xs font-medium hover:underline">View →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-white rounded-lg shadow-card border border-paper-line p-4">
      <p className="eyebrow mb-1">{label}</p>
      <p className="text-2xl font-display font-semibold num">{value}</p>
    </div>
  );
}