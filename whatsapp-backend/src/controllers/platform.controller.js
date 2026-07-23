/**
 * Platform Console Controller.
 *
 * Every endpoint here is gated by requirePlatformAdmin. Controllers remain thin
 * HTTP adapters while the organization directory service performs bounded,
 * server-side enrichment and filtering for the Platform Owner Console.
 */

import { db } from "../bootstrap/firebase.js";
import * as analytics from "../services/platformAnalytics.js";
import { enrichOrganizations, listOrganizationDirectory, newOrganizationDirectoryEvent } from "../services/platformOrganization.js";
import { nowIso, safeDocId } from "../services/helpers.js";
import { getMergedPlans } from "../../plans.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const ORGANIZATION_ACTIONS = new Set([
  "activate", "suspend", "extend_trial", "upgrade_plan", "downgrade_plan",
  "increase_seats", "reset_usage", "send_announcement", "update_location", "impersonate", "delete",
]);
const BULK_ACTIONS = new Set(["suspend", "upgrade_plan", "send_email", "send_whatsapp"]);

const asText = (value, maxLength = 120) => String(value || "").trim().slice(0, maxLength);
const asPositiveInt = (value, fallback, max) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= max ? parsed : fallback;
};

function getOrganizationFilters(query = {}) {
  const requestedStatus = asText(query.status, 32);
  const status = query.trial === "true" ? "trialing"
    : query.expired === "true" ? "expired"
      : ["active", "trialing", "past_due", "expired", "deleted"].includes(requestedStatus) ? requestedStatus : "";
  const revenueMin = query.revenueMin === undefined || query.revenueMin === "" ? null : Number(query.revenueMin);
  const revenueMax = query.revenueMax === undefined || query.revenueMax === "" ? null : Number(query.revenueMax);

  return {
    status,
    plan: asText(query.plan, 64),
    country: asText(query.country, 80),
    state: asText(query.state, 80),
    search: asText(query.search, 80),
    health: ["healthy", "attention", "at_risk"].includes(query.health) ? query.health : "",
    inactive: query.inactive === "true",
    revenueMin: Number.isFinite(revenueMin) && revenueMin >= 0 ? revenueMin : null,
    revenueMax: Number.isFinite(revenueMax) && revenueMax >= 0 ? revenueMax : null,
    cursor: asText(query.cursor, 180),
    limit: Math.min(50, Math.max(10, Number(query.limit) || 25)),
  };
}

async function writePlatformAudit({ actor, action, orgId, params = {}, result = {} }) {
  await db.collection("platformAuditLogs").add({
    actor: actor.uid,
    actorPhone: actor.phone_number || null,
    action: `org_${action}`,
    targetType: "organization",
    targetId: orgId,
    params,
    result,
    at: nowIso(),
  });
}

async function writeOrganizationActivity(orgId, text, actorId, extra = {}) {
  await db.collection("organizations").doc(orgId).collection("activity").add({
    text,
    orgId,
    actorId,
    at: nowIso(),
    ...extra,
  });
}

async function getOrganizationPayload(orgId) {
  const orgRef = db.collection("organizations").doc(orgId);
  const orgSnap = await orgRef.get();
  if (!orgSnap.exists) {
    const error = new Error("Organization not found");
    error.status = 404;
    throw error;
  }

  const [directoryRecord, membersSnap, aggregatesSnap, invoicesSnap] = await Promise.all([
    enrichOrganizations(db, [orgSnap]),
    db.collection("memberships").where("orgId", "==", orgId).get(),
    orgRef.collection("aggregates").doc("counts").get(),
    orgRef.collection("invoices").orderBy("at", "desc").limit(25).get(),
  ]);

  return {
    organization: directoryRecord[0],
    members: membersSnap.docs.map((member) => {
      const value = member.data();
      return {
        id: member.id,
        uid: value.uid,
        role: value.role,
        displayName: value.displayName || "—",
        phone: value.phone || null,
        email: value.email || null,
        active: Boolean(value.active),
        joinedAt: value.joinedAt || null,
        lastActiveAt: value.lastActiveAt || null,
      };
    }),
    aggregates: aggregatesSnap.exists ? aggregatesSnap.data() : null,
    invoices: invoicesSnap.docs.map((invoice) => ({ id: invoice.id, ...invoice.data() })),
  };
}

