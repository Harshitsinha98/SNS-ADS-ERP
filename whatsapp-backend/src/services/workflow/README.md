# Workflow Automation Engine

A database-driven, multi-tenant, versionable automation engine for the
Codeskate CRM. This document is the entry point for engineers; the full
Firestore schema is in [`SCHEMA.md`](./SCHEMA.md).

## Why this design

The requirement was explicit: **no hardcoded workflows**. Every existing
automation in this codebase (`followUpAutomation.js`, round-robin lead
assignment) is a fixed if/else pipeline — to change its behavior you edit
code and redeploy. This engine inverts that: behavior lives in Firestore
documents, and application code contains only two kinds of things:

1. **Registries** — a fixed, small set of "what a condition/action *can*
   do" functions (`conditionEvaluators.js`, `actionExecutors.js`). Adding a
   new condition/action type is a registry entry, not a rewrite of the
   engine.
2. **One integration call** — `emitWorkflowTrigger(db, {...})`, invoked from
   five existing business-logic call sites. Business code has zero
   knowledge of which workflows exist or what they do.

## Architecture at a glance

```
                 ┌─────────────────────────────────────────┐
Business logic → │  emitWorkflowTrigger(db, { orgId,        │
(leadIntake.js,  │    triggerType, entityType, entity,      │
followUpTasks.js,│    previousEntity, dedupeToken })         │
followUpAutomation│                                          │
.js, whatsapp.js,│  1. listActiveWorkflowsForTrigger()       │  workflowRepository.js
ticketService.js)│     → one indexed query, priority order   │
                 │  2. evaluateConditionSet() per workflow   │  conditionEvaluators.js
                 │  3. claimTrigger() — exactly-once guard   │  workflowEngine.js
                 │  4. executeAction() per action, in order  │  actionExecutors.js
                 │  5. write one workflowRuns audit doc      │
                 └─────────────────────────────────────────┘
                              ▲
                              │ CRUD / versioning / publish / test-run
                 ┌─────────────────────────────────────────┐
UI Builder     → │  /api/v1/workflows/*  (workflow.controller.js)
(Workflows.jsx,  │  /api/v1/tickets/*                        │
WorkflowBuilder  └─────────────────────────────────────────┘
.jsx)
```

## Files

| Path | Responsibility |
|---|---|
| `SCHEMA.md` | Full Firestore schema + trigger call-site map |
| `workflowRepository.js` | Head/version CRUD, draft → publish → rollback lifecycle |
| `conditionEvaluators.js` | `type × operator` matrix — the condition vocabulary |
| `actionExecutors.js` | One executor per action type, reusing existing services |
| `emailService.js` | Graceful-degradation email (logs until a provider is wired) |
| `workflowEngine.js` | `emitWorkflowTrigger()` — the sole integration surface |
| `../ticketService.js` | Minimal ticket model backing `ticket_closed` |
| `../../controllers/workflow.controller.js` | HTTP adapters (thin) |
| `../../routes/v1/workflow.routes.js` | `/api/v1/workflows`, `/api/v1/tickets` |
| `../../validators/workflow.schema.js` | Zod schemas — the single source of truth for shape |
| `lead-erp/src/data/workflowVocabulary.js` | Frontend mirror of the vocabulary, drives the UI Builder |
| `lead-erp/src/pages/admin/Workflows.jsx` | List/create/pause/archive |
| `lead-erp/src/pages/admin/WorkflowBuilder.jsx` | Condition/action editor, publish, test-run, version history |

## Requirement → implementation map

| Requirement | How it's satisfied |
|---|---|
| **Triggers**: Lead Created/Updated, Reminder Missed, Ticket Closed, WhatsApp Message Received | `TRIGGER_TYPES` enum; each has exactly one emission call site (see SCHEMA.md table) |
| **Conditions**: Source, Status, Employee, City, Product, Organization, Tags | `CONDITION_FIELD_RESOLVERS` map in `conditionEvaluators.js` |
| **Actions**: Assign, Reassign, Reminder, WhatsApp Template, Email, Activity, Escalation, Update Status | `ACTION_EXECUTORS` map in `actionExecutors.js` |
| **No hardcoded workflows** | Rules live in Firestore (`workflows/{id}/versions/{v}.definition`); engine only interprets, never special-cases a workflow |
| **Database driven** | Every trigger emission is a Firestore query (`listActiveWorkflowsForTrigger`), not a code branch |
| **Extensible** | New condition/action = one registry entry + one Zod union member; engine code unchanged |
| **Multi-tenant** | Every collection is `organizations/{orgId}/...`, identical to `leads`/`followUpTasks`; `firestore.rules` enforces it |
| **Versionable** | `versions` subcollection is create-only; publish/rollback always create a new version, never mutate history |

## Safety guarantees

- **Never breaks the caller.** Every `emitWorkflowTrigger()` call site wraps
  it in `.catch(() => {})`; the engine's own top-level try/catch means a bug
  in one workflow's conditions/actions can never fail a lead creation,
  status change, or ticket close.
- **Exactly-once execution.** `workflowTriggerState` claim docs (same pattern
  as `whatsappMessageEvents`) mean a retried upstream event — a duplicate
  WhatsApp webhook, a re-run cron pass — can never double-assign a lead or
  double-send a WhatsApp template.
- **Partial-failure visibility.** If action 3 of 5 fails, actions 4–5 still
  run and the `workflowRuns` doc records `status: "partial"` with the exact
  action and error — nothing is silently swallowed from the admin's view.
- **Reuses proven logic.** Assign/Reassign call the exact same
  `utils/assignLead.js` round-robin/workload functions manual assignment
  uses. Reminder writes the exact `followUpTasks` document shape
  `followUpAutomation.js` already knows how to schedule. This means a
  workflow-driven side effect is indistinguishable from a manual one once
  persisted — no parallel, divergent code path to maintain.

## Extending the engine (example)

To add a **"Lead Score"** condition type:

1. `conditionEvaluators.js`: add `lead_score: (entity) => entity.score ?? null`
   to `CONDITION_FIELD_RESOLVERS`.
2. `workflow.schema.js`: add `"lead_score"` to `CONDITION_TYPES`.
3. `lead-erp/src/data/workflowVocabulary.js`: add one entry to `CONDITIONS`.

No changes to `workflowEngine.js`, `workflowRepository.js`, or any route —
the new condition type works everywhere immediately.

## Known simplifications (documented, not hidden)

- **Email** has no real provider wired yet — it logs to
  `organizations/{orgId}/emailOutbox` and is fully auditable. Wiring
  SendGrid/SMTP later requires zero schema or engine changes (see
  `emailService.js` header comment).
- **"Organization" condition** compares an optional `branchId` field, which
  defaults to always-true for today's single-branch tenants. This avoids a
  premature multi-branch data model while keeping the condition usable the
  moment branches are introduced.
- **"City"** is a free-text comparison against `lead.city` — no dedicated
  City collection was introduced, since city values are already
  free-text on leads/tickets in this codebase.
