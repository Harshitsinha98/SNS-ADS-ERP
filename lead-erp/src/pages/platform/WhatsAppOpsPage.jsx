/**
 * Module 7: WhatsApp Operations.
 */
import { useState, useEffect } from "react";
import PlatformShell from "./components/PlatformShell";
import KpiCard from "./components/KpiCard";
import SectionCard from "./components/SectionCard";
import StatusBadge from "./components/StatusBadge";
import { getWhatsAppOverview } from "../../utils/platformApi";
import { MessageCircle, Wifi, WifiOff } from "lucide-react";

export default function WhatsAppOpsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWhatsAppOverview().then((r) => setData(r)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <PlatformShell title="WhatsApp Ops"><div className="animate-pulse h-64 rounded-2xl bg-cream-200" /></PlatformShell>;

  const connections = data?.connections || [];

  return (
    <PlatformShell title="WhatsApp Operations">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard label="Active Connections" value={connections.length} icon={Wifi} color="green" />
          <KpiCard label="Phone Numbers" value={connections.length} icon={MessageCircle} color="blue" />
          <KpiCard label="Disconnected" value={0} icon={WifiOff} color="red" />
        </div>
        <SectionCard title="Connected WhatsApp Numbers">
          {connections.length === 0 ? (
            <p className="text-sm text-ink-muted text-center py-6">No WhatsApp connections yet</p>
          ) : (
            <div className="space-y-2">
              {connections.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-cream-200">
                  <div>
                    <p className="text-sm font-medium text-ink">{c.phoneNumberId}</p>
                    <p className="text-[11px] text-ink-muted">Org: {c.orgId} · WABA: {c.wabaId}</p>
                  </div>
                  <StatusBadge status={c.active ? "active" : "disabled"} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </PlatformShell>
  );
}