async function queueAnnouncement(orgId, actor, params = {}) {
  const channel = ["in_app", "email", "whatsapp"].includes(params.channel) ? params.channel : "in_app";
  const message = asText(params.message, 1000);
  const subject = asText(params.subject, 160) || "Announcement from Codeskate CRM";
  if (!message) {
    const error = new Error("An announcement message is required");
    error.status = 400;
    throw error;
  }

  const announcementRef = db.collection("platformAnnouncements").doc();
  const orgAnnouncementRef = db.collection("organizations").doc(orgId).collection("announcements").doc(announcementRef.id);
  const payload = {
    orgId,
    subject,
    message,
    channel,
    status: channel === "in_app" ? "delivered" : "queued",
    createdAt: nowIso(),
    createdBy: actor.uid,
  };

  if (channel === "in_app") {
    const members = await db.collection("memberships")
      .where("orgId", "==", orgId)
      .where("active", "==", true)
      .get();
    const batches = [];
    for (let offset = 0; offset < members.docs.length; offset += 400) {
      const batch = db.batch();
      if (offset === 0) {
        batch.set(announcementRef, payload);
        batch.set(orgAnnouncementRef, payload);
      }
      members.docs.slice(offset, offset + 400).forEach((member) => {
        batch.set(db.collection("organizations").doc(orgId).collection("notifications").doc(), {
          orgId,
          userId: member.data().uid,
          text: subject ? `${subject}: ${message}` : message,
          read: false,
          at: nowIso(),
          source: "platform_announcement",
        });
      });
      batches.push(batch.commit());
    }
    if (!batches.length) {
      await Promise.all([announcementRef.set(payload), orgAnnouncementRef.set(payload)]);
    } else {
      await Promise.all(batches);
    }
    return { message: `In-app announcement delivered to ${members.size} active member(s)` };
  }

  // External providers are intentionally asynchronous. The queue document is
  // auditable and can be consumed by a configured delivery worker without
  // pretending that an email or WhatsApp template has already been delivered.
  await Promise.all([
    announcementRef.set(payload),
    orgAnnouncementRef.set(payload),
    db.collection("platformAnnouncementOutbox").doc(announcementRef.id).set(payload),
  ]);
  return { message: `${channel === "email" ? "Email" : "WhatsApp"} announcement queued for delivery` };
}

