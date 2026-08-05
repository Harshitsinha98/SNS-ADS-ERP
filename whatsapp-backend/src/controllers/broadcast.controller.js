/**
 * Broadcast controller — WhatsApp bulk template sending.
 *
 * Endpoints:
 *   POST /api/broadcast/create      → create + start (or schedule) broadcast
 *   POST /api/broadcast/preview     → audience count for filters/leadIds
 *   GET  /api/broadcast/list        → list org broadcasts
 *   GET  /api/broadcast/status      → single broadcast status
 *   GET  /api/broadcast/recipients  → recipient rows (optionally by status)
 *   GET  /api/broadcast/analytics   → aggregate dashboard analytics
 *   POST /api/broadcast/retry       → retry failed recipients
 *   POST /api/broadcast/cancel      → cancel a running/scheduled broadcast
 */

import {
  createBroadcast,
  previewAudience,
  getBroadcasts,
  getBroadcastStatus,
  getBroadcastRecipients,
  getBroadcastAnalytics,
  retryFailedRecipients,
  cancelBroadcast,
} from "../services/broadcast.js";
import { isOrgAdmin } from "../middleware/auth.js";

async function requireAdmin(req, orgId, res) {
  if (!orgId) { res.status(400).json({ error: "orgId is required" }); return false; }
  if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
    res.status(403).json({ error: "Organization admin access required" });
    return false;
  }
  return true;
}

export async function createHandler(req, res) {
  try {
    const { orgId, templateId, parameters, filters, leadIds, name, scheduledAtMs } = req.body || {};
    if (!(await requireAdmin(req, orgId, res))) return;
    if (!templateId) return res.status(400).json({ error: "templateId is required" });

    const result = await createBroadcast({
      orgId,
      uid: req.authUser.uid,
      templateId,
      parameters: parameters || [],
      filters: filters || null,
      leadIds: leadIds || null,
      name: name || "",
      scheduledAtMs: scheduledAtMs || null,
    });
    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "Could not create broadcast" });
  }
}

export async function previewHandler(req, res) {
  try {
    const { orgId, filters, leadIds } = req.body || {};
    if (!(await requireAdmin(req, orgId, res))) return;
    const result = await previewAudience({ orgId, filters: filters || null, leadIds: leadIds || null });
    return res.json(result);
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "Could not preview audience" });
  }
}

export async function listHandler(req, res) {
  try {
    const orgId = req.query.orgId;
    if (!(await requireAdmin(req, orgId, res))) return;
    const broadcasts = await getBroadcasts(orgId);
    return res.json({ broadcasts });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "Could not list broadcasts" });
  }
}

export async function statusHandler(req, res) {
  try {
    const broadcastId = req.query.broadcastId;
    if (!broadcastId) return res.status(400).json({ error: "broadcastId is required" });
    const broadcast = await getBroadcastStatus(broadcastId);
    if (!(await requireAdmin(req, broadcast.orgId, res))) return;
    return res.json(broadcast);
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "Could not get broadcast status" });
  }
}

export async function recipientsHandler(req, res) {
  try {
    const broadcastId = req.query.broadcastId;
    if (!broadcastId) return res.status(400).json({ error: "broadcastId is required" });
    const broadcast = await getBroadcastStatus(broadcastId);
    if (!(await requireAdmin(req, broadcast.orgId, res))) return;
    const result = await getBroadcastRecipients(broadcastId, {
      status: req.query.status || null,
      limit: Number(req.query.limit) || 200,
    });
    return res.json(result);
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "Could not get recipients" });
  }
}

export async function analyticsHandler(req, res) {
  try {
    const orgId = req.query.orgId;
    if (!(await requireAdmin(req, orgId, res))) return;
    const analytics = await getBroadcastAnalytics(orgId);
    return res.json(analytics);
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "Could not load analytics" });
  }
}

export async function retryHandler(req, res) {
  try {
    const { orgId, broadcastId } = req.body || {};
    if (!(await requireAdmin(req, orgId, res))) return;
    if (!broadcastId) return res.status(400).json({ error: "broadcastId is required" });
    const result = await retryFailedRecipients(broadcastId, orgId);
    return res.json(result);
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "Could not retry broadcast" });
  }
}

export async function cancelHandler(req, res) {
  try {
    const { orgId, broadcastId } = req.body || {};
    if (!(await requireAdmin(req, orgId, res))) return;
    if (!broadcastId) return res.status(400).json({ error: "broadcastId is required" });
    const result = await cancelBroadcast(broadcastId, orgId);
    return res.json(result);
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "Could not cancel broadcast" });
  }
}
