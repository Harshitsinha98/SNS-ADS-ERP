// Minimal client-side CSV export helper.
// Accepts an array of rows (each row an array of cells) and triggers a download.

function escapeCell(value) {
  const s = value == null ? "" : String(value);
  // Quote if the cell contains a comma, quote, or newline; escape inner quotes.
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv(rows, filename = "export.csv") {
  const csv = rows.map((row) => row.map(escapeCell).join(",")).join("\n");
  // Prepend UTF-8 BOM so Excel renders unicode (₹, names) correctly.
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
