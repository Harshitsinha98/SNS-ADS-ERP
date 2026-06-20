import { useParams, useNavigate } from "react-router-dom";
import Layout from "../../components/Layout";
import Timeline from "../../components/Timeline";
import { useData } from "../../context/DataContext";
import { fmtDate, fmtMoney, daysSince } from "../../utils/helpers";
import { PriorityBadge } from "../../components/StatusLamp";

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { leads, users, reassignLead, blacklistLead } = useData();
  const lead = leads.find((l) => l.id === id);

  if (!lead) return <Layout title="Lead"><p className="text-danger">Lead not found.</p></Layout>;

  const employees = users.filter((u) => u.role === "employee");
  const calls = lead.notes.filter((n) => n.type === "call");
  const totalCallSeconds = calls.reduce((s, c) => s + (c.duration || 0), 0);

  return (
    <Layout title={`Lead — ${lead.name}`}>
      <button onClick={() => navigate(-1)} className="text-sm text-ink/40 mb-4 hover:text-ink">← Back</button>

      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-card border border-paper-line p-5">
          <p className="eyebrow mb-3">Lead profile</p>
          <p className="text-sm mb-1"><span className="text-ink/40">Name</span> · {lead.name}</p>
          <p className="text-sm mb-1 num"><span className="text-ink/40">Phone</span> · {lead.phone}</p>
          <p className="text-sm mb-1"><span className="text-ink/40">Source</span> · {lead.source}</p>
          <p className="text-sm mb-1"><span className="text-ink/40">Requirement</span> · {lead.requirement}</p>
          <p className="text-sm mb-1"><span className="text-ink/40">Value</span> · <span className="num">{fmtMoney(lead.value)}</span></p>
          <p className="text-sm mb-3"><span className="text-ink/40">Priority</span> · <PriorityBadge p={lead.priority} /></p>

          <p className="eyebrow mb-1.5">Assigned to</p>
          <select value={lead.assignedTo || ""} onChange={(e) => reassignLead(lead.id, e.target.value)}
            className="w-full border border-paper-line rounded-md p-2 text-sm mb-3">
            {employees.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>

          {!lead.blacklisted && (
            <button onClick={() => blacklistLead(lead.id)} className="text-xs text-danger hover:underline">Blacklist this lead</button>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-card border border-paper-line p-5">
          <p className="eyebrow mb-3">Status & engagement</p>
          <p className="text-sm mb-1">Current status · <b>{lead.status}</b></p>
          <p className="text-sm mb-1 num">Idle for · {daysSince(lead.lastUpdated)} days</p>
          <p className="text-sm mb-1">Total calls logged · <b>{calls.length}</b></p>
          <p className="text-sm mb-1 num">Total talk-time · <b>{Math.floor(totalCallSeconds / 60)} min</b></p>
          {lead.followUp && <p className="text-sm num">Next follow-up · {fmtDate(lead.followUp)}</p>}
        </div>

        <div className="bg-white rounded-lg shadow-card border border-paper-line p-5">
          <p className="eyebrow mb-3">Follow-up history</p>
          <Timeline entries={lead.notes} />
        </div>
      </div>
    </Layout>
  );
}