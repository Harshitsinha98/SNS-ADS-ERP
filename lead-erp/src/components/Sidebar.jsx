import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard,
  Users,
  Settings,
  Inbox,
  ClipboardList,
  LogOut,
  Sparkles,
  X,
  ChevronRight,
  CreditCard,
} from "lucide-react";

const adminLinks = [
  { to: "/admin", label: "Dashboard", end: true, icon: LayoutDashboard },
  { to: "/admin/leads", label: "Lead Hub", icon: Inbox },
  { to: "/admin/employees", label: "Team", icon: Users },
  { to: "/admin/billing", label: "Billing", icon: CreditCard },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

const empLinks = [
  { to: "/app", label: "Workspace", end: true, icon: LayoutDashboard },
  { to: "/app/tasks", label: "My Leads", icon: ClipboardList },
];

export default function Sidebar({ isOpen = false, onClose = () => {} }) {
  const { user, logout, switchOrg } = useAuth();
  const links = user?.role === "admin" || user?.role === "owner" ? adminLinks : empLinks;

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col
          transform transition-transform duration-200 ease-out lg:translate-x-0
          ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Logo */}
        <div className="px-5 pt-6 pb-5 flex items-center justify-between border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-accent-600 rounded-xl flex items-center justify-center shadow-glow">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-display font-bold text-lg bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent">
                CodeSkate
              </p>
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                {user?.role === "admin" || user?.role === "owner" ? "Admin Portal" : "Sales Desk"}
              </p>
            </div>
          </div>
          {/* Close button - mobile only */}
          <button
            onClick={onClose}
            className="lg:hidden text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Organization Switcher */}
        {user?.memberships && user.memberships.length > 1 && (
          <div className="px-3 py-3 border-b border-gray-100">
            <select
              value={user.activeOrgId}
              onChange={(e) => switchOrg(e.target.value)}
              className="w-full text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-300"
            >
              {user.memberships.map((m) => (
                <option key={m.orgId} value={m.orgId}>
                  {m.displayName || m.orgId}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                    isActive
                      ? "bg-gradient-to-r from-primary-50 to-accent-50 text-primary-700"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={18}
                      strokeWidth={2}
                      className={isActive ? "text-primary-600" : "text-gray-400 group-hover:text-gray-600"}
                    />
                    <span className="flex-1">{link.label}</span>
                    {isActive && <ChevronRight size={16} className="text-primary-400" />}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User Profile */}
        <div className="px-4 py-4 border-t border-gray-100">
          <div className="bg-gray-50 rounded-lg p-3 mb-3">
            <p className="text-sm font-semibold text-gray-800 truncate">
              {user?.displayName || user?.name || "User"}
            </p>
            <p className="text-xs text-gray-500 font-mono mt-0.5">{user?.phone}</p>
            {user?.activeOrgName && (
              <p className="text-xs text-gray-400 mt-1">{user.activeOrgName}</p>
            )}
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-danger-600 hover:bg-danger-50 rounded-lg px-3 py-2 transition-colors w-full"
          >
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
