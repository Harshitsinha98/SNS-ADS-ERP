// src/pages/employee/MyLeads.jsx
import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import { getLeadCategory } from "../../utils/leadLifecycle";

const TABS = ["All", "New to Call", "Follow-up Today", "Overdue"];

export default function MyLeads() {
  const { user } = useAuth();
  const [leads, setLeads] = useState([]);
  const [activeTab, setActiveTab] = useState("All");

  useEffect(() => {
    const q = query(collection(db, "leads"), where("assignedTo", "==", user.uid));
    const unsub = onSnapshot(q, snap => setLeads(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, [user.uid]);

  const filtered = leads.filter(l => activeTab === "All" || getLeadCategory(l) === activeTab);

  return (
    <div className="p-6">
      <div className="flex gap-2 mb-4">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-full text-sm ${activeTab === tab ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
            {tab} {tab !== "All" && `(${leads.filter(l => getLeadCategory(l) === tab).length})`}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {filtered.map(lead => <LeadRow key={lead.id} lead={lead} />)}
      </div>
    </div>
  );
}