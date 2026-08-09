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
import { useAuth } from "../../context/AuthContext";
import { auth } from "../../firebase";
import Layout from "../../components/Layout";
import {
  Phone, Upload, CheckCircle2, Clock, AlertTriangle, Loader2, Shield,
} from "lucide-react";

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

function ActiveNumberCard({ number }) {
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
          <span className="text-gray-500">Monthly Cost</span>
          <p className="font-medium">₹{number.monthlyCostInr || 500}/mo</p>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-4">
        All bridge calls from your org now use this number as caller ID. Your customers see YOUR number, not CodeSkate's.
      </p>
    </div>
  );
}

function PendingCard({ number }) {
  return (
    <div className="bg-white border rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
          <Clock size={20} className="text-yellow-600" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900">Compliance Under Review</h3>
          <p className="text-xs text-gray-500">Plivo is verifying your documents</p>
        </div>
        <div className="ml-auto"><StatusBadge status={number.status} /></div>
      </div>
      <div className="bg-yellow-50 rounded-lg p-4 text-sm text-yellow-800">
        <p className="font-medium mb-1">What happens next?</p>
        <ol className="list-decimal list-inside space-y-1 text-xs">
          <li>Plivo reviews your Udyam/CoI + GST certificate (24-48 hrs)</li>
          <li>On approval, we auto-purchase an India number for you</li>
          <li>Your bridge calls start using YOUR dedicated number</li>
        </ol>
      </div>
      {number.rejectionReason && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <p className="font-medium">Rejected:</p>
          <p className="text-xs mt-1">{number.rejectionReason}</p>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-3">Business: {number.businessName}</p>
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
        Plivo reviews within 24-48 hours. Number auto-activates on approval. Cancel anytime.
      </p>
    </div>
  );
}

export default function CodeSkateVoice() {
  const { user } = useAuth();
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

  useEffect(() => { load(); }, [orgId]);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-6">
          <Phone size={20} className="text-orange-500" />
          <h1 className="text-xl font-bold text-gray-900">CodeSkate Voice</h1>
        </div>

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
            {/* All numbers/requests for this org (multiple allowed) */}
            {(data.numbers || []).map((n) =>
              n.status === "active"
                ? <ActiveNumberCard key={n.id} number={n} />
                : <PendingCard key={n.id} number={n} />
            )}

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
          </div>
        )}

        {/* Pricing info */}
        <div className="mt-8 bg-gray-50 rounded-lg p-4 text-xs text-gray-500">
          <p className="font-medium text-gray-700 mb-2">Pricing</p>
          <ul className="space-y-1">
            <li>Dedicated number: <strong>₹500/month</strong></li>
            <li>Bridge calls: <strong>₹2.20/min</strong> (pay only when connected)</li>
            <li>Recordings: <strong>Free</strong> (included in subscription)</li>
          </ul>
        </div>
      </div>
    </Layout>
  );
}
