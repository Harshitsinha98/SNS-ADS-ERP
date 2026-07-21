/**
 * Workflow Execution Engine.
 *
 * ARCHITECTURAL DECISION: This is the ONE function every business-logic call
 * site invokes to run automation: `emitWorkflowTrigger(db, {...})`. It is
 * intentionally the narrowest possible integration surface — call sites
 * never know which workflows exist, what conditions they check, or what
 * actions they run. That knowledge lives entirely in Firestore
 * (`workflows`/`versions`) and in the two registries (`conditionEvaluators`,
 * `actionExecutors`). This is what makes the system database-driven and
 * extensible: shipping a brand-new automation requires zero deploys.
 *
 * Execution flow per trigger emission:
 *   1. Look up active workflows for this org+triggerType, in priority order
 *      (workflowRepository.listActiveWorkflowsForTrigger — one indexed query).
 *   2. For each workflow: evaluate its condition set against the entity.
 *   3. On match: claim an idempotency lock (workflowTriggerState) keyed by
 *      (workflowId, dedupeToken) so retried upstream events (duplicate
 *      WhatsApp webhooks, duplicate cron passes) can never double-execute
 *      the same workflow for the same event.
 *   4. Execute actions in array order; a failed action does not stop later
 *      actions (each is independently caught in actionExecutors.js) but the
 *      run's overall status reflects any failure ("partial").
 *   5. Write one workflowRuns doc (audit) + bump the head's run counters.
 *   6. If `stopOnMatch` is set on a matched workflow, stop evaluating any
 *      lower-priority workflow for this same emission.
 *
 * Every step above is wrapped so a bug in one workflow's logic can never
 * propagate an exception back into the caller's primary transaction (lead
 * creation, ticket closing, etc.) — see the top-level try/catch in
 * `emitWorkflowTrigger`.
 */

import { nowIso, safeDocId, orgCollection } from "../helpers.js";
import { evaluateConditionSet } from "./conditionEvaluators.js";
import { executeAction } from "./actionExecutors.js";
import { listActiveWorkflowsForTrigger, recordRunOutcome } from "./workflowRepository.js";
import { logger } from "../../middleware/logger.js";

/**
 * Attempt to atomically claim a (workflowId, dedupeToken) pair. Returns
 * true if this call is the first/only claimant (should execute); false if
 * another emission already claimed it (skip — already handled).
 *
 * Mirrors the exact claim-transaction shape already used by
 * `services/whatsapp.js: claimInboundMessage()` for the same reason:
 * exactly-once side effects under at-least-once delivery.
 */
async function claimTrigger(db, orgId, workflowId, dedupeToken) {
  const key = safeDocId(`${workflowId}_${dedupeToken}`);
  const ref = orgCollection(db, orgId, "workflowTriggerState").doc(key);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    tx.create(ref, { workflowId, dedupeToken, claimedAt: nowIso() });
    return true;
  }).catch(() => false); // A claim race that throws is treated as "already claimed"
}

async function runWorkflow(db, orgId, workflow, ctx, helpers) {
  const startedAt = Date.now();
  const startedAtIso = nowIso();
  const { matched, results } = evaluateConditionSet(workflow.definition, ctx.entity, ctx);
  if (!matched) return { matched: false };

  const claimed = await claimTrigger(db, orgId, workflow.id, ctx.dedupeToken);
  if (!claimed) return { matched: true, skipped: "duplicate_event" };

  const actionsExecuted = [];
  let anyFailed = false;
  for (const action of workflow.definition.actions) {
    const outcome = await executeAction(db, orgId, action, { ...ctx, dedupeKey: `${workflow.id}_${ctx.dedupeToken}` }, helpers);
    actionsExecuted.push({ type: action.type, params: action.params, status: outcome.ok ? "ok" : "failed", error: outcome.error || null, detail: outcome.detail || null });
    if (!outcome.ok) anyFailed = true;
  }

  const finishedAtIso = nowIso();
  const runStatus = anyFailed ? "partial" : "completed";
  await orgCollection(db, orgId, "workflowRuns").add({
    workflowId: workflow.id,
    workflowName: workflow.name,
    workflowVersion: workflow.version,
    orgId,
    triggerType: ctx.triggerType,
    entityType: ctx.entityType,
    entityId: ctx.entity?.id || ctx.entity?.leadId || null,
    conditionResults: results.map((r) => ({ condition: r.condition, passed: r.passed })),
    actionsExecuted,
    status: runStatus,
    startedAt: startedAtIso,
    finishedAt: finishedAtIso,
    durationMs: Date.now() - startedAt,
  });
  await recordRunOutcome(db, orgId, workflow.id, { status: runStatus, at: finishedAtIso });

  return { matched: true, status: runStatus, stopOnMatch: workflow.stopOnMatch };
}

/**
 * Entry point called from business logic whenever a trigger-worthy event
 * occurs. Never throws.
 *
 * @param {Firestore} db
 * @param {object} args
 * @param {string} args.orgId
 * @param {string} args.triggerType - one of TRIGGER_TYPES
 * @param {string} args.entityType - "lead" | "ticket" | "followUpTask" | "whatsappMessage"
 * @param {object} args.entity - the current state of the triggering document
 * @param {object} [args.previousEntity] - prior state, powers changed_to/changed_from conditions
 * @param {string} args.dedupeToken - a value unique to this specific event occurrence
 * @param {object} [args.helpers] - optional injected helpers (e.g. metaGraphRequest for WhatsApp actions)
 * @returns {Promise<{ evaluated: number, matched: number }>}
 */
export async function emitWorkflowTrigger(db, {
  orgId, triggerType, entityType, entity, previousEntity = null, dedupeToken, helpers = {},
}) {
  try {
    if (!orgId || !triggerType || !entity || !dedupeToken) {
      logger.warn({ orgId, triggerType }, "emitWorkflowTrigger called with incomplete arguments");
      return { evaluated: 0, matched: 0 };
    }

    const workflows = await listActiveWorkflowsForTrigger(db, orgId, triggerType);
    if (workflows.length === 0) return { evaluated: 0, matched: 0 };

    const ctx = { orgId, triggerType, entityType, entity, previousEntity, dedupeToken };
    let matchedCount = 0;

    for (const workflow of workflows) {
      const outcome = await runWorkflow(db, orgId, workflow, ctx, helpers);
      if (outcome.matched) {
        matchedCount += 1;
        if (outcome.stopOnMatch) break;
      }
    }

    return { evaluated: workflows.length, matched: matchedCount };
  } catch (error) {
    // Workflow evaluation must NEVER fail the caller's primary transaction
    // (lead creation, status change, ticket close, WhatsApp ingestion).
    logger.error({ err: error, orgId, triggerType }, "Workflow trigger emission failed");
    return { evaluated: 0, matched: 0, error: error.message };
  }
}

/**
 * Evaluate a workflow's draft/published definition against a sample entity
 * WITHOUT executing any actions or writing any run log — powers the UI
 * Builder's "Test this workflow" preview button.
 */
export function testEvaluateDefinition(definition, entity, previousEntity = null) {
  return evaluateConditionSet(definition, entity, { previousEntity });
}
