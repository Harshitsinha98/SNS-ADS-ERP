# Workflow Automation Engine — Firestore Schema

ARCHITECTURAL DECISION: This engine is **database-driven**: no trigger,
condition, or action is hardcoded in application code. Every workflow is a
document tree under the tenant's `organizations/{orgId}/` namespace (the same
tenancy boundary already used by `leads`, `followUpTasks`, `notifications`,
etc. — see `firestore.rules`). Adding a new trigger/condition/action type
means adding an entry to a registry map (see `conditionEvaluators.js` /
`actionExecutors.js`) — never a new `if` branch scattered through business
logic. Business code only ever calls one function:
`emitWorkflowTrigger(db, { orgId, triggerType, ... })`.

---

## 1. `organizations/{orgId}/workflows/{workflowId}` — Workflow head

The mutable "head" document. Holds identity, lifecycle state, and a pointer
to the currently-live version. The actual condition/action logic is **never**
stored here — it lives in the immutable `versions` subcollection so every
change is versioned (see Requirement: Versionable).

| Field | Type | Notes |
|---|---|---|
| `id` | string | = doc id |
| `orgId` | string | tenant scope, denormalized for collectionGroup queries |
| `name` | string | admin-facing label |
| `description` | string | optional |
| `triggerType` | enum | `lead_created` \| `lead_updated` \| `reminder_missed` \| `ticket_closed` \| `whatsapp_message_received` |
| `status` | enum | `draft` \| `active` \| `paused` \| `archived` |
| `priority` | number | lower runs first when multiple workflows match the same event |
| `stopOnMatch` | boolean | if true, stop evaluating lower-priority workflows for this event once this one matches |
| `currentVersion` | number\|null | version number currently live (null until first publish) |
| `draftVersion` | number\|null | version number being edited (null when no unpublished draft) |
| `createdBy` / `createdAt` | string | audit |
| `updatedBy` / `updatedAt` | string | audit |
| `runCount` | number | denormalized counter (avoids scanning `workflowRuns` to render a dashboard) |
| `lastRunAt` | string\|null | ISO timestamp |
| `lastRunStatus` | enum\|null | `completed` \| `partial` \| `failed` |

## 2. `organizations/{orgId}/workflows/{workflowId}/versions/{version}`

**Immutable** snapshot of workflow logic. `version` is a zero-padded string
doc id (`"1"`, `"2"`, ...) so version history sorts naturally. A version is
never mutated after it leaves `draft` status — publishing/rollback always
creates a new version number. This is what makes the engine auditable and
safely reversible.

| Field | Type | Notes |
|---|---|---|
| `version` | number | matches doc id |
| `status` | enum | `draft` \| `published` \| `superseded` |
| `definition.conditionLogic` | enum | `ALL` (AND) \| `ANY` (OR) |
| `definition.conditions[]` | array | see Condition shape below |
| `definition.actions[]` | array | see Action shape below (executed in array order) |
| `changeNote` | string | optional, admin-supplied |
| `createdBy` / `createdAt` | string | audit |
| `publishedBy` / `publishedAt` | string\|null | set only when `status` becomes `published` |

### Condition shape

```jsonc
{
  "type": "lead_source",      // lead_source | status | employee | city | product | organization | tags
  "operator": "equals",       // equals|not_equals|in|not_in|contains|not_contains|contains_any|contains_all|changed_to|changed_from|is_empty|is_not_empty
  "value": "Website"          // string | string[]  (omitted for is_empty/is_not_empty)
}
```

### Action shape (discriminated by `type`)

```jsonc
{ "type": "assign",            "params": { "strategy": "round_robin" } }
{ "type": "reassign",          "params": { "strategy": "workload", "reason": "SLA breach" } }
{ "type": "reminder",          "params": { "afterMinutes": 30, "taskType": "Call", "title": "Follow up" } }
{ "type": "whatsapp_template", "params": { "templateId": "tpl_abc", "parameters": ["{{leadName}}"] } }
{ "type": "email",             "params": { "to": "assignee", "subject": "New hot lead", "body": "..." } }
{ "type": "activity",          "params": { "text": "Workflow note: {{workflowName}} matched" } }
{ "type": "escalation",        "params": { "escalateTo": "admins", "message": "SLA breached for {{leadName}}" } }
{ "type": "update_status",     "params": { "status": "Ringing" } }
```

