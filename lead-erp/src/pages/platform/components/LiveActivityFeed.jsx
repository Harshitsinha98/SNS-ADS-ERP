/**
 * Bounded real-time activity feed for Platform Mission Control.
 *
 * The feed listens only to the 20 latest organization activity events and
 * platform audit events. This is intentionally separate from Action Center
 * aggregates so high-volume activity cannot trigger broad platform scans.
 */

import { useEffect, useMemo, useState } from "react";
import { collection, collectionGroup, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import {
  Activity, BadgeCheck, Building2, CalendarPlus, CheckCircle2,
  CircleDollarSign, MessageCircle, RefreshCw, Upload,
} from "lucide-react";
import { db } from "../../../firebase";
import SectionCard from "./SectionCard";

const FEED_LIMIT = 20;

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function relativeTime(value) {
  const timestamp = toMillis(value);
  if (!timestamp) return "Recently";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function eventPresentation(item) {
  const text = String(item.text || item.action || "Platform event");
  const normalized = text.toLowerCase().replaceAll("_", " ");

  if (normalized.includes("trial") && normalized.includes("extend")) {
    return { title: "Trial Extended", detail: item.text || "A trial was extended", icon: CalendarPlus, color: "text-orange-600 bg-orange-100" };
  }
  if (normalized.includes("whatsapp") && (normalized.includes("connect") || normalized.includes("subscribed"))) {
    return { title: "WhatsApp Connected", detail: item.text || "A WhatsApp Business connection changed", icon: MessageCircle, color: "text-emerald-600 bg-emerald-100" };
  }
  if (normalized.includes("payment") || normalized.includes("subscription") || normalized.includes("plan")) {
    const upgraded = normalized.includes("upgrade");
    return { title: upgraded ? "Plan Upgraded" : normalized.includes("payment") ? "Payment Received" : "Subscription Activated", detail: item.text || "A subscription changed", icon: CircleDollarSign, color: "text-emerald-600 bg-emerald-100" };
  }
  if (normalized.includes("import")) {
    return { title: "Lead Import Completed", detail: item.text || "Lead import completed", icon: Upload, color: "text-blue-600 bg-blue-100" };
  }
  if (normalized.includes("created") || normalized.includes("workspace")) {
    return { title: "Organization Created", detail: item.text || "A new organization was created", icon: Building2, color: "text-purple-600 bg-purple-100" };
  }
  if (normalized.includes("activate")) {
    return { title: "Subscription Activated", detail: item.text || "A subscription was activated", icon: BadgeCheck, color: "text-emerald-600 bg-emerald-100" };
  }
  return { title: "Platform Activity", detail: item.text || item.action || "Platform event", icon: Activity, color: "text-ink-soft bg-cream-100" };
}

function useLiveActivityFeed(enabled) {
  const [orgEvents, setOrgEvents] = useState([]);
  const [platformEvents, setPlatformEvents] = useState([]);
  const [readySources, setReadySources] = useState(0);
  const [error, setError] = useState(null);
  const [liveConnected, setLiveConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;

    setOrgEvents([]);
    setPlatformEvents([]);
    setReadySources(0);
    setError(null);
    setLiveConnected(false);

    let orgSourceReady = false;
    let platformSourceReady = false;
    const sourceReady = (source) => {
      if (source === "organization") {
        if (orgSourceReady) return;
        orgSourceReady = true;
      } else {
        if (platformSourceReady) return;
        platformSourceReady = true;
      }
      setReadySources((count) => Math.min(2, count + 1));
    };

    // The collectionGroup("activity") query may fail with permission-denied
    // because Firestore collection-group security rules require matching ALL
    // possible paths. The platformAuditLogs stream is the authoritative source
    // for platform-wide events; if it connects successfully the feed is live.
    const unsubOrgActivity = onSnapshot(
      query(collectionGroup(db, "activity"), orderBy("at", "desc"), limit(FEED_LIMIT)),
      (snapshot) => {
        setOrgEvents(snapshot.docs.map((doc) => ({ id: `org:${doc.ref.parent.parent?.id || "unknown"}:${doc.id}`, source: "organization", ...doc.data() })));
        setLiveConnected(true);
        sourceReady("organization");
      },
      (snapshotError) => {
        // Gracefully degrade: org activity stream is non-critical when
        // platformAuditLogs is healthy. Only log and mark source ready.
        console.warn("Organization activity collection-group listener failed (non-critical):", snapshotError?.code);
        sourceReady("organization");
      }
    );

    const unsubPlatformActivity = onSnapshot(
      query(collection(db, "platformAuditLogs"), orderBy("at", "desc"), limit(FEED_LIMIT)),
      (snapshot) => {
        setPlatformEvents(snapshot.docs.map((doc) => ({ id: `platform:${doc.id}`, source: "platform", ...doc.data() })));
        setLiveConnected(true);
        sourceReady("platform");
      },
      (snapshotError) => {
        console.warn("Platform audit logs listener error:", snapshotError?.code);
        setError("Live activity is temporarily unavailable.");
        sourceReady("platform");
      }
    );

    return () => {
      unsubOrgActivity();
      unsubPlatformActivity();
    };
  }, [enabled]);

  const events = useMemo(() => [...orgEvents, ...platformEvents]
    .sort((left, right) => toMillis(right.at) - toMillis(left.at))
    .slice(0, FEED_LIMIT), [orgEvents, platformEvents]);

  return { events, loading: enabled && readySources < 2, error, liveConnected };
}

export default function LiveActivityFeed({ isPlatformAdmin }) {
  const { events, loading, error, liveConnected } = useLiveActivityFeed(isPlatformAdmin);

  return (
    <SectionCard
      title="Live Activity Feed"
      subtitle="The latest organization and platform events update automatically."
      actions={(
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${liveConnected ? "text-emerald-700" : "text-ink-muted"}`}>
          <span className={`h-2 w-2 rounded-full ${liveConnected ? "bg-emerald-500 animate-pulse" : "bg-cream-300"}`} aria-hidden="true" />
          {liveConnected ? "Live" : "Connecting…"}
        </span>
      )}
    >
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-11 animate-pulse rounded-lg bg-cream-100" />)}
        </div>
      ) : error && events.length === 0 ? (
        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">{error}</p>
          <p className="mt-1 text-xs text-amber-700">Other Mission Control data is still available. Retry after checking your Firestore connection.</p>
        </div>
      ) : events.length === 0 ? (
        <div className="py-8 text-center">
          <CheckCircle2 size={28} className="mx-auto text-emerald-500" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-ink">No recent activity</p>
          <p className="mt-1 text-xs text-ink-muted">New organization, payment, WhatsApp, and operational events will appear here.</p>
        </div>
      ) : (
        <ol className="divide-y divide-cream-100">
          {events.map((event) => {
            const presentation = eventPresentation(event);
            const Icon = presentation.icon;
            return (
              <li key={event.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${presentation.color}`}>
                  <Icon size={15} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">{presentation.title}</p>
                    <time className="whitespace-nowrap text-[11px] text-ink-muted" dateTime={typeof event.at === "string" ? event.at : undefined}>{relativeTime(event.at)}</time>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-soft" title={presentation.detail}>{presentation.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}
