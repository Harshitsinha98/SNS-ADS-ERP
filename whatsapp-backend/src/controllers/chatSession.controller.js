/**
 * Chat Session Controller.
 *
 * API endpoints for managing human takeover sessions.
 * Used by both admin (full access) and employees (session-scoped access).
 */

import { isOrgAdmin, getActiveMembership } from "../middleware/auth.js";
import {
  createChatSession,
  endSession,
  reEnableAI,
  getActiveSession,
  listSessions,
  getSessionMessages,
} from "../services/chatSessionService.js";
import { logger } from "../middleware/logger.js";

/**
 * POST /api/v1/chat-sessions/takeover
 * Admin or assigned employee takes over a lead from AI.
 */
export async function takeOver(req, res) {
  try {
    const { orgId, leadId, reason } = req.body;
    if (!orgId || !leadId) return res.status(400).json({ error: "orgId and leadId are required" });

    const membership = await getActiveMembership(req.authUser.uid, orgId);
    if (!membership) return res.status(403).json({ error: "Not a member of this organization" });

    const session = await createChatSession(orgId, leadId, {
      employeeId: req.authUser.uid,
      employeeName: membership.displayName || "Agent",
      reason: reason || "manual_takeover",
    });

    return res.status(201).json(session);
  } catch (error) {
    logger.error({ error: error.message }, "takeOver failed");
    return res.status(400).json({ error: error.message });
  }
}

/**
 * POST /api/v1/chat-sessions/resolve
 * End the active session (mark as resolved).
 */
export async function resolveSession(req, res) {
  try {
    const { orgId, leadId, sessionId, summary } = req.body;
    if (!orgId || !leadId || !sessionId) {
      return res.status(400).json({ error: "orgId, leadId, and sessionId are required" });
    }

    const membership = await getActiveMembership(req.authUser.uid, orgId);
    if (!membership) return res.status(403).json({ error: "Not a member of this organization" });

    const result = await endSession(orgId, leadId, sessionId, "resolved", summary);
    return res.json(result);
  } catch (error) {
    logger.error({ error: error.message }, "resolveSession failed");
    return res.status(400).json({ error: error.message });
  }
}

/**
 * POST /api/v1/chat-sessions/reassign
 * End current session and create a new one for a different employee.
 */
export async function reassignSession(req, res) {
  try {
    const { orgId, leadId, newEmployeeId, newEmployeeName } = req.body;
    if (!orgId || !leadId || !newEmployeeId) {
      return res.status(400).json({ error: "orgId, leadId, and newEmployeeId are required" });
    }

    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Only admins can reassign sessions" });
    }

    const session = await createChatSession(orgId, leadId, {
      employeeId: newEmployeeId,
      employeeName: newEmployeeName || "Agent",
      reason: "reassigned",
    });

    return res.status(201).json(session);
  } catch (error) {
    logger.error({ error: error.message }, "reassignSession failed");
    return res.status(400).json({ error: error.message });
  }
}

/**
 * POST /api/v1/chat-sessions/re-enable-ai
 * End session and re-enable AI for the lead.
 */
export async function reEnableAIForLead(req, res) {
  try {
    const { orgId, leadId } = req.body;
    if (!orgId || !leadId) return res.status(400).json({ error: "orgId and leadId are required" });

    const membership = await getActiveMembership(req.authUser.uid, orgId);
    if (!membership) return res.status(403).json({ error: "Not a member of this organization" });

    const result = await reEnableAI(orgId, leadId);
    return res.json(result);
  } catch (error) {
    logger.error({ error: error.message }, "reEnableAI failed");
    return res.status(400).json({ error: error.message });
  }
}

/**
 * GET /api/v1/chat-sessions/active?orgId=...&leadId=...
 * Get the currently active session for a lead.
 */
export async function getActive(req, res) {
  try {
    const { orgId, leadId } = req.query;
    if (!orgId || !leadId) return res.status(400).json({ error: "orgId and leadId are required" });

    const membership = await getActiveMembership(req.authUser.uid, orgId);
    if (!membership) return res.status(403).json({ error: "Not a member of this organization" });

    const session = await getActiveSession(orgId, leadId);
    return res.json({ session });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/v1/chat-sessions/messages?orgId=...&leadId=...&sessionId=...
 * Get messages bounded to a specific session (for employees).
 */
export async function getMessages(req, res) {
  try {
    const { orgId, leadId, sessionId } = req.query;
    if (!orgId || !leadId || !sessionId) {
      return res.status(400).json({ error: "orgId, leadId, and sessionId are required" });
    }

    const membership = await getActiveMembership(req.authUser.uid, orgId);
    if (!membership) return res.status(403).json({ error: "Not a member of this organization" });

    const messages = await getSessionMessages(orgId, leadId, sessionId);
    return res.json({ messages });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/v1/chat-sessions/history?orgId=...&leadId=...
 * List all sessions for a lead (admin only).
 */
export async function getHistory(req, res) {
  try {
    const { orgId, leadId } = req.query;
    if (!orgId || !leadId) return res.status(400).json({ error: "orgId and leadId are required" });

    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Only admins can view session history" });
    }

    const sessions = await listSessions(orgId, leadId);
    return res.json({ sessions });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
