/**
 * CodeSkate Voice — tenant admin page to purchase a dedicated calling number.
 *
 * States:
 *   1. No number → show "Get Your Number" form (upload Udyam + GST)
 *   2. Pending compliance → show status + "Under Review" badge
 *   3. Rejected → show reason + allow resubmit
 *   4. Active → show the number, status, monthly cost
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useBilling } from "../../context/BillingContext";
import { auth } from "../../firebase";
import Layout from "../../components/Layout";
import { PLATFORM_OWNER_PHONE } from "../../data/constants";
import {
  Phone, Upload, CheckCircle2, Clock, AlertTriangle, Loader2, Shield, Mic, Wallet, Plus,
  Sparkles, ArrowRight, Lock,
} from "lucide-react";

const VOICE_PLANS = new Set(["growth", "enterprise", "enterprise_plus"]);

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

async function apiPostJson(path, body) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// Platform-owner only: attach an already-owned Plivo number to this org.
function RegisterOwnedForm({ orgId, onSuccess }) {
  const [open, setOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [chargeRent, setChargeRent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!phoneNumber) { setError("Enter the number."); return; }
    setBusy(true); setError(null);
    try {
      await apiPostJson("/api/v1/voice/register-owned", { orgId, phoneNumber, businessName, chargeRent });
      setOpen(false); setPhoneNumber(""); setBusinessName("");
      onSuccess();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full border-2 border-dashed border-gray-300 rounded-xl py-2.5 text-xs font-medium text-gray-500 hover:border-orange-300 hover:text-orange-600">
        <Plus size={13} className="inline mr-1" /> Register an owned number (platform admin)
      </button>
    );
  }

  return (
    <div className="bg-white border rounded-xl p-4 space-y-2">
      <p className="text-sm font-semibold text-gray-900">Register owned number</p>
      <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}
        placeholder="918035410700" className="w-full border rounded-lg px-3 py-2 text-sm" />
      <input value={businessName} onChange={(e) => setBusinessName(e.target.value)}
        placeholder="Business name (optional)" className="w-full border rounded-lg px-3 py-2 text-sm" />
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={chargeRent} onChange={(e) => setChargeRent(e.target.checked)} />
        Charge ₹500/mo rent (uncheck for CodeSkate's own free number)
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={busy}
          className="bg-orange-500 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-orange-600 disabled:opacity-50">
          {busy ? "Adding..." : "Add number"}
        </button>
        <button onClick={() => setOpen(false)} className="text-sm text-gray-500 px-3 py-1.5">Cancel</button>
      </div>
    </div>
  );
}

const BASE = import.meta.env.VITE_BACKEND_URL || "";

async function apiGet(path) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Request failed");
  return res.json();
}

async function apiPostForm(path, formData) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Submission failed");
  return data;
}

const STATUS_CONFIG = {
  pending_review: { label: "Under Review", color: "text-yellow-600 bg-yellow-50", icon: Clock },
  pending_compliance: { label: "Under Review", color: "text-yellow-600 bg-yellow-50", icon: Clock },
  compliance_approved: { label: "Approved — Purchasing", color: "text-blue-600 bg-blue-50", icon: Loader2 },
  purchasing: { label: "Purchasing Number", color: "text-blue-600 bg-blue-50", icon: Loader2 },
  active: { label: "Active", color: "text-green-600 bg-green-50", icon: CheckCircle2 },
  suspended: { label: "Suspended", color: "text-red-600 bg-red-50", icon: AlertTriangle },
  cancelled: { label: "Cancelled", color: "text-gray-600 bg-gray-50", icon: AlertTriangle },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending_compliance;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon size={12} className={status === "compliance_approved" || status === "purchasing" ? "animate-spin" : ""} />
      {cfg.label}
    </span>
  );
}

function ActiveNumberCard({ number, onCancel }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="bg-white border-2 border-green-200 rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
          <Phone size={20} className="text-green-600" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900">Your Calling Number</h3>
          <p className="text-xs text-gray-500">Dedicated to your business</p>
        </div>
        <div className="ml-auto"><StatusBadge status="active" /></div>
      </div>
      <div className="bg-gray-50 rounded-lg p-4 mb-3">
        <p className="text-2xl font-mono font-bold text-gray-900 tracking-wider">
          {number.displayNumber || number.phoneNumber}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-gray-500">Business</span>
          <p className="font-medium">{number.businessName}</p>
        </div>
        <div>
          <span className="text-gray-500">Monthly Rent</span>
          <p className="font-medium">₹{number.monthlyCostInr || 500}/mo</p>
        </div>
      </div>

      {/* Rent billing info */}
      <div className="mt-3 flex items-center gap-2 bg-orange-50 rounded-lg px-3 py-2 text-xs text-orange-700">
        <Wallet size={13} />
        <span>
          ₹{number.monthlyCostInr || 500}/mo auto-deducts from your Voice Wallet
          {number.nextRentAt ? ` · next charge ${formatDate(number.nextRentAt)}` : ""}
        </span>
      </div>

      {/* Cancel */}
      <div className="mt-3 border-t pt-3">
        {!confirming ? (
          <button onClick={() => setConfirming(true)} className="text-xs text-red-500 hover:text-red-700">
            Cancel this number
          </button>
        ) : (
          <div className="bg-red-50 rounded-lg p-3 text-xs text-red-700">
            <p className="font-medium mb-2">Are you sure? This will deactivate the number. Bridge calls will stop working until you get a new one.</p>
            <div className="flex gap-2">
              <button onClick={() => { onCancel(number.id); setConfirming(false); }}
                className="bg-red-600 text-white px-3 py-1 rounded text-xs font-medium">Yes, cancel</button>
              <button onClick={() => setConfirming(false)} className="text-gray-600 px-3 py-1">Keep it</button>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-3">
        All bridge calls from your org use this number as caller ID. Your customers see YOUR number.
      </p>
    </div>
  );
}

