import { useState, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { useData } from "../../context/DataContext";
import { useAuth } from "../../context/AuthContext";
import { parseCSV, toCSV, fmtDate } from "../../utils/helpers";
import { StatusLamp } from "../../components/StatusLamp";
import { Upload, Download, RefreshCw, RotateCcw, Plus, KeyRound, Copy, X, CheckCircle } from "lucide-react";

const PRIORITIES = ["Hot", "Warm", "Cold"];
const SECTIONS = ["Active", "Lost"];
const EMPTY_LEAD = { name: "", phone: "", email: "", source: "Manual", campaign: "", requirement: "", priority: "Warm" };

const priorityClass = (p) => {
  switch (p) {
    case "Hot": return "bg-red-50 text-red-700 border-red-200";
    case "Warm": return "bg-amber-50 text-amber-700 border-amber-200";
    case "Cold": return "bg-blue-50 text-blue-700 border-blue-200";
    default: return "border-paper-line";
  }
};

const isLost = (lead) => lead.blacklisted === true || lead.status === "Lost";

export default function LeadHub() {
  const { user } = useAuth();
  const {
    leads, users, settings, updateLead, reassignLead, blacklistLead, addBulkLeads,
    addManualLead, createWebsiteLeadIntakeKey, triggerWhatsAppSync, updatePriority,
  } = useData();
  const [section, setSection] = useState("Active");
  const [sortBy, setSortBy] = useState("createdAt");
  const [filterStatus, setFilterStatus] = useState("All");
  const [syncing, setSyncing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [leadForm, setLeadForm] = useState(EMPTY_LEAD);
  const [leadSaving, setLeadSaving] = useState(false);
  const [leadMessage, setLeadMessage] = useState("");
  const [showApi, setShowApi] = useState(false);
  const [apiBusy, setApiBusy] = useState(false);
  const [apiData, setApiData] = useState(null);
  const [copied, setCopied] = useState(false);
  const importIdsRef = useRef(new Map());
  const employees = users.filter((member) => member.role === "employee" && !member.pending);

  const activeLeads = useMemo(() => leads.filter((lead) => !isLost(lead)), [leads]);
  const lostLeads = useMemo(() => leads.filter(isLost), [leads]);
  const activeStatuses = settings.statuses.filter((status) => status !== "Lost");
  const view = useMemo(() => {
    let list = section === "Active" ? [...activeLeads] : [...lostLeads];
    if (section === "Active" && filterStatus !== "All") list = list.filter((lead) => lead.status === filterStatus);
    list.sort((a, b) => String(a[sortBy] || "").localeCompare(String(b[sortBy] || "")));
    return list;
  }, [activeLeads, lostLeads, section, sortBy, filterStatus]);

  const handleImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const importKey = `${file.name}:${file.size}:${file.lastModified}`;
    const importId = importIdsRef.current.get(importKey)
      || globalThis.crypto?.randomUUID?.()
      || `import_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    importIdsRef.current.set(importKey, importId);
    const reader = new FileReader();
    reader.onload = async (loadEvent) => {
      try {
        const rows = parseCSV(loadEvent.target.result);
        const count = await addBulkLeads(rows, settings.autoAssign, importId);
        importIdsRef.current.delete(importKey);
        alert(`${count} leads imported and auto-assigned (${settings.autoAssign}).`);
      } catch (error) {
        if (error.importId) importIdsRef.current.set(importKey, error.importId);
        alert(error.message || "Could not import leads.");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    const blob = new Blob([toCSV(leads)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "leads_export.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await triggerWhatsAppSync();
      alert(result.imported > 0
        ? `${result.imported} new WhatsApp lead(s) imported.`
        : "No pending WhatsApp leads found. New messages arrive in real time.");
    } catch (error) {
      console.error("Sync error:", error);
      alert("Sync failed. Check the backend connection and Render logs.");
    } finally {
      setSyncing(false);
    }
  };

  const handleManualLead = async (event) => {
    event.preventDefault();
    if (!leadForm.phone.trim() && !leadForm.email.trim()) {
      setLeadMessage("Enter at least a phone number or email address.");
      return;
    }
    setLeadSaving(true);
    setLeadMessage("");
    try {
      const result = await addManualLead(leadForm);
      if (result.duplicate) {
        setLeadMessage(`Duplicate found by ${result.duplicateReason.replaceAll("_", " ")}. Existing lead: ${result.leadId}`);
        return;
      }
      setLeadForm(EMPTY_LEAD);
      setShowCreate(false);
      setLeadMessage(`Lead created and assigned to ${result.assignedToName || "the next available employee"}.`);
    } catch (error) {
      setLeadMessage(error.message || "Could not create lead.");
    } finally {
      setLeadSaving(false);
    }
  };

  const openWebsiteApi = () => {
    setApiData(null);
    setCopied(false);
    setShowApi(true);
  };

  const generateWebsiteKey = async () => {
    setApiBusy(true);
    try {
      setApiData(await createWebsiteLeadIntakeKey());
    } catch (error) {
      setApiData({ error: error.message || "Could not generate the website intake key." });
    } finally {
      setApiBusy(false);
    }
  };

  const copyApiExample = async () => {
    if (!apiData?.key || !apiData?.endpoint) return;
    const example = `curl -X POST '${apiData.endpoint}' \\\n  -H 'Content-Type: application/json' \\\n  -H 'x-codeskate-intake-key: ${apiData.key}' \\\n  -d '{"name":"Website Visitor","phone":"9876543210","email":"visitor@example.com","requirement":"Interested in a demo","campaign":"Google Search","utmSource":"google","utmMedium":"cpc","utmCampaign":"crm-launch","externalLeadId":"your-form-submission-id"}'`;
    await navigator.clipboard?.writeText(example);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const restoreLead = (lead) => updateLead(lead.id, { blacklisted: false, status: "New" }, user);

  return (
    <Layout title="Centralized Lead Hub">
      {leadMessage && (
        <div className="mb-4 rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700" role="status">
          {leadMessage}
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <button onClick={() => { setLeadForm(EMPTY_LEAD); setLeadMessage(""); setShowCreate(true); }} className="flex items-center gap-1.5 bg-success-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-success-700 transition-colors">
          <Plus size={14} /> Add lead
        </button>
        <label className="flex items-center gap-1.5 bg-ink text-white px-4 py-2 rounded-md cursor-pointer text-sm">
          <Upload size={14} /> Bulk import (CSV)
          <input type="file" accept=".csv" onChange={handleImport} className="hidden" />
        </label>
        <button onClick={handleExport} className="flex items-center gap-1.5 bg-white border border-paper-line px-4 py-2 rounded-md text-sm">
          <Download size={14} /> Export CSV
        </button>
        <button onClick={openWebsiteApi} className="flex items-center gap-1.5 bg-white border border-paper-line px-4 py-2 rounded-md text-sm hover:bg-paper">
          <KeyRound size={14} /> Website API
        </button>
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-1.5 bg-success-600 text-white px-4 py-2 rounded-md text-sm disabled:opacity-50 hover:bg-success-700 transition-colors">
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} /> {syncing ? "Syncing…" : "Sync WhatsApp now"}
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {SECTIONS.map((tab) => (
          <button key={tab} onClick={() => setSection(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
              section === tab ? "bg-ink text-white border-ink" : "bg-white border-paper-line text-ink/60 hover:bg-paper"
            }`}>
            {tab} <span className="num">({tab === "Active" ? activeLeads.length : lostLeads.length})</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-3 items-center">
        {section === "Active" && (
          <select className="border border-paper-line rounded-md p-2 text-sm" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}>
            <option>All</option>
            {activeStatuses.map((status) => <option key={status}>{status}</option>)}
          </select>
        )}
        <select className="border border-paper-line rounded-md p-2 text-sm sm:ml-auto" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
          <option value="createdAt">Sort: Date</option>
          <option value="status">Sort: Status</option>
          <option value="source">Sort: Source</option>
          <option value="assignedTo">Sort: Employee</option>
        </select>
      </div>

      <div className="bg-white rounded-lg shadow-card border border-paper-line overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead><tr className="text-left text-ink/40 border-b border-paper-line bg-paper/60">
            <th className="p-3 font-medium">ID</th><th className="font-medium">Name</th><th className="font-medium">Source</th>
            {section === "Active" && <th className="font-medium">Priority</th>}
            <th className="font-medium">Status</th><th className="font-medium">Assigned</th>
            <th className="font-medium">{section === "Active" ? "Created" : "Lost on"}</th><th className="font-medium">Actions</th>
          </tr></thead>
          <tbody>
            {view.map((lead) => (
              <tr key={lead.id} className={`border-b border-paper-line last:border-0 ${section === "Lost" ? "bg-danger-soft/20" : "hover:bg-paper/50"}`}>
                <td className="p-3 num text-ink/50">{lead.id}</td>
                <td><Link to={`/admin/leads/${lead.id}`} className="font-medium hover:underline">{lead.name}</Link></td>
                <td>{lead.source}</td>
                {section === "Active" && (
                  <td><select value={lead.priority || "Warm"} onChange={(event) => updatePriority(lead.id, event.target.value, user)} className={`border rounded p-1 text-xs font-medium ${priorityClass(lead.priority)}`}>
                    {PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}
                  </select></td>
                )}
                <td><StatusLamp status={lead.status} /></td>
                <td>{section === "Active" ? (
                  <select value={lead.assignedTo || ""} onChange={(event) => reassignLead(lead.id, event.target.value, employees.find((member) => member.id === event.target.value)?.name, user)} className="border border-paper-line rounded p-1 text-xs">
                    {employees.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                  </select>
                ) : <span className="text-xs text-ink/50">{employees.find((member) => member.id === lead.assignedTo)?.name || lead.assignedTo || "—"}</span>}</td>
                <td className="text-xs num text-ink/40">{fmtDate(section === "Active" ? lead.createdAt : lead.lastUpdated)}</td>
                <td>{section === "Active" ? (
                  <button onClick={() => blacklistLead(lead.id)} className="text-danger text-xs hover:underline">Blacklist</button>
                ) : (
                  <button onClick={() => restoreLead(lead)} className="flex items-center gap-1 text-info text-xs hover:underline"><RotateCcw size={11} /> Restore to active</button>
                )}</td>
              </tr>
            ))}
            {view.length === 0 && <tr><td colSpan={section === "Active" ? 8 : 7} className="text-ink/40 p-4 text-center">{section === "Active" ? "No active leads found." : "No lost or blacklisted leads."}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink/35 mt-2">CSV headers expected: name, phone, email, source, requirement</p>

      {showCreate && (
        <Modal title="Add a lead" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleManualLead} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Name"><input required value={leadForm.name} onChange={(event) => setLeadForm({ ...leadForm, name: event.target.value })} className="input" placeholder="Customer name" /></Field>
              <Field label="Phone"><input value={leadForm.phone} onChange={(event) => setLeadForm({ ...leadForm, phone: event.target.value })} className="input" placeholder="9876543210" /></Field>
              <Field label="Email"><input type="email" value={leadForm.email} onChange={(event) => setLeadForm({ ...leadForm, email: event.target.value })} className="input" placeholder="customer@example.com" /></Field>
              <Field label="Source"><select value={leadForm.source} onChange={(event) => setLeadForm({ ...leadForm, source: event.target.value })} className="input">
                {["Manual", "Referral", "Walk-in", "Phone Call", "Website", "Other"].map((source) => <option key={source}>{source}</option>)}
              </select></Field>
              <Field label="Campaign"><input value={leadForm.campaign} onChange={(event) => setLeadForm({ ...leadForm, campaign: event.target.value })} className="input" placeholder="Optional campaign" /></Field>
              <Field label="Priority"><select value={leadForm.priority} onChange={(event) => setLeadForm({ ...leadForm, priority: event.target.value })} className="input">
                {PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}
              </select></Field>
            </div>
            <Field label="Requirement / note"><textarea value={leadForm.requirement} onChange={(event) => setLeadForm({ ...leadForm, requirement: event.target.value })} className="input min-h-24" placeholder="What is the customer looking for?" /></Field>
            <p className="text-xs text-ink/50">At least a phone number or email is required. Existing phone/email matches are returned as duplicates instead of creating another lead.</p>
            <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setShowCreate(false)} className="btn btn-secondary">Cancel</button><button disabled={leadSaving} className="btn btn-primary">{leadSaving ? "Creating…" : "Create & auto-assign"}</button></div>
          </form>
        </Modal>
      )}

      {showApi && (
        <Modal title="Website lead intake API" onClose={() => setShowApi(false)}>
          {!apiData && <>
            <p className="text-sm text-ink-soft">Generate a workspace-specific key for a website backend, form provider, Zapier, Make, or Pabbly. Generating a new key immediately disables the previous key.</p>
            <p className="text-xs text-warning-700 bg-warning-50 border border-warning-200 rounded p-3 mt-3">Do not put this secret key in public browser JavaScript. Call this API from your website server or an automation provider.</p>
            <button onClick={generateWebsiteKey} disabled={apiBusy} className="btn btn-primary mt-4">{apiBusy ? "Generating…" : "Generate website key"}</button>
          </>}
          {apiData?.error && <div className="space-y-3"><p className="text-sm text-danger">{apiData.error}</p><button onClick={generateWebsiteKey} disabled={apiBusy} className="btn btn-secondary">{apiBusy ? "Retrying…" : "Try again"}</button></div>}
          {apiData?.key && <>
            <div className="rounded-md bg-success-50 border border-success-200 p-3 text-sm text-success-700 flex gap-2"><CheckCircle size={18} className="shrink-0" />Copy this key now. It is shown only once and a new key replaces it.</div>
            <Field label="Endpoint"><input readOnly value={apiData.endpoint} className="input mt-1 bg-paper" /></Field>
            <Field label="Website intake key"><input readOnly value={apiData.key} className="input mt-1 font-mono text-xs bg-paper" /></Field>
            <button onClick={copyApiExample} className="btn btn-secondary mt-4"><Copy size={14} /> {copied ? "Copied" : "Copy cURL example"}</button>
          </>}
        </Modal>
      )}
    </Layout>
  );
}

function Field({ label, children }) {
  return <label className="block text-sm font-medium text-ink">{label}{children}</label>;
}

function Modal({ title, children, onClose }) {
  return <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-4">
    <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
      <div className="flex items-center justify-between gap-3 mb-4"><h2 className="text-lg font-semibold text-ink">{title}</h2><button onClick={onClose} className="p-1 text-ink-soft hover:text-ink" aria-label="Close"><X size={20} /></button></div>
      {children}
    </div>
  </div>;
}
