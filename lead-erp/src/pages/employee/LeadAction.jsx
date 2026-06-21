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

export default function LeadAction() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { leads, settings, updateLeadStatus, updateFollowUpDate, addNote, addWorknote } = useData();
  const lead = leads.find((l) => l.id === id);

  const [notes, setNotes] = useState([]);
  const [note, setNote] = useState("");
  const [followDate, setFollowDate] = useState("");

  const [callActive, setCallActive] = useState(false);
  const [callStart, setCallStart] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [showWorknoteModal, setShowWorknoteModal] = useState(false);
  const [pendingDuration, setPendingDuration] = useState(0);
  const [worknote, setWorknote] = useState("");

  useEffect(() => {
    if (!id) return;
    const q = query(
      collection(db, "leads", id, "notes"),
      where("visibility", "!=", "admin_only")
    );
    const unsub = onSnapshot(q, (snap) => {
      setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Notes listener error:", err));
    return unsub;
  }, [id]);

  useEffect(() => {
    if (!callActive) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - callStart) / 1000)), 1000);
    return () => clearInterval(t);
  }, [callActive, callStart]);

  if (!lead || lead.assignedTo !== user.id)
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
      authorId: user.id || user.uid,
      authorName: user.name,
      authorRole: user.role,
      visibility: "team",
    });
    setShowWorknoteModal(false);
    setWorknote("");
    setPendingDuration(0);
  };

  const setStatus = (status) => updateLeadStatus(lead.id, status, user);

  const scheduleFollowUp = () => {
    if (!followDate) return;
    updateFollowUpDate(lead.id, new Date(followDate).toISOString(), user);
    updateLeadStatus(lead.id, "Follow-up", user);
    setFollowDate("");
  };

  const saveNote = () => {
    if (!note.trim()) return;
    addWorknote(lead.id, note, user, { visibility: "team" });
    setNote("");
  };

  const quickWhatsApp = () => {
    addNote(lead.id, "Opened WhatsApp chat from lead page", "whatsapp", {
      authorName: user.name,
      authorId: user.id || user.uid,
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
            <button onClick={startCall} className="w-full flex items-center justify-center gap-2 bg-ok text-white rounded-md p-2.5 text-sm font-medium">
              <Phone size={15} /> Start call
            </button>
          ) : (
            <button onClick={endCall} className="w-full flex items-center justify-center gap-2 bg-danger text-white rounded-md p-2.5 text-sm font-medium animate-pulse">
              <PhoneOff size={15} /> End call · {fmtDuration(elapsed)}
            </button>
          )}
          <button onClick={quickWhatsApp} className="w-full flex items-center justify-center gap-2 bg-info-soft text-info rounded-md p-2.5 text-sm font-medium mt-2">
            <MessageCircle size={15} /> WhatsApp
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-card border border-paper-line p-5">
          <p className="eyebrow mb-2">Status</p>
          <select value={lead.status} onChange={(e) => setStatus(e.target.value)}
            className="w-full border border-paper-line rounded-md p-2 text-sm mb-2">
            {settings.statuses.map((s) => <option key={s}>{s}</option>)}
          </select>
          <p className="text-xs text-ink/35 num mb-4">Last updated: {fmtDate(lead.lastUpdated)}</p>

          <p className="eyebrow mb-2">Schedule follow-up</p>
          <input type="datetime-local" className="w-full border border-paper-line rounded-md p-2 text-sm mb-2"
            value={followDate} onChange={(e) => setFollowDate(e.target.value)} />
          <button onClick={scheduleFollowUp} className="w-full bg-ink text-white rounded-md p-2 text-sm">Schedule</button>
          {lead.followUp && <p className="text-xs text-signal num mt-2">Next follow-up: {fmtDate(lead.followUp)}</p>}

          <p className="eyebrow mt-5 mb-2">Add work note</p>
          <textarea className="w-full border border-paper-line rounded-md p-2 text-sm mb-2" rows="3"
            placeholder="Log conversation summary…" value={note} onChange={(e) => setNote(e.target.value)} />
          <button onClick={saveNote} className="w-full bg-paper border border-paper-line rounded-md p-2 text-sm">Save note</button>
        </div>

        <div className="bg-white rounded-lg shadow-card border border-paper-line p-5">
          <p className="eyebrow mb-3">Follow-up history</p>
          <Timeline entries={notes} />
        </div>
      </div>

      {showWorknoteModal && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm">
            <p className="eyebrow mb-1">Call ended</p>
            <p className="text-sm text-ink/50 mb-4">Duration: <span className="num font-semibold text-ok">{fmtDuration(pendingDuration)}</span></p>
            <textarea className="w-full border border-paper-line rounded-md p-2 text-sm mb-3" rows="4"
              placeholder="What happened on this call?" value={worknote} onChange={(e) => setWorknote(e.target.value)} autoFocus />
            <button onClick={saveCallLog} className="w-full bg-ink text-white rounded-md p-2.5 text-sm font-medium">Save call log</button>
          </div>
        </div>
      )}
    </Layout>
  );
}