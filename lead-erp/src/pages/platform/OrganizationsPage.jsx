/**
 * Enterprise Organization Management.
 *
 * This page intentionally does not use usePlatformData: that hook has a
 * cross-tenant realtime listener appropriate for small dashboards, while this
 * operational directory uses protected server-side filters and cursor pages.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Activity, ArrowDownCircle, ArrowUpCircle, Ban, Building2, CalendarDays,
  CheckSquare, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Download,
  ExternalLink, Eye, FilterX, Loader2, LogIn, Mail, Megaphone, MessageCircle,
  MoreVertical, Phone, Play, RefreshCw, RotateCcw, Search, ShieldAlert,
  Trash2, Users, X,
} from "lucide-react";
import PlatformShell from "./components/PlatformShell";
import SectionCard from "./components/SectionCard";
import StatusBadge from "./components/StatusBadge";
import { usePlatformAuth } from "./hooks/usePlatformAuth";
import { useOrganizationDirectory } from "./hooks/useOrganizationDirectory";
import {
  bulkOrgAction, exportOrganization, getOrganizationDetail, performOrgAction,
} from "../../utils/platformApi";

const PLAN_OPTIONS = ["starter", "growth", "enterprise", "scale"];
const BULK_ACTION_OPTIONS = [
  { value: "suspend", label: "Suspend selected" },
  { value: "upgrade_plan", label: "Upgrade selected" },
  { value: "send_email", label: "Send email" },
  { value: "send_whatsapp", label: "Send WhatsApp" },
];

function formatDate(value, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function healthTone(score) {
  if (score >= 70) return "bg-emerald-100 text-emerald-700";
  if (score >= 40) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

function Usage({ used, limit }) {
  const safeLimit = Number(limit || 0);
  const ratio = safeLimit ? Math.min(100, Math.round((Number(used || 0) / safeLimit) * 100)) : 0;
  const tone = ratio >= 90 ? "bg-red-500" : ratio >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="min-w-[88px]">
      <p className="font-mono text-xs text-ink">{Number(used || 0).toLocaleString("en-IN")}/{safeLimit.toLocaleString("en-IN")}</p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-cream-200">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${ratio}%` }} />
      </div>
    </div>
  );
}

function ActionMenu({ organization, open, onToggle, onAction, onOpenDashboard, onExport }) {
  const actions = [
    { label: "Open dashboard", icon: Eye, onClick: onOpenDashboard },
    { label: "Login as organization", icon: LogIn, action: "impersonate" },
    { label: "Activate", icon: Play, action: "activate" },
    { label: "Suspend", icon: Ban, action: "suspend", danger: true },
    { label: "Extend trial", icon: Clock3, action: "extend_trial" },
    { label: "Upgrade plan", icon: ArrowUpCircle, action: "upgrade_plan" },
    { label: "Downgrade plan", icon: ArrowDownCircle, action: "downgrade_plan" },
    { label: "Increase seats", icon: Users, action: "increase_seats" },
    { label: "Reset usage", icon: RotateCcw, action: "reset_usage" },
    { label: "Send announcement", icon: Megaphone, action: "send_announcement" },
    { label: "Export organization", icon: Download, onClick: onExport },
    { label: "Archive organization", icon: Trash2, action: "delete", danger: true, divider: true },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); onToggle(); }}
        className="rounded-lg p-1.5 text-ink-soft hover:bg-cream-100 hover:text-ink"
        aria-label={`Actions for ${organization.name}`}
      >
        <MoreVertical size={17} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-cream-200 bg-white py-1 shadow-lg">
          {actions.map(({ label, icon: Icon, action, onClick, danger, divider }) => (
            <button
              key={label}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggle(false);
                if (onClick) onClick();
                else onAction(action);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-cream-50 ${danger ? "text-red-700" : "text-ink-soft"} ${divider ? "mt-1 border-t border-cream-100 pt-2" : ""}`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionDialog({ dialog, busy, onClose, onConfirm }) {
  const [planId, setPlanId] = useState("growth");
  const [days, setDays] = useState(7);
  const [seats, setSeats] = useState(1);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState("in_app");

  useEffect(() => {
    if (!dialog) return;
    setPlanId("growth"); setDays(7); setSeats(1); setDurationMinutes(30);
    setSubject(""); setMessage("");
    setChannel(dialog.action === "send_email" ? "email" : dialog.action === "send_whatsapp" ? "whatsapp" : "in_app");
  }, [dialog]);

  if (!dialog) return null;
  const count = dialog.orgIds.length;
  const isAnnouncement = ["send_announcement", "send_email", "send_whatsapp"].includes(dialog.action);
  const isPlanChange = ["upgrade_plan", "downgrade_plan"].includes(dialog.action);
  const isDanger = ["suspend", "delete"].includes(dialog.action);
  const labels = {
    activate: "Activate organization", suspend: "Suspend organization", extend_trial: "Extend trial",
    upgrade_plan: "Upgrade plan", downgrade_plan: "Downgrade plan", increase_seats: "Increase seats",
    reset_usage: "Reset lead usage", send_announcement: "Send announcement", impersonate: "Login as organization",
    delete: "Archive organization", send_email: "Send email", send_whatsapp: "Send WhatsApp",
  };
  const targetLabel = count === 1 ? dialog.organization?.name || "this organization" : `${count} selected organizations`;
  const params = {
    planId,
    days: Number(days),
    seats: Number(seats),
    durationMinutes: Number(durationMinutes),
    subject,
    message,
    channel,
  };
  const requiresMessage = isAnnouncement;
  const disabled = busy || (requiresMessage && !message.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-cream-100 px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">{labels[dialog.action]}</h2>
            <p className="mt-1 text-xs text-ink-muted">{targetLabel}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-1 text-ink-muted hover:bg-cream-100"><X size={18} /></button>
        </div>
        <div className="space-y-4 p-5">
          {isDanger && (
            <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <ShieldAlert size={16} className="mt-0.5 flex-shrink-0" />
              <p>{dialog.action === "delete" ? "This archives the organization and stops its subscription. Tenant data is retained for audit and recovery." : "Suspended organizations cannot use subscription-protected features until reactivated."}</p>
            </div>
          )}
          {dialog.action === "extend_trial" && (
            <label className="block text-sm font-medium text-ink">Extension (days)
              <input className="input mt-1 w-full" type="number" min="1" max="90" value={days} onChange={(event) => setDays(event.target.value)} />
            </label>
          )}
          {isPlanChange && (
            <label className="block text-sm font-medium text-ink">Target plan
              <select className="input mt-1 w-full" value={planId} onChange={(event) => setPlanId(event.target.value)}>
                {PLAN_OPTIONS.map((plan) => <option key={plan} value={plan}>{plan.charAt(0).toUpperCase() + plan.slice(1)}</option>)}
              </select>
            </label>
          )}
          {dialog.action === "increase_seats" && (
            <label className="block text-sm font-medium text-ink">Additional seats
              <input className="input mt-1 w-full" type="number" min="1" max="500" value={seats} onChange={(event) => setSeats(event.target.value)} />
            </label>
          )}
          {dialog.action === "impersonate" && (
            <>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">A time-bound support-admin membership is created and audited. It expires automatically; no customer credential is used.</div>
              <label className="block text-sm font-medium text-ink">Access duration (minutes)
                <input className="input mt-1 w-full" type="number" min="1" max="60" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} />
              </label>
            </>
          )}
          {isAnnouncement && (
            <>
              {dialog.action === "send_announcement" && (
                <label className="block text-sm font-medium text-ink">Channel
                  <select className="input mt-1 w-full" value={channel} onChange={(event) => setChannel(event.target.value)}>
                    <option value="in_app">In-app notification</option>
                    <option value="email">Email queue</option>
                    <option value="whatsapp">WhatsApp queue</option>
                  </select>
                </label>
              )}
              <label className="block text-sm font-medium text-ink">Subject
                <input className="input mt-1 w-full" maxLength="160" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Optional announcement subject" />
              </label>
              <label className="block text-sm font-medium text-ink">Message
                <textarea className="input mt-1 min-h-24 w-full" maxLength="1000" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write the announcement…" />
              </label>
              {(channel === "email" || channel === "whatsapp") && <p className="text-[11px] text-ink-muted">External delivery is queued for the configured provider; it is not marked delivered until that worker processes it.</p>}
            </>
          )}
          {dialog.action === "reset_usage" && <p className="text-sm text-ink-soft">This resets the subscription lead-usage counter to zero. Existing lead records are not deleted.</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-cream-100 px-5 py-4">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="button" className={`btn ${isDanger ? "bg-red-600 text-white hover:bg-red-700" : "btn-primary"}`} disabled={disabled} onClick={() => onConfirm(params)}>
            {busy ? <><Loader2 size={15} className="animate-spin" /> Working…</> : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OrganizationDetail({ organizationId, onClose, onAction, onExport }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!organizationId) return undefined;
    let active = true;
    setLoading(true); setError("");
    getOrganizationDetail(organizationId)
      .then((response) => { if (active) setDetail(response); })
      .catch((requestError) => { if (active) setError(requestError?.message || "Unable to load organization."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button type="button" onClick={onClose} className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink"><ChevronLeft size={14} /> Back to organizations</button>
          <h2 className="font-display text-2xl font-bold text-ink">Organization Dashboard</h2>
        </div>
        {detail?.organization && <div className="flex gap-2"><button type="button" className="btn btn-secondary" onClick={onExport}><Download size={15} /> Export</button><button type="button" className="btn btn-primary" onClick={() => onAction("impersonate", detail.organization)}><LogIn size={15} /> Login as org</button></div>}
      </div>
      {loading ? <div className="h-64 animate-pulse rounded-2xl bg-cream-200" /> : error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : detail && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Metric label="Plan" value={detail.organization.planName} />
            <Metric label="Health score" value={detail.organization.healthScore} tone={healthTone(detail.organization.healthScore)} />
            <Metric label="Lifetime revenue" value={formatCurrency(detail.organization.revenueGenerated)} />
            <Metric label="WhatsApp" value={detail.organization.whatsappStatus.replaceAll("_", " ")} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="Organization profile">
              <dl className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                {[
                  ["Owner", detail.organization.ownerName], ["Phone", detail.organization.ownerPhone], ["Email", detail.organization.ownerEmail], ["Created", formatDate(detail.organization.createdAt)],
                  ["Last login", formatDate(detail.organization.lastLoginAt, true)], ["Version", detail.organization.currentVersion], ["Country", detail.organization.country], ["State", detail.organization.state],
                ].map(([label, value]) => <div key={label}><dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{label}</dt><dd className="mt-1 text-sm text-ink">{value || "—"}</dd></div>)}
              </dl>
            </SectionCard>
            <SectionCard title="Usage & subscription">
              <div className="space-y-4"><div><p className="mb-1 text-xs text-ink-muted">Seats used</p><Usage used={detail.organization.seatsUsed} limit={detail.organization.seatsLimit} /></div><div><p className="mb-1 text-xs text-ink-muted">Lead usage</p><Usage used={detail.organization.leadsUsed} limit={detail.organization.leadsLimit} /></div><div className="flex items-center justify-between"><StatusBadge status={detail.organization.subscriptionStatus} /><span className="text-xs text-ink-muted">Trial ends: {formatDate(detail.organization.trialEndsAt)}</span></div></div>
            </SectionCard>
          </div>
          <SectionCard title="Members" subtitle={`${detail.members?.length || 0} membership records`}>
            <div className="overflow-x-auto"><table className="w-full min-w-[540px] text-sm"><thead className="border-b border-cream-100 text-left text-xs text-ink-muted"><tr><th className="pb-2 font-medium">Name</th><th className="pb-2 font-medium">Role</th><th className="pb-2 font-medium">Phone</th><th className="pb-2 font-medium">Last active</th><th className="pb-2 font-medium">Status</th></tr></thead><tbody>{detail.members?.map((member) => <tr key={member.id} className="border-b border-cream-50"><td className="py-2.5 font-medium text-ink">{member.displayName}</td><td className="py-2.5 capitalize text-ink-soft">{member.role}</td><td className="py-2.5 text-ink-soft">{member.phone || "—"}</td><td className="py-2.5 text-ink-soft">{formatDate(member.lastActiveAt)}</td><td className="py-2.5"><StatusBadge status={member.active ? "active" : "paused"} /></td></tr>)}</tbody></table></div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, tone = "" }) {
  return <div className="rounded-2xl border border-cream-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{label}</p><p className={`mt-1 text-xl font-display font-bold capitalize text-ink ${tone}`}>{value ?? "—"}</p></div>;
}

export default function OrganizationsPage() {
  const { isPlatformAdmin } = usePlatformAuth();
  const { orgId } = useParams();
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ status: "", plan: "", country: "", state: "", health: "", revenueMin: "", trial: false, expired: false, inactive: false, limit: 25 });
  const [selectedIds, setSelectedIds] = useState([]);
  const [menuId, setMenuId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const directoryFilters = useMemo(() => ({ ...filters, search }), [filters, search]);
  const directory = useOrganizationDirectory(isPlatformAdmin, directoryFilters);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => setSelectedIds([]), [JSON.stringify(directoryFilters)]);

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const clearFilters = () => { setSearchInput(""); setSearch(""); setFilters({ status: "", plan: "", country: "", state: "", health: "", revenueMin: "", trial: false, expired: false, inactive: false, limit: 25 }); };
  const selectAll = () => setSelectedIds((current) => current.length === directory.organizations.length ? [] : directory.organizations.map((org) => org.id));
  const toggleSelected = (id) => setSelectedIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);

  const openAction = (action, organization = null, orgIds = organization ? [organization.id] : selectedIds) => {
    if (!orgIds.length) return;
    setDialog({ action, organization, orgIds });
  };

  const handleAction = async (params) => {
    if (!dialog) return;
    setActionBusy(true); setNotice(null);
    try {
      let response;
      if (dialog.orgIds.length > 1) response = await bulkOrgAction(dialog.orgIds, dialog.action, params);
      else response = await performOrgAction(dialog.orgIds[0], dialog.action, params);
      if (dialog.action === "impersonate" && response.redirectPath) {
        localStorage.setItem("activeOrgId", dialog.orgIds[0]);
        window.location.assign(response.redirectPath);
        return;
      }
      const message = response.message || `${response.succeeded || 0} completed${response.failed ? `; ${response.failed} failed` : ""}`;
      setNotice({ kind: "success", text: message });
      setDialog(null);
      setSelectedIds([]);
      directory.refresh();
    } catch (error) {
      setNotice({ kind: "error", text: error?.message || "Organization action failed." });
    } finally { setActionBusy(false); }
  };

  const handleExport = async (organization) => {
    try {
      setNotice(null);
      const data = await exportOrganization(organization.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `${organization.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || organization.id}-export.json`; anchor.click();
      URL.revokeObjectURL(url);
      setNotice({ kind: "success", text: `${organization.name} exported.` });
    } catch (error) { setNotice({ kind: "error", text: error?.message || "Organization export failed." }); }
  };

  if (orgId) {
    return <PlatformShell title="Organization Dashboard"><OrganizationDetail organizationId={orgId} onClose={() => navigate("/platform/organizations")} onAction={openAction} onExport={() => handleExport({ id: orgId, name: "organization" })} /><ActionDialog dialog={dialog} busy={actionBusy} onClose={() => setDialog(null)} onConfirm={handleAction} /></PlatformShell>;
  }

  return (
    <PlatformShell title="Organization Management">
      <div className="space-y-5" onClick={() => menuId && setMenuId(null)}>
        <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-end">
          <div><h2 className="font-display text-2xl font-bold text-ink">Customer organizations</h2><p className="mt-1 text-sm text-ink-muted">Cross-tenant customer intelligence, lifecycle control, and audited support access.</p></div>
          <button type="button" onClick={directory.refresh} disabled={directory.loading || directory.refreshing} className="btn btn-secondary self-start xl:self-auto"><RefreshCw size={15} className={directory.refreshing ? "animate-spin" : ""} /> Refresh</button>
        </div>

        <SectionCard title="Search & filters" subtitle="All filters are applied on the platform API; results use cursor pagination.">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="relative xl:col-span-2"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" /><input className="input w-full pl-9" placeholder="Search name, owner, phone, email, ID…" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label>
            <select className="input" value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="trialing">Trialing</option><option value="past_due">Past due</option><option value="expired">Expired</option><option value="deleted">Archived</option></select>
            <select className="input" value={filters.plan} onChange={(event) => updateFilter("plan", event.target.value)}><option value="">All plans</option>{PLAN_OPTIONS.map((plan) => <option key={plan} value={plan}>{plan.charAt(0).toUpperCase() + plan.slice(1)}</option>)}</select>
            <select className="input" value={filters.health} onChange={(event) => updateFilter("health", event.target.value)}><option value="">Any health score</option><option value="healthy">Healthy (70–100)</option><option value="attention">Attention (40–69)</option><option value="at_risk">At risk (0–39)</option></select>
            <input className="input" placeholder="Country" value={filters.country} onChange={(event) => updateFilter("country", event.target.value)} />
            <input className="input" placeholder="State" value={filters.state} onChange={(event) => updateFilter("state", event.target.value)} />
            <select className="input" value={filters.revenueMin} onChange={(event) => updateFilter("revenueMin", event.target.value)}><option value="">Any revenue</option><option value="0">₹0+</option><option value="1000">₹1,000+</option><option value="10000">₹10,000+</option><option value="50000">₹50,000+</option></select>
            <div className="flex flex-wrap items-center gap-2 xl:col-span-2"><ToggleFilter active={filters.trial} label="Trial" onClick={() => setFilters((current) => ({ ...current, trial: !current.trial, expired: false }))} /><ToggleFilter active={filters.expired} label="Expired" onClick={() => setFilters((current) => ({ ...current, expired: !current.expired, trial: false }))} /><ToggleFilter active={filters.inactive} label="Inactive 7d" onClick={() => updateFilter("inactive", !filters.inactive)} /></div>
          </div>
          <div className="mt-3 flex justify-end"><button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink"><FilterX size={14} /> Clear filters</button></div>
        </SectionCard>

        {notice && <div className={`rounded-xl border px-4 py-3 text-sm ${notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{notice.text}</div>}

        {selectedIds.length > 0 && <div className="flex flex-col gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-semibold text-orange-900"><CheckSquare size={16} className="mr-1 inline" /> {selectedIds.length} selected</p><div className="flex flex-wrap gap-2"><button type="button" className="btn btn-secondary text-xs" onClick={() => openAction("suspend")}>Suspend</button><button type="button" className="btn btn-secondary text-xs" onClick={() => openAction("upgrade_plan")}>Upgrade</button><button type="button" className="btn btn-secondary text-xs" onClick={() => openAction("send_email")}>Send email</button><button type="button" className="btn btn-primary text-xs" onClick={() => openAction("send_whatsapp")}>Send WhatsApp</button><button type="button" className="px-2 text-xs text-ink-muted hover:text-ink" onClick={() => setSelectedIds([])}>Clear</button></div></div>}

        <SectionCard title="Organization directory" subtitle={directory.loading ? "Loading secure cursor page…" : `${directory.organizations.length} record(s) on this page${directory.scanned > directory.organizations.length ? ` · scanned ${directory.scanned} safely on the server` : ""}`} actions={<span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Live refresh</span>}>
          {directory.error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><p className="font-semibold">Could not load organizations</p><p className="mt-1">{directory.error}</p><button className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white" onClick={directory.refresh}>Try again</button></div> : directory.loading ? <DirectorySkeleton /> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[1850px] text-sm"><thead className="border-b border-cream-200 bg-cream-50 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted"><tr><th className="w-10 px-3 py-3"><input type="checkbox" checked={directory.organizations.length > 0 && selectedIds.length === directory.organizations.length} onChange={selectAll} aria-label="Select visible organizations" /></th><th className="px-3 py-3">Organization</th><th className="px-3 py-3">Owner</th><th className="px-3 py-3">Plan</th><th className="px-3 py-3">Subscription</th><th className="px-3 py-3">Seats</th><th className="px-3 py-3">Lead usage</th><th className="px-3 py-3">Health</th><th className="px-3 py-3">Last login</th><th className="px-3 py-3">Created</th><th className="px-3 py-3">Revenue</th><th className="px-3 py-3">WhatsApp</th><th className="px-3 py-3">Version</th><th className="px-3 py-3"><span className="sr-only">Actions</span></th></tr></thead><tbody>{directory.organizations.map((organization) => <tr key={organization.id} className="border-b border-cream-100 align-top hover:bg-cream-50"><td className="px-3 py-3"><input type="checkbox" checked={selectedIds.includes(organization.id)} onChange={() => toggleSelected(organization.id)} aria-label={`Select ${organization.name}`} /></td><td className="px-3 py-3"><button type="button" onClick={() => navigate(`/platform/organizations/${organization.id}`)} className="text-left"><p className="max-w-44 truncate font-semibold text-ink hover:text-orange-700">{organization.name}</p><p className="mt-0.5 max-w-44 truncate font-mono text-[10px] text-ink-muted">{organization.id}</p></button></td><td className="px-3 py-3"><p className="max-w-40 truncate font-medium text-ink">{organization.ownerName}</p><p className="max-w-40 truncate text-[11px] text-ink-muted">{organization.ownerPhone || organization.ownerEmail || "—"}</p></td><td className="px-3 py-3 capitalize text-ink-soft">{organization.planName}</td><td className="px-3 py-3"><StatusBadge status={organization.subscriptionStatus} /></td><td className="px-3 py-3"><Usage used={organization.seatsUsed} limit={organization.seatsLimit} /></td><td className="px-3 py-3"><Usage used={organization.leadsUsed} limit={organization.leadsLimit} /></td><td className="px-3 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${healthTone(organization.healthScore)}`}>{organization.healthScore}</span></td><td className="px-3 py-3 whitespace-nowrap text-xs text-ink-soft">{formatDate(organization.lastLoginAt, true)}</td><td className="px-3 py-3 whitespace-nowrap text-xs text-ink-soft">{formatDate(organization.createdAt)}</td><td className="px-3 py-3 whitespace-nowrap text-xs font-semibold text-ink">{formatCurrency(organization.revenueGenerated)}</td><td className="px-3 py-3"><StatusBadge status={organization.whatsappStatus} className="capitalize" /></td><td className="px-3 py-3 font-mono text-xs text-ink-soft">{organization.currentVersion}</td><td className="px-3 py-3"><ActionMenu organization={organization} open={menuId === organization.id} onToggle={(value) => setMenuId(value === false || menuId === organization.id ? null : organization.id)} onAction={(action) => openAction(action, organization)} onOpenDashboard={() => navigate(`/platform/organizations/${organization.id}`)} onExport={() => handleExport(organization)} /></td></tr>)}{directory.organizations.length === 0 && <tr><td colSpan="14" className="px-3 py-12 text-center"><Building2 size={28} className="mx-auto text-cream-400" /><p className="mt-2 text-sm font-medium text-ink">No organizations found</p><p className="mt-1 text-xs text-ink-muted">Adjust your search or filters, then try again.</p></td></tr>}</tbody></table></div>
          )}
          <div className="mt-4 flex items-center justify-between border-t border-cream-100 pt-4"><button type="button" className="btn btn-secondary text-xs" disabled={!directory.hasPrevious || directory.loading} onClick={directory.goPrevious}><ChevronLeft size={15} /> Previous</button><p className="text-xs text-ink-muted">Cursor pagination · data is loaded server-side</p><button type="button" className="btn btn-secondary text-xs" disabled={!directory.nextCursor || directory.loading} onClick={directory.goNext}>Next <ChevronRight size={15} /></button></div>
        </SectionCard>
      </div>
      <ActionDialog dialog={dialog} busy={actionBusy} onClose={() => setDialog(null)} onConfirm={handleAction} />
    </PlatformShell>
  );
}

function ToggleFilter({ active, label, onClick }) {
  return <button type="button" onClick={onClick} className={`rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${active ? "border-orange-300 bg-orange-100 text-orange-800" : "border-cream-300 bg-white text-ink-soft hover:bg-cream-50"}`}>{label}</button>;
}

function DirectorySkeleton() {
  return <div className="space-y-3">{Array.from({ length: 7 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded-lg bg-cream-100" />)}</div>;
}
