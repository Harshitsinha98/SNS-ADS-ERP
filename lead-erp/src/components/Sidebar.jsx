import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import SkateMark from "./marketing/SkateMark";
import {
  LayoutDashboard,
  Users,
  Settings,
  Inbox,
  ClipboardList,
  LogOut,
  X,
  CreditCard,
  MessageCircle,
  Globe2,
  Megaphone,
  CalendarCheck2,
  Workflow,
  GitBranch,
  Brain,
  Wallet,
  Radio,
  PhoneCall,
  Mic,
  Phone,
  ChevronRight,
  Package,
} from "lucide-react";

const adminLinks = [
  { to: "/admin", label: "Dashboard", end: true, icon: LayoutDashboard },
  { to: "/admin/leads", label: "Lead Hub", icon: Inbox },
  { to: "/admin/follow-ups", label: "Follow-ups", icon: CalendarCheck2 },
  { to: "/admin/automation", label: "Automation", icon: Workflow },
  { to: "/admin/workflows", label: "Workflows", icon: GitBranch },
  { to: "/admin/ai-customer-care", label: "AI Customer Care", icon: Brain },
  { to: "/admin/employees", label: "Team", icon: Users },
  { to: "/admin/inbox", label: "Team Inbox", icon: Inbox },
  { to: "/admin/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { to: "/admin/broadcast", label: "Broadcast", icon: Radio },
  { to: "/admin/website-lead-integration", label: "Website Leads", icon: Globe2 },
  { to: "/admin/ad-leads", label: "Meta & Google Ads", icon: Megaphone },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/billing", label: "Billing", icon: CreditCard },
  { to: "/admin/voice-wallet", label: "Voice Wallet", icon: Wallet },
  { to: "/admin/call-history", label: "Call History", icon: PhoneCall },
  { to: "/admin/recordings", label: "Recordings", icon: Mic },
  { to: "/admin/voice", label: "CodeSkate Voice", icon: Phone },
  { to: "/admin/tickets", label: "Tickets", icon: ClipboardList },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

const empLinks = [
  { to: "/app", label: "Workspace", end: true, icon: LayoutDashboard },
  { to: "/app/inbox", label: "Team Inbox", icon: Inbox },
  { to: "/app/leads", label: "My Leads", icon: Inbox },
  { to: "/app/conversations", label: "Conversations", icon: MessageCircle },
  { to: "/app/tasks", label: "Follow-ups", icon: ClipboardList },
  { to: "/app/tickets", label: "Tickets", icon: ClipboardList },
];

export default function Sidebar({ isOpen = false, onClose = () => {} }) {
  const { user, logout, switchOrg } = useAuth();
  const links = user?.role === "admin" || user?.role === "owner" ? adminLinks : empLinks;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="sheet-backdrop"
          onClick={onClose}
        />
      )}

      {/* Drawer Panel */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[280px] bg-white flex flex-col
          transform transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
          ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SkateMark size={36} />
            <div>
              <p className="font-display font-bold text-base text-gradient">
                Codeskate CRM
              </p>
              <p className="text-[10px] text-ink-muted font-medium uppercase tracking-wider">
                {user?.role === "admin" || user?.role === "owner" ? "Admin" : "Sales"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-cream-100 tap-highlight"
          >
            <X size={16} className="text-ink-muted" />
          </button>
        </div>

        {/* Organization Switcher */}
        {user?.memberships && user.memberships.length > 1 && (
          <div className="px-4 pb-3">
            <select
              value={user.activeOrgId}
              onChange={(e) => switchOrg(e.target.value)}
              className="w-full text-sm font-medium text-ink bg-cream-50 border border-cream-200 rounded-xl px-3 py-2.5 min-h-touch"
            >
              {user.memberships.map((m) => (
                <option key={m.orgId} value={m.orgId}>
                  {m.displayName || m.orgId}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Navigation List */}
        <nav className="flex-1 overflow-y-auto scroll-rubber px-3 py-2">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                onClick={onClose}
                className={({ isActive }) =>
                  `list-item rounded-xl mb-0.5 ${
                    isActive
                      ? "bg-orange-50 text-orange-700"
                      : "text-ink-soft"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={18}
                      strokeWidth={isActive ? 2.2 : 1.8}
                      className={isActive ? "text-orange-600" : "text-ink-muted"}
                    />
                    <span className="flex-1 text-sm font-medium">{link.label}</span>
                    {isActive && <ChevronRight size={14} className="text-orange-400" />}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User Profile Footer */}
        <div className="px-4 py-4 border-t border-cream-100" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="avatar">
              {(user?.displayName || user?.name || "U")[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink truncate">
                {user?.displayName || user?.name || "User"}
              </p>
              <p className="text-xs text-ink-muted num">{user?.phone}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="list-item rounded-xl text-danger-600 w-full -mx-1"
          >
            <LogOut size={18} />
            <span className="text-sm font-medium">Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
