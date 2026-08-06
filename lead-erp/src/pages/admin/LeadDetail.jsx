import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { collection, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../../firebase";
import Layout from "../../components/Layout";
import { useData } from "../../context/DataContext";
import { useAuth } from "../../context/AuthContext";
import { CheckCircle, Phone, PhoneOff, PhoneCall, Loader2, Trash2, AlertTriangle, X } from "lucide-react";
import { fmtDuration } from "../../utils/helpers";
import { useBridgeCall } from "../../hooks/useBridgeCall";
import Timeline from "../../components/Timeline";
import WhatsAppConversation from "../../components/WhatsAppConversation";
import ChatSessionControls from "../../components/ChatSessionControls";
import FollowUpTaskControls from "../../components/FollowUpTaskControls";

const PRIORITIES = ["Hot", "Warm", "Cold"];

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const {
    leads, users, settings,
    updateLeadStatus, addWorknote,
    reassignLead, updateLeadRevenue, updatePriority, addNote, deleteLead,
  } = useData();

  const orgId = user?.activeOrgId;
  const isOrgAdmin = user?.activeOrgRole === "admin" || user?.activeOrgRole === "owner";
  const lead = leads.find((l) => l.id === id);
  const [notes, setNotes] = useState([]);
  const [financial, setFinancial] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [revenueInput, setRevenueInput] = useState("");
  const [revenueSaving, setRevenueSaving] = useState(false);
  const [revenueMessage, setRevenueMessage] = useState("");

  const [callActive, setCallActive] = useState(false);
  const [callStart, setCallStart] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [showWorknoteModal, setShowWorknoteModal] = useState(false);
  const [pendingDuration, setPendingDuration] = useState(0);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    if (!id || !orgId) return undefined;
    const q = query(collection(db, "organizations", orgId, "leads", id, "notes"), orderBy("at", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Notes listener error:", err));
    return unsub;
  }, [id, orgId]);

  useEffect(() => {
    if (!id || !orgId || !isOrgAdmin) { setFinancial(null); return undefined; }
    const unsub = onSnapshot(doc(db, "organizations", orgId, "leads", id, "private", "data"), (snap) => {
      setFinancial(snap.exists() ? snap.data() : null);
    }, (err) => console.error("Financial listener error:", err));
    return unsub;
  }, [id, orgId, isOrgAdmin]);

  useEffect(() => {
    if (!callActive) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - callStart) / 1000)), 1000);
    return () => clearInterval(t);
  }, [callActive, callStart]);

  if (!lead) return <Layout title="Lead"><p className="text-red-500">Lead not found.</p></Layout>;

  const employees = users.filter((u) => u.role === "employee");

  const handleAddWorknote = () => {
    if (!noteText.trim()) return;
    const visibility = isOrgAdmin && isPrivate ? 'admin_only' : 'team';
    addWorknote(lead.id, noteText, user, { visibility });
    setNoteText("");
  };

  const handleRevenueSave = async () => {
    const revenue = Number(revenueInput);
    if (!revenueInput.trim() || !Number.isFinite(revenue) || revenue < 0) {
      setRevenueMessage("Enter a valid revenue amount of ₹0 or more.");
      return;
    }

    setRevenueSaving(true);
    setRevenueMessage("");
    try {
      await updateLeadRevenue(lead.id, revenue, user);
      setRevenueInput("");
      setRevenueMessage("Revenue saved securely.");
    } catch (error) {
      console.error("Revenue save error:", error);
      setRevenueMessage("Revenue could not be saved. Please try again.");
    } finally {
      setRevenueSaving(false);
    }
  };

  const handleDeleteLead = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteLead(lead.id);
      navigate("/admin/leads");
    } catch (error) {
      console.error("Delete lead error:", error);
      setDeleteError(error.message || "Could not delete this lead. Please try again.");
      setDeleting(false);
    }
  };

  const closeDeleteModal = () => {
    if (deleting) return;
    setShowDeleteModal(false);
    setDeleteConfirmText("");
    setDeleteError("");
  };

  const startCall = () => {
    setCallStart(Date.now());
    setElapsed(0);
    setCallActive(true);
    window.location.href = `tel:${lead.phone}`;
  };

  const {
    bridgeState, bridgeError, bridgeDuration, bridgeRecording,
    startBridgeCall, resetBridgeCall,
  } = useBridgeCall();

  const handleBridgeCall = async () => {
    const result = await startBridgeCall(lead);
    if (result?.fallback) startCall();
  };

  const endCall = () => {
    setPendingDuration(elapsed);
    setCallActive(false);
    setShowWorknoteModal(true);
  };

  const saveCallLog = () => {
    const visibility = isOrgAdmin && isPrivate ? 'admin_only' : 'team';
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

              <FollowUpTaskControls lead={lead} />

              {isOrgAdmin && (
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
              {bridgeState !== "idle" && bridgeState !== "completed" && bridgeState !== "failed" && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800 flex items-center gap-2">
                  <Loader2 size={15} className="animate-spin" />
                  {bridgeState === "initiating" && "Connecting to your phone..."}
                  {bridgeState === "ringing" && "Ringing your phone — pick up!"}
                  {bridgeState === "in-progress" && "Connected! Talking to lead..."}
                </div>
              )}
              {bridgeState === "completed" && (
                <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-800">
                  Bridge call done ({fmtDuration(bridgeDuration)}).
                  {bridgeRecording && <a href={bridgeRecording} target="_blank" rel="noreferrer" className="ml-2 underline font-medium">Play recording</a>}
                  <button onClick={resetBridgeCall} className="ml-2 text-xs underline">Dismiss</button>
                </div>
              )}
              {bridgeState === "failed" && bridgeError && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
                  {bridgeError} <button onClick={resetBridgeCall} className="ml-2 text-xs underline">Dismiss</button>
                </div>
              )}
              {!callActive && bridgeState === "idle" ? (
                <div className="space-y-2">
                  <button onClick={handleBridgeCall} className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white rounded-md p-2.5 text-sm font-medium hover:bg-blue-700 transition">
                    <PhoneCall size={15} /> Bridge call (masked + recorded)
                  </button>
                  <button onClick={startCall} className="w-full flex items-center justify-center gap-2 bg-green-600 text-white rounded-md p-2.5 text-sm font-medium hover:bg-green-700 transition">
                    <Phone size={15} /> Direct call
                  </button>
                </div>
              ) : callActive ? (
                <button onClick={endCall} className="w-full flex items-center justify-center gap-2 bg-red-600 text-white rounded-md p-2.5 text-sm font-medium animate-pulse">
                  <PhoneOff size={15} /> End call · {fmtDuration(elapsed)}
                </button>
              ) : null}
            </div>

            {isOrgAdmin && (
              <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <label className="text-xs font-semibold text-green-700 flex items-center gap-1"><CheckCircle size={14} /> Deal Revenue (₹)</label>
                <div className="flex gap-2 mt-2">
                  <input type="number" min="0" step="1" value={revenueInput} onChange={(e) => setRevenueInput(e.target.value)} className="w-full border border-green-300 rounded p-2" placeholder={financial?.revenue != null ? `Current: ₹${Number(financial.revenue).toLocaleString("en-IN")}` : "e.g. 50000"} />
                  <button onClick={handleRevenueSave} disabled={revenueSaving} className="bg-green-600 text-white px-4 rounded hover:bg-green-700 disabled:opacity-60 font-medium">
                    {revenueSaving ? "Saving…" : "Save"}
                  </button>
                </div>
                {financial?.revenue != null && <p className="text-xs font-medium text-green-800 mt-2">Saved revenue: ₹{Number(financial.revenue).toLocaleString("en-IN")}</p>}
                {revenueMessage && <p className="text-xs text-green-700 mt-2" role="status">{revenueMessage}</p>}
                <p className="text-[10px] text-green-600 mt-1">Separate admin-only record. Employees have zero DB-level access.</p>
              </div>
            )}

            {isOrgAdmin && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="w-full flex items-center justify-center gap-2 text-red-600 border border-red-200 rounded-md p-2.5 text-sm font-medium hover:bg-red-50 transition"
                >
                  <Trash2 size={15} /> Delete Lead
                </button>
              </div>
            )}
          </div>

          <WhatsAppConversation lead={lead} />

          <ChatSessionControls lead={lead} orgId={orgId} onUpdate={() => window.location.reload()} />

          <div className="bg-white rounded-xl shadow border p-5">
            <h3 className="font-semibold mb-3">Add Worknote</h3>
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows="3" className="w-full border rounded p-3 text-sm" placeholder="What did the client say? Next steps?"></textarea>

            {isOrgAdmin && (
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

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-red-100 max-w-md w-full p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                <AlertTriangle className="text-red-600" size={22} />
              </div>
              <button onClick={closeDeleteModal} disabled={deleting} className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
                <X size={20} />
              </button>
            </div>

            <h3 className="font-bold text-lg text-gray-900 mb-1">Delete "{lead.name}"?</h3>
            <p className="text-sm text-red-600 font-semibold mb-3">This action is permanent and cannot be undone.</p>

            <p className="text-sm text-gray-600 mb-2">Deleting this lead will permanently remove:</p>
            <ul className="space-y-1.5 mb-4 text-sm text-gray-600">
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" /> All worknotes, call logs, and activity history</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" /> The full WhatsApp conversation with this lead</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" /> Any recorded deal revenue on this lead</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" /> Its open follow-up task, if any</li>
            </ul>

            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <label className="block text-xs font-semibold text-red-700 mb-1.5">
                Type <span className="font-mono">DELETE</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                autoFocus
                disabled={deleting}
                placeholder="DELETE"
                className="w-full border border-red-300 rounded-md p-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-60"
              />
            </div>

            {deleteError && <p className="text-xs text-red-600 mb-3">{deleteError}</p>}

            <div className="flex gap-3">
              <button onClick={closeDeleteModal} disabled={deleting} className="flex-1 border border-gray-200 text-gray-700 rounded-md p-2.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-60">
                Cancel
              </button>
              <button
                onClick={handleDeleteLead}
                disabled={deleting || deleteConfirmText.trim().toUpperCase() !== "DELETE"}
                className="flex-1 bg-red-600 text-white rounded-md p-2.5 text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {deleting ? <><Loader2 size={15} className="animate-spin" /> Deleting…</> : <><Trash2 size={15} /> Permanently delete</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}