async function applyOrganizationAction({ orgId, action, params, actor }) {
  if (!ORGANIZATION_ACTIONS.has(action)) {
    const error = new Error("Invalid organization action");
    error.status = 400;
    throw error;
  }

  const orgRef = db.collection("organizations").doc(orgId);
  const orgSnap = await orgRef.get();
  if (!orgSnap.exists) {
    const error = new Error("Organization not found");
    error.status = 404;
    throw error;
  }
  const org = orgSnap.data();
  const now = Date.now();
  const activityFields = { lastActivityAt: nowIso(), lastActivityAtMs: now, updatedAt: nowIso() };
  let result;
  let auditParams = {};
  let auditWrittenInTransaction = false;

  if (action === "activate") {
    const plans = await getMergedPlans(db);
    const plan = plans[org.planId || "growth"] || plans.growth;
    const currentPeriodEndMs = Math.max(now, Number(org.currentPeriodEndMs || 0)) + (30 * DAY_MS);
    await orgRef.update({
      ...activityFields,
      subscriptionStatus: "active",
      currentPeriodEndMs,
      planName: plan.name,
      seatsLimit: Number(org.seatsLimit || plan.includedSeats),
      leadsLimit: Number(org.leadsLimit || plan.leadsLimit),
    });
    result = { message: `Activated until ${new Date(currentPeriodEndMs).toLocaleDateString("en-IN")}` };
  } else if (action === "suspend") {
    await orgRef.update({ ...activityFields, subscriptionStatus: "expired", suspendedAt: nowIso(), suspendedBy: actor.uid });
    result = { message: "Organization suspended" };
  } else if (action === "extend_trial") {
    const days = asPositiveInt(params.days, 7, 90);
    const trialEndsAtMs = Math.max(now, Number(org.trialEndsAtMs || 0)) + (days * DAY_MS);
    await orgRef.update({
      ...activityFields,
      subscriptionStatus: "trialing",
      trialEndsAtMs,
      trialEndsAt: new Date(trialEndsAtMs).toISOString(),
    });
    auditParams = { days };
    result = { message: `Trial extended by ${days} day(s)` };
  } else if (action === "upgrade_plan" || action === "downgrade_plan") {
    const planId = asText(params.planId, 64);
    const plans = await getMergedPlans(db);
    const plan = plans[planId];
    if (!plan) {
      const error = new Error("Select a valid plan");
      error.status = 400;
      throw error;
    }
    if (action === "downgrade_plan" && (
      Number(org.seatsUsed || 0) > Number(plan.includedSeats || 0)
      || Number(org.leadsUsed || 0) > Number(plan.leadsLimit || 0)
    )) {
      const error = new Error("Current seat or lead usage exceeds the selected plan limits");
      error.status = 409;
      throw error;
    }
    await orgRef.update({
      ...activityFields,
      planId: plan.id,
      planName: plan.name,
      seatsLimit: plan.includedSeats,
      leadsLimit: plan.leadsLimit,
      pendingPlanChange: null,
    });
    auditParams = { planId: plan.id };
    result = { message: `Plan changed to ${plan.name}` };
  } else if (action === "increase_seats") {
    const seats = asPositiveInt(params.seats, 1, 500);
    const seatsLimit = Number(org.seatsLimit || 0) + seats;
    await orgRef.update({ ...activityFields, seatsLimit });
    auditParams = { seats };
    result = { message: `${seats} seat(s) added; new limit is ${seatsLimit}` };
  } else if (action === "reset_usage") {
    await orgRef.update({ ...activityFields, leadsUsed: 0, usageResetAt: nowIso(), usageResetBy: actor.uid });
    result = { message: "Lead usage counter reset" };
  } else if (action === "send_announcement") {
    result = await queueAnnouncement(orgId, actor, params);
    auditParams = { channel: params.channel || "in_app", subject: asText(params.subject, 160), messageLength: asText(params.message, 1000).length };
  } else if (action === "update_location") {
    const country = asText(params.country, 80);
    const state = asText(params.state, 80);
    if (!country) {
      const error = new Error("Country is required");
      error.status = 400;
      throw error;
    }
    await orgRef.update({ ...activityFields, country, state });
    auditParams = { country, state };
    result = { message: "Organization location updated" };
  } else if (action === "impersonate") {
    const durationMinutes = asPositiveInt(params.durationMinutes, 30, 60);
    const expiresAtMs = now + (durationMinutes * 60 * 1000);
    const membershipRef = db.collection("memberships").doc(`${actor.uid}_${orgId}`);
    const sessionRef = db.collection("supportImpersonations").doc();
    await db.runTransaction(async (transaction) => {
      const membership = await transaction.get(membershipRef);
      const existing = membership.data();
      const hasPermanentAccess = membership.exists && existing.active && !existing.isSupportImpersonation;
      if (!hasPermanentAccess) {
        transaction.set(membershipRef, {
          uid: actor.uid,
          orgId,
          role: "admin",
          displayName: "Platform Support",
          phone: actor.phone_number || null,
          active: true,
          isSupportImpersonation: true,
          supportSessionId: sessionRef.id,
          expiresAtMs,
          joinedAt: nowIso(),
          lastActiveAt: nowIso(),
        }, { merge: true });
      }
      transaction.set(sessionRef, {
        orgId,
        actorUid: actor.uid,
        createdAt: nowIso(),
        expiresAtMs,
        status: "active",
      });
    });
    auditParams = { durationMinutes };
    result = { message: `Support access granted for ${durationMinutes} minute(s)`, expiresAtMs, redirectPath: "/admin" };
  } else if (action === "delete") {
    await orgRef.update({
      ...activityFields,
      subscriptionStatus: "deleted",
      deletedAt: nowIso(),
      deletedBy: actor.uid,
      deletionType: "soft",
    });
    result = { message: "Organization archived. Tenant data was retained for audit and recovery." };
  }

  await Promise.all([
    writePlatformAudit({ actor, action, orgId, params: auditParams, result }),
    writeOrganizationActivity(orgId, `Platform action: ${action.replaceAll("_", " ")}`, actor.uid, { platformAction: action }),
  ]);
  return result;
}

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

