import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Menu, X, ArrowRight } from "lucide-react";
import Logo from "./Logo";

const NAV_LINKS = [
  { label: "Features", to: "/#features" },
  { label: "Voice", to: "/#voice" },
  { label: "How it works", to: "/#how" },
  { label: "Pricing", to: "/pricing" },
  { label: "FAQ", to: "/pricing#faq" },
];

export default function MarketingNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const go = (to) => {
    setOpen(false);
    if (to.startsWith("/#")) {
      if (location.pathname !== "/") {
        navigate("/");
        setTimeout(() => {
          document.querySelector(to.slice(1))?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      } else {
        document.querySelector(to.slice(1))?.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      navigate(to);
    }
  };

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-midnight-950/80 backdrop-blur-xl border-b border-white/[0.08] shadow-[0_8px_32px_-16px_rgba(0,0,0,0.8)]"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <button onClick={() => go("/")} className="shrink-0">
            {/* onDark keeps the wordmark legible against the dark canvas. */}
            <Logo onDark />
          </button>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <button
                key={l.label}
                onClick={() => go(l.to)}
                className="px-4 py-2 text-sm font-medium text-midnight-200/80 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors"
              >
                {l.label}
              </button>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={() => navigate("/login")}
              className="px-4 py-2 text-sm font-semibold text-midnight-100 hover:text-orange-300 transition-colors"
            >
              Sign in
            </button>
            <button
              onClick={() => navigate("/signup")}
              className="btn mkt-btn-ember text-sm font-semibold"
            >
              Start free trial
              <ArrowRight size={16} />
            </button>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setOpen((v) => !v)}
            className="md:hidden p-2 text-white hover:bg-white/[0.08] rounded-lg transition-colors"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-midnight-950/95 backdrop-blur-xl border-b border-white/[0.08] px-4 py-4 space-y-1 animate-fade-in">
          {NAV_LINKS.map((l) => (
            <button
              key={l.label}
              onClick={() => go(l.to)}
              className="block w-full text-left px-4 py-3 text-sm font-medium text-midnight-200/80 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors"
            >
              {l.label}
            </button>
          ))}
          <div className="pt-3 flex flex-col gap-2 border-t border-white/[0.08] mt-2">
            <button
              onClick={() => navigate("/login")}
              className="btn mkt-btn-glass w-full font-semibold"
            >
              Sign in
            </button>
            <button
              onClick={() => navigate("/signup")}
              className="btn mkt-btn-ember w-full font-semibold"
            >
              Start free trial
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
