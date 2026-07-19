import { useEffect, useRef, useState } from "react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import {
  connectWhatsAppBusiness,
  disconnectWhatsAppBusiness,
  getWhatsAppConnection,
} from "../../utils/billingApi";
import { MessageCircle, Loader2, Plug, Unplug, ArrowRight, Info, ShieldCheck } from "lucide-react";

const META_APP_ID = import.meta.env.VITE_META_APP_ID || "";
const META_EMBEDDED_SIGNUP_CONFIG_ID = import.meta.env.VITE_META_EMBEDDED_SIGNUP_CONFIG_ID || "";
const META_GRAPH_API_VERSION = import.meta.env.VITE_META_GRAPH_API_VERSION || "v22.0";

function loadMetaSdk() {
  if (!META_APP_ID) return Promise.reject(new Error("Meta App ID is not configured"));
  if (window.FB) {
    window.FB.init({ appId: META_APP_ID, cookie: true, xfbml: false, version: META_GRAPH_API_VERSION });
    return Promise.resolve(window.FB);
  }
  return new Promise((resolve, reject) => {
    const existing = document.getElementById("meta-jssdk");
    const initialise = () => {
      if (!window.FB) return reject(new Error("Meta login could not be loaded"));
      window.FB.init({ appId: META_APP_ID, cookie: true, xfbml: false, version: META_GRAPH_API_VERSION });
      resolve(window.FB);
    };
    if (existing) {
      existing.addEventListener("load", initialise, { once: true });
      existing.addEventListener("error", () => reject(new Error("Meta login could not be loaded")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "meta-jssdk";
    script.async = true;
    script.defer = true;
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onload = initialise;
    script.onerror = () => reject(new Error("Meta login could not be loaded"));
    document.body.appendChild(script);
  });
}

export default function WhatsApp() {
  const { user } = useAuth();
  const orgId = user?.activeOrgId;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connection, setConnection] = useState({ connected: false });
  const [message, setMessage] = useState("");
  const completionRef = useRef({ code: null, signup: null, done: false });

  const refreshConnection = async () => {
    if (!orgId) return;
    const result = await getWhatsAppConnection({ orgId });
    setConnection(result);
  };

  useEffect(() => {
    refreshConnection()
      .catch((error) => setMessage(error.message || "Could not load WhatsApp connection."))
      .finally(() => setLoading(false));
  }, [orgId]);

  const connect = async () => {
    if (!orgId) return;
    if (!META_APP_ID || !META_EMBEDDED_SIGNUP_CONFIG_ID) {
      setMessage("WhatsApp onboarding is not configured yet. Ask the platform administrator to add the Meta App ID and Embedded Signup Configuration ID in Vercel.");
      return;
    }
    setSaving(true);
    setMessage("");
    completionRef.current = { code: null, signup: null, done: false };

    const finishConnection = async () => {
      const state = completionRef.current;
      if (state.done || !state.code || !state.signup?.wabaId || !state.signup?.phoneNumberId) return;
      state.done = true;
      window.removeEventListener("message", onMetaMessage);
      try {
        await connectWhatsAppBusiness({
          orgId,
          code: state.code,
          wabaId: state.signup.wabaId,
          phoneNumberId: state.signup.phoneNumberId,
        });
        await refreshConnection();
        setMessage("WhatsApp Business connected. New inbound messages will be routed to this workspace and your team can reply from lead records.");
      } catch (error) {
        setMessage(error.message || "Could not verify the WhatsApp Business connection.");
      } finally {
        setSaving(false);
      }
    };

    const onMetaMessage = (event) => {
      if (!["https://www.facebook.com", "https://web.facebook.com"].includes(event.origin)) return;
      let payload;
      try {
        payload = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (payload?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (payload.event === "FINISH") {
        const data = payload.data || {};
        completionRef.current.signup = {
          wabaId: String(data.waba_id || data.wabaId || ""),
          phoneNumberId: String(data.phone_number_id || data.phoneNumberId || ""),
        };
        finishConnection();
      } else if (payload.event === "CANCEL") {
        setMessage("WhatsApp connection was cancelled before completion.");
        setSaving(false);
      }
    };

    window.addEventListener("message", onMetaMessage);
    try {
      const FB = await loadMetaSdk();
      FB.login((response) => {
        const code = response?.authResponse?.code;
        if (!code) {
          window.removeEventListener("message", onMetaMessage);
          setMessage("Meta did not return an authorization code. Please complete the connection flow and try again.");
          setSaving(false);
          return;
        }
        completionRef.current.code = code;
        finishConnection();
      }, {
        config_id: META_EMBEDDED_SIGNUP_CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "whatsapp_business_app_onboarding" },
      });
    } catch (error) {
      window.removeEventListener("message", onMetaMessage);
      setMessage(error.message || "Could not start Meta Embedded Signup.");
      setSaving(false);
    }
  };

  const disconnect = async () => {
    if (!orgId || !window.confirm("Disconnect this WhatsApp Business number? Inbound messages will no longer create leads in this workspace.")) return;
    setSaving(true);
    setMessage("");
    try {
      await disconnectWhatsAppBusiness({ orgId });
      setConnection({ connected: false });
      setMessage("WhatsApp Business has been disconnected from this workspace.");
    } catch (error) {
      setMessage(error.message || "Could not disconnect WhatsApp Business.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Layout title="WhatsApp Integration"><div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-orange-500" /></div></Layout>;
  }

  return (
    <Layout title="WhatsApp Integration">
      <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${connection.connected ? "bg-success-100" : "bg-cream-200"}`}>
            <MessageCircle className={connection.connected ? "text-success-600" : "text-ink-muted"} size={26} />
          </div>
          <div className="flex-1">
            <h2 className="font-display font-bold text-xl text-ink flex items-center gap-2">
              WhatsApp Business
              {connection.connected
                ? <span className="badge badge-success">Connected</span>
                : connection.reauthorizationRequired
                  ? <span className="badge bg-amber-100 text-amber-700">Reconnect required</span>
                  : <span className="badge bg-cream-200 text-ink-muted">Not connected</span>}
            </h2>
            <p className="text-sm text-ink-soft mt-0.5">
              {connection.connected
                ? "Inbound messages create leads in this workspace. Your team can reply from each lead record."
                : connection.reauthorizationRequired
                  ? "The Meta authorization has expired. Reconnect this number before sending CRM replies."
                  : "Connect this workspace's own WhatsApp Business number through Meta."}
            </p>
          </div>
          {connection.connected && (
            <button onClick={disconnect} disabled={saving} className="btn btn-secondary text-sm text-danger-600 border-danger-200 hover:bg-danger-50">
              <Unplug size={15} /> Disconnect
            </button>
          )}
        </div>
        {connection.connected && (
          <p className="mt-4 text-xs text-ink-muted">Connected Meta phone number ID: <code className="bg-cream-100 px-1.5 py-0.5 rounded">{connection.phoneNumberId}</code></p>
        )}
      </div>

      {message && <div className="bg-orange-50 border border-orange-200 text-ember-700 rounded-xl px-4 py-3 mb-6 text-sm">{message}</div>}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6">
          <h3 className="font-display font-semibold text-lg text-ink mb-2 flex items-center gap-2"><ShieldCheck size={19} className="text-success-600" /> Secure per-workspace connection</h3>
          <p className="text-sm text-ink-soft leading-6">
            Each customer connects their own WhatsApp Business Account through Meta. CodeSkate verifies the number before routing messages, so another workspace cannot claim or receive its leads.
          </p>
          <button onClick={connect} disabled={saving || connection.connected} className="btn btn-primary w-full mt-6">
            {saving ? <><Loader2 size={16} className="animate-spin" /> Connecting…</> : <><Plug size={16} /> Connect with Meta <ArrowRight size={16} /></>}
          </button>
        </div>
        <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6">
          <h3 className="font-display font-semibold text-lg text-ink mb-2">How replies work</h3>
          <ol className="text-sm text-ink-soft space-y-3 list-decimal pl-5">
            <li>A customer messages this connected WhatsApp number.</li>
            <li>CodeSkate creates or updates the lead in this workspace.</li>
            <li>Open the lead record and use the WhatsApp reply panel.</li>
          </ol>
          <p className="text-xs text-ink-muted mt-5 flex items-start gap-1.5"><Info size={13} className="mt-0.5 shrink-0" /> Free-form replies are available for 24 hours after the customer's latest message. Outside that window, Meta requires an approved template.</p>
        </div>
      </div>
    </Layout>
  );
}
