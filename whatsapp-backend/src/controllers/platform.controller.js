/**
 * Platform Console Controller.
 *
 * ARCHITECTURAL DECISION: Every endpoint here is gated by requirePlatformAdmin.
 * These are thin HTTP adapters — they call platformAnalytics/platformServices
 * and shape responses. Expensive queries (cross-org scans) go through the
 * backend aggregate service rather than letting the client do unbounded reads.
 */

import { db } from "../bootstrap/firebase.js";
import * as analytics from "../services/platformAnalytics.js";
import { nowIso, safeDocId } from "../services/helpers.js";
import { getMergedPlans } from "../../plans.js";

// ── Executive Dashboard ──

export async function getPlatformStats(req, res) {
  try {
    const metrics = await analytics.getCurrentMetrics();
    return res.json({ ok: true, metrics });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not load platform stats" });
  }
}

export async function getRevenueTimeline(req, res) {
  try {
    const range = req.query?.range || "30d";
    const timeline = await analytics.getRevenueTimeline(range);
    return res.json({ ok: true, timeline });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not load revenue data" });
  }
}

// ── Organization Management ──

export async function listOrganizations(req, res) {
  try {
    const { status, plan, search, cursor, limit: limitParam } = req.query;
    const pageSize = Math.min(100, Math.max(1, Number(limitParam) || 25));
    let query = db.collection("organizations").orderBy("createdAt", "desc").limit(pageSize + 1);

    if (status) query = query.where("subscriptionStatus", "==", status);
    if (plan) query = query.where("planId", "==", plan);
    if (cursor) {
      const cursorDoc = await db.collection("organizations").doc(cursor).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }

    const snap = await query.get();
    const hasMore = snap.docs.length > pageSize;
    const docs = snap.docs.slice(0, pageSize);
    const organizations = docs.map((d) => ({ id: d.id, ...d.data() }));

    // Client-side search filter (for name/phone) since Firestore doesn't support LIKE
    const filtered = search
      ? organizations.filter((o) =>
          (o.name || "").toLowerCase().includes(search.toLowerCase()) ||
          (o.ownerPhone || "").includes(search)
        )
      : organizations;

    return res.json({
      ok: true,
      organizations: filtered,
      nextCursor: hasMore ? docs[docs.length - 1].id : null,
      total: null, // Expensive count — use aggregate if needed
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not list organizations" });
  }
}

export async function getOrganizationDetail(req, res) {
  try {
    const { orgId } = req.params;
    const orgSnap = await db.collection("organizations").doc(orgId).get();
    if (!orgSnap.exists) return res.status(404).json({ error: "Organization not found" });
    const org = { id: orgSnap.id, ...orgSnap.data() };

    // Fetch related data in parallel
    const [membersSnap, leadsCountSnap, invoicesSnap] = await Promise.all([
      db.collection("memberships").where("orgId", "==", orgId).get(),
      db.collection("organizations").doc(orgId).collection("aggregates").doc("counts").get(),
      db.collection("organizations").doc(orgId).collection("invoices").orderBy("at", "desc").limit(10).get(),
    ]);

    return res.json({
      ok: true,
      organization: org,
      members: membersSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      aggregates: leadsCountSnap.exists ? leadsCountSnap.data() : null,
      invoices: invoicesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not load organization" });
  }
}

export async function performOrgAction(req, res) {
  try {
    const { orgId } = req.params;
    const { action, ...params } = req.body;
    const orgRef = db.collection("organizations").doc(orgId);
    const orgSnap = await orgRef.get();
    if (!orgSnap.exists) return res.status(404).json({ error: "Organization not found" });

    const actions = {
      activate: async () => {
        const plans = await getMergedPlans(db);
        const plan = plans[orgSnap.data().planId || "growth"] || plans.growth;
        const endMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
        await orgRef.update({
          subscriptionStatus: "active", currentPeriodEndMs: endMs,
          planName: plan.name, seatsLimit: plan.includedSeats, leadsLimit: plan.leadsLimit,
        });
        return { message: `Activated until ${new Date(endMs).toLocaleDateString("en-IN")}` };
      },
      suspend: async () => {
        await orgRef.update({ subscriptionStatus: "expired" });
        return { message: "Organization suspended" };
      },
      extend_trial: async () => {
        const days = Number(params.days) || 7;
        const endMs = Date.now() + days * 24 * 60 * 60 * 1000;
        await orgRef.update({ trialEndsAtMs: endMs, trialEndsAt: new Date(endMs).toISOString() });
        return { message: `Trial extended by ${days} days` };
      },
      update_limits: async () => {
        const update = {};
        if (params.seatsLimit) update.seatsLimit = Number(params.seatsLimit);
        if (params.leadsLimit) update.leadsLimit = Number(params.leadsLimit);
        await orgRef.update(update);
        return { message: "Limits updated" };
      },
    };

    if (!actions[action]) return res.status(400).json({ error: "Invalid action" });
    const result = await actions[action]();

    // Audit log
    await db.collection("platformAuditLogs").add({
      actor: req.authUser.uid,
      actorPhone: req.authUser.phone_number || null,
      action: `org_${action}`,
      targetType: "organization",
      targetId: orgId,
      params,
      result,
      at: nowIso(),
    });

    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Action failed" });
  }
}

// ── Billing Overview ──

export async function getBillingOverview(req, res) {
  try {
    const metrics = await analytics.getCurrentMetrics();
    const recentPayments = await db.collection("billingEvents")
      .orderBy("appliedAt", "desc")
      .limit(20)
      .get();

    return res.json({
      ok: true,
      mrr: metrics.mrr || 0,
      arr: metrics.arr || 0,
      activeSubscriptions: metrics.activeOrgs || 0,
      recentPayments: recentPayments.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not load billing overview" });
  }
}

// ── Customer Success ──

export async function getCustomerSuccess(req, res) {
  try {
    const churnRisk = await analytics.getChurnRisk();
    return res.json({ ok: true, ...churnRisk });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not load health scores" });
  }
}

// ── Infrastructure ──

export async function getInfrastructureHealth(req, res) {
  try {
    const health = analytics.getSystemHealth();
    return res.json({ ok: true, ...health });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not load system health" });
  }
}

// ── WhatsApp Operations ──

export async function getWhatsAppOverview(req, res) {
  try {
    const connectionsSnap = await db.collection("whatsappConfigs").where("active", "==", true).get();
    const connections = connectionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return res.json({ ok: true, connections, total: connections.length });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not load WhatsApp data" });
  }
}

// ── Audit Logs ──

export async function listAuditLogs(req, res) {
  try {
    const { cursor, limit: limitParam, action, actor } = req.query;
    const pageSize = Math.min(100, Math.max(1, Number(limitParam) || 50));
    let query = db.collection("platformAuditLogs").orderBy("at", "desc").limit(pageSize + 1);

    if (action) query = query.where("action", "==", action);
    if (cursor) {
      const cursorDoc = await db.collection("platformAuditLogs").doc(cursor).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }

    const snap = await query.get();
    const hasMore = snap.docs.length > pageSize;
    const logs = snap.docs.slice(0, pageSize).map((d) => ({ id: d.id, ...d.data() }));

    return res.json({ ok: true, logs, nextCursor: hasMore ? logs[logs.length - 1]?.id : null });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not load audit logs" });
  }
}

// ── Feature Flags ──

export async function listFeatureFlags(req, res) {
  try {
    const snap = await db.collection("platformFeatureFlags").get();
    const flags = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return res.json({ ok: true, flags });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not load feature flags" });
  }
}

export async function toggleFeatureFlag(req, res) {
  try {
    const { flagId } = req.params;
    const { enabled } = req.body;
    await db.collection("platformFeatureFlags").doc(flagId).update({ enabled: Boolean(enabled), updatedAt: nowIso(), updatedBy: req.authUser.uid });
    await db.collection("platformAuditLogs").add({
      actor: req.authUser.uid, action: "toggle_feature_flag", targetType: "feature_flag",
      targetId: flagId, params: { enabled }, at: nowIso(),
    });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not toggle flag" });
  }
}

export async function createFeatureFlag(req, res) {
  try {
    const { name, description, enabled = false, scope = "global" } = req.body;
    if (!name) return res.status(400).json({ error: "Flag name is required" });
    const id = safeDocId(name.toLowerCase().replace(/\s+/g, "_"));
    await db.collection("platformFeatureFlags").doc(id).set({
      name, description: description || "", enabled, scope, createdAt: nowIso(), createdBy: req.authUser.uid,
    });
    return res.status(201).json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not create flag" });
  }
}

// ── Platform Settings ──

export async function getPlatformSettings(req, res) {
  try {
    const snap = await db.collection("platformConfig").doc("global").get();
    return res.json({ ok: true, settings: snap.exists ? snap.data() : {} });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not load settings" });
  }
}

export async function updatePlatformSettings(req, res) {
  try {
    const patch = req.body;
    await db.collection("platformConfig").doc("global").set(
      { ...patch, updatedAt: nowIso(), updatedBy: req.authUser.uid },
      { merge: true }
    );
    await db.collection("platformAuditLogs").add({
      actor: req.authUser.uid, action: "update_platform_settings",
      targetType: "platform_config", params: patch, at: nowIso(),
    });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not update settings" });
  }
}
