/**
 * Section card — wraps a section of content with optional title and actions.
 */

export default function SectionCard({ title, subtitle, actions, children, className = "" }) {
  return (
    <div className={`rounded-2xl border border-cream-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-cream-100">
          <div>
            {title && <h3 className="font-display font-semibold text-ink">{title}</h3>}
            {subtitle && <p className="text-xs text-ink-muted mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
