import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { useData } from "../../context/DataContext";
import { useAuth } from "../../context/AuthContext";
import { parseCSV, toCSV, fmtDate } from "../../utils/helpers";
import { StatusLamp } from "../../components/StatusLamp";
import { Upload, Download, RefreshCw } from "lucide-react";

const PRIORITIES = ["Hot", "Warm", "Cold"];

const priorityClass = (p) => {
  switch (p) {
    case "Hot": return "bg-red-50 text-red-700 border-red-200";
    case "Warm": return "bg-amber-50 text-amber-700 border-amber-200";
    case "Cold": return "bg-blue-50 text-blue-700 border-blue-200";
    default: return "border-paper-line";
  }
};

export default function LeadHub() {
  const { user } = useAuth();
  const { leads, users, settings, reassignLead, blacklistLead, addBulkLeads, triggerWhatsAppSync, updatePriority } = useData();
  const [sortBy, setSortBy] = useState("createdAt");
  const [filterStatus, setFilterStatus] = useState("All");
  const [syncing, setSyncing] = useState(false);
  const employees = users.filter((u) => u.role === "employee");

  const view = useMemo(() => {
    let list = [...leads];
    if (filterStatus !== "All") list = list.filter((l) => l.status === filterStatus);
    list.sort((a, b) => (a[sortBy] > b[sortBy] ? 1 : -1));
    return list;
  }, [leads, sortBy, filterStatus]);

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target.result);
      const count = addBulkLeads(rows, settings.autoAssign);
      alert(`${count} leads imported & auto-assigned (${settings.autoAssign}).`);
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
          : "Koi naya pending lead nahi mila. Naye leads webhook se real-time aate hain — ye button sirf pehle se atki hui leads ko retry karta hai."
      );
    } catch (e) {
      console.error("Sync error:", e);
      alert("Sync failed — backend se connect nahi ho paaya. Render logs check karo, service down ho sakti hai.");
    } finally {
      setSyncing(false);
    }
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
        <select className="border border-paper-line rounded-md p-2 text-sm sm:ml-auto" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option>All</option>
          {settings.statuses.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="border border-paper-line rounded-md p-2 text-sm" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
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
            <th className="font-medium">Priority</th><th className="font-medium">Status</th>
            <th className="font-medium">Assigned</th><th className="font-medium">Created</th><th className="font-medium">Actions</th>
          </tr></thead>
          <tbody>
            {view.map((l) => (
              <tr key={l.id} className={`border-b border-paper-line last:border-0 ${l.blacklisted ? "bg-danger-soft/30 opacity-60" : "hover:bg-paper/50"}`}>
                <td className="p-3 num text-ink/50">{l.id}</td>
                <td><Link to={`/admin/leads/${l.id}`} className="font-medium hover:underline">{l.name}</Link></td>
                <td>{l.source}</td>
                <td>
                  <select
                    value={l.priority || "Warm"}
                    onChange={(e) => updatePriority(l.id, e.target.value, user)}
                    className={`border rounded p-1 text-xs font-medium ${priorityClass(l.priority)}`}
                  >
                    {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </td>
                <td><StatusLamp status={l.status} /></td>
                <td>
                  {/* FIX: employeeName + user pass kiya, pehle sirf 2 args jaate the —
                      assignedToName hamesha null save hota tha */}
                  <select value={l.assignedTo || ""}
                    onChange={(e) => reassignLead(l.id, e.target.value, employees.find((u) => u.id === e.target.value)?.name, user)}
                    className="border border-paper-line rounded p-1 text-xs">
                    {employees.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </td>
                <td className="text-xs num text-ink/40">{fmtDate(l.createdAt)}</td>
                <td>
                  {!l.blacklisted && (
                    <button onClick={() => blacklistLead(l.id)} className="text-danger text-xs hover:underline">Blacklist</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink/35 mt-2">CSV headers expected: name, phone, email, source, requirement</p>
    </Layout>
  );
}