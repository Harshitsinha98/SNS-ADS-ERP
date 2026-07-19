import { useState, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { useData } from "../../context/DataContext";
import { useAuth } from "../../context/AuthContext";
import { parseCSV, toCSV, fmtDate } from "../../utils/helpers";
import { StatusLamp } from "../../components/StatusLamp";
import { Upload, Download, RefreshCw, RotateCcw } from "lucide-react";

const PRIORITIES = ["Hot", "Warm", "Cold"];
const SECTIONS = ["Active", "Lost"];

const priorityClass = (p) => {
  switch (p) {
    case "Hot": return "bg-red-50 text-red-700 border-red-200";
    case "Warm": return "bg-amber-50 text-amber-700 border-amber-200";
    case "Cold": return "bg-blue-50 text-blue-700 border-blue-200";
    default: return "border-paper-line";
  }
};

// A lead moves to the "Lost" section automatically only when it has been
// blacklisted OR its status is manually set to "Lost" — covers both paths.
const isLost = (l) => l.blacklisted === true || l.status === "Lost";

export default function LeadHub() {
  const { user } = useAuth();
  const { leads, users, settings, updateLead, reassignLead, blacklistLead, addBulkLeads, triggerWhatsAppSync, updatePriority } = useData();
  const [section, setSection] = useState("Active");
  const [sortBy, setSortBy] = useState("createdAt");
  const [filterStatus, setFilterStatus] = useState("All");
  const [syncing, setSyncing] = useState(false);
  // Keep one idempotency key for a selected CSV so a timeout/partial failure
  // can be safely retried by selecting the same file again.
  const importIdsRef = useRef(new Map());
  const employees = users.filter((u) => u.role === "employee");

  const activeLeads = useMemo(() => leads.filter((l) => !isLost(l)), [leads]);
  const lostLeads = useMemo(() => leads.filter(isLost), [leads]);

  // Removed "Lost" from the Active tab's status filter — it now has its own tab
  const activeStatuses = settings.statuses.filter((s) => s !== "Lost");

  const view = useMemo(() => {
    let list = section === "Active" ? [...activeLeads] : [...lostLeads];
    if (section === "Active" && filterStatus !== "All") list = list.filter((l) => l.status === filterStatus);
    list.sort((a, b) => (a[sortBy] > b[sortBy] ? 1 : -1));
    return list;
  }, [activeLeads, lostLeads, section, sortBy, filterStatus]);

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const importKey = `${file.name}:${file.size}:${file.lastModified}`;
    const importId = importIdsRef.current.get(importKey)
      || globalThis.crypto?.randomUUID?.()
      || `import_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    importIdsRef.current.set(importKey, importId);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const rows = parseCSV(ev.target.result);
        const count = await addBulkLeads(rows, settings.autoAssign, importId);
        importIdsRef.current.delete(importKey);
        alert(`${count} leads imported & auto-assigned (${settings.autoAssign}).`);
      } catch (error) {
        // Retain this key for a safe retry of the same file. The backend also
        // returns it with an error if the first request reached the server.
        if (error.importId) importIdsRef.current.set(importKey, error.importId);
        alert(error.message || "Could not import leads.");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    const blob = new Blob([toCSV(leads)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "leads_export.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await triggerWhatsAppSync();
      alert(
        result.imported > 0
          ? `${result.imported} new WhatsApp lead(s) imported.`
          : "No new pending leads found. New leads arrive in real time via the webhook — this button only retries leads that were previously stuck."
      );
    } catch (e) {
      console.error("Sync error:", e);
      alert("Sync failed — couldn't connect to the backend. Check the Render logs; the service may be down.");
    } finally {
      setSyncing(false);
    }
  };

  // NEW: bring a Lost lead back to Active in one click —
  // reset the status to "New" so an employee can work on it again.
  const restoreLead = (l) => {
    updateLead(l.id, { blacklisted: false, status: "New" }, user);
  };

  return (
    <Layout title="Centralized Lead Hub">
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <label className="flex items-center gap-1.5 bg-ink text-white px-4 py-2 rounded-md cursor-pointer text-sm">
          <Upload size={14} /> Bulk import (CSV)
          <input type="file" accept=".csv" onChange={handleImport} className="hidden" />
        </label>
        <button onClick={handleExport} className="flex items-center gap-1.5 bg-white border border-paper-line px-4 py-2 rounded-md text-sm">
          <Download size={14} /> Export CSV
        </button>
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-1.5 bg-ok text-white px-4 py-2 rounded-md text-sm disabled:opacity-50">
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} /> {syncing ? "Syncing…" : "Sync WhatsApp now"}
        </button>
      </div>

      {/* Active / Lost tabs */}
      <div className="flex gap-2 mb-4">
        {SECTIONS.map((s) => (
          <button key={s} onClick={() => setSection(s)}
            className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
              section === s ? "bg-ink text-white border-ink" : "bg-white border-paper-line text-ink/60 hover:bg-paper"
            }`}>
            {s} <span className="num">({s === "Active" ? activeLeads.length : lostLeads.length})</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-3 items-center">
        {section === "Active" && (
          <select className="border border-paper-line rounded-md p-2 text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option>All</option>
            {activeStatuses.map((s) => <option key={s}>{s}</option>)}
          </select>
        )}
        <select className="border border-paper-line rounded-md p-2 text-sm sm:ml-auto" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
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
            <th className="font-medium">Status</th>
            <th className="font-medium">Assigned</th>
            <th className="font-medium">{section === "Active" ? "Created" : "Lost on"}</th>
            <th className="font-medium">Actions</th>
          </tr></thead>
          <tbody>
            {view.map((l) => (
              <tr key={l.id} className={`border-b border-paper-line last:border-0 ${section === "Lost" ? "bg-danger-soft/20" : "hover:bg-paper/50"}`}>
                <td className="p-3 num text-ink/50">{l.id}</td>
                <td><Link to={`/admin/leads/${l.id}`} className="font-medium hover:underline">{l.name}</Link></td>
                <td>{l.source}</td>
                {section === "Active" && (
                  <td>
                    <select
                      value={l.priority || "Warm"}
                      onChange={(e) => updatePriority(l.id, e.target.value, user)}
                      className={`border rounded p-1 text-xs font-medium ${priorityClass(l.priority)}`}
                    >
                      {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </td>
                )}
                <td><StatusLamp status={l.status} /></td>
                <td>
                  {section === "Active" ? (
                    <select value={l.assignedTo || ""}
                      onChange={(e) => reassignLead(l.id, e.target.value, employees.find((u) => u.id === e.target.value)?.name, user)}
                      className="border border-paper-line rounded p-1 text-xs">
                      {employees.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-ink/50">{employees.find((u) => u.id === l.assignedTo)?.name || l.assignedTo || "—"}</span>
                  )}
                </td>
                <td className="text-xs num text-ink/40">{fmtDate(section === "Active" ? l.createdAt : l.lastUpdated)}</td>
                <td>
                  {section === "Active" ? (
                    <button onClick={() => blacklistLead(l.id)} className="text-danger text-xs hover:underline">Blacklist</button>
                  ) : (
                    <button onClick={() => restoreLead(l)} className="flex items-center gap-1 text-info text-xs hover:underline">
                      <RotateCcw size={11} /> Restore to active
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {view.length === 0 && (
              <tr><td colSpan={section === "Active" ? 8 : 7} className="text-ink/40 p-4 text-center">
                {section === "Active" ? "No active leads found." : "No lost/blacklisted leads. 🎉"}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink/35 mt-2">CSV headers expected: name, phone, email, source, requirement</p>
    </Layout>
  );
}