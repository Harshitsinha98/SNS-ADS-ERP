import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { collection, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../../firebase";
import Layout from "../../components/Layout";
import { useData } from "../../context/DataContext";
import { useAuth } from "../../context/AuthContext";
import { CheckCircle, Phone, PhoneOff } from "lucide-react";
import { fmtDuration } from "../../utils/helpers";
import Timeline from "../../components/Timeline";
import WhatsAppConversation from "../../components/WhatsAppConversation";

const PRIORITIES = ["Hot", "Warm", "Cold"];

// A datetime-local input needs "YYYY-MM-DDTHH:mm" — passing a full ISO (...Z)
// string directly showed a blank input, so the conversion is necessary
const toDatetimeLocal = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const {
    leads, users, settings,
    updateLeadStatus, addWorknote, updateFollowUpDate,
    reassignLead, updateLeadRevenue, updatePriority, addNote
  } = useData();

  const orgId = user?.activeOrgId;
  const lead = leads.find((l) => l.id === id);
  const [notes, setNotes] = useState([]);
  const [financial, setFinancial] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [revenueInput, setRevenueInput] = useState("");

  const [callActive, setCallActive] = useState(false);
  const [callStart, setCallStart] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [showWorknoteModal, setShowWorknoteModal] = useState(false);
  const [pendingDuration, setPendingDuration] = useState(0);

  useEffect(() => {
    if (!id || !orgId) return undefined;
    const q = query(collection(db, "organizations", orgId, "leads", id, "notes"), orderBy("at", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Notes listener error:", err));
    return unsub;
  }, [id, orgId]);

  useEffect(() => {
    if (!id || !orgId || user?.role !== "admin") { setFinancial(null); return undefined; }
    const unsub = onSnapshot(doc(db, "organizations", orgId, "leads", id, "private", "data"), (snap) => {
      setFinancial(snap.exists() ? snap.data() : null);
    }, (err) => console.error("Financial listener error:", err));
    return unsub;
  }, [id, orgId, user?.role]);

  useEffect(() => {
    if (!callActive) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - callStart) / 1000)), 1000);
    return () => clearInterval(t);
  }, [callActive, callStart]);

  if (!lead) return <Layout title="Lead"><p className="text-red-500">Lead not found.</p></Layout>;

  const employees = users.filter((u) => u.role === "employee");
  const isOverdue = lead.followUp && new Date(lead.followUp) < new Date() && !["Closed-Won", "Lost"].includes(lead.status);

  const handleAddWorknote = () => {
    if (!noteText.trim()) return;
    const visibility = (user.role === 'admin' && isPrivate) ? 'admin_only' : 'team';
    addWorknote(lead.id, noteText, user, { visibility });
    setNoteText("");
  };

  const handleRevenueSave = () => {
    if (revenueInput && !isNaN(revenueInput)) {
      updateLeadRevenue(lead.id, revenueInput, user);
      alert("Revenue saved securely.");
      setRevenueInput("");
    }
  };

  const startCall = () => {
    setCallStart(Date.now());
    setElapsed(0);
    setCallActive(true);
    window.location.href = `tel:${lead.phone}`;
  };

  const endCall = () => {
    setPendingDuration(elapsed);
    setCallActive(false);
    setShowWorknoteModal(true);
  };

  const saveCallLog = () => {
    const visibility = (user.role === 'admin' && isPrivate) ? 'admin_only' : 'team';
    addNote(lead.id, noteText || "Call completed — no notes added.", "call", {
      duration: pendingDuration,
      authorName: user.name,
      authorId: user.id || user.uid,
      authorRole: user.role,
      visibility
    });
    setShowWorknoteModal(false);
    setNoteText("");
    setPendingDuration(0);
  };

  return (
    <Layout title={`Lead Record: ${lead.name}`}>
      <button onClick={() => navigate(-1)} className="text-sm text-gray-500 mb-4 hover:underline">← Back</button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

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
                <label className="text-xs font-semibold text-gray-500">Priority</label>
                <select value={lead.priority || "Warm"} onChange={(e) => updatePriority(lead.id, e.target.value, user)} className="w-full border rounded p-2 mt-1 bg-gray-50">
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500">Follow-up Date {isOverdue && <span className="text-red-500">(Overdue)</span>}</label>
                <input type="datetime-local" value={toDatetimeLocal(lead.followUp)}
                  onChange={(e) => updateFollowUpDate(lead.id, e.target.value ? new Date(e.target.value).toISOString() : null, user)}
                  className="w-full border rounded p-2 mt-1" />
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

            <div className="mt-6 space-y-2">
              {!callActive ? (
                <button onClick={startCall} className="w-full flex items-center justify-center gap-2 bg-green-600 text-white rounded-md p-2.5 text-sm font-medium hover:bg-green-700 transition">
                  <Phone size={15} /> Start call
                </button>
              ) : (
                <button onClick={endCall} className="w-full flex items-center justify-center gap-2 bg-red-600 text-white rounded-md p-2.5 text-sm font-medium animate-pulse">
                  <PhoneOff size={15} /> End call · {fmtDuration(elapsed)}
                </button>
              )}
            </div>

            {user.role === 'admin' && (
              <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <label className="text-xs font-semibold text-green-700 flex items-center gap-1"><CheckCircle size={14} /> Deal Revenue (₹)</label>
                <div className="flex gap-2 mt-2">
                  <input type="number" value={revenueInput} onChange={(e) => setRevenueInput(e.target.value)} className="w-full border border-green-300 rounded p-2" placeholder={financial?.revenue ? `Current: ₹${financial.revenue}` : "e.g. 50000"} />
                  <button onClick={handleRevenueSave} className="bg-green-600 text-white px-4 rounded hover:bg-green-700 font-medium">Save</button>
                </div>
                <p className="text-[10px] text-green-600 mt-1">Separate admin-only record. Employees have zero DB-level access.</p>
              </div>
            )}
          </div>

          <WhatsAppConversation lead={lead} />

          <div className="bg-white rounded-xl shadow border p-5">
            <h3 className="font-semibold mb-3">Add Worknote</h3>
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows="3" className="w-full border rounded p-3 text-sm" placeholder="What did the client say? Next steps?"></textarea>

            {user.role === 'admin' && (
              <div className="flex items-center gap-2 mt-3 mb-1">
                <input type="checkbox" id="privateNote" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="cursor-pointer" />
                <label htmlFor="privateNote" className="text-xs font-medium text-gray-600 cursor-pointer">Keep this note private (Admin Only)</label>
              </div>
            )}

            <button onClick={handleAddWorknote} className="w-full bg-blue-600 text-white rounded p-2 mt-3 hover:bg-blue-700 font-medium transition-colors">Save Worknote</button>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow border p-6 h-[80vh] flex flex-col">
            <h3 className="font-semibold text-lg mb-6 border-b pb-2">Activity Stream</h3>
            <div className="flex-1 overflow-y-auto">
              <Timeline entries={notes} />
            </div>
          </div>
        </div>

      </div>

      {showWorknoteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Call ended</p>
            <p className="text-sm text-gray-600 mb-4">Duration: <span className="font-mono font-semibold text-green-600">{fmtDuration(pendingDuration)}</span></p>

            <textarea className="w-full border rounded-md p-2 text-sm mb-3" rows="4"
              placeholder="What happened on this call?" value={noteText} onChange={(e) => setNoteText(e.target.value)} autoFocus />

            {user.role === 'admin' && (
              <div className="flex items-center gap-2 mb-3">
                <input type="checkbox" id="privateCallNote" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
                <label htmlFor="privateCallNote" className="text-xs font-medium text-gray-600">Keep this note private</label>
              </div>
            )}

            <button onClick={saveCallLog} className="w-full bg-blue-600 text-white rounded-md p-2.5 text-sm font-medium hover:bg-blue-700">Save call log</button>
          </div>
        </div>
      )}
    </Layout>
  );
}