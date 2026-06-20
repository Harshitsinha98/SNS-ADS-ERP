import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import Timeline from "../../components/Timeline";
import { useData } from "../../context/DataContext";
import { useAuth } from "../../context/AuthContext";
import { fmtDate, fmtDuration } from "../../utils/helpers";
import { Phone, PhoneOff, MessageCircle } from "lucide-react";

export default function LeadAction() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { leads, settings, updateLead, addNote } = useData();
  const lead = leads.find((l) => l.id === id);

  const [note, setNote] = useState("");
  const [followDate, setFollowDate] = useState("");

  const [callActive, setCallActive] = useState(false);
  const [callStart, setCallStart] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [showWorknoteModal, setShowWorknoteModal] = useState(false);
  const [pendingDuration, setPendingDuration] = useState(0);
  const [worknote, setWorknote] = useState("");

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
    addNote(lead.id, worknote || "Call completed — no notes added.", "call", { duration: pendingDuration, by: user.name });
    setShowWorknoteModal(false);
    setWorknote("");
    setPendingDuration(0);
  };

  const setStatus = (status) => updateLead(lead.id, { status });

  const scheduleFollowUp = () => {
    if (followDate) {
      updateLead(lead.id, { status: "Follow-up", followUp: new Date(followDate).toISOString() });
      addNote(lead.id, `Follow-up scheduled for ${fmtDate(new Date(followDate).toISOString())}`, "status");
    }
  };

  const quickWhatsApp = () => {
    addNote(lead.id, "Opened WhatsApp chat from lead page", "whatsapp");
    window.open(`https://wa.me/91${lead.phone}`, "_blank");
  };

  return (
    <Layout title="Lead Action Interface">
      <button onClick={() => navigate(-1)} className="text-sm text-ink/40 mb-4 hover:text-ink">← Back</button>

      <div className="grid grid-cols-3 gap-6">
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
          <button onClick={() => { if (note) { addNote(lead.id, note); setNote(""); } }}
            className="w-full bg-paper border border-paper-line rounded-md p-2 text-sm">Save note</button>
        </div>

        <div className="bg-white rounded-lg shadow-card border border-paper-line p-5">
          <p className="eyebrow mb-3">Follow-up history</p>
          <Timeline entries={lead.notes} />
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