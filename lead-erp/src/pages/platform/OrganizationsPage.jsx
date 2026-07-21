/**
 * Module 2: Organization Management.
 *
 * Search, filters, cursor pagination, drill-down, and bulk actions.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Filter, Download, MoreVertical, Building2, Loader2 } from "lucide-react";
import PlatformShell from "./components/PlatformShell";
import DataTable from "./components/DataTable";
import StatusBadge from "./components/StatusBadge";
import { usePlatformAuth } from "./hooks/usePlatformAuth";
import { usePlatformData } from "./hooks/usePlatformData";
import { performOrgAction } from "../../utils/platformApi";

export default function OrganizationsPage() {
  const { isPlatformAdmin } = usePlatformAuth();
  const { orgs, loading } = usePlatformData(isPlatformAdmin);
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [page, setPage] = useState(0);
  const [actionBusy, setActionBusy] = useState(null);
  const [actionMsg, setActionMsg] = useState("");
  const pageSize = 20;

  const filtered = orgs.filter((o) => {
    if (statusFilter && o.subscriptionStatus !== statusFilter) return false;
    if (planFilter && o.planId !== planFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (o.name || "").toLowerCase().includes(q) || (o.ownerPhone || "").includes(q) || o.id.includes(q);
    }
    return true;
  });

  const paginated = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const hasNext = filtered.length > (page + 1) * pageSize;
  const hasPrev = page > 0;

  const handleAction = async (orgId, action) => {
    setActionBusy(orgId);
    setActionMsg("");
    try {
      const result = await performOrgAction(orgId, action);
      setActionMsg(`✓ ${result.message}`);
    } catch (e) {
      setActionMsg(`✗ ${e.message}`);
    } finally {
      setActionBusy(null);
    }
  };

  const fmtDate = (v) => {
    if (!v) return "—";
    try { return new Date(typeof v === "string" ? v : v.toDate?.() || v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }); }
    catch { return "—"; }
  };

  const columns = [
    { key: "name", label: "Organization", render: (val, row) => (
      <div>
        <p className="font-medium text-ink text-sm">{val || "Unnamed"}</p>
        <p className="text-[11px] text-ink-muted">{row.ownerPhone || "—"}</p>
      </div>
    )},
    { key: "planId", label: "Plan", render: (val) => <span className="text-xs font-medium capitalize">{val || "—"}</span> },
    { key: "subscriptionStatus", label: "Status", render: (val) => <StatusBadge status={val} /> },
    { key: "seatsUsed", label: "Seats", render: (val, row) => <span className="text-xs">{val || 0}/{row.seatsLimit || 0}</span> },
    { key: "leadsUsed", label: "Leads", render: (val, row) => <span className="text-xs">{val || 0}/{row.leadsLimit || 0}</span> },
    { key: "createdAt", label: "Created", render: (val) => <span className="text-xs text-ink-muted">{fmtDate(val)}</span> },
    { key: "id", label: "Actions", render: (_, row) => (
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); handleAction(row.id, "activate"); }}
          disabled={actionBusy === row.id}
          className="text-[11px] px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
        >
          Activate
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/platform/organizations/${row.id}`); }}
          className="text-[11px] px-2 py-1 rounded bg-cream-100 text-ink-soft hover:bg-cream-200"
        >
          Details
        </button>
      </div>
    )},
  ];

  return (
    <PlatformShell title="Organizations">
      <div className="space-y-4">
        {/* Filters bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              className="input pl-9 w-full"
              placeholder="Search by name, phone, or ID…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
          <select className="input w-40" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
            <option value="past_due">Past Due</option>
            <option value="expired">Expired</option>
          </select>
          <select className="input w-36" value={planFilter} onChange={(e) => { setPlanFilter(e.target.value); setPage(0); }}>
            <option value="">All plans</option>
            <option value="starter">Starter</option>
            <option value="growth">Growth</option>
            <option value="enterprise">Scale</option>
          </select>
          <span className="text-xs text-ink-muted self-center">{filtered.length} org(s)</span>
        </div>

        {actionMsg && (
          <div className={`text-sm px-4 py-2 rounded-xl border ${actionMsg.startsWith("✓") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
            {actionMsg}
          </div>
        )}

        <DataTable
          columns={columns}
          rows={paginated}
          loading={loading}
          emptyMessage="No organizations found"
          emptyIcon={Building2}
          onRowClick={(row) => navigate(`/platform/organizations/${row.id}`)}
          hasNextPage={hasNext}
          hasPrevPage={hasPrev}
          onNextPage={() => setPage((p) => p + 1)}
          onPrevPage={() => setPage((p) => Math.max(0, p - 1))}
          pageLabel={`Page ${page + 1} of ${Math.ceil(filtered.length / pageSize) || 1}`}
        />
      </div>
    </PlatformShell>
  );
}
