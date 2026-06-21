import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LayoutDashboard, Users, Settings, Inbox, ClipboardList, LogOut, Radio, X } from "lucide-react";

const adminLinks = [
  { to: "/admin", label: "Dashboard", end: true, icon: LayoutDashboard },
  { to: "/admin/leads", label: "Lead Hub", icon: Inbox },
  { to: "/admin/employees", label: "Employees", icon: Users },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];
const empLinks = [
  { to: "/app", label: "My Workspace", end: true, icon: LayoutDashboard },
  { to: "/app/tasks", label: "My Leads", icon: ClipboardList },
];

// isOpen/onClose props add hue — mobile drawer control karne ke liye.
// Desktop pe ye props effectively ignore ho jaate hain (md:translate-x-0 always).
export default function Sidebar({ isOpen = false, onClose = () => {} }) {
  const { user, logout } = useAuth();
  const links = user.role === "admin" ? adminLinks : empLinks;

  return (
    <>
      {/* Backdrop — sirf mobile pe, sidebar open hone par dikhta hai, tap se close */}
      {isOpen && (
        <div className="fixed inset-0 bg-ink/60 z-40 md:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-ink text-white/80 min-h-screen flex flex-col
          transform transition-transform duration-200 ease-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        <div className="px-5 pt-6 pb-5 flex items-center justify-between gap-2 border-b border-ink-line">
          <div className="flex items-center gap-2">
            <Radio size={18} className="text-signal" />
            <div>
              <p className="font-display font-semibold text-white text-[15px] leading-tight">SNS ADS ERP</p>
              <p className="text-[11px] text-white/40 leading-tight">{user.role === "admin" ? "Control Tower" : "Sales Desk"}</p>
            </div>
          </div>
          {/* Close button — sirf mobile drawer ke andar */}
          <button onClick={onClose} className="md:hidden text-white/40 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <NavLink key={l.to} to={l.to} end={l.end} onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm relative transition-colors ${
                    isActive ? "bg-white/[0.06] text-white" : "text-white/55 hover:text-white hover:bg-white/[0.04]"
                  }`
                }>
                {({ isActive }) => (
                  <>
                    <span className={`absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full ${isActive ? "bg-signal" : "bg-transparent"}`} />
                    <Icon size={16} strokeWidth={2} />
                    {l.label}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-ink-line">
          <p className="text-sm text-white font-medium truncate">{user.name}</p>
          <p className="text-xs text-white/35 num">{user.phone}</p>
          <button onClick={logout} className="mt-3 flex items-center gap-1.5 text-xs text-white/50 hover:text-danger transition-colors">
            <LogOut size={13} /> Logout
          </button>
        </div>
      </aside>
    </>
  );
}