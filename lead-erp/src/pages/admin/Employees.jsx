import { useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { useData } from "../../context/DataContext";
import { useBilling } from "../../context/BillingContext";
import { employeeStats } from "../../utils/helpers";

export default function Employees() {
  const { users, leads, addUser } = useData();
  const { seatsUsed, seatsLimit, canAddSeat, planName, isExpired } = useBilling();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", role: "employee" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const employees = users.filter((u) => u.role === "employee");
  const norm = (p) => String(p || "").replace(/\D/g, "").slice(-10);

  const create = async (e) => {
    e.preventDefault();
    setErr("");
    const cleanPhone = form.phone.replace(/\D/g, "");
    if (!form.name.trim()) { setErr("Employee ka naam daalo."); return; }
    if (cleanPhone.length !== 10) { setErr("Sahi 10-digit mobile number daalo."); return; }
    if (users.some((u) => norm(u.phone) === cleanPhone)) { setErr("Ye number already added/invited hai."); return; }

    setSaving(true);
    const res = await addUser({ name: form.name.trim(), phone: cleanPhone, email: form.email.trim(), role: form.role });
    setSaving(false);

    if (!res?.ok) { setErr(res?.error || "Member add nahi hua."); return; }
    setForm({ name: "", phone: "", email: "", role: "employee" });
    setShowForm(false);
  };

  const seatPct = seatsLimit > 0 ? Math.min(100, Math.round((seatsUsed / seatsLimit) * 100)) : 0;

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

      {/* Seat usage banner */}
      <div className="bg-white rounded-xl shadow-card border border-cream-300/60 p-4 mb-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-sm font-semibold text-ink">
              Seats: <span className="font-mono">{seatsUsed}</span> / <span className="font-mono">{seatsLimit}</span> used
              <span className="ml-2 text-xs font-normal text-ink-muted">({planName} plan)</span>
            </p>
            <span className="text-xs text-ink-muted">{seatPct}%</span>
          </div>
          <div className="w-full bg-cream-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${seatPct >= 100 ? "bg-danger-500" : "bg-gradient-orange"}`}
              style={{ width: `${seatPct}%` }}
            />
          </div>
        </div>
        <Link to="/admin/billing" className="text-sm font-semibold text-orange-600 hover:underline whitespace-nowrap">
          Manage plan →
        </Link>
      </div>

      <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
        <p className="eyebrow">Performance leaderboard</p>
        {canAddSeat && !isExpired ? (
          <button onClick={() => { setShowForm((s) => !s); setErr(""); }} className="bg-gradient-orange text-white px-4 py-2 rounded-lg text-sm font-semibold">
            {showForm ? "Close" : "+ Add employee"}
          </button>
        ) : (
          <Link to="/admin/billing" className="bg-cream-200 text-ember-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-cream-300">
            {isExpired ? "Trial ended — Upgrade" : `Seat limit reached (${seatsLimit}/${seatsLimit}) — Upgrade`}
          </Link>
        )}
      </div>

      {showForm && (
        <form onSubmit={create} className="bg-white rounded-xl shadow-card border border-cream-300/60 p-5 mb-5">
          {err && <p className="text-danger-600 text-sm mb-3 bg-danger-50 border border-danger-100 rounded-lg px-3 py-2">{err}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <input className="border border-cream-400/70 rounded-lg p-2.5 text-sm" placeholder="Full Name"
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input className="border border-cream-400/70 rounded-lg p-2.5 text-sm" placeholder="10-digit Mobile" maxLength={10}
              value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "") })} required />
            <input className="border border-cream-400/70 rounded-lg p-2.5 text-sm" placeholder="Email (optional)" type="email"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <select className="border border-cream-400/70 rounded-lg p-2.5 text-sm" value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
            </select>
            <button disabled={saving} className="bg-gradient-orange text-white rounded-lg p-2.5 text-sm font-semibold disabled:opacity-60">
              {saving ? "Adding…" : "Send invite"}
            </button>
          </div>
          <p className="text-xs text-ink-muted mt-3">
            Invite bhejne ke baad employee apne number se OTP login karega — automatically uska employee dashboard khul jayega (dobara org banane ka prompt nahi aayega).
          </p>
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
                <td>
                  {u.pending
                    ? <span className="badge badge-warning text-xs">Invited</span>
                    : u.active === false
                      ? <span className="text-danger text-xs">Inactive</span>
                      : <span className="text-ok text-xs">Active</span>}
                </td>
                <td>
                  {u.pending
                    ? <span className="text-ink/30 text-xs">Awaiting login</span>
                    : <Link to={`/admin/employees/${u.id}`} className="text-info text-xs font-medium hover:underline">View →</Link>}
                </td>
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