import { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import {
  MessageCircle, Check, Copy, Loader2, Plug, Unplug, ArrowRight, Info,
} from "lucide-react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

export default function WhatsApp() {
  const { user } = useAuth();
  const orgId = user?.activeOrgId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connected, setConnected] = useState(false);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [savedNumberId, setSavedNumberId] = useState("");
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState("");

  const webhookUrl = BACKEND_URL ? `${BACKEND_URL}/webhook` : "https://<your-backend>/webhook";

  useEffect(() => {
    if (!orgId) return;
    getDoc(doc(db, "organizations", orgId, "settings", "whatsapp"))
      .then((snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setConnected(!!d.connected);
          setPhoneNumberId(d.phoneNumberId || "");
          setWabaId(d.wabaId || "");
          setSavedNumberId(d.phoneNumberId || "");
        }
      })
      .catch((e) => console.warn("whatsapp settings read:", e?.code))
      .finally(() => setLoading(false));
  }, [orgId]);

  const copy = (text, key) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  };

  const connect = async (e) => {
    e.preventDefault();
    setMsg("");
    const pid = phoneNumberId.trim();
    if (!/^\d{6,}$/.test(pid)) {
      setMsg("Phone Number ID sahi daalo (Meta se milta hai, sirf numbers).");
      return;
    }
    setSaving(true);
    try {
      // Reverse-lookup mapping used by the backend webhook to route leads.
      await setDoc(doc(db, "whatsappConfigs", pid), {
        orgId,
        phoneNumberId: pid,
        wabaId: wabaId.trim() || null,
        connectedAt: serverTimestamp(),
        connectedBy: user.uid,
      });
      // Org-scoped settings for display.
      await setDoc(doc(db, "organizations", orgId, "settings", "whatsapp"), {
        phoneNumberId: pid,
        wabaId: wabaId.trim() || null,
        connected: true,
        connectedAt: serverTimestamp(),
      }, { merge: true });

      // Clean up an old mapping if the number id changed.
      if (savedNumberId && savedNumberId !== pid) {
        await deleteDoc(doc(db, "whatsappConfigs", savedNumberId)).catch(() => {});
      }

      setConnected(true);
      setSavedNumberId(pid);
      setMsg("✅ WhatsApp connected! Ab is number pe aane wale leads automatically aa jayenge.");
    } catch (err) {
      console.error("WhatsApp connect error:", err?.code, err?.message);
      setMsg(err?.code === "permission-denied"
        ? "Permission denied — rules publish karo ya admin access check karo."
        : "Connect nahi hua: " + (err?.code || err?.message));
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    setSaving(true); setMsg("");
    try {
      if (savedNumberId) await deleteDoc(doc(db, "whatsappConfigs", savedNumberId)).catch(() => {});
      await setDoc(doc(db, "organizations", orgId, "settings", "whatsapp"),
        { connected: false }, { merge: true });
      setConnected(false);
      setMsg("WhatsApp disconnect ho gaya.");
    } catch (err) {
      setMsg("Disconnect nahi hua: " + (err?.code || err?.message));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Layout title="WhatsApp Integration"><div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-orange-500" /></div></Layout>;
  }

  return (
    <Layout title="WhatsApp Integration">
      {/* Status card */}
      <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${connected ? "bg-success-100" : "bg-cream-200"}`}>
            <MessageCircle className={connected ? "text-success-600" : "text-ink-muted"} size={26} />
          </div>
          <div className="flex-1">
            <h2 className="font-display font-bold text-xl text-ink flex items-center gap-2">
              WhatsApp Business
              {connected
                ? <span className="badge badge-success">Connected</span>
                : <span className="badge bg-cream-200 text-ink-muted">Not connected</span>}
            </h2>
            <p className="text-sm text-ink-soft mt-0.5">
              {connected
                ? `Number ID ${savedNumberId} se leads automatically fetch ho rahe hain.`
                : "Apna WhatsApp Business number connect karo — leads apne aap CRM me aayenge."}
            </p>
          </div>
          {connected && (
            <button onClick={disconnect} disabled={saving}
              className="btn btn-secondary text-sm text-danger-600 border-danger-200 hover:bg-danger-50">
              <Unplug size={15} /> Disconnect
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className="bg-orange-50 border border-orange-200 text-ember-700 rounded-xl px-4 py-3 mb-6 text-sm">{msg}</div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Step 1: Meta webhook config */}
        <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6">
          <h3 className="font-display font-semibold text-lg text-ink mb-1 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center">1</span>
            Meta me webhook set karo
          </h3>
          <p className="text-sm text-ink-soft mb-4">
            Meta Developer → WhatsApp → Configuration me ye webhook URL aur verify token daalo (ek baar):
          </p>

          <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1">Callback URL</label>
          <div className="flex items-center gap-2 mb-3">
            <code className="flex-1 bg-cream-100 border border-cream-300 rounded-lg px-3 py-2 text-sm font-mono break-all">{webhookUrl}</code>
            <button onClick={() => copy(webhookUrl, "url")} className="btn btn-secondary px-3 py-2">
              {copied === "url" ? <Check size={15} className="text-success-600" /> : <Copy size={15} />}
            </button>
          </div>

          <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1">Verify Token</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-cream-100 border border-cream-300 rounded-lg px-3 py-2 text-sm font-mono">codeskate_verify</code>
            <button onClick={() => copy("codeskate_verify", "tok")} className="btn btn-secondary px-3 py-2">
              {copied === "tok" ? <Check size={15} className="text-success-600" /> : <Copy size={15} />}
            </button>
          </div>
          <p className="text-xs text-ink-muted mt-3 flex items-start gap-1.5">
            <Info size={13} className="mt-0.5 shrink-0" />
            Backend me <code className="bg-cream-200 px-1 rounded">WHATSAPP_VERIFY_TOKEN=codeskate_verify</code> set hona chahiye. Field "messages" subscribe karo.
          </p>
        </div>

        {/* Step 2: Connect this org's number */}
        <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6">
          <h3 className="font-display font-semibold text-lg text-ink mb-1 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center">2</span>
            Apna number connect karo
          </h3>
          <p className="text-sm text-ink-soft mb-4">
            Meta → WhatsApp → API Setup me <strong>Phone number ID</strong> milta hai. Wahi yahan daalo.
          </p>
          <form onSubmit={connect} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Phone Number ID <span className="text-danger-500">*</span></label>
              <input className="input" placeholder="e.g. 123456789012345" value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">WhatsApp Business Account ID <span className="text-ink-muted">(optional)</span></label>
              <input className="input" placeholder="e.g. 987654321098765" value={wabaId}
                onChange={(e) => setWabaId(e.target.value.replace(/\D/g, ""))} />
            </div>
            <button disabled={saving} className="btn btn-primary w-full">
              {saving ? <><Loader2 size={16} className="animate-spin" /> Saving…</>
                : connected ? <><Plug size={16} /> Update connection</>
                : <>Connect WhatsApp <ArrowRight size={16} /></>}
            </button>
          </form>
        </div>
      </div>

      <p className="text-xs text-ink-muted mt-6 flex items-center gap-1.5">
        <Info size={13} />
        Ek WhatsApp number sirf ek organization se connect ho sakta hai. Leads us number ke Phone Number ID se aapke org me route hote hain.
      </p>
    </Layout>
  );
}
