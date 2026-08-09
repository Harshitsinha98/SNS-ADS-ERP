/**
 * Platform admin page — review, approve, and reject voice number requests.
 * Wrapped in PlatformShell (sidebar + auth gate). Uses shared platformApi pattern.
 */

import { useEffect, useState } from "react";
import PlatformShell from "./components/PlatformShell";
import { auth } from "../../firebase";
import {
  Phone, CheckCircle2, XCircle, Loader2, FileText, ExternalLink,
} from "lucide-react";

const BASE = import.meta.env.VITE_BACKEND_URL || "";

// Uses the same token pattern as platformApi.js but for these specific endpoints
async function platformGet(path) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function platformPost(path, body) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function formatDate(iso) {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_COLORS = {
  pending_review: "bg-yellow-100 text-yellow-700",
  compliance_approved: "bg-blue-100 text-blue-700",
  rejected: "bg-red-100 text-red-700",
};

export default function VoiceRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionBusy, setActionBusy] = useState(null);
  const [approveForm, setApproveForm] = useState(null);
  const [rejectForm, setRejectForm] = useState(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [reasonInput, setReasonInput] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const d = await platformGet("/api/v1/platform/voice-requests");
      setRequests(d.requests || []);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (numberId) => {
    if (!phoneInput.trim()) { setMsg("Enter the phone number to assign."); return; }
    setActionBusy(numberId);
    setMsg("");
    try {
      await platformPost("/api/v1/platform/voice-approve", { numberId, phoneNumber: phoneInput.trim() });
      setApproveForm(null);
      setPhoneInput("");
      setMsg("Approved and activated.");
      load();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setActionBusy(null);
    }
  };

  const handleReject = async (numberId) => {
    setActionBusy(numberId);
    setMsg("");
    try {
      await platformPost("/api/v1/platform/voice-reject", { numberId, reason: reasonInput || "Documents could not be verified." });
      setRejectForm(null);
      setReasonInput("");
      setMsg("Request rejected.");
      load();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <PlatformShell title="Voice Requests">
      <div className="max-w-4xl mx-auto">
        {msg && <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700 mb-4">{msg}</div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">{error}</div>}

        {loading && (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-orange-500" /></div>
        )}

        {!loading && requests.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Phone size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No pending voice number requests.</p>
          </div>
        )}

        {!loading && requests.length > 0 && (
          <div className="space-y-4">
            {requests.map((r) => (
              <div key={r.id} className="bg-white border rounded-xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">{r.businessName || "\u2014"}</p>
                    <p className="text-xs text-gray-500">Org: {r.orgId} \u00B7 Submitted: {formatDate(r.createdAt)}</p>
                    <p className="text-xs text-gray-500">Reg #: {r.registrationNumber || "\u2014"} \u00B7 Email: {r.email || "\u2014"}</p>
                    {r.address && <p className="text-xs text-gray-400">{r.address}, {r.city} {r.state} {r.postalCode}</p>}
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status] || "bg-gray-100 text-gray-600"}`}>
                    {r.status?.replace(/_/g, " ")}
                  </span>
                </div>

                {/* Document links */}
                <div className="flex flex-wrap gap-3 mb-3">
                  {r.registrationDocUrl && (
                    <a href={r.registrationDocUrl} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded">
                      <FileText size={12} /> Registration Cert <ExternalLink size={10} />
                    </a>
                  )}
                  {r.gstDocUrl && (
                    <a href={r.gstDocUrl} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded">
                      <FileText size={12} /> GST Cert <ExternalLink size={10} />
                    </a>
                  )}
                  {!r.registrationDocUrl && !r.gstDocUrl && (
                    <span className="text-xs text-gray-400">No documents uploaded (R2 not configured at submission time)</span>
                  )}
                </div>

                {/* Rejection reason */}
                {r.rejectionReason && (
                  <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1 mb-3">Previous rejection: {r.rejectionReason}</p>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  {approveForm?.numberId === r.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        placeholder="918012345678 (Plivo number)"
                        className="border rounded-lg px-3 py-1.5 text-sm flex-1"
                      />
                      <button
                        onClick={() => handleApprove(r.id)}
                        disabled={actionBusy === r.id}
                        className="bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                      >
                        {actionBusy === r.id ? "..." : "Confirm Approve"}
                      </button>
                      <button onClick={() => setApproveForm(null)} className="text-xs text-gray-500">Cancel</button>
                    </div>
                  ) : rejectForm?.numberId === r.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        value={reasonInput}
                        onChange={(e) => setReasonInput(e.target.value)}
                        placeholder="Rejection reason..."
                        className="border rounded-lg px-3 py-1.5 text-sm flex-1"
                      />
                      <button
                        onClick={() => handleReject(r.id)}
                        disabled={actionBusy === r.id}
                        className="bg-red-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                      >
                        {actionBusy === r.id ? "..." : "Confirm Reject"}
                      </button>
                      <button onClick={() => setRejectForm(null)} className="text-xs text-gray-500">Cancel</button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => { setApproveForm({ numberId: r.id }); setRejectForm(null); }}
                        className="flex items-center gap-1 bg-green-50 text-green-700 text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-green-100"
                      >
                        <CheckCircle2 size={13} /> Approve
                      </button>
                      <button
                        onClick={() => { setRejectForm({ numberId: r.id }); setApproveForm(null); }}
                        className="flex items-center gap-1 bg-red-50 text-red-700 text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-red-100"
                      >
                        <XCircle size={13} /> Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PlatformShell>
  );
}
