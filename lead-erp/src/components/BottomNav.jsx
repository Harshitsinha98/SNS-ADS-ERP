import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard,
  Inbox,
  CalendarCheck2,
  Users,
  MessageCircle,
  ClipboardList,
  ListChecks,
} from "lucide-react";

const adminTabs = [
  { to: "/admin", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/admin/leads", label: "Leads", icon: Inbox },
  { to: "/admin/follow-ups", label: "Follow-ups", icon: CalendarCheck2 },
  { to: "/admin/employees", label: "Team", icon: Users },
  { to: "/admin/whatsapp", label: "Chat", icon: MessageCircle },
];

const empTabs = [
  { to: "/app", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/app/leads", label: "Leads", icon: Inbox },
  { to: "/app/tasks", label: "Tasks", icon: ListChecks },
  { to: "/app/conversations", label: "Chats", icon: MessageCircle },
  { to: "/app/tickets", label: "Tickets", icon: ClipboardList },
];

export default function BottomNav() {
  const { user } = useAuth();
  const location = useLocation();
  const tabs = user?.role === "admin" || user?.role === "owner" ? adminTabs : empTabs;

  return (
    <nav className="app-bottomnav">
      <div className="app-bottomnav-inner">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          // Determine active state
          const isActive = tab.end
            ? location.pathname === tab.to
            : location.pathname.startsWith(tab.to);

          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 press-scale"
            >
              <div
                className={`flex items-center justify-center w-10 h-7 rounded-full transition-all duration-200 ${
                  isActive
                    ? "bg-orange-100 scale-110"
                    : "bg-transparent"
                }`}
              >
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.3 : 1.8}
                  className={`transition-colors duration-200 ${
                    isActive ? "text-orange-600" : "text-ink-muted"
                  }`}
                />
              </div>
              <span
                className={`text-[10px] font-medium transition-colors duration-200 ${
                  isActive ? "text-orange-600" : "text-ink-muted"
                }`}
              >
                {tab.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
