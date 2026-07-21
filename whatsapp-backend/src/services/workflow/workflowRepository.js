/**
 * Workflow Repository — CRUD, versioning, and publish/rollback lifecycle.
 *
 * ARCHITECTURAL DECISION: Workflow *logic* (conditions/actions) is immutable
 * once published — every edit creates a new version document instead of
 * mutating history. This mirrors why `followUpTasks` never mutates a
 * completed task and why `billingEvents` are create-only: an audit trail
 * that can be silently rewritten is not an audit trail. The mutable
 * `workflows/{id}` head document only carries lifecycle/pointer state
 * (status, currentVersion, draftVersion) — never the rules themselves.
 *
 * All functions take `db` as an explicit parameter (matching the newer
 * services/aggregates.js and services/queryBatch.js convention) rather than
 * importing the Firestore singleton, so this module stays unit-testable
 * with a fake/mocked Firestore instance.
 */

import { FieldValue } from "firebase-admin/firestore";
import { nowIso, safeDocId, orgCollection } from "../helpers.js";
import { workflowDefinitionSchema } from "../../validators/workflow.schema.js";

const TERMINAL_STATUSES = new Set(["archived"]);

function workflowError(status, message) {
  return Object.assign(new Error(message), { status });
}

/** Version numbers are stored zero-padded so doc IDs also sort naturally. */
function versionDocId(version) {
  return String(version).padStart(6, "0");
}

function workflowsRef(db, orgId) {
  return orgCollection(db, orgId, "workflows");
}

function versionsRef(db, orgId, workflowId) {
  return workflowsRef(db, orgId).doc(workflowId).collection("versions");
}

// ─── Head document CRUD ─────────────────────────────────────────────

/**
 * Create a new workflow shell (no logic yet — starts in "draft" with no
 * published version). Callers must follow up with saveDraft()+publish().
 */
export async function createWorkflow(db, orgId, {
  name, description = "", triggerType, priority = 100, stopOnMatch = false, actorId,
}) {
  const ref = workflowsRef(db, orgId).doc();
  const createdAt = nowIso();
  const head = {
    id: ref.id,
    orgId,
    name,
    description,
    triggerType,
    status: "draft",
    priority,
    stopOnMatch,
    currentVersion: null,
    draftVersion: null,
    runCount: 0,
    lastRunAt: null,
    lastRunStatus: null,
    createdBy: actorId,
    createdAt,
    updatedBy: actorId,
    updatedAt: createdAt,
  };
  await ref.create(head);
  return head;
}

