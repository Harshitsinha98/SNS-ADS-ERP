/**
 * Platform Owner Console — Shell Layout.
 *
 * ARCHITECTURAL DECISION: This layout is completely independent from the
 * organization admin Layout component. It has:
 * 1. Its own self-contained platform-owner auth check (not ProtectedRoute).
 * 2. A distinct dark sidebar matching the "control panel" aesthetic.
 * 3. Real-time connection indicator for Firestore.
 * 4. Collapsible sidebar for responsive design.
 *
 * The shell wraps every platform page. It handles the auth gate internally
 * — if the user is not a platform admin, it shows a login/denied screen
 * instead of the page content. This mirrors the existing PlatformDashboard.jsx
 * pattern but is reusable across all 12 modules.
 */

import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { usePlatformAuth } from "../hooks/usePlatformAuth";
import PlatformLogin from "./PlatformLogin";
import {
  LayoutDashboard, Building2, CreditCard, HeartHandshake, BarChart3,
  Server, MessageCircle, Brain, ScrollText, ToggleLeft, Settings2,
  HelpCircle, LogOut, Menu, X, Shield, ChevronLeft,
} from "lucide-react";

const NAV_SECTIONS = [
  {
    label: "Core",
    items: [
      { to: "/platform", label: "Executive Dashboard", icon: LayoutDashboard, end: true },
      { to: "/platform/organizations", label: "Organizations", icon: Building2 },
      { to: "/platform/billing", label: "Subscription & Billing", icon: CreditCard },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/platform/customer-success", label: "Customer Success", icon: HeartHandshake },
      { to: "/platform/analytics", label: "Platform Analytics", icon: BarChart3 },
      { to: "/platform/infrastructure", label: "Infrastructure", icon: Server },
      { to: "/platform/whatsapp", label: "WhatsApp Ops", icon: MessageCircle },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/platform/ai-usage", label: "AI Usage & Cost", icon: Brain },
      { to: "/platform/audit-logs", label: "Audit Logs", icon: ScrollText },
      { to: "/platform/feature-flags", label: "Feature Flags", icon: ToggleLeft },
      { to: "/platform/settings", label: "Platform Settings", icon: Settings2 },
      { to: "/platform/support", label: "Support Center", icon: HelpCircle },
    ],
  },
];

export default function PlatformShell({ children, title }) {
  const { user, logout } = useAuth();
  const { isPlatformAdmin, checking } = usePlatformAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Auth loading state
  if (checking) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-orange-300 border-t-orange-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-cream-300 text-sm">Verifying platform access…</p>
        </div>
      </div>
    );
  }

  // Not signed in or not platform admin → show login
  if (!user || !isPlatformAdmin) {
    return <PlatformLogin />;
  }

  return (
    <div className="min-h-screen bg-cream-50 flex">
      {/* ── Sidebar ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-ink text-cream-200 flex flex-col transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
            <Shield size={16} className="text-white" />
          </div>
          <div>
            <p className="font-display font-bold text-sm text-white">Platform Console</p>
            <p className="text-[10px] text-cream-400 uppercase tracking-wider">Owner Access</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden text-cream-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-cream-500">{section.label}</p>
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isActive
                            ? "bg-orange-600/20 text-orange-300 font-medium"
                            : "text-cream-300 hover:bg-white/5 hover:text-white"
                        }`
                      }
                    >
                      <item.icon size={16} />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-orange-600/30 flex items-center justify-center">
              <span className="text-xs font-bold text-orange-300">
                {user?.displayName?.[0] || user?.phone?.slice(-2) || "PO"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{user?.displayName || "Platform Owner"}</p>
              <p className="text-[10px] text-cream-500 truncate">{user?.phone || ""}</p>
            </div>
          </div>
          <button
            onClick={() => { logout(); navigate("/platform"); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-cream-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </aside>

      {/* ── Overlay (mobile) ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Main Content ── */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-cream-200 px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-cream-100"
            >
              <Menu size={20} className="text-ink" />
            </button>
            <h1 className="text-lg font-display font-bold text-ink">{title || "Platform Console"}</h1>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 p-4 sm:p-6 overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
