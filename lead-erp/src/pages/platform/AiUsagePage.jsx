/**
 * Module 8: AI Usage & Cost.
 * Placeholder — no AI provider is integrated yet. Shows a ready-state UI.
 */
import PlatformShell from "./components/PlatformShell";
import SectionCard from "./components/SectionCard";
import KpiCard from "./components/KpiCard";
import { Brain, DollarSign, Zap, Clock } from "lucide-react";

export default function AiUsagePage() {
  return (
    <PlatformShell title="AI Usage & Cost">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total API Calls" value="—" icon={Zap} color="purple" sublabel="No AI provider configured" />
          <KpiCard label="Monthly Cost" value="₹0" icon={DollarSign} color="green" />
          <KpiCard label="Avg Latency" value="—" icon={Clock} color="blue" />
          <KpiCard label="Models Active" value="0" icon={Brain} color="orange" />
        </div>
        <SectionCard title="AI Integration Status">
          <div className="text-center py-12">
            <Brain size={48} className="text-cream-300 mx-auto mb-4" />
            <h3 className="font-semibold text-ink mb-2">No AI Provider Configured</h3>
            <p className="text-sm text-ink-muted max-w-md mx-auto">
              When an AI provider (OpenAI, Anthropic, etc.) is integrated, this module will display
              token usage, cost breakdown by org, model performance, and rate limit monitoring.
            </p>
          </div>
        </SectionCard>
      </div>
    </PlatformShell>
  );
}
