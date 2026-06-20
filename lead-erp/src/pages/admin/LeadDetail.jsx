import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import Layout from "../../components/Layout";
import { useData } from "../../context/DataContext";
import { useAuth } from "../../context/AuthContext";
import { Clock, MessageSquare, RefreshCw, UserCheck } from "lucide-react";

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth(); // Current logged in user (Admin/Emp)
  const { leads, users, settings, updateLeadStatus, addWorknote, updateFollowUpDate, reassignLead } = useData();
  
  const lead = leads.find((l) => l.id === id);
  const [noteText, setNoteText] = useState("");
  
  if (!lead) return <Layout title="Lead"><p className="text-red-500">Lead not found.</p></Layout>;

  const employees = users.filter((u) => u.role === "employee");
  const isOverdue = lead.followUp && new Date(lead.followUp) < new Date() && lead.status !== "Closed-Won";

  const handleAddWorknote = () => {
    if (!noteText.trim()) return;
    addWorknote(lead.id, noteText, user);
    setNoteText("");
  };

  // Activity Icon Picker
  const getIcon = (type) => {
    if (type === 'worknote') return <MessageSquare size={16} className="text-blue-500" />;
    if (type === 'status_change') return <RefreshCw size={16} className="text-orange-500" />;
    if (type === 'assignment') return <UserCheck size={16} className="text-green-500" />;
    return <Clock size={16} className="text-gray-500" />;
  };

  return (
    <Layout title={`Lead Record: ${lead.name}`}>
      <button onClick={() => navigate(-1)} className="text-sm text-gray-500 mb-4 hover:underline">← Back</button>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: Controls & Details */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl shadow border p-5">
            <h2 className="text-lg font-bold">{lead.name}</h2>
            <p className="text-sm text-gray-500 font-mono mt-1">{lead.phone} • {lead.source}</p>
            
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500">Current Status</label>
                <select value={lead.status} onChange={(e) => updateLeadStatus(lead.id, e.target.value, user)} className="w-full border rounded p-2 mt-1 bg-gray-50">
                  {settings.statuses.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500">Follow-up Date {isOverdue && <span className="text-red-500">(Overdue)</span>}</label>
                <input type="datetime-local" value={lead.followUp || ""} onChange={(e) => updateFollowUpDate(lead.id, e.target.value, user)} className="w-full border rounded p-2 mt-1" />
              </div>

              {user.role === "admin" && (
                <div>
                  <label className="text-xs font-semibold text-gray-500">Assigned To</label>
                  <select value={lead.assignedTo || ""} onChange={(e) => {
                    const emp = employees.find(x => x.id === e.target.value);
                    if (emp) reassignLead(lead.id, emp.id, emp.name, user);
                  }} className="w-full border rounded p-2 mt-1">
                    <option value="">Unassigned</option>
                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow border p-5">
             <h3 className="font-semibold mb-3">Add Worknote</h3>
             <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows="3" className="w-full border rounded p-3 text-sm" placeholder="Client ne kya kaha? Next steps?"></textarea>
             <button onClick={handleAddWorknote} className="w-full bg-blue-600 text-white rounded p-2 mt-2 hover:bg-blue-700">Save Worknote</button>
          </div>
        </div>

        {/* RIGHT COLUMN: ServiceNow Activity Timeline */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow border p-6 h-[80vh] flex flex-col">
            <h3 className="font-semibold text-lg mb-6 border-b pb-2">Activity Stream</h3>
            
            <div className="flex-1 overflow-y-auto space-y-6 pr-2">
              {(lead.notes || []).map((act, index) => (
                <div key={index} className="flex gap-4">
                  <div className="mt-1 bg-gray-100 p-2 rounded-full h-8 w-8 flex items-center justify-center">
                    {getIcon(act.type)}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 flex-1 border">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-sm font-semibold text-gray-800">{act.authorName} <span className="text-xs text-gray-400 font-normal">({act.authorRole})</span></span>
                      <span className="text-xs text-gray-400">{new Date(act.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{act.text}</p>
                  </div>
                </div>
              ))}
              
              {(!lead.notes || lead.notes.length === 0) && (
                <p className="text-gray-400 text-sm text-center mt-10">No activity logged yet. Start by adding a worknote.</p>
              )}
            </div>
          </div>
        </div>
        
      </div>
    </Layout>  
  );
}