`{{placeholders}}` are resolved against the triggering entity at execution
time (see `resolveTemplate()` in `actionExecutors.js`).

## 3. `organizations/{orgId}/workflowRuns/{runId}` — Execution audit log

One doc per (workflow × triggering event) evaluation that **matched**.
Non-matches are not logged (would be pure noise at scale — matches the
codebase's existing bias toward minimizing writes, see `aggregates.js`).

| Field | Type |
|---|---|
| `workflowId`, `workflowVersion`, `orgId` | string/number |
| `triggerType` | enum |
| `entityType` | `lead` \| `ticket` \| `followUpTask` \| `whatsappMessage` |
| `entityId` | string |
| `conditionResults[]` | `{ condition, passed }` — for the debug/test UI |
| `actionsExecuted[]` | `{ type, params, status: "ok"|"failed", error?, resultRef? }` |
| `status` | `completed` \| `partial` \| `failed` |
| `startedAt`, `finishedAt`, `durationMs` | timing |

## 4. `organizations/{orgId}/workflowTriggerState/{dedupeKey}`

Idempotency claim docs (mirrors the existing `whatsappMessageEvents` /
`systemLocks` claim pattern already used in this codebase). Written **only**
when a workflow matches and is about to execute actions — never for
non-matches — so retrying an already-idempotent upstream event (e.g. a
duplicate WhatsApp webhook delivery) cannot double-assign a lead or double
-send a WhatsApp template.

`dedupeKey = safeDocId(`${workflowId}_${dedupeToken}`)` where `dedupeToken`
is supplied by the caller from an already-unique source (message id,
`task.dueAt`, `lead.createdAt`, `ticket.closedAt`, ...).

## 5. `organizations/{orgId}/tickets/{ticketId}` (new — required by "Ticket Closed" trigger)

Minimal ticket model, intentionally small since Tickets are new to this
codebase.

| Field | Type |
|---|---|
| `id`, `orgId` | string |
| `leadId` | string\|null — optional link back to a lead |
| `subject`, `description` | string |
| `status` | `open` \| `in_progress` \| `closed` |
| `priority` | `Hot` \| `Warm` \| `Cold` (reuses Lead's priority vocabulary) |
| `assignedTo`, `assignedToName` | string |
| `tags[]` | string[] |
| `product`, `city`, `source` | string — condition fields |
| `createdAt`, `updatedAt`, `closedAt`, `closedBy` | audit |

## 6. `organizations/{orgId}/tags/{tagId}` and `organizations/{orgId}/products/{productId}`

Small registries that exist **only** to power the UI Builder's autocomplete
pickers for the Tags / Product conditions — the conditions themselves just
compare against the `tags[]` / `product` field already present on
leads/tickets. No separate collection is needed for **City**: it is a free
-text field already on `leads.city`; the condition evaluator compares it
directly (documented decision — avoids a low-value new collection).

| Field | Type |
|---|---|
| `id`, `orgId`, `name` | string |
| `color` (tags only) | string |
| `sku`, `active` (products only) | string/boolean |
| `createdAt` | string |

## 7. "Organization" condition — design note

Workflows already run inside a single tenant (`orgId` is the outer scope),
so an `organization` condition cannot mean cross-tenant matching. It is
implemented generically against an optional `branchId`/`orgUnit` field so
multi-branch/franchise tenants (a plausible future requirement) can filter
by branch without an engine change — it defaults to always-true when the
entity has no branch field, preserving current single-branch behavior.

## Trigger → Emission Call Sites

| Trigger | Fired from | Dedupe token |
|---|---|---|
| `lead_created` | `leadIntake.js: createLeadFromIntake()`, `services/whatsapp.js: importWhatsAppLeadUnlocked()` | `lead.createdAt` |
| `lead_updated` | `followUpTasks.js: /:leadId/status`, `/:leadId/reassign` | `lead.lastUpdated` |
| `reminder_missed` | `followUpAutomation.js: processTask()` escalation branch | `task.dueAt` |
| `ticket_closed` | `services/ticketService.js: closeTicket()` | `ticket.closedAt` |
| `whatsapp_message_received` | `services/whatsapp.js: importWhatsAppLeadUnlocked()` (duplicate-lead branch) & `processInboundMessage()` | `providerMessageId` |

All emission calls are **fire-and-await-but-never-throw**: a workflow
failure is logged into its own `workflowRuns` doc and must never fail the
primary business transaction (lead creation, ticket closing, etc.).
