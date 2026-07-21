/**
 * Module 9: Audit Logs.
 * Platform-level audit trail with cursor pagination.
 */
import { useState, useEffect } from "react";
import PlatformShell from "./components/PlatformShell";
import DataTable from "./components/DataTable";
import { listAuditLogs } from "../../utils/platformApi";
import { ScrollText } from "lucide-react";

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [history, setHistory] = useState([]); // cursor stack for back

  const loadPage = async (c = null) => {
    setLoading(true);
    try {
      const params = { limit: "30" };
      if (c) params.cursor = c;
      const result = await listAuditLogs(params);
      setLogs(result.logs || []);
      setHasMore(Boolean(result.nextCursor));
      setCursor(result.nextCursor || null);
    } catch { setLogs([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadPage(); }, []);

  const columns = [
    { key: "at", label: "Time", render: (v) => <span className="text-xs text-ink-muted">{v ? new Date(v).toLocaleString("en-IN") : "—"}</span> },
    { key: "action", label: "Action", render: (v) => <span className="text-xs font-medium">{v || "—"}</span> },
    { key: "targetType", label: "Target", render: (v) => <span className="text-xs">{v || "—"}</span> },
    { key: "targetId", label: "Target ID", render: (v) => <span className="text-xs text-ink-muted font-mono">{v ? v.slice(0, 12) : "—"}</span> },
    { key: "actorPhone", label: "Actor", render: (v) => <span className="text-xs">{v || "System"}</span> },
  ];

  return (
    <PlatformShell title="Audit Logs">
      <DataTable
        columns={columns}
        rows={logs}
        loading={loading}
        emptyMessage="No audit logs yet"
        emptyIcon={ScrollText}
        hasNextPage={hasMore}
        hasPrevPage={history.length > 0}
        onNextPage={() => { setHistory((h) => [...h, logs[0]?.id || null]); loadPage(cursor); }}
        onPrevPage={() => { const prev = history.pop(); setHistory([...history]); loadPage(prev || null); }}
      />
    </PlatformShell>
  );
}
