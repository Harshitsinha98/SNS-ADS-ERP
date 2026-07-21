/**
 * Workflow Automation Engine controller.
 *
 * ARCHITECTURAL DECISION: Controllers are thin HTTP adapters — they extract
 * request params (already Zod-validated by the `validate()` middleware into
 * `req.validated`), call workflowRepository/workflowEngine service functions,
 * and shape the HTTP response. All rule-matching and versioning logic lives
 * in src/services/workflow/*.js, never here, so the same operations remain
 * callable from a future admin CLI/script without any HTTP dependency.
 *
 * Every route in this file requires org-admin access — building/publishing
 * automation is an administrative capability, matching the existing
 * `requireOrgAdmin` gate already used by billing/team routes.
 */

import { db } from "../bootstrap/firebase.js";
import { isOrgAdmin } from "../middleware/auth.js";
import * as workflowRepo from "../services/workflow/workflowRepository.js";
import { emitWorkflowTrigger, testEvaluateDefinition } from "../services/workflow/workflowEngine.js";
import { orgCollection } from "../services/helpers.js";
import * as ticketService from "../services/ticketService.js";

function handleError(res, error, fallbackMessage) {
  return res.status(error.status || 500).json({ error: error.message || fallbackMessage });
}

// ─── Workflow CRUD ───────────────────────────────────────────────────

export async function createWorkflow(req, res) {
  try {
    const { orgId, name, description, triggerType, priority, stopOnMatch } = req.validated;
    const head = await workflowRepo.createWorkflow(db, orgId, {
      name, description, triggerType, priority, stopOnMatch, actorId: req.authUser.uid,
    });
    return res.status(201).json({ ok: true, workflow: head });
  } catch (error) {
    return handleError(res, error, "Could not create workflow");
  }
}

