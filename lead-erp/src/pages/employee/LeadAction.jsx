import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import Layout from "../../components/Layout";
import Timeline from "../../components/Timeline";
import { useData } from "../../context/DataContext";
import { useAuth } from "../../context/AuthContext";
import { fmtDate, fmtDuration, toWaNumber } from "../../utils/helpers";
import { Phone, PhoneOff, MessageCircle } from "lucide-react";
import FollowUpTaskControls from "../../components/FollowUpTaskControls";

export default function LeadAction() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { leads, settings, updateLeadStatus, addNote, addWorknote } = useData();
  const orgId = user?.activeOrgId;
  const currentUserId = user?.uid || user?.id;
  const lead = leads.find((l) => l.id === id);

  const [notes, setNotes] = useState([]);
  const [note, setNote] = useState("");

  const [callActive, setCallActive] = useState(false);
  const [callStart, setCallStart] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [showWorknoteModal, setShowWorknoteModal] = useState(false);
  const [pendingDuration, setPendingDuration] = useState(0);
  const [worknote, setWorknote] = useState("");

  useEffect(() => {
    if (!id || !orgId) return undefined;
    const worknotesQuery = query(
      collection(db, "organizations", orgId, "leads", id, "notes"),
      where("visibility", "==", "team"),
      where("type", "==", "worknote")
    );
    const unsub = onSnapshot(worknotesQuery, (snap) => {
      setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Team worknotes listener error:", err));
    return unsub;
  }, [id, orgId]);

  useEffect(() => {
    if (!callActive) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - callStart) / 1000)), 1000);
    return () => clearInterval(t);
  }, [callActive, callStart]);

  if (!lead || lead.assignedTo !== currentUserId)
    return <Layout title="Lead"><p className="text-danger">Access denied or lead not found.</p></Layout>;

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
    addNote(lead.id, worknote || "Call completed — no notes added.", "call", {
      duration: pendingDuration,
      authorId: currentUserId,
      authorName: user.name,
      authorRole: user.role,
      visibility: "team",
    });
    setShowWorknoteModal(false);
    setWorknote("");
    setPendingDuration(0);
  };

  const setStatus = (status) => updateLeadStatus(lead.id, status, user);

  const saveNote = () => {
    if (!note.trim()) return;
    addWorknote(lead.id, note, user, { visibility: "team" });
    setNote("");
  };

  const quickWhatsApp = () => {
    addNote(lead.id, "Opened WhatsApp chat from lead page", "whatsapp", {
      authorName: user.name,
      authorId: currentUserId,
      authorRole: user.role,
      visibility: "team",
    });
    window.open(`https://wa.me/${toWaNumber(lead.phone)}`, "_blank");
  };

  return (
    <Layout title="Lead Action Interface">
      <button onClick={() => navigate(-1)} className="text-sm text-ink/40 mb-4 hover:text-ink">← Back</button>

      {/* FIX: grid-cols-3 → grid-cols-1 md:grid-cols-3. Mobile pe ab niche stack
          hota hai, tablet+ (md, ≥768px) se side-by-side 3 columns. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-card border border-paper-line p-5">
          <p className="eyebrow mb-3">Client profile</p>
          <p className="text-sm mb-1"><span className="text-ink/40">Name</span> · {lead.name}</p>
          <p className="text-sm mb-1 num"><span className="text-ink/40">Phone</span> · {lead.phone}</p>
          <p className="text-sm mb-1"><span className="text-ink/40">Source</span> · {lead.source}</p>
          <p className="text-sm mb-4"><span className="text-ink/40">Requirement</span> · {lead.requirement}</p>

          {!callActive ? (
            <button onClick={startCall} className="w-full flex items-center justify-center gap-2 bg-success-600 text-white rounded-md p-2.5 text-sm font-medium hover:bg-success-700 transition-colors">
              <Phone size={15} /> Start call
            </button>
          ) : (
            <button onClick={endCall} className="w-full flex items-center justify-center gap-2 bg-danger-600 text-white rounded-md p-2.5 text-sm font-medium animate-pulse">
              <PhoneOff size={15} /> End call · {fmtDuration(elapsed)}
            </button>
          )}
          <button onClick={quickWhatsApp} className="w-full flex items-center justify-center gap-2 bg-success-50 text-success-700 border border-success-200 rounded-md p-2.5 text-sm font-medium mt-2 hover:bg-success-100 transition-colors">
            <MessageCircle size={15} /> Open WhatsApp
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-card border border-paper-line p-5">
          <p className="eyebrow mb-2">Status</p>
          <select value={lead.status} onChange={(e) => setStatus(e.target.value)}
            className="w-full border border-paper-line rounded-md p-2 text-sm mb-2">
            {settings.statuses.map((s) => <option key={s}>{s}</option>)}
          </select>
          <p className="text-xs text-ink/35 num mb-4">Last updated: {fmtDate(lead.lastUpdated)}</p>

          <FollowUpTaskControls lead={lead} compact />

          <p className="eyebrow mt-5 mb-2">Add work note</p>
          <textarea className="w-full border border-paper-line rounded-md p-2 text-sm mb-2" rows="3"
            placeholder="Log conversation summary…" value={note} onChange={(e) => setNote(e.target.value)} />
          <button onClick={saveNote} className="w-full bg-cream-100 text-ink border border-cream-300 rounded-md p-2 text-sm hover:bg-cream-200 transition-colors">Save note</button>
        </div>

        <div className="bg-white rounded-lg shadow-card border border-paper-line p-5">
          <p className="eyebrow mb-3">Team work notes</p>
          <Timeline entries={notes} />
        </div>
      </div>

      {showWorknoteModal && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm">
            <p className="eyebrow mb-1">Call ended</p>
            <p className="text-sm text-ink-soft mb-4">Duration: <span className="num font-semibold text-success-700">{fmtDuration(pendingDuration)}</span></p>
            <textarea className="w-full border border-paper-line rounded-md p-2 text-sm mb-3" rows="4"
              placeholder="What happened on this call?" value={worknote} onChange={(e) => setWorknote(e.target.value)} autoFocus />
            <button onClick={saveCallLog} className="w-full bg-ink text-white rounded-md p-2.5 text-sm font-medium">Save call log</button>
          </div>
        </div>
      )}
    </Layout>
  );
}