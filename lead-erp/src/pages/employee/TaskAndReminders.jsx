import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useData } from "../../context/DataContext";
import { getLeadFlags } from "../../utils/leadLifecycle";

const TABS = ["All", "New to Call", "Follow-up Today", "Overdue"];

export default function TasksAndReminders() {
  const { user } = useAuth();
  const { leads, updatePriority, updateFollowUpDate } = useData();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("All");

  const matchesTab = (lead, tab = activeTab) => {
    const flags = getLeadFlags(lead);
    if (flags.isClosed) return false;
    if (tab === "All") return true;
    if (tab === "New to Call") return flags.isNew;
    if (tab === "Follow-up Today") return flags.isFollowUpToday;
    return flags.isOverdue;
  };

  const filtered = leads.filter((lead) => matchesTab(lead));
  const quickPriority = (id, value) => updatePriority(id, value, user);
  const quickFollowUp = (id, value) => updateFollowUpDate(id, value, user);

  return (
    <div className="p-6">
      <div className="flex gap-2 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-full text-sm ${activeTab === tab ? "bg-blue-600 text-white" : "bg-gray-100"}`}
          >
            {tab} ({leads.filter((lead) => matchesTab(lead, tab)).length})
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map((lead) => (
          <div key={lead.id} className="bg-white rounded-xl shadow p-4 flex items-center justify-between">
            <div onClick={() => navigate(`/employee/leads/${lead.id}`)} className="cursor-pointer">
              <p className="font-medium">{lead.name}</p>
              <p className="text-sm text-gray-500">{lead.phone} · {lead.status}</p>
            </div>
            <div className="flex gap-2 items-center">
              <select
                value={lead.priority || "Medium"}
                onChange={(event) => quickPriority(lead.id, event.target.value)}
                className="border rounded p-1 text-sm"
              >
                {["Low", "Medium", "High", "Urgent"].map((priority) => <option key={priority}>{priority}</option>)}
              </select>
              <input
                type="datetime-local"
                value={lead.followUp?.slice(0, 16) || ""}
                onChange={(event) => quickFollowUp(lead.id, event.target.value)}
                className="border rounded p-1 text-sm"
              />
              <button onClick={() => navigate(`/employee/leads/${lead.id}`)} className="bg-blue-600 text-white px-3 py-1 rounded text-sm">Open</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
