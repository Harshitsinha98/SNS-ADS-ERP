/**
 * Employee My Leads Page.
 *
 * A dedicated, organized view of all leads assigned to the current employee.
 * Supports search, priority/status filters, and quick actions (call, WhatsApp, status change).
 */

import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Search, Filter, Phone, MessageCircle, ArrowUpDown,
  Flame, Thermometer, Snowflake, ChevronRight, Inbox,
} from "lucide-react";
import Layout from "../../components/Layout";
import { useData } from "../../context/DataContext";
import { useAuth } from "../../context/AuthContext";
import { StatusLamp, PriorityBadge } from "../../components/StatusLamp";
import { daysSince, toWaNumber } from "../../utils/helpers";

const PRIORITY_ORDER = { Hot: 0, Warm: 1, Cold: 2 };

export default function MyLeads() {
  const { user } = useAuth();
  const { leads, settings, updateLeadStatus, addNote } = useData();
  const employeeName = user?.displayName || user?.name || "Agent";

  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [sortBy, setSortBy] = useState("lastUpdated"); // lastUpdated | priority | name | createdAt

  const myLeads = useMemo(() => {
    let filtered = leads.filter((l) => l.assignedTo === user?.id && !l.blacklisted);

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((l) =>
        (l.name || "").toLowerCase().includes(q) ||
        (l.phone || "").includes(q) ||
        (l.requirement || "").toLowerCase().includes(q)
      );
    }
    if (filterPriority) filtered = filtered.filter((l) => l.priority === filterPriority);
    if (filterStatus) filtered = filtered.filter((l) => l.status === filterStatus);

    filtered.sort((a, b) => {
      if (sortBy === "priority") return (PRIORITY_ORDER[a.priority] || 2) - (PRIORITY_ORDER[b.priority] || 2);
      if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
      if (sortBy === "createdAt") return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      return new Date(b.lastUpdated || 0) - new Date(a.lastUpdated || 0);
    });

    return filtered;
  }, [leads, user?.id, search, filterPriority, filterStatus, sortBy]);

  const stats = useMemo(() => {
    const all = leads.filter((l) => l.assignedTo === user?.id && !l.blacklisted);
    return {
      total: all.length,
      hot: all.filter((l) => l.priority === "Hot" && !["Closed-Won", "Lost"].includes(l.status)).length,
      new: all.filter((l) => l.status === "New").length,
      idle: all.filter((l) => !["Closed-Won", "Lost"].includes(l.status) && daysSince(l.lastUpdated) >= 2).length,
    };
  }, [leads, user?.id]);

  const quickCall = (lead) => {
    addNote(lead.id, "Call initiated from My Leads", "call", {
      authorId: user.id, authorName: employeeName, authorRole: user.role, visibility: "team",
    });
    window.location.href = `tel:${lead.phone}`;
  };

  const quickWhatsApp = (lead) => {
    addNote(lead.id, "WhatsApp opened from My Leads", "whatsapp", {
      authorId: user.id, authorName: employeeName, authorRole: user.role, visibility: "team",
    });
    window.open(`https://wa.me/${toWaNumber(lead.phone)}`, "_blank");
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Inbox size={24} className="text-orange-500" />
            <div>
              <h1 className="text-xl font-display font-bold text-ink">My Leads</h1>
              <p className="text-sm text-ink-muted">{stats.total} total · {stats.hot} hot · {stats.new} new · {stats.idle} idle</p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <button onClick={() => { setFilterPriority(""); setFilterStatus(""); }}
            className={`rounded-xl border p-3 text-center transition-all ${!filterPriority && !filterStatus ? "border-orange-300 bg-orange-50" : "border-cream-200 hover:border-orange-200"}`}>
            <p className="text-lg font-bold text-ink">{stats.total}</p>
            <p className="text-[11px] text-ink-muted">All Leads</p>
          </button>
          <button onClick={() => { setFilterPriority("Hot"); setFilterStatus(""); }}
            className={`rounded-xl border p-3 text-center transition-all ${filterPriority === "Hot" ? "border-red-300 bg-red-50" : "border-cream-200 hover:border-red-200"}`}>
            <p className="text-lg font-bold text-red-600">{stats.hot}</p>
            <p className="text-[11px] text-ink-muted">Hot</p>
          </button>
          <button onClick={() => { setFilterStatus("New"); setFilterPriority(""); }}
            className={`rounded-xl border p-3 text-center transition-all ${filterStatus === "New" ? "border-blue-300 bg-blue-50" : "border-cream-200 hover:border-blue-200"}`}>
            <p className="text-lg font-bold text-blue-600">{stats.new}</p>
            <p className="text-[11px] text-ink-muted">New</p>
          </button>
          <button onClick={() => { setFilterPriority(""); setFilterStatus(""); setSortBy("lastUpdated"); setSearch(""); }}
            className={`rounded-xl border p-3 text-center transition-all ${stats.idle > 0 ? "border-amber-300 bg-amber-50" : "border-cream-200"}`}>
            <p className="text-lg font-bold text-amber-600">{stats.idle}</p>
            <p className="text-[11px] text-ink-muted">Idle 2d+</p>
          </button>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, or requirement..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-cream-200 text-sm focus:border-orange-300 focus:ring-2 focus:ring-orange-100 outline-none transition-all" />
          </div>
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}
            className="rounded-xl border border-cream-200 px-3 py-2.5 text-sm focus:border-orange-300 outline-none">
            <option value="">All priorities</option>
            <option value="Hot">Hot</option>
            <option value="Warm">Warm</option>
            <option value="Cold">Cold</option>
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-xl border border-cream-200 px-3 py-2.5 text-sm focus:border-orange-300 outline-none">
            <option value="">All statuses</option>
            {(settings.statuses || []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
            className="rounded-xl border border-cream-200 px-3 py-2.5 text-sm focus:border-orange-300 outline-none">
            <option value="lastUpdated">Last updated</option>
            <option value="priority">Priority</option>
            <option value="createdAt">Newest first</option>
            <option value="name">Name A-Z</option>
          </select>
        </div>

        {/* Lead List */}
        {myLeads.length === 0 ? (
          <div className="bg-white rounded-2xl border border-cream-200 p-16 text-center">
            <Inbox size={40} className="mx-auto text-cream-300 mb-3" />
            <p className="text-ink-muted">No leads match your filters</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-cream-200 overflow-hidden">
            {myLeads.map((lead, i) => (
              <div key={lead.id} className={`flex items-center gap-4 px-5 py-4 hover:bg-cream-50/50 transition-colors ${i < myLeads.length - 1 ? "border-b border-cream-100" : ""}`}>
                {/* Priority indicator */}
                <div className={`w-1.5 h-10 rounded-full shrink-0 ${lead.priority === "Hot" ? "bg-red-400" : lead.priority === "Warm" ? "bg-amber-400" : "bg-blue-300"}`} />

                {/* Lead info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link to={`/app/lead/${lead.id}`} className="text-sm font-semibold text-ink hover:text-orange-600 truncate">
                      {lead.name || "Unknown"}
                    </Link>
                    <PriorityBadge p={lead.priority} />
                    <StatusLamp status={lead.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-ink-muted">{lead.phone}</span>
                    {lead.source && <span className="text-[10px] px-1.5 py-0.5 rounded bg-cream-100 text-ink-muted">{lead.source}</span>}
                    {lead.requirement && <span className="text-xs text-ink-muted/60 truncate max-w-[200px]">{lead.requirement}</span>}
                  </div>
                </div>

                {/* Time */}
                <div className="text-right shrink-0 hidden sm:block">
                  <p className="text-[11px] text-ink-muted">{daysSince(lead.lastUpdated) === 0 ? "Today" : `${daysSince(lead.lastUpdated)}d ago`}</p>
                </div>

                {/* Quick actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => quickCall(lead)} title="Call"
                    className="w-8 h-8 rounded-lg bg-emerald-50 hover:bg-emerald-100 flex items-center justify-center transition-colors">
                    <Phone size={14} className="text-emerald-600" />
                  </button>
                  <button onClick={() => quickWhatsApp(lead)} title="WhatsApp"
                    className="w-8 h-8 rounded-lg bg-emerald-50 hover:bg-emerald-100 flex items-center justify-center transition-colors">
                    <MessageCircle size={14} className="text-emerald-600" />
                  </button>
                  <select value={lead.status} onChange={(e) => updateLeadStatus(lead.id, e.target.value, user)}
                    className="text-[11px] border border-cream-200 rounded-lg px-1.5 py-1 bg-white max-w-[100px]">
                    {(settings.statuses || []).map((s) => <option key={s}>{s}</option>)}
                  </select>
                  <Link to={`/app/lead/${lead.id}`} className="w-8 h-8 rounded-lg hover:bg-cream-100 flex items-center justify-center">
                    <ChevronRight size={16} className="text-ink-muted" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-ink-muted mt-4">
          Showing {myLeads.length} of {stats.total} leads
        </p>
      </div>
    </Layout>
  );
}
