/**
 * DataTable — reusable table component with loading/empty states,
 * cursor pagination, and responsive design for platform console modules.
 */

import { Loader2, ChevronLeft, ChevronRight, Inbox } from "lucide-react";

export default function DataTable({
  columns,
  rows,
  loading,
  emptyMessage = "No data found",
  emptyIcon: EmptyIcon = Inbox,
  onRowClick,
  // Cursor pagination
  hasNextPage,
  hasPrevPage,
  onNextPage,
  onPrevPage,
  pageLabel,
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-cream-200 bg-white p-12 text-center">
        <Loader2 size={24} className="animate-spin text-orange-500 mx-auto mb-2" />
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-2xl border border-cream-200 bg-white p-12 text-center">
        <EmptyIcon size={32} className="text-cream-400 mx-auto mb-3" />
        <p className="text-sm text-ink-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-cream-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-200 bg-cream-50/50">
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold text-ink-muted uppercase tracking-wider whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-100">
            {rows.map((row, idx) => (
              <tr
                key={row.id || idx}
                onClick={() => onRowClick?.(row)}
                className={`hover:bg-cream-50/50 transition-colors ${onRowClick ? "cursor-pointer" : ""}`}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 whitespace-nowrap">
                    {col.render ? col.render(row[col.key], row) : (row[col.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      {(hasNextPage || hasPrevPage) && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-cream-200 bg-cream-50/30">
          <button
            onClick={onPrevPage}
            disabled={!hasPrevPage}
            className="flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={14} /> Previous
          </button>
          {pageLabel && <span className="text-xs text-ink-muted">{pageLabel}</span>}
          <button
            onClick={onNextPage}
            disabled={!hasNextPage}
            className="flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
