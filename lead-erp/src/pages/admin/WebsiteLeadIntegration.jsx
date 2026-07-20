import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import {
  createWebsiteLeadIntegration,
  getWebsiteLeadIntegration,
  rotateWebsiteLeadIntakeKey,
} from "../../utils/billingApi";
import {
  Braces,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  Copy,
  Globe2,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Send,
  Webhook,
  FileText,
} from "lucide-react";

const INITIAL_FORM = {
  allowedDomains: "",
  formTitle: "Talk to our team",
  submitLabel: "Send enquiry",
  successMessage: "Thank you. Our team will contact you shortly.",
};

function domainList(value) {
  return String(value || "").split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

export default function WebsiteLeadIntegration() {
  const { user } = useAuth();
  const [form, setForm] = useState(INITIAL_FORM);
  const [existing, setExisting] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [developerApi, setDeveloperApi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiBusy, setApiBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const orgId = user?.activeOrgId;

  useEffect(() => {
    if (!orgId) return;
    let active = true;
    setLoading(true);
    getWebsiteLeadIntegration(orgId)
      .then((result) => {
        if (!active) return;
        setExisting(result.configured ? result : null);
        if (result.configured) {
          setForm({
            allowedDomains: (result.allowedDomains || []).join("\n"),
            formTitle: result.formTitle || INITIAL_FORM.formTitle,
            submitLabel: result.submitLabel || INITIAL_FORM.submitLabel,
            successMessage: result.successMessage || INITIAL_FORM.successMessage,
          });
        }
      })
      .catch((requestError) => active && setError(requestError.message || "Could not load website integration"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [orgId]);

  const embedCode = credentials?.embedUrl
    ? `<iframe\n  src="${credentials.embedUrl}"\n  width="100%"\n  height="650"\n  frameborder="0"\n  title="Contact form">\n</iframe>`
    : "";
  const webhookExample = credentials?.webhookUrl
    ? `POST ${credentials.webhookUrl}\nContent-Type: application/json\n\n{\n  "name": "Rahul Sharma",\n  "phone": "9876543210",\n  "email": "rahul@example.com",\n  "message": "I need a demo",\n  "campaign": "Website Contact Form",\n  "externalLeadId": "form-submission-id"\n}`
    : "";
  const developerExample = developerApi?.endpoint
    ? `await fetch("${developerApi.endpoint}", {\n  method: "POST",\n  headers: {\n    "Content-Type": "application/json",\n    "x-codeskate-intake-key": "${developerApi.key}",\n  },\n  body: JSON.stringify({\n    name, phone, email, requirement: message,\n    externalLeadId: submissionId,\n  }),\n});`
    : "";

  const updateForm = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const generateUniversalIntegration = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await createWebsiteLeadIntegration({ orgId, ...form, allowedDomains: domainList(form.allowedDomains) });
      setCredentials(result);
      setExisting({ configured: true, ...result });
      setNotice("Integration links created. Copy and save them now—generating again revokes the old links.");
    } catch (requestError) {
      setError(requestError.message || "Could not create website integration.");
    } finally {
      setSaving(false);
    }
  };

  const generateDeveloperApi = async () => {
    setApiBusy(true);
    setError("");
    try {
      setDeveloperApi(await rotateWebsiteLeadIntakeKey({ orgId }));
      setNotice("Developer API key created. Copy it now—creating another key revokes the previous one.");
    } catch (requestError) {
      setError(requestError.message || "Could not create developer API key.");
    } finally {
      setApiBusy(false);
    }
  };

  const copy = async (key, value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      setError("Copy failed. Select the text and copy it manually.");
    }
  };

  return (
    <Layout title="Website Lead Integration">
      <section className="mb-6 rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-cream-100 p-6 shadow-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="eyebrow">Lead capture for every website</p>
            <h1 className="mt-1 text-2xl font-bold text-ink">Connect any client website in minutes</h1>
            <p className="mt-2 max-w-3xl text-sm text-ink-soft">Use a ready-to-paste form for Wix, WordPress, Webflow, Shopify, and HTML websites; connect an existing form through a webhook; or use the protected server API for coded websites.</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm font-medium text-success-700"><CheckCircle2 size={18} /> Auto-assignment and duplicate protection included</div>
        </div>
      </section>

      {notice && <div className="mb-5 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{notice}</div>}
      {error && <div className="mb-5 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(350px,0.9fr)]">
        <section className="card p-6">
          <div className="mb-5 flex items-start gap-3"><div className="rounded-xl bg-orange-100 p-2.5 text-orange-700"><Globe2 size={22} /></div><div><h2 className="font-semibold text-ink">1. Create universal integration</h2><p className="mt-1 text-sm text-ink-soft">Set the domains and messages for the hosted form. One setup gives you both an embed snippet and a webhook URL.</p></div></div>
          {loading ? <div className="flex items-center gap-2 py-10 text-sm text-ink-soft"><LoaderCircle className="animate-spin" size={18} /> Loading configuration…</div> : (
            <form onSubmit={generateUniversalIntegration} className="space-y-4">
              <Field label="Client website domain(s) — optional"><textarea value={form.allowedDomains} onChange={updateForm("allowedDomains")} className="input min-h-20 resize-y" placeholder={"clientwebsite.com\nwww.clientwebsite.com"} /></Field>
              <p className="-mt-2 text-xs text-ink-muted">For your internal record only: add one domain per line. The hosted form is protected by server-verified Cloudflare Turnstile.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Form heading"><input value={form.formTitle} onChange={updateForm("formTitle")} className="input" maxLength="100" /></Field>
                <Field label="Submit button"><input value={form.submitLabel} onChange={updateForm("submitLabel")} className="input" maxLength="60" /></Field>
              </div>
              <Field label="Success message"><input value={form.successMessage} onChange={updateForm("successMessage")} className="input" maxLength="240" /></Field>
              {existing && !credentials && <div className="rounded-lg border border-warning-200 bg-warning-50 p-3 text-xs text-warning-800"><LockKeyhole size={14} className="mr-1 inline" /> Existing integration is active ({existing.webhookTokenPrefix || "secure link"}). For security the old URLs are not shown again. Create new links to replace them.</div>}
              <button disabled={saving} className="btn btn-primary"><RefreshCw size={16} className={saving ? "animate-spin" : ""} />{saving ? "Creating…" : existing ? "Create new links and revoke old ones" : "Create integration links"}</button>
            </form>
          )}
        </section>

        <section className="card p-6">
          <div className="mb-5 flex items-start gap-3"><div className="rounded-xl bg-success-100 p-2.5 text-success-700"><ClipboardCheck size={22} /></div><div><h2 className="font-semibold text-ink">Client-friendly choices</h2><p className="mt-1 text-sm text-ink-soft">Give the client only the option that matches their website.</p></div></div>
          <div className="space-y-3">
            <Guide icon={Globe2} title="Wix, Webflow, Shopify, HTML" text="Paste the hosted form embed code. No API key or backend is needed." />
            <Guide icon={FileText} title="WordPress / existing form" text="Paste the webhook URL into Elementor, WPForms, Contact Form 7, or a Zapier/Make/Pabbly webhook step." />
            <Guide icon={Code2} title="React, Next.js, Node, PHP" text="Keep the existing form UI and forward submissions from the website server using the protected Developer API." />
          </div>
        </section>
      </div>

      {credentials && <section className="mt-6 space-y-6">
        {credentials.hostedFormAvailable ? (
          <IntegrationCard icon={Globe2} title="2A. Paste this form on any website" subtitle="Best for clients without a developer. Paste into an HTML/embed block in Wix, Webflow, WordPress, Shopify, or any coded website. The hosted form is protected by Cloudflare Turnstile.">
            <CodeBlock value={embedCode} onCopy={() => copy("embed", embedCode)} copied={copied === "embed"} />
          </IntegrationCard>
        ) : (
          <div className="rounded-xl border border-warning-200 bg-warning-50 p-5 text-sm text-warning-800"><strong>Hosted form needs one setup step:</strong> add <code>TURNSTILE_SITE_KEY</code> and <code>TURNSTILE_SECRET_KEY</code> on Render, then generate new links. The existing-form webhook and Developer API are already available.</div>
        )}
        <IntegrationCard icon={Webhook} title="2B. Connect an existing website form" subtitle="Use this secret URL in form tools and automation platforms. It accepts flat JSON or normal form fields such as name/full_name, phone/mobile, email, message/comments, and UTM fields.">
          <CodeBlock value={credentials.webhookUrl} onCopy={() => copy("webhook", credentials.webhookUrl)} copied={copied === "webhook"} />
          <p className="mt-3 text-xs text-ink-muted">For Elementor, WPForms, Contact Form 7, Webflow, Zapier, Make, or Pabbly: choose a POST webhook action, paste this URL, and map fields to the flat payload below. For providers with nested payloads (such as Typeform), use a Zapier/Make/Pabbly mapping step.</p>
          <details className="mt-3 rounded-lg bg-cream-50 p-3"><summary className="cursor-pointer text-sm font-medium text-ink">View a sample webhook payload</summary><pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-ink-soft">{webhookExample}</pre></details>
        </IntegrationCard>
      </section>}

      <section className="card mt-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div className="flex items-start gap-3"><div className="rounded-xl bg-ink p-2.5 text-white"><Braces size={22} /></div><div><h2 className="font-semibold text-ink">3. Developer API for coded websites</h2><p className="mt-1 max-w-2xl text-sm text-ink-soft">Use this only from a server, serverless function, or backend API route. Never expose this key in browser JavaScript.</p></div></div><button onClick={generateDeveloperApi} disabled={apiBusy} className="btn btn-secondary shrink-0"><KeyRound size={16} />{apiBusy ? "Generating…" : "Generate developer API key"}</button></div>
        {developerApi && <div className="mt-5 space-y-4"><div className="rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-700"><LockKeyhole size={15} className="mr-1 inline" /> Copy this key now. A future key rotation will invalidate it.</div><Field label="Protected endpoint"><CodeBlock value={developerApi.endpoint} onCopy={() => copy("developer-endpoint", developerApi.endpoint)} copied={copied === "developer-endpoint"} /></Field><Field label="Secret API key"><CodeBlock value={developerApi.key} onCopy={() => copy("developer-key", developerApi.key)} copied={copied === "developer-key"} /></Field><details className="rounded-lg bg-cream-50 p-3"><summary className="cursor-pointer text-sm font-medium text-ink">View Node / Next.js server example</summary><pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-ink-soft">{developerExample}</pre></details></div>}
      </section>

      <section className="mt-6 rounded-xl border border-cream-300 bg-cream-50 p-5 text-sm text-ink-soft"><div className="flex items-start gap-2"><Send size={18} className="mt-0.5 shrink-0 text-orange-600" /><p><strong className="text-ink">Every valid submission</strong> is duplicate-checked, assigned with your workspace rule, counted against the plan lead limit, and sent to the assigned employee as a notification. The webhook and developer URLs are secrets—share only with the relevant client or developer. The hosted form link is public by design and protected with Turnstile.</p></div></section>
    </Layout>
  );
}

function Field({ label, children }) {
  return <label className="block text-sm font-medium text-ink">{label}<span className="mt-1.5 block">{children}</span></label>;
}

function Guide({ icon: Icon, title, text }) {
  return <div className="flex gap-3 rounded-xl border border-cream-300/70 bg-cream-50 p-3"><Icon size={18} className="mt-0.5 shrink-0 text-orange-600" /><div><h3 className="text-sm font-semibold text-ink">{title}</h3><p className="mt-1 text-xs leading-5 text-ink-soft">{text}</p></div></div>;
}

function IntegrationCard({ icon: Icon, title, subtitle, children }) {
  return <article className="card p-6"><div className="flex items-start gap-3"><div className="rounded-xl bg-orange-100 p-2.5 text-orange-700"><Icon size={22} /></div><div><h2 className="font-semibold text-ink">{title}</h2><p className="mt-1 text-sm text-ink-soft">{subtitle}</p></div></div><div className="mt-5">{children}</div></article>;
}

function CodeBlock({ value, onCopy, copied }) {
  return <div className="relative"><pre className="max-h-72 overflow-auto rounded-xl bg-ink p-4 pr-28 text-xs leading-5 text-cream-100"><code>{value}</code></pre><button onClick={onCopy} className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/20"><Copy size={13} />{copied ? "Copied" : "Copy"}</button></div>;
}
