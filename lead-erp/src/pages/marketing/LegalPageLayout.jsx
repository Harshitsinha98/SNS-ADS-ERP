import { Link } from "react-router-dom";
import { ArrowLeft, FileCheck2, ShieldCheck } from "lucide-react";
import MarketingNav from "../../components/marketing/MarketingNav";
import MarketingFooter from "../../components/marketing/MarketingFooter";

export default function LegalPageLayout({ eyebrow, title, intro, updatedAt, children }) {
  return (
    <div className="min-h-screen mkt-canvas text-midnight-100 overflow-x-hidden">
      <MarketingNav />
      <main className="relative pt-28 pb-20 sm:pt-36">
        <div className="absolute inset-0 mkt-grid-fade pointer-events-none" />
        <div className="absolute inset-0 mkt-grain pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-midnight-300 hover:text-orange-300 transition-colors"
          >
            <ArrowLeft size={16} /> Back to Codeskate CRM
          </Link>

          <header className="mt-8 relative rounded-3xl mkt-card mkt-sheen p-7 sm:p-10 overflow-hidden">
            <div className="absolute -right-16 -top-16 h-56 w-56 bg-orange-500/20 mkt-bloom" />
            <div className="relative flex items-start gap-4">
              <div className="rounded-2xl bg-orange-500/15 border border-orange-400/20 p-3 text-orange-300 shrink-0">
                {eyebrow === "Privacy" ? <ShieldCheck size={26} /> : <FileCheck2 size={26} />}
              </div>
              <div>
                <p className="mkt-eyebrow">{eyebrow}</p>
                <h1 className="mt-2 font-display text-3xl sm:text-4xl font-bold tracking-[-0.025em] text-white">
                  {title}
                </h1>
                <p className="mt-3 max-w-2xl text-sm sm:text-base leading-7 text-midnight-200/80">
                  {intro}
                </p>
                <p className="mt-5 text-xs text-midnight-300/80">Last updated: {updatedAt}</p>
              </div>
            </div>
          </header>

          <article className="mt-7 rounded-3xl mkt-card p-6 sm:p-10 text-sm sm:text-base leading-7 text-midnight-200/80 [&_h2]:font-display [&_h2]:font-bold [&_h2]:text-xl [&_h2]:text-white [&_h2]:mt-10 [&_h2]:mb-3 [&_h2:first-child]:mt-0 [&_h3]:font-semibold [&_h3]:text-midnight-100 [&_h3]:mt-6 [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_strong]:text-white [&_a]:text-orange-300 [&_a]:font-semibold [&_a]:hover:underline">
            {children}
          </article>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
