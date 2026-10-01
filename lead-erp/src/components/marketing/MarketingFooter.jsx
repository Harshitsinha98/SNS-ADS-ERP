import { Link } from "react-router-dom";
import { Globe, Mail, Send, MessageCircle } from "lucide-react";
import SkateMark from "./SkateMark";

const PRODUCT_LINKS = [
  { label: "Features", to: "/#features" },
  { label: "Pricing", to: "/pricing" },
  { label: "Free trial", to: "/signup" },
  { label: "Sign in", to: "/login" },
];

const COMPANY_LINKS = ["About", "Blog", "Careers", "Contact"];

const LEGAL_LINKS = [
  { label: "Privacy", to: "/privacy" },
  { label: "Terms", to: "/terms" },
];

const SOCIAL_ICONS = [Globe, MessageCircle, Send, Mail];

export default function MarketingFooter() {
  return (
    <footer className="relative bg-midnight-950 text-midnight-200 overflow-hidden border-t border-white/[0.08]">
      {/* Ambient warmth + grain so the footer doesn't read as a flat black slab. */}
      <div className="absolute inset-0 mkt-grain pointer-events-none" />
      <div className="absolute -top-28 left-1/4 w-96 h-96 bg-orange-600/15 mkt-bloom" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <SkateMark size={36} />
              <span className="font-display font-bold text-xl text-white">
                Codeskate <span className="mkt-text-gradient">CRM</span>
              </span>
            </div>
            <p className="text-sm text-midnight-300/80 leading-relaxed max-w-xs">
              The all-in-one lead management platform that helps growing teams close more deals.
            </p>
          </div>

          <div>
            <h4 className="font-display font-semibold text-white text-sm mb-4">Product</h4>
            <ul className="space-y-2.5 text-sm">
              {PRODUCT_LINKS.map((l) => (
                <li key={l.label}>
                  <Link
                    to={l.to}
                    className="text-midnight-300/80 hover:text-orange-300 transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold text-white text-sm mb-4">Company</h4>
            <ul className="space-y-2.5 text-sm">
              {COMPANY_LINKS.map((l) => (
                <li key={l}>
                  <span className="text-midnight-300/80">{l}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold text-white text-sm mb-4">Legal</h4>
            <ul className="space-y-2.5 text-sm">
              {LEGAL_LINKS.map((l) => (
                <li key={l.label}>
                  <Link
                    to={l.to}
                    className="text-midnight-300/80 hover:text-orange-300 transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <span className="text-midnight-300/80">Security</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mkt-rule mb-8" />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-midnight-300/80">
            © {new Date().getFullYear()} Codeskate CRM. All rights reserved.
          </p>
          <div className="flex items-center gap-2.5">
            {SOCIAL_ICONS.map((Icon, i) => (
              <span
                key={i}
                className="w-9 h-9 rounded-lg bg-white/[0.05] border border-white/[0.08] hover:bg-gradient-orange hover:border-transparent flex items-center justify-center transition-all duration-300 cursor-pointer"
              >
                <Icon size={16} className="text-midnight-200" />
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
