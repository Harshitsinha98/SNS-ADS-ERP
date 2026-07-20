import { Link } from "react-router-dom";
import { Zap, Globe, Mail, Send, MessageCircle } from "lucide-react";

export default function MarketingFooter() {
  return (
    <footer className="relative bg-ink text-cream-200 texture-grain overflow-hidden">
      {/* warm glow */}
      <div className="absolute -top-24 left-1/4 w-96 h-96 bg-orange-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-gradient-orange flex items-center justify-center shadow-glow">
                <Zap size={18} className="text-white" fill="currentColor" strokeWidth={1.5} />
              </div>
              <span className="font-display font-bold text-xl text-white">
                Codeskate <span className="text-orange-400">CRM</span>
              </span>
            </div>
            <p className="text-sm text-cream-400/80 leading-relaxed max-w-xs">
              The all-in-one lead management platform that helps growing teams close more deals.
            </p>
          </div>

          <div>
            <h4 className="font-display font-semibold text-white text-sm mb-4">Product</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link to="/#features" className="text-cream-400/80 hover:text-orange-400 transition-colors">Features</Link></li>
              <li><Link to="/pricing" className="text-cream-400/80 hover:text-orange-400 transition-colors">Pricing</Link></li>
              <li><Link to="/signup" className="text-cream-400/80 hover:text-orange-400 transition-colors">Free trial</Link></li>
              <li><Link to="/login" className="text-cream-400/80 hover:text-orange-400 transition-colors">Sign in</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold text-white text-sm mb-4">Company</h4>
            <ul className="space-y-2.5 text-sm">
              <li><span className="text-cream-400/80">About</span></li>
              <li><span className="text-cream-400/80">Blog</span></li>
              <li><span className="text-cream-400/80">Careers</span></li>
              <li><span className="text-cream-400/80">Contact</span></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold text-white text-sm mb-4">Legal</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link to="/privacy" className="text-cream-400/80 hover:text-orange-400 transition-colors">Privacy</Link></li>
              <li><Link to="/terms" className="text-cream-400/80 hover:text-orange-400 transition-colors">Terms</Link></li>
              <li><span className="text-cream-400/80">Security</span></li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-cream-200/10">
          <p className="text-xs text-cream-400/60">
            © {new Date().getFullYear()} Codeskate CRM. All rights reserved.
          </p>
          <div className="flex items-center gap-3">
            {[Globe, MessageCircle, Send, Mail].map((Icon, i) => (
              <span
                key={i}
                className="w-9 h-9 rounded-lg bg-white/5 hover:bg-orange-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                <Icon size={16} className="text-cream-300" />
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
