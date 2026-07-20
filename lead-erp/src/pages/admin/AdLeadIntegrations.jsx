import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import {
  connectMetaLeadPage,
  createGoogleAdsLeadIntegration,
  disconnectMetaLeadPage,
  getAdLeadIntegrationStatus,
  listMetaLeadPages,
} from "../../utils/billingApi";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Copy,
  ExternalLink,
  Link2,
  LoaderCircle,
  Megaphone,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from "lucide-react";

const META_APP_ID = import.meta.env.VITE_META_APP_ID || "";
const META_GRAPH_API_VERSION = import.meta.env.VITE_META_GRAPH_API_VERSION || "v22.0";

function loadMetaSdk() {
  if (!META_APP_ID) return Promise.reject(new Error("Meta Lead Ads is not enabled for this CRM yet."));
  if (window.FB) {
    window.FB.init({ appId: META_APP_ID, cookie: true, xfbml: false, version: META_GRAPH_API_VERSION });
    return Promise.resolve(window.FB);
  }
  return new Promise((resolve, reject) => {
    const existing = document.getElementById("meta-lead-ads-sdk");
    const initialise = () => {
      if (!window.FB) return reject(new Error("Meta login could not be loaded."));
      window.FB.init({ appId: META_APP_ID, cookie: true, xfbml: false, version: META_GRAPH_API_VERSION });
      resolve(window.FB);
    };
    if (existing) {
      existing.addEventListener("load", initialise, { once: true });
      existing.addEventListener("error", () => reject(new Error("Meta login could not be loaded.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "meta-lead-ads-sdk";
    script.async = true;
    script.defer = true;
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onload = initialise;
    script.onerror = () => reject(new Error("Meta login could not be loaded."));
    document.body.appendChild(script);
  });
}

function CopyBlock({ label, value, onCopy, copied, secret = false }) {
  return <div>
    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
    <div className="flex gap-2 rounded-xl border border-cream-300 bg-cream-50 p-2">
      <code className={`min-w-0 flex-1 break-all px-2 py-1.5 text-xs text-ink ${secret ? "select-all" : ""}`}>{value}</code>
      <button onClick={() => onCopy(value, label)} className="btn btn-secondary shrink-0 px-3 py-2 text-xs"><Copy size={14} />{copied === label ? "Copied" : "Copy"}</button>
    </div>
  </div>;
}

function Step({ number, title, children }) {
  return <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">{number}</span><div className="pb-3"><p className="text-sm font-semibold text-ink">{title}</p><div className="mt-1 text-xs leading-5 text-ink-soft">{children}</div></div></li>;
}

export default function AdLeadIntegrations() {
  const { user } = useAuth();
  const orgId = user?.activeOrgId;
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [googleCredentials, setGoogleCredentials] = useState(null);
  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [metaPages, setMetaPages] = useState([]);
  const [selectedPageId, setSelectedPageId] = useState("");

  const refresh = async () => {
    if (!orgId) return;
    const next = await getAdLeadIntegrationStatus(orgId);
    setStatus(next);
  };

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    refresh().catch((requestError) => mounted && setError(requestError.message || "Could not load ad integrations."))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [orgId]);

  const copy = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      setError("Copy failed. Select the value and copy it manually.");
    }
  };

  const createGoogle = async () => {
    setBusy("google"); setError(""); setNotice("");
    try {
      const credentials = await createGoogleAdsLeadIntegration({ orgId });
      setGoogleCredentials(credentials);
      await refresh();
      setNotice("Google Ads destination is ready. Copy the URL and key below, then paste them in your Google lead form.");
    } catch (requestError) {
      setError(requestError.message || "Could not create the Google Ads connection.");
    } finally {
      setBusy("");
    }
  };

  const chooseMetaPage = async () => {
    setBusy("meta-login"); setError(""); setNotice("");
    try {
      const FB = await loadMetaSdk();
      const response = await new Promise((resolve) => FB.login(resolve, {
        scope: "pages_show_list,pages_read_engagement,pages_manage_metadata,ads_management,leads_retrieval",
        return_scopes: true,
      }));
      const accessToken = response?.authResponse?.accessToken;
      if (!accessToken) throw new Error("Meta login was cancelled. Please approve Page and Lead Ads access to continue.");
      const result = await listMetaLeadPages({ orgId, userAccessToken: accessToken });
      if (!result.pages?.length) throw new Error("No eligible Meta Pages were found. Use a Meta account with Lead Ads access to the Page.");
      setMetaAccessToken(accessToken);
      setMetaPages(result.pages);
      setSelectedPageId(result.pages.length === 1 ? result.pages[0].id : "");
      setNotice("Choose the Page whose instant-form leads should enter this workspace.");
    } catch (requestError) {
      setError(requestError.message || "Could not connect to Meta.");
    } finally {
      setBusy("");
    }
  };

  const connectMeta = async () => {
    if (!selectedPageId || !metaAccessToken) return;
    setBusy("meta-connect"); setError("");
    try {
      const result = await connectMetaLeadPage({ orgId, pageId: selectedPageId, userAccessToken: metaAccessToken });
      setMetaAccessToken(""); setMetaPages([]); setSelectedPageId("");
      await refresh();
      setNotice(`${result.pageName} is connected. New Meta instant-form leads will be assigned automatically.`);
    } catch (requestError) {
      setError(requestError.message || "Could not connect the Meta Page.");
    } finally {
      setBusy("");
    }
  };

  const disconnectMeta = async () => {
    if (!window.confirm("Disconnect this Meta Page? New Meta instant-form leads will stop entering this workspace.")) return;
    setBusy("meta-disconnect"); setError("");
    try {
      await disconnectMetaLeadPage({ orgId });
      await refresh();
      setNotice("Meta Page disconnected. Existing leads remain safely in your CRM.");
    } catch (requestError) {
      setError(requestError.message || "Could not disconnect the Meta Page.");
    } finally {
      setBusy("");
    }
  };

  return (
    <Layout title="Ads Lead Integration">
      <section className="mb-6 rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-cream-100 p-6 shadow-card">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center"><div><p className="eyebrow">One setup, instant leads</p><h1 className="mt-1 text-2xl font-bold text-ink">Connect Meta and Google Ads without a spreadsheet</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-ink-soft">Every ad-form lead is duplicate-checked, added to this workspace, and automatically assigned to your team. No Zapier, CSV download, or manual entry is required.</p></div><div className="flex items-center gap-2 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm font-semibold text-success-700"><ShieldCheck size={18} /> Secure provider webhooks</div></div>
      </section>

      {notice && <div className="mb-5 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700"><CheckCircle2 className="mr-2 inline" size={16} />{notice}</div>}
      {error && <div className="mb-5 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"><AlertCircle className="mr-2 inline" size={16} />{error}</div>}

      {loading ? <div className="flex justify-center py-20 text-ink-soft"><LoaderCircle className="animate-spin" size={25} /></div> : <div className="grid gap-6 xl:grid-cols-2">
        <section className="card overflow-hidden p-0"><div className="border-b border-cream-200 bg-white p-6"><div className="flex items-start gap-3"><div className="rounded-xl bg-blue-100 p-2.5 text-blue-700"><Megaphone size={23} /></div><div className="flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-ink">Google Ads lead forms</h2>{status?.google?.configured && <span className="badge badge-success">Ready</span>}</div><p className="mt-1 text-sm text-ink-soft">Generate two values once, paste them in Google Ads, and test the connection.</p></div></div></div>
          <div className="space-y-5 p-6">
            {googleCredentials ? <div className="space-y-4 rounded-xl border border-success-200 bg-success-50/50 p-4"><p className="text-sm font-semibold text-success-800">Save these now — the secret key is shown only once.</p><CopyBlock label="Webhook URL" value={googleCredentials.webhookUrl} onCopy={copy} copied={copied} /><CopyBlock label="Webhook key" value={googleCredentials.key} onCopy={copy} copied={copied} secret /></div> : status?.google?.configured ? <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900"><CheckCircle2 className="mr-1 inline" size={16} /> Connected with key ending in <code>{status.google.keyPrefix}</code>. Generate a new key only if you need to replace it in Google Ads.</div> : null}
            <ol className="divide-y divide-cream-200"><Step number="1" title="Create a lead form in Google Ads">Open your campaign, add a <strong>Lead form</strong> asset, and choose <strong>Webhook integration</strong> under lead delivery.</Step><Step number="2" title="Paste the URL and key">Use the values shown here. Google sends each submitted form directly to Codeskate CRM.</Step><Step number="3" title="Send Google’s test data">Google shows a success state after it receives our response. Then submit one real lead to confirm automatic assignment.</Step></ol>
            <button onClick={createGoogle} disabled={Boolean(busy)} className="btn btn-primary">{busy === "google" ? <LoaderCircle className="animate-spin" size={16} /> : <RefreshCw size={16} />}{status?.google?.configured ? "Generate replacement URL & key" : "Generate Google Ads URL & key"}</button>
          </div>
        </section>

        <section className="card overflow-hidden p-0"><div className="border-b border-cream-200 bg-white p-6"><div className="flex items-start gap-3"><div className="rounded-xl bg-indigo-100 p-2.5 text-indigo-700"><Link2 size={23} /></div><div className="flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-ink">Meta instant forms</h2>{status?.meta?.connected && <span className="badge badge-success">Connected</span>}</div><p className="mt-1 text-sm text-ink-soft">Sign in to Meta, choose your Facebook Page, and we connect its Lead Ads securely.</p></div></div></div>
          <div className="space-y-5 p-6">
            {status?.meta?.connected ? <div className="rounded-xl border border-success-200 bg-success-50 p-4"><p className="font-semibold text-success-800"><CheckCircle2 className="mr-1 inline" size={16} /> {status.meta.pageName} is connected</p><p className="mt-1 text-xs text-success-700">Now use Meta's Lead Ads Testing Tool or submit one test instant form. {status.meta.lastDeliveryAt ? `Last lead received: ${new Date(status.meta.lastDeliveryAt).toLocaleString("en-IN")}.` : "This card will show the first received lead after delivery is verified."}</p><button onClick={disconnectMeta} disabled={Boolean(busy)} className="btn btn-secondary mt-3 text-danger-700 border-danger-200 hover:bg-danger-50">{busy === "meta-disconnect" ? <LoaderCircle className="animate-spin" size={15} /> : <Unplug size={15} />}Disconnect Page</button></div> : (!status?.meta?.platformReady || !META_APP_ID) ? <div className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800"><CircleHelp className="mr-1 inline" size={16} /><strong>One-time platform setup pending.</strong> Configure the Meta App's <strong>Page → leadgen</strong> webhook before a workspace connects a Page.{status?.meta?.callbackUrl && <><br /><span className="mt-2 block text-xs">Callback URL: <code className="select-all">{status.meta.callbackUrl}</code></span></>}<span className="mt-2 block text-xs">The Render server also needs META_APP_ID, META_APP_SECRET, META_LEAD_WEBHOOK_VERIFY_TOKEN, and AD_LEADS_ENCRYPTION_KEY. This is done once for the whole CRM, not once per client.</span></div> : status?.meta?.connectionState === "failed" ? <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800"><AlertCircle className="mr-1 inline" size={16} /><strong>Previous Meta connection did not finish.</strong> Sign in again and reconnect the same Page.</div> : <><ol className="divide-y divide-cream-200"><Step number="1" title="Sign in with Meta">Use the Meta account that manages the Page and has Lead Ads access.</Step><Step number="2" title="Choose the Facebook Page">We show only Pages available to your Meta account. Select the Page running your instant-form ads.</Step><Step number="3" title="Done">Codeskate CRM subscribes securely and sends new leads to the right team member.</Step></ol><button onClick={chooseMetaPage} disabled={Boolean(busy)} className="btn btn-primary">{busy === "meta-login" ? <LoaderCircle className="animate-spin" size={16} /> : <ExternalLink size={16} />}Sign in to Meta & choose Page</button>{metaPages.length > 0 && <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4"><label className="block text-sm font-semibold text-ink">Facebook Page<select value={selectedPageId} onChange={(event) => setSelectedPageId(event.target.value)} className="input mt-2"><option value="">Select a Page</option>{metaPages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}</select></label><button onClick={connectMeta} disabled={!selectedPageId || busy === "meta-connect"} className="btn btn-primary mt-3">{busy === "meta-connect" ? <LoaderCircle className="animate-spin" size={16} /> : <ChevronRight size={16} />}Connect selected Page</button></div>}</>}
          </div>
        </section>
      </div>}

      <section className="mt-6 rounded-xl border border-cream-300 bg-cream-50 p-5 text-sm text-ink-soft"><div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-success-700" size={19} /><p><strong className="text-ink">What happens after a lead arrives:</strong> Codeskate CRM validates the provider request, prevents duplicates using the provider lead ID, applies your lead limit and auto-assignment rule, then notifies the assigned employee. Ad-platform credentials and webhook keys never appear in Firestore or lead records.</p></div></section>
    </Layout>
  );
}
