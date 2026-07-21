/**
 * Workflow Automation Engine routes (v1).
 *
 * ARCHITECTURAL DECISION: Routes are declarative wiring only — URL pattern +
 * middleware chain + controller handler, matching whatsapp.routes.js /
 * subscription.routes.js exactly. `validate()` (Zod) runs before every
 * controller that accepts a body, so controllers always receive
 * pre-validated `req.validated`.
 */

import { Router } from "express";
import { requireAuth, validate } from "../../middleware/index.js";
import {
  createWorkflowSchema,
  updateWorkflowMetaSchema,
  workflowStatusSchema,
  saveDraftSchema,
  publishWorkflowSchema,
  rollbackWorkflowSchema,
  testRunWorkflowSchema,
} from "../../validators/workflow.schema.js";
import {
  createWorkflow,
  listWorkflows,
  getWorkflow,
  updateWorkflowMeta,
  setWorkflowStatus,
  saveDraft,
  publishWorkflow,
  rollbackWorkflow,
  testRunWorkflow,
  listWorkflowRuns,
  manualTrigger,
  createTicket,
  listTickets,
  closeTicket,
} from "../../controllers/workflow.controller.js";

export function createWorkflowRoutes() {
  const router = Router();

  // ── Workflow CRUD ──
  router.post("/", requireAuth, validate(createWorkflowSchema), createWorkflow);
  router.get("/", requireAuth, listWorkflows);
  router.get("/:workflowId", requireAuth, getWorkflow);
  router.patch("/:workflowId", requireAuth, validate(updateWorkflowMetaSchema), updateWorkflowMeta);
  router.post("/:workflowId/status", requireAuth, validate(workflowStatusSchema), setWorkflowStatus);

  // ── Versioning ──
  router.post("/:workflowId/draft", requireAuth, validate(saveDraftSchema), saveDraft);
  router.post("/:workflowId/publish", requireAuth, validate(publishWorkflowSchema), publishWorkflow);
  router.post("/:workflowId/rollback", requireAuth, validate(rollbackWorkflowSchema), rollbackWorkflow);

  // ── Test run (no side effects) & run history ──
  router.post("/:workflowId/test-run", requireAuth, validate(testRunWorkflowSchema), testRunWorkflow);
  router.get("/:workflowId/runs", requireAuth, listWorkflowRuns);

  // ── Manual trigger (admin-initiated, e.g. "Run now" against a real record) ──
  router.post("/manual-trigger", requireAuth, manualTrigger);

  return router;
}

/**
 * Tickets are new to this codebase and exist primarily to power the
 * `ticket_closed` trigger — kept as a small, separate router (mounted under
 * /api/v1/tickets) rather than nested under /workflows, since tickets are a
 * first-class entity, not a workflow sub-resource.
 */
export function createTicketRoutes() {
  const router = Router();

  router.post("/", requireAuth, createTicket);
  router.get("/", requireAuth, listTickets);
  router.post("/:ticketId/close", requireAuth, closeTicket);

  return router;
}
