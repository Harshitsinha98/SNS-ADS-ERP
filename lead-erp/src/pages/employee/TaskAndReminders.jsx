// src/pages/employee/TasksAndReminders.jsx
import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { getLeadFlags } from "../../utils/leadLifecycle";

const TABS = ["All", "New to Call", "Follow-up Today", "Overdue"];

export default function TasksAndReminders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [activeTab, setActiveTab] = useState("All");

  useEffect(() => {
    const q = query(collection(db, "leads"), where("assignedTo", "==", user.uid));
    return onSnapshot(q, snap => setLeads(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [user.uid]);

  const matchesTab = (lead) => {
    const f = getLeadFlags(lead);
    if (f.isClosed) return false; // closed leads don't belong in any tab
    if (activeTab === "All") return true;
    if (activeTab === "New to Call") return f.isNew;
    if (activeTab === "Follow-up Today") return f.isFollowUpToday;
    if (activeTab === "Overdue") return f.isOverdue;
  };

  const filtered = leads.filter(matchesTab);
  const quickPriority = (id, val) => updateDoc(doc(db, "leads", id), { priority: val });
  const quickFollowUp = (id, val) => updateDoc(doc(db, "leads", id), { followUpDate: val });

  return (
    <div className="p-6">
      <div className="flex gap-2 mb-4">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-full text-sm ${activeTab === tab ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
            {tab} ({leads.filter(l => !getLeadFlags(l).isClosed && (tab === "All" || matchesTabName(l, tab))).length})
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map(lead => (
          <div key={lead.id} className="bg-white rounded-xl shadow p-4 flex items-center justify-between">
            <div onClick={() => navigate(`/employee/leads/${lead.id}`)} className="cursor-pointer">
              <p className="font-medium">{lead.name}</p>
              <p className="text-sm text-gray-500">{lead.phone} · {lead.status}</p>
            </div>
            <div className="flex gap-2 items-center">
              <select value={lead.priority || "Medium"} onChange={e => quickPriority(lead.id, e.target.value)} className="border rounded p-1 text-sm">
                {["Low","Medium","High","Urgent"].map(p => <option key={p}>{p}</option>)}
              </select>
              <input type="datetime-local" value={lead.followUpDate?.slice(0,16) || ""} onChange={e => quickFollowUp(lead.id, e.target.value)} className="border rounded p-1 text-sm" />
              <button onClick={() => navigate(`/employee/leads/${lead.id}`)} className="bg-blue-600 text-white px-3 py-1 rounded text-sm">Open</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}