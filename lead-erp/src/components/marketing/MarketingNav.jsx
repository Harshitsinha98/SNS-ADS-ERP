import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Menu, X, ArrowRight } from "lucide-react";
import Logo from "./Logo";

const NAV_LINKS = [
  { label: "Features", to: "/#features" },
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
          ? "bg-cream-50/85 backdrop-blur-xl border-b border-cream-300/60 shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <button onClick={() => go("/")} className="shrink-0">
            <Logo />
          </button>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <button
                key={l.label}
                onClick={() => go(l.to)}
                className="px-4 py-2 text-sm font-medium text-ink-soft hover:text-orange-600 rounded-lg hover:bg-orange-50 transition-colors"
              >
                {l.label}
              </button>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={() => navigate("/login")}
              className="px-4 py-2 text-sm font-semibold text-ink hover:text-orange-600 transition-colors"
            >
              Sign in
            </button>
            <button
              onClick={() => navigate("/signup")}
              className="btn btn-primary text-sm"
            >
              Start free trial
              <ArrowRight size={16} />
            </button>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setOpen((v) => !v)}
            className="md:hidden p-2 text-ink hover:bg-orange-50 rounded-lg"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-cream-50/95 backdrop-blur-xl border-b border-cream-300/60 px-4 py-4 space-y-1 animate-fade-in">
          {NAV_LINKS.map((l) => (
            <button
              key={l.label}
              onClick={() => go(l.to)}
              className="block w-full text-left px-4 py-3 text-sm font-medium text-ink-soft hover:text-orange-600 hover:bg-orange-50 rounded-lg"
            >
              {l.label}
            </button>
          ))}
          <div className="pt-3 flex flex-col gap-2 border-t border-cream-300/60 mt-2">
            <button
              onClick={() => navigate("/login")}
              className="btn btn-secondary w-full"
            >
              Sign in
            </button>
            <button
              onClick={() => navigate("/signup")}
              className="btn btn-primary w-full"
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