/** Fetch the mutable head document, or null if it doesn't exist. */
export async function getWorkflowHead(db, orgId, workflowId) {
  const snap = await workflowsRef(db, orgId).doc(workflowId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/**
 * List workflow heads for the admin UI, optionally filtered by trigger/status.
 * This is a list-view query (no version join) — cheap by design.
 */
export async function listWorkflows(db, orgId, { triggerType = null, status = null } = {}) {
  let query = workflowsRef(db, orgId);
  if (triggerType) query = query.where("triggerType", "==", triggerType);
  if (status) query = query.where("status", "==", status);
  const snap = await query.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Update workflow metadata (name/description/priority/stopOnMatch). This is
 * intentionally NOT versioned — metadata is presentation, not logic, so
 * changing a name should not create a new "version" of the rules.
 */
export async function updateWorkflowMeta(db, orgId, workflowId, patch, actorId) {
  const ref = workflowsRef(db, orgId).doc(workflowId);
  const allowedKeys = ["name", "description", "priority", "stopOnMatch"];
  const update = { updatedBy: actorId, updatedAt: nowIso() };
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) update[key] = patch[key];
  }
  await ref.update(update);
  return getWorkflowHead(db, orgId, workflowId);
}

/**
 * Explicit lifecycle transition (active/paused/archived). Publishing a draft
 * is a separate operation (see publishWorkflow) because it also advances
 * version pointers; this function only flips the head's `status` field.
 */
export async function setWorkflowStatus(db, orgId, workflowId, status, actorId) {
  return db.runTransaction(async (tx) => {
    const ref = workflowsRef(db, orgId).doc(workflowId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw workflowError(404, "Workflow not found");
    const head = snap.data();
    if (TERMINAL_STATUSES.has(head.status) && status !== "archived") {
      throw workflowError(409, "Archived workflows cannot be reactivated directly. Duplicate it instead.");
    }
    if (status === "active" && !head.currentVersion) {
      throw workflowError(409, "Publish a version before activating this workflow");
    }
    tx.update(ref, { status, updatedBy: actorId, updatedAt: nowIso() });
    return { ...head, status };
  });
}

// ─── Versioning ─────────────────────────────────────────────────────

/**
 * Create or update the single mutable draft for a workflow. A workflow has
 * at most one draft at a time — saving again before publishing overwrites
 * that same draft version rather than accumulating unpublished versions.
 */
export async function saveDraft(db, orgId, workflowId, { definition, changeNote = "", actorId }) {
  const parsed = workflowDefinitionSchema.parse(definition);
  return db.runTransaction(async (tx) => {
    const headRef = workflowsRef(db, orgId).doc(workflowId);
    const headSnap = await tx.get(headRef);
    if (!headSnap.exists) throw workflowError(404, "Workflow not found");
    const head = headSnap.data();
    if (TERMINAL_STATUSES.has(head.status)) throw workflowError(409, "Cannot edit an archived workflow");

    const version = head.draftVersion || (Number(head.currentVersion) || 0) + 1;
    const versionRef = versionsRef(db, orgId, workflowId).doc(versionDocId(version));
    const existingDraft = await tx.get(versionRef);
    const createdAt = existingDraft.exists ? existingDraft.data().createdAt : nowIso();

    tx.set(versionRef, {
      version,
      status: "draft",
      definition: parsed,
      changeNote,
      createdBy: existingDraft.exists ? existingDraft.data().createdBy : actorId,
      createdAt,
      updatedBy: actorId,
      updatedAt: nowIso(),
      publishedBy: null,
      publishedAt: null,
    }, { merge: true });

    tx.update(headRef, { draftVersion: version, updatedBy: actorId, updatedAt: nowIso() });
    return { version, definition: parsed, status: "draft" };
  });
}

/**
 * Publish the current draft: the draft version becomes immutable
 * (`status: "published"`), any prior published version becomes
 * `"superseded"`, and the head's `currentVersion` pointer advances. A
 * workflow being published for the first time (status was "draft")
 * automatically becomes "active" — publishing a rule set with no way to run
 * it would be a confusing dead end for the admin.
 */
export async function publishWorkflow(db, orgId, workflowId, actorId) {
  return db.runTransaction(async (tx) => {
    const headRef = workflowsRef(db, orgId).doc(workflowId);
    const headSnap = await tx.get(headRef);
    if (!headSnap.exists) throw workflowError(404, "Workflow not found");
    const head = headSnap.data();
    if (!head.draftVersion) throw workflowError(409, "There is no draft to publish");

    const draftRef = versionsRef(db, orgId, workflowId).doc(versionDocId(head.draftVersion));
    const draftSnap = await tx.get(draftRef);
    if (!draftSnap.exists) throw workflowError(404, "Draft version not found");
    // Re-validate at the persistence boundary — defensive against any
    // draft written by a future migration/script that skipped API validation.
    workflowDefinitionSchema.parse(draftSnap.data().definition);

    const publishedAt = nowIso();
    if (head.currentVersion) {
      const priorRef = versionsRef(db, orgId, workflowId).doc(versionDocId(head.currentVersion));
      tx.update(priorRef, { status: "superseded" });
    }
    tx.update(draftRef, { status: "published", publishedBy: actorId, publishedAt });

    const nextStatus = head.status === "draft" ? "active" : head.status;
    tx.update(headRef, {
      currentVersion: head.draftVersion,
      draftVersion: null,
      status: nextStatus,
      updatedBy: actorId,
      updatedAt: publishedAt,
    });
    return { version: head.draftVersion, status: nextStatus };
  });
}

/** List every version (draft/published/superseded) for the version-history UI. */
export async function listVersions(db, orgId, workflowId) {
  const snap = await versionsRef(db, orgId, workflowId).orderBy("version", "desc").get();
  return snap.docs.map((d) => d.data());
}

/** Fetch one specific version document. */
export async function getVersion(db, orgId, workflowId, version) {
  const snap = await versionsRef(db, orgId, workflowId).doc(versionDocId(version)).get();
  return snap.exists ? snap.data() : null;
}

/**
 * Roll back to a previously published version by creating a brand-new
 * version that copies its definition and publishing it immediately. This
 * preserves complete, append-only history (never rewinds `currentVersion`
 * onto an old doc) — the audit trail always shows "why" a version exists,
 * including "this was a rollback of v3 to match v1's rules".
 */
export async function rollbackWorkflow(db, orgId, workflowId, toVersion, actorId) {
  const target = await getVersion(db, orgId, workflowId, toVersion);
  if (!target || target.status === "draft") {
    throw workflowError(404, "Choose a previously published version to roll back to");
  }
  await saveDraft(db, orgId, workflowId, {
    definition: target.definition,
    changeNote: `Rollback to v${toVersion}`,
    actorId,
  });
  return publishWorkflow(db, orgId, workflowId, actorId);
}

/**
 * Resolve the currently-live rules for execution. Returns null when the
 * workflow has never been published — the engine treats that as "nothing to
 * run" rather than an error, since a draft-only workflow is expected state.
 */
export async function getPublishedDefinition(db, orgId, workflowId) {
  const head = await getWorkflowHead(db, orgId, workflowId);
  if (!head || !head.currentVersion) return null;
  const version = await getVersion(db, orgId, workflowId, head.currentVersion);
  return version ? { version: version.version, definition: version.definition } : null;
}

/**
 * Hot-path lookup used by the execution engine on every trigger emission:
 * "which active workflows care about this trigger type, in priority order,
 * with their live rules attached?" One indexed query (see
 * firestore.indexes.json: workflows(triggerType, status, priority)) plus a
 * parallel batch of version reads — never a full collection scan.
 */
export async function listActiveWorkflowsForTrigger(db, orgId, triggerType) {
  const snap = await workflowsRef(db, orgId)
    .where("triggerType", "==", triggerType)
    .where("status", "==", "active")
    .orderBy("priority", "asc")
    .get();

  const heads = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((h) => h.currentVersion);
  const versions = await Promise.all(
    heads.map((head) => getVersion(db, orgId, head.id, head.currentVersion))
  );

  return heads
    .map((head, index) => (versions[index] ? {
      id: head.id,
      name: head.name,
      priority: head.priority,
      stopOnMatch: Boolean(head.stopOnMatch),
      version: versions[index].version,
      definition: versions[index].definition,
    } : null))
    .filter(Boolean);
}

/**
 * Denormalized run counters on the head doc — avoids scanning workflowRuns
 * to render a dashboard. Uses FieldValue.increment for atomicity under
 * concurrent trigger emissions (no read-then-write race).
 */
export async function recordRunOutcome(db, orgId, workflowId, { status, at }) {
  await workflowsRef(db, orgId).doc(workflowId).update({
    runCount: FieldValue.increment(1),
    lastRunAt: at,
    lastRunStatus: status,
  }).catch(() => {
    // Best-effort counter; a failure here must never affect the executed
    // workflow's own audit record in workflowRuns.
  });
}

export { safeDocId, versionDocId };
