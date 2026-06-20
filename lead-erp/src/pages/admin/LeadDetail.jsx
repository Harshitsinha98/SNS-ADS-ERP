import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import Layout from "../../components/Layout";
import { useData } from "../../context/DataContext";
import { useAuth } from "../../context/AuthContext";
import { CheckCircle } from "lucide-react";
import Timeline from "../../components/Timeline"; // Naya Timeline component import kiya

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth(); // role: 'admin' | 'employee'
  const { leads, users, settings, updateLeadStatus, addWorknote, updateFollowUpDate, reassignLead, updateLeadRevenue } = useData();
  
  const lead = leads.find((l) => l.id === id);
  const [noteText, setNoteText] = useState("");
  // By default, admin notes are private. Employees don't see this toggle and their notes are 'team' visibility.
  const [isPrivate, setIsPrivate] = useState(user?.role === 'admin'); 
  const [revenueInput, setRevenueInput] = useState("");

  if (!lead) return <Layout title="Lead"><p className="text-red-500">Lead not found.</p></Layout>;

  const employees = users.filter((u) => u.role === "employee");
  const isOverdue = lead.followUp && new Date(lead.followUp) < new Date() && lead.status !== "Closed-Won";

  const handleAddWorknote = () => {
    if (!noteText.trim()) return;
    
    const visibility = (user.role === 'admin' && isPrivate) ? 'admin_only' : 'team';
    addWorknote(lead.id, noteText, user, { visibility });
    setNoteText("");
  };

  const handleRevenueSave = () => {
      if(revenueInput && !isNaN(revenueInput)){
          updateLeadRevenue(lead.id, revenueInput, user);
          alert("Revenue saved securely.");
          setRevenueInput("");
      }
  }

  // 🛡️ Security Check: Filter timeline based on role
  const visibleTimeline = (lead.notes || []).filter(note => {
      if (user.role === 'admin') return true; // Admin sees everything
      
      // Support dono formats (backend wala raw aur frontend wala metadata object)
      const vis = note.visibility || note.metadata?.visibility;
      return vis !== 'admin_only'; // Employees cannot see admin_only notes
  });

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
            
            {/* 💰 Revenue Entry (Admin Only) - Appears if status is Won */}
             {user.role === 'admin' && lead.status === "Closed-Won" && (
                <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <label className="text-xs font-semibold text-green-700 flex items-center gap-1"><CheckCircle size={14}/> Deal Revenue (₹)</label>
                    <div className="flex gap-2 mt-2">
                    <input type="number" value={revenueInput} onChange={(e) => setRevenueInput(e.target.value)} className="w-full border border-green-300 rounded p-2" placeholder="e.g. 50000" />
                    <button onClick={handleRevenueSave} className="bg-green-600 text-white px-4 rounded hover:bg-green-700 font-medium">Save</button>
                    </div>
                    <p className="text-[10px] text-green-600 mt-1">Stored securely. Employees cannot see this.</p>
                </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow border p-5">
             <h3 className="font-semibold mb-3">Add Worknote</h3>
             <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows="3" className="w-full border rounded p-3 text-sm" placeholder="Client ne kya kaha? Next steps?"></textarea>
             
             {/* 👁️ Visibility Toggle for Admin */}
             {user.role === 'admin' && (
                <div className="flex items-center gap-2 mt-3 mb-1">
                    <input type="checkbox" id="privateNote" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="cursor-pointer" />
                    <label htmlFor="privateNote" className="text-xs font-medium text-gray-600 cursor-pointer">Keep this note private (Admin Only)</label>
                </div>
             )}

             <button onClick={handleAddWorknote} className="w-full bg-blue-600 text-white rounded p-2 mt-3 hover:bg-blue-700 font-medium transition-colors">Save Worknote</button>
          </div>
        </div>

        {/* RIGHT COLUMN: ServiceNow Activity Timeline */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow border p-6 h-[80vh] flex flex-col">
            <h3 className="font-semibold text-lg mb-6 border-b pb-2">Activity Stream</h3>
            
            <div className="flex-1 overflow-y-auto">
              {/* Sirf component pass kar diya! */}
              <Timeline entries={visibleTimeline} />
            </div>
          </div>
        </div>
        
      </div>
    </Layout>  
  );
}