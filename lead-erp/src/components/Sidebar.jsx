import { NavLink } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import SkateMark from "./marketing/SkateMark";
import {
  LayoutDashboard,
  Users,
  Settings,
  Inbox,
  LogOut,
  X,
  CreditCard,
  MessageCircle,
  MessagesSquare,
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
  Contact,
  ListChecks,
  Ticket,
} from "lucide-react";

/*
 * Navigation is grouped for scannability. Every route (`to`) and `end` flag
 * is identical to the previous flat lists — only the order and grouping
 * changed, plus distinct icons where two entries previously shared one
 * (Lead Hub / Team Inbox both used Inbox; Follow-ups / Tickets both used
 * ClipboardList).
 */
const adminGroups = [
  {
    label: "Overview",
    links: [{ to: "/admin", label: "Dashboard", end: true, icon: LayoutDashboard }],
  },
  {
    label: "Sales",
    links: [
      { to: "/admin/leads", label: "Lead Hub", icon: Inbox },
      { to: "/admin/follow-ups", label: "Follow-ups", icon: CalendarCheck2 },
      { to: "/admin/inbox", label: "Team Inbox", icon: MessagesSquare },
      { to: "/admin/employees", label: "Team", icon: Users },
      { to: "/admin/products", label: "Products", icon: Package },
    ],
  },
  {
    label: "Automation & AI",
    links: [
      { to: "/admin/automation", label: "Automation", icon: Workflow },
      { to: "/admin/workflows", label: "Workflows", icon: GitBranch },
      { to: "/admin/ai-customer-care", label: "AI Customer Care", icon: Brain },
    ],
  },
  {
    label: "Channels",
    links: [
      { to: "/admin/whatsapp", label: "WhatsApp", icon: MessageCircle },
      { to: "/admin/broadcast", label: "Broadcast", icon: Radio },
      { to: "/admin/website-lead-integration", label: "Website Leads", icon: Globe2 },
      { to: "/admin/ad-leads", label: "Meta & Google Ads", icon: Megaphone },
    ],
  },
  {
    label: "Voice",
    links: [
      { to: "/admin/voice", label: "CodeSkate Voice", icon: Phone },
      { to: "/admin/call-history", label: "Call History", icon: PhoneCall },
      { to: "/admin/recordings", label: "Recordings", icon: Mic },
      { to: "/admin/voice-wallet", label: "Voice Wallet", icon: Wallet },
    ],
  },
  {
    label: "Account",
    links: [
      { to: "/admin/billing", label: "Billing", icon: CreditCard },
      { to: "/admin/tickets", label: "Tickets", icon: Ticket },
      { to: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

const empGroups = [
  {
    label: null, // six links — a heading would only add noise
    links: [
      { to: "/app", label: "Workspace", end: true, icon: LayoutDashboard },
      { to: "/app/inbox", label: "Team Inbox", icon: MessagesSquare },
      { to: "/app/leads", label: "My Leads", icon: Contact },
      { to: "/app/conversations", label: "Conversations", icon: MessageCircle },
      { to: "/app/tasks", label: "Follow-ups", icon: ListChecks },
      { to: "/app/tickets", label: "Tickets", icon: Ticket },
    ],
  },
];

const EASE = [0.22, 1, 0.36, 1];
const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.025, delayChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, x: -10 },
  show: { opacity: 1, x: 0, transition: { duration: 0.32, ease: EASE } },
};

export default function Sidebar({ isOpen = false, onClose = () => {} }) {
  const { user, logout, switchOrg } = useAuth();
  const reduce = useReducedMotion();
  const isAdmin = user?.role === "admin" || user?.role === "owner";
  const groups = isAdmin ? adminGroups : empGroups;

  // Under reduced motion, render the list in its final state with no variants.
  const motionList = reduce ? {} : { variants: listVariants, initial: "hidden", animate: isOpen ? "show" : "hidden" };
  const motionItem = reduce ? {} : { variants: itemVariants };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="sheet-backdrop animate-fade-in"
          onClick={onClose}
        />
      )}

      {/* Drawer Panel */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[280px] bg-midnight-900 text-midnight-100 flex flex-col overflow-hidden
          border-r border-white/[0.06]
          transform transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
          ${isOpen
            ? "translate-x-0 shadow-[24px_0_60px_-20px_rgba(0,0,0,0.6)]"
            // No shadow while parked off-screen: a 24px-offset, 60px-blur shadow
            // reaches ~60px past the drawer's edge and greyed the left of every page.
            : "-translate-x-full shadow-none"}`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Ambient brand warmth — decorative, never intercepts taps. */}
        <div className="absolute -top-24 -left-16 w-72 h-72 bg-orange-500/15 mkt-bloom" />
        <div className="absolute inset-0 mkt-grain pointer-events-none" />

        {/* Header */}
        <div className="relative px-5 pt-5 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SkateMark size={36} />
            <div>
              <p className="font-display font-bold text-base text-white tracking-tight">
                Codeskate <span className="mkt-text-gradient">CRM</span>
              </p>
              <span className="inline-block mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-md bg-orange-500/15 text-orange-300">
                {isAdmin ? "Admin" : "Sales"}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.12] active:bg-white/[0.16] transition-colors"
            aria-label="Close menu"
          >
            <X size={16} className="text-midnight-200" />
          </button>
        </div>

        {/* Organization Switcher */}
        {user?.memberships && user.memberships.length > 1 && (
          <div className="relative px-4 pb-3">
            <select
              value={user.activeOrgId}
              onChange={(e) => switchOrg(e.target.value)}
              className="w-full text-sm font-medium text-white bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2.5 min-h-touch outline-none focus:border-orange-400/50"
            >
              {user.memberships.map((m) => (
                // Native option lists render on a light OS surface — keep them dark-on-light.
                <option key={m.orgId} value={m.orgId} className="text-ink bg-white">
                  {m.displayName || m.orgId}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Navigation List */}
        <motion.nav {...motionList} className="relative flex-1 overflow-y-auto scroll-rubber px-3 py-2">
          {groups.map((group, gi) => (
            <div key={group.label || gi} className={gi > 0 ? "mt-4" : ""}>
              {group.label && (
                <motion.p
                  {...motionItem}
                  className="px-4 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-midnight-300/80"
                >
                  {group.label}
                </motion.p>
              )}
              {group.links.map((link) => {
                const Icon = link.icon;
                return (
                  <motion.div key={link.to} {...motionItem}>
                    <NavLink
                      to={link.to}
                      end={link.end}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `relative flex items-center gap-3 px-4 py-3 min-h-touch rounded-xl mb-0.5 transition-colors duration-150 ${
                          isActive
                            ? "bg-white/[0.07] text-white"
                            : "text-midnight-200/80 hover:bg-white/[0.04] hover:text-white active:bg-white/[0.08]"
                        }`
                      }
                      style={{ WebkitTapHighlightColor: "transparent" }}
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-gradient-orange shadow-[0_0_12px_rgba(255,107,26,0.8)]" />
                          )}
                          <Icon
                            size={18}
                            strokeWidth={isActive ? 2.2 : 1.8}
                            className={isActive ? "text-orange-300" : "text-midnight-300/80"}
                          />
                          <span className="flex-1 text-sm font-medium">{link.label}</span>
                          {isActive && <ChevronRight size={14} className="text-orange-300/80" />}
                        </>
                      )}
                    </NavLink>
                  </motion.div>
                );
              })}
            </div>
          ))}
        </motion.nav>

        {/* User Profile Footer */}
        <div
          className="relative px-4 py-4 border-t border-white/[0.07] bg-white/[0.02]"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="avatar ring-2 ring-white/10">
              {(user?.displayName || user?.name || "U")[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {user?.displayName || user?.name || "User"}
              </p>
              <p className="text-xs text-midnight-300/80 num">{user?.phone}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 min-h-touch rounded-xl text-rose-300 w-full -mx-1 transition-colors hover:bg-rose-500/10 active:bg-rose-500/15"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <LogOut size={18} />
            <span className="text-sm font-medium">Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