export async function getMissionControl(req, res) {
  try {
    const missionControl = await analytics.getMissionControlMetrics();
    return res.json({ ok: true, missionControl });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not load Mission Control" });
  }
}

// ── Organization Management ──

export async function listOrganizations(req, res) {
  try {
    const filters = getOrganizationFilters(req.query);
    const result = await listOrganizationDirectory(db, filters);
    return res.json({ ok: true, ...result, filters: { ...filters, cursor: undefined } });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Could not list organizations" });
  }
}

export async function getOrganizationDetail(req, res) {
  try {
    return res.json({ ok: true, ...(await getOrganizationPayload(req.params.orgId)) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Could not load organization" });
  }
}

export async function exportOrganization(req, res) {
  try {
    const payload = await getOrganizationPayload(req.params.orgId);
    await writePlatformAudit({ actor: req.authUser, action: "export", orgId: req.params.orgId, result: { format: "json" } });
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="organization-${safeDocId(req.params.orgId)}.json"`);
    return res.json({ exportedAt: nowIso(), ...payload });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Could not export organization" });
  }
}

export async function performOrgAction(req, res) {
  try {
    const action = asText(req.body?.action, 64);
    const result = await applyOrganizationAction({
      orgId: req.params.orgId,
      action,
      params: req.body || {},
      actor: req.authUser,
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Action failed" });
  }
}

export async function bulkOrganizationAction(req, res) {
  try {
    const action = asText(req.body?.action, 64);
    if (!BULK_ACTIONS.has(action)) return res.status(400).json({ error: "Invalid bulk action" });
    const orgIds = [...new Set(Array.isArray(req.body?.orgIds) ? req.body.orgIds.map((id) => asText(id, 180)).filter(Boolean) : [])];
    if (!orgIds.length || orgIds.length > 50) return res.status(400).json({ error: "Select between 1 and 50 organizations" });

    const mappedAction = action === "send_email" || action === "send_whatsapp" ? "send_announcement" : action;
    const mappedParams = {
      ...(req.body || {}),
      channel: action === "send_email" ? "email" : action === "send_whatsapp" ? "whatsapp" : req.body?.channel,
    };
    const results = [];
    for (let index = 0; index < orgIds.length; index += 5) {
      const chunk = orgIds.slice(index, index + 5);
      const chunkResults = await Promise.all(chunk.map(async (orgId) => {
        try {
          const result = await applyOrganizationAction({ orgId, action: mappedAction, params: mappedParams, actor: req.authUser });
          return { orgId, ok: true, message: result.message };
        } catch (error) {
          return { orgId, ok: false, error: error.message || "Action failed" };
        }
      }));
      results.push(...chunkResults);
    }
    return res.json({ ok: true, results, succeeded: results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok).length });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Bulk action failed" });
  }
}

// ── Billing Overview ──

export async function getBillingOverview(req, res) {
  try {
    const metrics = await analytics.getCurrentMetrics();
    const recentPayments = await db.collection("billingEvents").orderBy("appliedAt", "desc").limit(20).get();
    return res.json({ ok: true, mrr: metrics.mrr || 0, arr: metrics.arr || 0, activeSubscriptions: metrics.activeOrgs || 0, recentPayments: recentPayments.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not load billing overview" });
  }
}

// ── Customer Success ──
export async function getCustomerSuccess(req, res) {
  try { return res.json({ ok: true, ...(await analytics.getChurnRisk()) }); }
  catch (error) { return res.status(500).json({ error: error.message || "Could not load health scores" }); }
}

// ── Infrastructure ──
export async function getInfrastructureHealth(req, res) {
  try { return res.json({ ok: true, ...analytics.getSystemHealth() }); }
  catch (error) { return res.status(500).json({ error: error.message || "Could not load system health" }); }
}

// ── WhatsApp Operations ──
export async function getWhatsAppOverview(req, res) {
  try {
    const connectionsSnap = await db.collection("whatsappConfigs").where("active", "==", true).get();
    const connections = connectionsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.json({ ok: true, connections, total: connections.length });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not load WhatsApp data" });
  }
}

// ── Audit Logs ──
export async function listAuditLogs(req, res) {
  try {
    const { cursor, limit: limitParam, action } = req.query;
    const pageSize = Math.min(100, Math.max(1, Number(limitParam) || 50));
    let query = db.collection("platformAuditLogs").orderBy("at", "desc").limit(pageSize + 1);
    if (action) query = query.where("action", "==", action);
    if (cursor) {
      const cursorDoc = await db.collection("platformAuditLogs").doc(cursor).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }
    const snap = await query.get();
    const docs = snap.docs.slice(0, pageSize);
    const logs = docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.json({ ok: true, logs, nextCursor: snap.docs.length > pageSize ? logs.at(-1)?.id : null });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not load audit logs" });
  }
}

// ── Feature Flags ──
export async function listFeatureFlags(req, res) {
  try { const snap = await db.collection("platformFeatureFlags").get(); return res.json({ ok: true, flags: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) }); }
  catch (error) { return res.status(500).json({ error: error.message || "Could not load feature flags" }); }
}

export async function toggleFeatureFlag(req, res) {
  try {
    const { flagId } = req.params;
    const { enabled } = req.body;
    await db.collection("platformFeatureFlags").doc(flagId).update({ enabled: Boolean(enabled), updatedAt: nowIso(), updatedBy: req.authUser.uid });
    await db.collection("platformAuditLogs").add({ actor: req.authUser.uid, action: "toggle_feature_flag", targetType: "feature_flag", targetId: flagId, params: { enabled }, at: nowIso() });
    return res.json({ ok: true });
  } catch (error) { return res.status(500).json({ error: error.message || "Could not toggle flag" }); }
}

export async function createFeatureFlag(req, res) {
  try {
    const { name, description, enabled = false, scope = "global" } = req.body;
    if (!name) return res.status(400).json({ error: "Flag name is required" });
    const id = safeDocId(name.toLowerCase().replace(/\s+/g, "_"));
    await db.collection("platformFeatureFlags").doc(id).set({ name, description: description || "", enabled, scope, createdAt: nowIso(), createdBy: req.authUser.uid });
    return res.status(201).json({ ok: true, id });
  } catch (error) { return res.status(500).json({ error: error.message || "Could not create flag" }); }
}

// ── Platform Settings ──
export async function getPlatformSettings(req, res) {
  try { const snap = await db.collection("platformConfig").doc("global").get(); return res.json({ ok: true, settings: snap.exists ? snap.data() : {} }); }
  catch (error) { return res.status(500).json({ error: error.message || "Could not load settings" }); }
}

export async function updatePlatformSettings(req, res) {
  try {
    const patch = req.body;
    await db.collection("platformConfig").doc("global").set({ ...patch, updatedAt: nowIso(), updatedBy: req.authUser.uid }, { merge: true });
    await db.collection("platformAuditLogs").add({ actor: req.authUser.uid, action: "update_platform_settings", targetType: "platform_config", params: patch, at: nowIso() });
    return res.json({ ok: true });
  } catch (error) { return res.status(500).json({ error: error.message || "Could not update settings" }); }
}
