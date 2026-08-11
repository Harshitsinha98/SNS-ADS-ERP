import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Menu, X, ArrowLeft } from "lucide-react";
import BottomNav from "./BottomNav";
import Sidebar from "./Sidebar";
import TrialBanner from "./TrialBanner";
import NotificationBell from "./NotificationBell";
import { useData } from "../context/DataContext";
import { useAuth } from "../context/AuthContext";

export default function Layout({ children, title, showBack = false, onBack }) {
  const { leads } = useData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const results =
    q.length >= 2
      ? leads
          .filter(
            (l) =>
              (l.name?.toLowerCase().includes(q.toLowerCase()) || l.phone?.includes(q)) &&
              (user.role === "admin" || user.role === "owner" || l.assignedTo === user.id)
          )
          .slice(0, 5)
      : [];

  const goToLead = (l) => {
    setQ("");
    setSearchOpen(false);
    navigate(user.role === "admin" || user.role === "owner" ? `/admin/leads/${l.id}` : `/app/lead/${l.id}`);
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-cream-100">
      {/* ─── TOP APP BAR ─── */}
      <header className="app-topbar shadow-topbar">
        <div className="app-topbar-inner">
          {/* Left: Back or Menu */}
          <div className="flex items-center gap-2">
            {showBack ? (
              <button
                onClick={onBack || (() => navigate(-1))}
                className="w-9 h-9 flex items-center justify-center rounded-full tap-highlight"
              >
                <ArrowLeft size={20} className="text-ink" />
              </button>
            ) : (
              <button
                onClick={() => setDrawerOpen(true)}
                className="w-9 h-9 flex items-center justify-center rounded-full tap-highlight"
              >
                <Menu size={20} className="text-ink" />
              </button>
            )}

            {/* Title */}
            <h1 className="text-base font-display font-bold text-ink truncate max-w-[180px]">
              {title}
            </h1>
          </div>

          {/* Right: Search + Notification */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="w-9 h-9 flex items-center justify-center rounded-full tap-highlight"
            >
              <Search size={18} className="text-ink-soft" />
            </button>
            <NotificationBell />
          </div>
        </div>

        {/* Expandable Search Bar */}
        {searchOpen && (
          <div className="px-4 pb-3 animate-slide-down">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search leads by name or phone..."
                autoFocus
                className="input pl-10 pr-10 py-3 text-sm"
              />
              <button
                onClick={() => { setSearchOpen(false); setQ(""); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-cream-200"
              >
                <X size={14} className="text-ink-muted" />
              </button>
            </div>

            {/* Search Results */}
            {results.length > 0 && (
              <div className="mt-2 bg-white rounded-xl border border-cream-200 shadow-card overflow-hidden">
                {results.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => goToLead(l)}
                    className="list-item w-full text-left border-b border-cream-100 last:border-0"
                  >
                    <div className="avatar-sm">
                      {(l.name || "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{l.name}</p>
                      <p className="text-xs text-ink-muted num">{l.phone}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      {/* ─── SIDEBAR DRAWER ─── */}
      <Sidebar isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* ─── MAIN CONTENT ─── */}
      <main className="app-content">
        <div className="px-4 pt-3 pb-2">
          <TrialBanner />
          {children}
        </div>
      </main>

      {/* ─── BOTTOM NAV ─── */}
      <BottomNav />
    </div>
  );
}
