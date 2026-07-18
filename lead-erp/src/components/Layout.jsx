import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Menu, Clock } from "lucide-react";
import Sidebar from "./Sidebar";
import TrialBanner from "./TrialBanner";
import { useData } from "../context/DataContext";
import { useAuth } from "../context/AuthContext";

export default function Layout({ children, title }) {
  const { leads } = useData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [now, setNow] = useState(new Date());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const results =
    q.length >= 2
      ? leads.filter(
          (l) =>
            (l.name?.toLowerCase().includes(q.toLowerCase()) || l.phone?.includes(q)) &&
            (user.role === "admin" || user.role === "owner" || l.assignedTo === user.id)
        ).slice(0, 6)
      : [];

  const goToLead = (l) => {
    setQ("");
    navigate(user.role === "admin" || user.role === "owner" ? "/admin/leads" : `/app/lead/${l.id}`);
  };

  return (
    <div className="flex bg-gray-50">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 min-h-screen min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 sm:px-6 py-4 bg-white border-b border-gray-200 sticky top-0 z-30">
          {/* Mobile menu button */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Menu size={20} />
          </button>

          {/* Title & Date */}
          <div className="flex items-baseline gap-3 min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl font-display font-semibold text-gray-800 truncate">
              {title}
            </h2>
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400 font-mono whitespace-nowrap">
              <Clock size={12} />
              {now.toLocaleDateString("en-IN", {
                weekday: "short",
                day: "2-digit",
                month: "short",
              })}
              <span className="text-gray-300 mx-1">·</span>
              {now.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          {/* Search */}
          <div className="relative w-full max-w-[200px] sm:max-w-xs shrink-0">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search leads..."
              className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-300 focus:bg-white transition-all"
            />
            {results.length > 0 && (
              <div className="absolute z-10 bg-white shadow-lg rounded-lg mt-2 w-full border border-gray-100 overflow-hidden">
                {results.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => goToLead(l)}
                    className="block w-full text-left px-4 py-3 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors"
                  >
                    <span className="font-medium text-gray-800">{l.name}</span>
                    <span className="text-gray-400 font-mono ml-2">{l.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <div className="p-4 sm:p-6">
          <TrialBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
