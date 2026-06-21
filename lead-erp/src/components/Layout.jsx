import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import { useData } from "../context/DataContext";
import { useAuth } from "../context/AuthContext";

export default function Layout({ children, title }) {
  const { leads } = useData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [now, setNow] = useState(new Date());
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer state

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const results = q.length >= 2
    ? leads.filter((l) =>
        (l.name?.toLowerCase().includes(q.toLowerCase()) || l.phone?.includes(q)) &&
        (user.role === "admin" || l.assignedTo === user.id)
      ).slice(0, 6)
    : [];

  const goToLead = (l) => {
    setQ("");
    navigate(user.role === "admin" ? "/admin/leads" : `/app/lead/${l.id}`);
  };

  return (
    <div className="flex">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 min-h-screen min-w-0">
        <header className="flex items-center gap-3 px-4 sm:px-7 py-3 border-b border-paper-line bg-paper-card/60 sticky top-0 z-30 backdrop-blur-sm">
          {/* Hamburger — sirf mobile (md se neeche) pe dikhega */}
          <button onClick={() => setSidebarOpen(true)} className="md:hidden p-1.5 -ml-1 text-ink/60 hover:text-ink shrink-0">
            <Menu size={20} />
          </button>

          <div className="flex items-baseline gap-3 min-w-0 flex-1">
            <h2 className="text-base sm:text-lg font-display font-semibold truncate">{title}</h2>
            <span className="num text-xs text-ink/35 hidden sm:inline whitespace-nowrap">
              {now.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" })} · {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>

          <div className="relative w-full max-w-[170px] sm:max-w-none sm:w-72 shrink-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads…"
              className="w-full bg-paper border border-paper-line rounded-md pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal/30 focus:border-signal" />
            {results.length > 0 && (
              <div className="absolute z-10 bg-white shadow-card rounded-md mt-1 w-full border border-paper-line overflow-hidden">
                {results.map((l) => (
                  <button key={l.id} onClick={() => goToLead(l)}
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-paper border-b border-paper-line last:border-0">
                    <span className="font-medium">{l.name}</span> <span className="num text-ink/40">{l.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        <div className="p-4 sm:p-7">{children}</div>
      </main>
    </div>
  );
}