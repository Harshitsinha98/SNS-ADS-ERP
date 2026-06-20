import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { useData } from "../../context/DataContext";
import { useAuth } from "../../context/AuthContext";
import { isToday, fmtDate } from "../../utils/helpers";
import { StatusLamp } from "../../components/StatusLamp";

export default function Tasks() {
  const { user } = useAuth();
  const { leads } = useData();
  const myLeads = leads.filter((l) => l.assignedTo === user.id && !l.blacklisted);
  const callToday = myLeads.filter((l) => isToday(l.followUp) || (l.followUp && new Date(l.followUp) <= new Date()));

  return (
    <Layout title="Smart Task & Reminder System">
      <div className="bg-white rounded-lg shadow-card border border-paper-line p-5">
        <p className="eyebrow mb-3">The "Call Today" queue ({callToday.length})</p>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ink/40 border-b border-paper-line">
            <th className="py-2 font-medium">Name</th><th className="font-medium">Phone</th>
            <th className="font-medium">Scheduled</th><th className="font-medium">Status</th><th></th>
          </tr></thead>
          <tbody>
            {callToday.map((l) => (
              <tr key={l.id} className="border-b border-paper-line last:border-0">
                <td className="py-2 font-medium">{l.name}</td>
                <td className="num">{l.phone}</td>
                <td className="num text-xs">{fmtDate(l.followUp)}</td>
                <td><StatusLamp status={l.status} /></td>
                <td><Link to={`/app/lead/${l.id}`} className="text-info text-xs hover:underline">Open</Link></td>
              </tr>
            ))}
            {callToday.length === 0 && <tr><td colSpan="5" className="text-ink/40 py-4">No calls scheduled.</td></tr>}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}