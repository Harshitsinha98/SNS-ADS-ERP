/**
 * Module 6: Infrastructure Monitoring.
 */
import { useState, useEffect } from "react";
import PlatformShell from "./components/PlatformShell";
import KpiCard from "./components/KpiCard";
import SectionCard from "./components/SectionCard";
import { getSystemHealth } from "../../utils/platformApi";
import { Server, Clock, Cpu, HardDrive } from "lucide-react";

export default function InfrastructurePage() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSystemHealth().then(setHealth).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <PlatformShell title="Infrastructure"><div className="animate-pulse h-64 rounded-2xl bg-cream-200" /></PlatformShell>;

  return (
    <PlatformShell title="Infrastructure Monitoring">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="System Status" value={health?.status || "unknown"} icon={Server} color={health?.status === "healthy" ? "green" : "red"} />
          <KpiCard label="Uptime" value={`${Math.floor((health?.uptime || 0) / 3600)}h ${Math.floor(((health?.uptime || 0) % 3600) / 60)}m`} icon={Clock} color="blue" />
          <KpiCard label="Heap Used" value={`${health?.memory?.heapUsed || 0} MB`} sublabel={`of ${health?.memory?.heapTotal || 0} MB`} icon={Cpu} color="purple" />
          <KpiCard label="RSS Memory" value={`${health?.memory?.rss || 0} MB`} icon={HardDrive} color="amber" />
        </div>
        <SectionCard title="System Info">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-ink-muted">Node Version:</span> <span className="font-medium">{health?.nodeVersion || "—"}</span></div>
            <div><span className="text-ink-muted">Last Checked:</span> <span className="font-medium">{health?.checkedAt ? new Date(health.checkedAt).toLocaleString("en-IN") : "—"}</span></div>
          </div>
        </SectionCard>
      </div>
    </PlatformShell>
  );
}
