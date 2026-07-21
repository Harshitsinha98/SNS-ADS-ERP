/**
 * Module 12: Support Center.
 * Platform-level support ticket management.
 */
import PlatformShell from "./components/PlatformShell";
import SectionCard from "./components/SectionCard";
import { HelpCircle, MessageSquare } from "lucide-react";

export default function SupportPage() {
  return (
    <PlatformShell title="Support Center">
      <div className="space-y-6">
        <SectionCard title="Support Queue">
          <div className="text-center py-12">
            <HelpCircle size={48} className="text-cream-300 mx-auto mb-4" />
            <h3 className="font-semibold text-ink mb-2">Support System Ready</h3>
            <p className="text-sm text-ink-muted max-w-md mx-auto">
              When support tickets are submitted by organizations, they will appear here
              for triage and resolution. Connect an external helpdesk (Freshdesk, Intercom)
              or use the built-in ticket system.
            </p>
          </div>
        </SectionCard>
      </div>
    </PlatformShell>
  );
}
