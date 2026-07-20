import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";

const BACKEND_URL = String(import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  const existing = document.querySelector('script[data-codeskate-turnstile="true"]');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(window.turnstile), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load security check")), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.codeskateTurnstile = "true";
    script.onload = () => resolve(window.turnstile);
    script.onerror = () => reject(new Error("Could not load security check"));
    document.head.appendChild(script);
  });
}

export default function WebsiteLeadForm() {
  const { orgId, token } = useParams();
  const turnstileMount = useRef(null);
  const turnstileWidgetId = useRef(null);
  const [config, setConfig] = useState(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", email: "", requirement: "", _cskWebsite: "" });
  const [status, setStatus] = useState({ state: "loading", message: "Loading form…" });

  useEffect(() => {
    if (!BACKEND_URL) {
      setStatus({ state: "error", message: "This form is not configured yet." });
      return;
    }
    const controller = new AbortController();
    fetch(`${BACKEND_URL}/api/leads/public-form/${encodeURIComponent(orgId)}/${encodeURIComponent(token)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not load this form");
        setConfig(data);
        setStatus({ state: "ready", message: "" });
      })
      .catch((error) => {
        if (error.name !== "AbortError") setStatus({ state: "error", message: error.message || "Could not load this form" });
      });
    return () => controller.abort();
  }, [orgId, token]);

  useEffect(() => {
    if (!config?.turnstileSiteKey || !turnstileMount.current) return undefined;
    let disposed = false;
    loadTurnstileScript()
      .then((turnstile) => {
        if (disposed || !turnstile || !turnstileMount.current) return;
        turnstileWidgetId.current = turnstile.render(turnstileMount.current, {
          sitekey: config.turnstileSiteKey,
          callback: (challengeToken) => setTurnstileToken(challengeToken),
          "expired-callback": () => setTurnstileToken(""),
          "error-callback": () => setTurnstileToken(""),
          theme: "light",
        });
      })
      .catch((error) => !disposed && setStatus({ state: "error", message: error.message || "Could not load security check" }));
    return () => {
      disposed = true;
      if (window.turnstile && turnstileWidgetId.current !== null) window.turnstile.remove(turnstileWidgetId.current);
      turnstileWidgetId.current = null;
    };
  }, [config?.turnstileSiteKey]);

  const submit = async (event) => {
    event.preventDefault();
    if (!turnstileToken) {
      setStatus({ state: "error", message: "Please complete the security check before submitting." });
      return;
    }
    setStatus({ state: "sending", message: "Sending your enquiry…" });
    try {
      const response = await fetch(`${BACKEND_URL}/api/leads/public-form/${encodeURIComponent(orgId)}/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, turnstileToken }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not submit your enquiry");
      setStatus({ state: "success", message: config?.successMessage || "Thank you. Our team will contact you shortly." });
    } catch (error) {
      setTurnstileToken("");
      if (window.turnstile && turnstileWidgetId.current !== null) window.turnstile.reset(turnstileWidgetId.current);
      setStatus({ state: "error", message: error.message || "Could not submit your enquiry" });
    }
  };

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  if (status.state === "loading") {
    return <Page><div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-soft"><LoaderCircle className="animate-spin" size={18} /> Loading secure form…</div></Page>;
  }

  if (status.state === "error" && !config) {
    return <Page><div className="rounded-xl border border-danger-200 bg-danger-50 p-5 text-center text-sm text-danger-700">{status.message}</div></Page>;
  }

  if (status.state === "success") {
    return <Page><div className="py-12 text-center"><CheckCircle2 className="mx-auto mb-3 text-success-600" size={44} /><h1 className="text-xl font-bold text-ink">Enquiry received</h1><p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">{status.message}</p></div></Page>;
  }

  return (
    <Page>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-ink">{config?.formTitle || "Talk to our team"}</h1>
        <p className="mt-2 text-sm text-ink-soft">Share your details and our team will get in touch.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Your name"><input required value={form.name} onChange={update("name")} className="input" autoComplete="name" placeholder="Your full name" /></Field>
        <Field label="Phone number"><input value={form.phone} onChange={update("phone")} className="input" autoComplete="tel" inputMode="tel" placeholder="9876543210" /></Field>
        <Field label="Email address"><input type="email" value={form.email} onChange={update("email")} className="input" autoComplete="email" placeholder="you@example.com" /></Field>
        <Field label="How can we help?"><textarea value={form.requirement} onChange={update("requirement")} className="input min-h-28 resize-y" placeholder="Tell us what you are looking for" /></Field>
        <input value={form._cskWebsite} onChange={update("_cskWebsite")} className="absolute -left-[10000px] h-px w-px opacity-0" tabIndex="-1" autoComplete="off" aria-hidden="true" />
        <p className="text-xs text-ink-muted">Please provide at least a phone number or email address.</p>
        <div ref={turnstileMount} className="min-h-[65px]" />
        {!turnstileToken && <p className="text-xs text-ink-muted">Complete the security check to enable submission.</p>}
        {status.state === "error" && <p className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{status.message}</p>}
        <button disabled={status.state === "sending" || !turnstileToken} className="btn btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60">
          {status.state === "sending" && <LoaderCircle size={16} className="animate-spin" />}
          {status.state === "sending" ? "Sending…" : config?.submitLabel || "Send enquiry"}
        </button>
      </form>
      <div className="mt-5 flex items-center justify-center gap-1.5 text-xs text-ink-muted"><ShieldCheck size={14} /> Protected by Cloudflare Turnstile</div>
    </Page>
  );
}

function Field({ label, children }) {
  return <label className="block text-sm font-medium text-ink">{label}{children}</label>;
}

function Page({ children }) {
  return <main className="min-h-screen bg-cream-100 p-4 font-body"><section className="mx-auto w-full max-w-xl rounded-2xl border border-cream-300/70 bg-white p-6 shadow-card sm:p-8">{children}</section></main>;
}
