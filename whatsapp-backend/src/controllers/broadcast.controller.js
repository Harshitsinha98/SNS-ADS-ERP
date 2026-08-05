/**
 * Broadcast controller — WhatsApp bulk template sending.
 *
 * Endpoints:
 *   POST /api/broadcast/create    → create + start broadcast
 *   GET  /api/broadcast/list      → list org broadcasts
 *   GET  /api/broadcast/status    → single broadcast status
 *   POST /api/broadcast/cancel    → cancel a running broadcast
 */

import { createBroadcast, getBroadcasts, getBroadcastStatus, cancelBroadcast } from "../services/broadcast.js";
import { isOrgAdmin } from "../middleware/auth.js";

export async function createHandler(req, res) {
  try {
    const { orgId, templateId, parameters, filters, leadIds, name } = req.body || {};
    if (!orgId || !templateId) {
      return res.status(400).json({ error: "orgId and templateId are required" });
    }
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }

    const result = await createBroadcast({
      orgId,
      uid: req.authUser.uid,
      templateId,
      parameters: parameters || [],
      filters: filters || null,
      leadIds: leadIds || null,
      name: name || "",
    });

    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "Could not create broadcast" });
  }
}

export async function listHandler(req, res) {
  try {
    const orgId = req.query.orgId;
    if (!orgId) return res.status(400).json({ error: "orgId is required" });
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }

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
    // Verify access
    if (!(await isOrgAdmin(req.authUser.uid, broadcast.orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }

    return res.json(broadcast);
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "Could not get broadcast status" });
  }
}

export async function cancelHandler(req, res) {
  try {
    const { orgId, broadcastId } = req.body || {};
    if (!orgId || !broadcastId) return res.status(400).json({ error: "orgId and broadcastId are required" });
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }

    const result = await cancelBroadcast(broadcastId, orgId);
    return res.json(result);
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "Could not cancel broadcast" });
  }
}