function PendingCard({ number, onCancel }) {
  return (
    <div className="bg-white border rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
          <Clock size={20} className="text-yellow-600" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900">Verification Under Review</h3>
          <p className="text-xs text-gray-500">CodeSkate is verifying your documents</p>
        </div>
        <div className="ml-auto"><StatusBadge status={number.status} /></div>
      </div>
      <div className="bg-yellow-50 rounded-lg p-4 text-sm text-yellow-800">
        <p className="font-medium mb-1">What happens next?</p>
        <ol className="list-decimal list-inside space-y-1 text-xs">
          <li>CodeSkate verifies your Udyam/CoI + GST certificate (24-48 hrs)</li>
          <li>On approval, we activate a dedicated India number for you</li>
          <li>Your bridge calls start using YOUR dedicated number</li>
        </ol>
      </div>
      {number.rejectionReason && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <p className="font-medium">Rejected:</p>
          <p className="text-xs mt-1">{number.rejectionReason}</p>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-gray-400">Business: {number.businessName}</p>
        <button onClick={() => onCancel(number.id)} className="text-xs text-red-500 hover:text-red-700">
          Cancel request
        </button>
      </div>
    </div>
  );
}

function SubmitForm({ orgId, onSuccess }) {
  const [form, setForm] = useState({
    businessName: "", registrationNumber: "", email: "",
    address: "", city: "", state: "", postalCode: "",
  });
  const [regFile, setRegFile] = useState(null);
  const [gstFile, setGstFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!regFile || !gstFile) { setError("Both documents are required."); return; }
    setSubmitting(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.append("orgId", orgId);
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append("registrationCert", regFile);
      fd.append("gstCert", gstFile);

      await apiPostForm("/api/v1/voice/submit-compliance", fd);
      onSuccess();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white border rounded-xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
          <Phone size={20} className="text-orange-600" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900">Get Your Dedicated Number</h3>
          <p className="text-xs text-gray-500">₹500/month — your calls, your number, your brand</p>
        </div>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 rounded-lg p-3 mb-5 text-xs text-blue-800">
        <p className="font-medium mb-1">What you need:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Udyam Registration Certificate OR Certificate of Incorporation (PDF/Image)</li>
          <li>GST Registration Certificate — Form GST REG-06 (PDF/Image)</li>
          <li>Business name must match EXACTLY across both documents</li>
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-600 block mb-1">Legal Business Name *</label>
            <input
              type="text" required placeholder="Exact name as on documents"
              value={form.businessName}
              onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1">Registration Number (CIN/Udyam) *</label>
            <input
              type="text" required placeholder="e.g., UDYAM-XX-00-0000000"
              value={form.registrationNumber}
              onChange={(e) => setForm((f) => ({ ...f, registrationNumber: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1">Email</label>
            <input
              type="email" placeholder="contact@business.com"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-600 block mb-1">Address</label>
            <input
              type="text" placeholder="Street address"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1">City</label>
            <input
              type="text" value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1">State</label>
            <input
              type="text" value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1">Postal Code</label>
            <input
              type="text" value={form.postalCode}
              onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* File uploads */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-600 block mb-1">Registration Certificate *</label>
            <label className="flex items-center gap-2 border-2 border-dashed rounded-lg p-3 cursor-pointer hover:border-orange-300 transition-colors">
              <Upload size={16} className="text-gray-400" />
              <span className="text-xs text-gray-500 truncate">
                {regFile ? regFile.name : "Upload Udyam/CoI (PDF, JPG, PNG)"}
              </span>
              <input
                type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setRegFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1">GST Certificate *</label>
            <label className="flex items-center gap-2 border-2 border-dashed rounded-lg p-3 cursor-pointer hover:border-orange-300 transition-colors">
              <Upload size={16} className="text-gray-400" />
              <span className="text-xs text-gray-500 truncate">
                {gstFile ? gstFile.name : "Upload GST REG-06 (PDF, JPG, PNG)"}
              </span>
              <input
                type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setGstFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit" disabled={submitting}
          className="w-full bg-orange-500 text-white font-medium py-2.5 rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
          {submitting ? "Submitting..." : "Submit for Verification (₹500/mo)"}
        </button>
      </form>

      <p className="text-[10px] text-gray-400 mt-3 text-center">
        CodeSkate verifies your documents within 24-48 hours. Your number activates on approval. Cancel anytime.
      </p>
    </div>
  );
}

export default function CodeSkateVoice() {
  const { user } = useAuth();
  const billing = useBilling();
  const navigate = useNavigate();
  const planId = billing?.planId || "starter";
  const planLocked = !VOICE_PLANS.has(planId);
  const orgId = user?.activeOrgId;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const d = await apiGet(`/api/v1/voice/status?orgId=${orgId}`);
      setData(d);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (numberId) => {
    try {
      await apiPostJson("/api/v1/voice/cancel", { orgId, numberId });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, [orgId]);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-6">
          <Phone size={20} className="text-orange-500" />
          <h1 className="text-xl font-bold text-gray-900">CodeSkate Voice</h1>
        </div>

        {/* Upgrade hook — Voice is a Growth+ feature */}
        {planLocked && (
          <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-5 mb-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shrink-0">
              <Lock className="text-white" size={20} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900">Unlock CodeSkate Voice</h3>
              <p className="text-sm text-gray-600">
                Dedicated numbers, bridge calling & AI voice are available on Growth and above. Upgrade to give your business its own calling identity.
              </p>
            </div>
            <button onClick={() => navigate("/admin/billing")}
              className="bg-orange-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-orange-600 flex items-center gap-1.5 whitespace-nowrap">
              Upgrade <ArrowRight size={15} />
            </button>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-orange-500" />
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{error}</div>
        )}

        {!loading && !error && data && (
          <div className="space-y-3">
            {/* All numbers/requests, sorted by rent priority (funded first). */}
            {(() => {
              const pkey = (n) => (n.priority != null ? Number(n.priority) : (Date.parse(n.createdAt) || 0));
              const sorted = [...(data.numbers || [])].sort((a, b) => pkey(a) - pkey(b));
              const paidCount = sorted.filter((n) => (n.monthlyCostInr || 0) > 0).length;
              const reorder = async (index, dir) => {
                const j = index + dir;
                if (j < 0 || j >= sorted.length) return;
                const newOrder = [...sorted];
                [newOrder[index], newOrder[j]] = [newOrder[j], newOrder[index]];
                // Renumber all so priorities stay clean (0 = highest priority).
                await Promise.all(newOrder.map((n, idx) =>
                  apiPostJson("/api/v1/voice/priority", { orgId, numberId: n.id, priority: idx })
                ));
                load();
              };
              return sorted.map((n, i) => (
                <div key={n.id} className="flex items-stretch gap-2">
                  {paidCount > 1 && (n.monthlyCostInr || 0) > 0 && (
                    <div className="flex flex-col items-center justify-center gap-1 px-1">
                      <button onClick={() => reorder(i, -1)} disabled={i === 0}
                        className="text-gray-400 hover:text-orange-500 disabled:opacity-30" title="Higher priority">▲</button>
                      <span className="text-[10px] text-gray-400 font-medium">#{i + 1}</span>
                      <button onClick={() => reorder(i, 1)} disabled={i === sorted.length - 1}
                        className="text-gray-400 hover:text-orange-500 disabled:opacity-30" title="Lower priority">▼</button>
                    </div>
                  )}
                  <div className="flex-1">
                    {n.status === "active" ? <ActiveNumberCard number={n} onCancel={handleCancel} /> : <PendingCard number={n} onCancel={handleCancel} />}
                  </div>
                </div>
              ));
            })()}

            {/* Add-number form: shown by default if no numbers, else behind a toggle */}
            {(!data.numbers || data.numbers.length === 0) ? (
              <SubmitForm orgId={orgId} onSuccess={load} />
            ) : (
              <>
                {!showAddForm ? (
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="w-full border-2 border-dashed border-gray-300 rounded-xl py-3 text-sm font-medium text-gray-600 hover:border-orange-300 hover:text-orange-600 transition-colors"
                  >
                    + Request another number
                  </button>
                ) : (
                  <div>
                    <p className="text-sm text-gray-600 mb-2 font-medium">New number request:</p>
                    <SubmitForm orgId={orgId} onSuccess={() => { setShowAddForm(false); load(); }} />
                  </div>
                )}
              </>
            )}

            {/* Platform owner: register a number CodeSkate already owns */}
            {user?.phone === PLATFORM_OWNER_PHONE && (
              <RegisterOwnedForm orgId={orgId} onSuccess={load} />
            )}
          </div>
        )}

        {/* Pricing info */}
        <div className="mt-8">
          <p className="text-sm font-semibold text-gray-900 mb-3">Pricing</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border rounded-xl p-4 text-center">
              <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center mx-auto mb-2">
                <Phone size={16} className="text-orange-500" />
              </div>
              <p className="text-lg font-bold text-gray-900">₹500<span className="text-xs font-normal text-gray-400">/mo</span></p>
              <p className="text-xs text-gray-500 mt-0.5">Dedicated number</p>
            </div>
            <div className="bg-white border rounded-xl p-4 text-center">
              <div className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 size={16} className="text-green-500" />
              </div>
              <p className="text-lg font-bold text-gray-900">₹2.20<span className="text-xs font-normal text-gray-400">/min</span></p>
              <p className="text-xs text-gray-500 mt-0.5">Bridge — pay when connected</p>
            </div>
            <div className="bg-white border rounded-xl p-4 text-center">
              <div className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center mx-auto mb-2">
                <Sparkles size={16} className="text-purple-500" />
              </div>
              <p className="text-lg font-bold text-gray-900">₹5<span className="text-xs font-normal text-gray-400">/min</span></p>
              <p className="text-xs text-gray-500 mt-0.5">AI voice call</p>
            </div>
            <div className="bg-white border rounded-xl p-4 text-center">
              <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-2">
                <Mic size={16} className="text-blue-500" />
              </div>
              <p className="text-lg font-bold text-gray-900">Free</p>
              <p className="text-xs text-gray-500 mt-0.5">Call recordings</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">All usage draws from your Voice Wallet. Top up once, use across bridge, AI & rent.</p>
        </div>
      </div>
    </Layout>
  );
}