export async function listWorkflows(req, res) {
  try {
    const orgId = String(req.query?.orgId || "").trim();
    if (!orgId || !(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    const workflows = await workflowRepo.listWorkflows(db, orgId, {
      triggerType: req.query?.triggerType || null,
      status: req.query?.status || null,
    });
    return res.json({ ok: true, workflows });
  } catch (error) {
    return handleError(res, error, "Could not list workflows");
  }
}

export async function getWorkflow(req, res) {
  try {
    const orgId = String(req.query?.orgId || "").trim();
    if (!orgId || !(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    const head = await workflowRepo.getWorkflowHead(db, orgId, req.params.workflowId);
    if (!head) return res.status(404).json({ error: "Workflow not found" });
    const versions = await workflowRepo.listVersions(db, orgId, req.params.workflowId);
    return res.json({ ok: true, workflow: head, versions });
  } catch (error) {
    return handleError(res, error, "Could not load workflow");
  }
}

export async function updateWorkflowMeta(req, res) {
  try {
    const { orgId, ...patch } = req.validated;
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    const head = await workflowRepo.updateWorkflowMeta(db, orgId, req.params.workflowId, patch, req.authUser.uid);
    return res.json({ ok: true, workflow: head });
  } catch (error) {
    return handleError(res, error, "Could not update workflow");
  }
}

export async function setWorkflowStatus(req, res) {
  try {
    const { orgId, status } = req.validated;
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    const head = await workflowRepo.setWorkflowStatus(db, orgId, req.params.workflowId, status, req.authUser.uid);
    return res.json({ ok: true, workflow: head });
  } catch (error) {
    return handleError(res, error, "Could not change workflow status");
  }
}

// ─── Versioning ──────────────────────────────────────────────────────

export async function saveDraft(req, res) {
  try {
    const { orgId, definition, changeNote } = req.validated;
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    const draft = await workflowRepo.saveDraft(db, orgId, req.params.workflowId, {
      definition, changeNote, actorId: req.authUser.uid,
    });
    return res.json({ ok: true, draft });
  } catch (error) {
    return handleError(res, error, "Could not save draft");
  }
}

export async function publishWorkflow(req, res) {
  try {
    const { orgId } = req.validated;
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    const result = await workflowRepo.publishWorkflow(db, orgId, req.params.workflowId, req.authUser.uid);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return handleError(res, error, "Could not publish workflow");
  }
}

export async function rollbackWorkflow(req, res) {
  try {
    const { orgId, toVersion } = req.validated;
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    const result = await workflowRepo.rollbackWorkflow(db, orgId, req.params.workflowId, toVersion, req.authUser.uid);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return handleError(res, error, "Could not roll back workflow");
  }
}

// ─── Test run (no side effects) ─────────────────────────────────────

export async function testRunWorkflow(req, res) {
  try {
    const { orgId, sampleEntity, previousEntity } = req.validated;
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    // Prefer the live draft so admins can test edits before publishing;
    // fall back to the published definition if there is no draft yet.
    const head = await workflowRepo.getWorkflowHead(db, orgId, req.params.workflowId);
    if (!head) return res.status(404).json({ error: "Workflow not found" });
    const version = head.draftVersion || head.currentVersion;
    if (!version) return res.status(409).json({ error: "This workflow has no rules to test yet" });
    const versionDoc = await workflowRepo.getVersion(db, orgId, req.params.workflowId, version);
    const result = testEvaluateDefinition(versionDoc.definition, sampleEntity, previousEntity || null);
    return res.json({ ok: true, version, ...result });
  } catch (error) {
    return handleError(res, error, "Could not test workflow");
  }
}

// ─── Run history ─────────────────────────────────────────────────────

export async function listWorkflowRuns(req, res) {
  try {
    const orgId = String(req.query?.orgId || "").trim();
    if (!orgId || !(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    const pageLimit = Math.min(100, Math.max(1, Number(req.query?.limit) || 25));
    let query = orgCollection(db, orgId, "workflowRuns")
      .where("workflowId", "==", req.params.workflowId)
      .orderBy("startedAt", "desc")
      .limit(pageLimit);
    if (req.query?.cursor) {
      const cursorDoc = await orgCollection(db, orgId, "workflowRuns").doc(req.query.cursor).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }
    const snap = await query.get();
    const runs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const nextCursor = snap.docs.length === pageLimit ? snap.docs[snap.docs.length - 1].id : null;
    return res.json({ ok: true, runs, nextCursor });
  } catch (error) {
    return handleError(res, error, "Could not load workflow run history");
  }
}

// ─── Manual trigger (used by "Run now" / testing against real data) ────

export async function manualTrigger(req, res) {
  try {
    const orgId = String(req.body?.orgId || "").trim();
    const { triggerType, entityType, entity, dedupeToken } = req.body || {};
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    if (!triggerType || !entityType || !entity || !dedupeToken) {
      return res.status(400).json({ error: "triggerType, entityType, entity, and dedupeToken are required" });
    }
    const result = await emitWorkflowTrigger(db, { orgId, triggerType, entityType, entity, dedupeToken });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return handleError(res, error, "Could not run workflows for this event");
  }
}

// ─── Tickets (minimal, required for the ticket_closed trigger) ──────

export async function createTicket(req, res) {
  try {
    const orgId = String(req.body?.orgId || "").trim();
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    const ticket = await ticketService.createTicket(db, orgId, { ...req.body, actorId: req.authUser.uid });
    return res.status(201).json({ ok: true, ticket });
  } catch (error) {
    return handleError(res, error, "Could not create ticket");
  }
}

export async function listTickets(req, res) {
  try {
    const orgId = String(req.query?.orgId || "").trim();
    if (!orgId || !(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    const tickets = await ticketService.listTickets(db, orgId, {
      status: req.query?.status || null,
      assignedTo: req.query?.assignedTo || null,
    });
    return res.json({ ok: true, tickets });
  } catch (error) {
    return handleError(res, error, "Could not list tickets");
  }
}

export async function closeTicket(req, res) {
  try {
    const orgId = String(req.body?.orgId || "").trim();
    if (!(await isOrgAdmin(req.authUser.uid, orgId))) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    const ticket = await ticketService.closeTicket(db, orgId, req.params.ticketId, req.authUser.uid);
    return res.json({ ok: true, ticket });
  } catch (error) {
    return handleError(res, error, "Could not close ticket");
  }
}
