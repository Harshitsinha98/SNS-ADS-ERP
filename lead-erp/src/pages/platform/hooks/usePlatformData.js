/**
 * Platform data hook — provides real-time cross-org data for the console.
 *
 * ARCHITECTURAL DECISION: Platform-level data lives in two layers:
 * 1. Real-time Firestore listeners for small collections (organizations, platformConfig)
 * 2. Backend API calls for expensive aggregations (analytics, audit logs, billing stats)
 *
 * The hook subscribes to organizations collection (platform admin has read
 * access per firestore.rules) and platformConfig for config changes.
 * Heavy analytics are fetched via the backend API to avoid expensive
 * client-side Firestore scans.
 */

import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../../firebase";
import { subscribePlatformConfig } from "../../../utils/platformConfig";
import { mergePlansWithConfig } from "../../../data/plans";

export function usePlatformData(isPlatformAdmin) {
  const [orgs, setOrgs] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isPlatformAdmin) return;
    setLoading(true);

    const unsubOrgs = onSnapshot(
      collection(db, "organizations"),
      (snap) => {
        setOrgs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.warn("Platform orgs listener error:", err?.code);
        setLoading(false);
      }
    );

    const unsubConfig = subscribePlatformConfig((c) => setConfig(c));

    return () => { unsubOrgs(); unsubConfig(); };
  }, [isPlatformAdmin]);

  // Derived analytics from orgs (computed client-side from cached data)
  const analytics = useMemo(() => {
    if (!orgs.length) return null;
    const { plans } = mergePlansWithConfig(config);
    const priceOf = (planId) => plans.find((p) => p.id === planId)?.monthlyPrice || 0;

    const total = orgs.length;
    const active = orgs.filter((o) => o.subscriptionStatus === "active").length;
    const trialing = orgs.filter((o) => o.subscriptionStatus === "trialing").length;
    const expired = orgs.filter((o) => o.subscriptionStatus === "expired").length;
    const pastDue = orgs.filter((o) => o.subscriptionStatus === "past_due").length;

    const mrr = orgs
      .filter((o) => o.subscriptionStatus === "active")
      .reduce((sum, o) => sum + priceOf(o.planId), 0);

    const totalSeats = orgs.reduce((sum, o) => sum + (o.seatsUsed || 0), 0);
    const totalLeads = orgs.reduce((sum, o) => sum + (o.leadsUsed || 0), 0);

    // Plan distribution
    const planDistribution = {};
    orgs.forEach((o) => {
      const plan = o.planId || "unknown";
      planDistribution[plan] = (planDistribution[plan] || 0) + 1;
    });

    // Recent signups (last 7 days)
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentSignups = orgs.filter((o) => {
      const created = o.createdAt ? (typeof o.createdAt === "string" ? Date.parse(o.createdAt) : o.createdAt.toMillis?.() || 0) : 0;
      return created > weekAgo;
    }).length;

    // WhatsApp connected count
    const whatsappConnected = orgs.filter((o) => o.whatsappConnected || false).length;

    return {
      total, active, trialing, expired, pastDue, mrr, totalSeats, totalLeads,
      planDistribution, recentSignups, whatsappConnected, plans,
    };
  }, [orgs, config]);

  return { orgs, config, analytics, loading };
}
