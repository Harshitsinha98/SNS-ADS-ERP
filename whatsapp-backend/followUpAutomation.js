import { FieldPath } from "firebase-admin/firestore";
import { emitWorkflowTrigger } from "./src/services/workflow/workflowEngine.js";

const MAX_AUTOMATION_MINUTES = 24 * 60;
const MIN_REMINDER_MINUTES = 5;
const LEGACY_BACKFILL_PAGE_SIZE = 100;
const LEGACY_MIGRATION_VERSION = 1;

const nowIso = () => new Date().toISOString();
const safeDocId = (value) => String(value || "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 180);
const orgCollection = (db, orgId, name) => db.collection("organizations").doc(orgId).collection(name);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

function boundedMinutes(value, fallback, minimum = 0) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return fallback;
  return Math.max(minimum, Math.min(MAX_AUTOMATION_MINUTES, Math.round(minutes)));
}

export function getFollowUpAutomationConfig(settings = {}) {
  const config = settings.followUpAutomation || {};
  return {
    enabled: config.enabled !== false,
    // The five-minute worker needs a full interval to reliably send a pre-due reminder.
    reminderMinutesBefore: boundedMinutes(config.reminderMinutesBefore, 30, MIN_REMINDER_MINUTES),
    overdueEscalationMinutes: boundedMinutes(config.overdueEscalationMinutes, 60),
  };
}

function initialAutomationAt(dueAt) {
  const dueMs = Date.parse(dueAt || "");
  if (!Number.isFinite(dueMs)) return null;
  // The first worker pass uses the organization setting to refine this gate.
  // One day is the maximum supported reminder lead time, so no task is missed.
  return new Date(Math.max(Date.now(), dueMs - MAX_AUTOMATION_MINUTES * 60 * 1000)).toISOString();
}

async function backfillLegacyTasksForOrg(db, orgId) {
  const stateRef = orgCollection(db, orgId, "automationState").doc("followUpLegacyMigration");
  const stateSnap = await stateRef.get();
  const state = stateSnap.data() || {};
  if (state.version === LEGACY_MIGRATION_VERSION && state.completedAt) {
    return { backfilled: 0, invalid: 0, pending: false };
  }

  let taskQuery = orgCollection(db, orgId, "followUpTasks")
    .orderBy(FieldPath.documentId())
    .limit(LEGACY_BACKFILL_PAGE_SIZE);
  if (state.lastTaskId) taskQuery = taskQuery.startAfter(state.lastTaskId);
  const page = await taskQuery.get();
  const batch = db.batch();
  let backfilled = 0;
  let invalid = 0;

  page.docs.forEach((taskSnap) => {
    const task = taskSnap.data();
    if (task.status === "open" && !hasOwn(task, "automationNextAt")) {
      const automationNextAt = initialAutomationAt(task.dueAt);
      if (automationNextAt) {
        batch.update(taskSnap.ref, {
          automationNextAt,
          automationBackfilledAt: nowIso(),
          automationBackfillVersion: LEGACY_MIGRATION_VERSION,
        });
        backfilled += 1;
      } else {
        batch.update(taskSnap.ref, {
          automationNextAt: null,
          automationBackfillError: "invalid_due_at",
          automationBackfilledAt: nowIso(),
          automationBackfillVersion: LEGACY_MIGRATION_VERSION,
        });
        invalid += 1;
      }
    } else if (task.status !== "open" && task.automationNextAt !== null && task.automationNextAt !== undefined) {
      // Also clean historical terminal tasks that would otherwise retain a
      // stale scheduler value after an older status transition.
      batch.update(taskSnap.ref, { automationNextAt: null, automationBackfilledAt: nowIso() });
    }
  });

  const lastTaskId = page.docs.at(-1)?.id || null;
  const complete = page.size < LEGACY_BACKFILL_PAGE_SIZE;
  batch.set(stateRef, {
    version: LEGACY_MIGRATION_VERSION,
    lastTaskId: complete ? null : lastTaskId,
    updatedAt: nowIso(),
    ...(complete ? { completedAt: nowIso() } : {}),
  }, { merge: true });
  await batch.commit();
  return { backfilled, invalid, pending: !complete };
}

async function backfillLegacyTasks(db, { orgId = null } = {}) {
  if (orgId) return backfillLegacyTasksForOrg(db, orgId);

  // Migrate one bounded page from one organization per cron run. This admits
  // Phase 3 task documents without returning to an unbounded overdue scan.
  const stateRef = db.collection("systemAutomationState").doc("followUpLegacyMigration");
  const stateSnap = await stateRef.get();
  const state = stateSnap.data() || {};
  if (state.version === LEGACY_MIGRATION_VERSION && state.completedAt) {
    return { backfilled: 0, invalid: 0, pending: false };
  }

  let organizationsQuery = db.collection("organizations").orderBy(FieldPath.documentId()).limit(1);
  if (state.lastOrgId) organizationsQuery = organizationsQuery.startAfter(state.lastOrgId);
  const organizations = await organizationsQuery.get();
  if (organizations.empty) {
    await stateRef.set({ version: LEGACY_MIGRATION_VERSION, completedAt: nowIso(), updatedAt: nowIso() }, { merge: true });
    return { backfilled: 0, invalid: 0, pending: false };
  }

  const organization = organizations.docs[0];
  const result = await backfillLegacyTasksForOrg(db, organization.id);
  if (!result.pending) {
    await stateRef.set({ version: LEGACY_MIGRATION_VERSION, lastOrgId: organization.id, updatedAt: nowIso() }, { merge: true });
  }
  return { ...result, pending: true };
}

async function reenrollPausedTasks(db, orgId) {
  if (!orgId) return { reenrolled: 0, invalid: 0, pending: false };
  const settingsSnap = await orgCollection(db, orgId, "settings").doc("config").get();
  if (!getFollowUpAutomationConfig(settingsSnap.data() || {}).enabled) {
    return { reenrolled: 0, invalid: 0, pending: false };
  }

  const paused = await orgCollection(db, orgId, "followUpTasks")
    .where("status", "==", "open")
    .where("automationPausedFor", ">=", "")
    .limit(LEGACY_BACKFILL_PAGE_SIZE)
    .get();
  const batch = db.batch();
  let reenrolled = 0;
  let invalid = 0;
  paused.docs.forEach((taskSnap) => {
    const automationNextAt = initialAutomationAt(taskSnap.data().dueAt);
    batch.update(taskSnap.ref, automationNextAt ? {
      automationNextAt,
      automationPausedFor: null,
      automationResumedAt: nowIso(),
    } : {
      automationNextAt: null,
      automationPausedFor: null,
      automationBackfillError: "invalid_due_at",
      automationResumedAt: nowIso(),
    });
    if (automationNextAt) reenrolled += 1;
    else invalid += 1;
  });
  if (paused.size) await batch.commit();
  return { reenrolled, invalid, pending: paused.size === LEGACY_BACKFILL_PAGE_SIZE };
}

async function getAdminIds(db, orgId, cache) {
  if (cache.has(orgId)) return cache.get(orgId);
  const members = await db.collection("memberships")
    .where("orgId", "==", orgId)
    .where("active", "==", true)
    .get();
  const ids = members.docs
    .map((member) => member.data())
    .filter((member) => member.role === "owner" || member.role === "admin")
    .map((member) => member.uid)
    .filter(Boolean);
  cache.set(orgId, ids);
  return ids;
}

async function processTask(db, taskRef, seed, adminCache) {
  const orgId = String(seed.orgId || "");
  if (!orgId) return null;
  const adminIds = await getAdminIds(db, orgId, adminCache);

  return db.runTransaction(async (tx) => {
    const [taskSnap, settingsSnap] = await Promise.all([
      tx.get(taskRef),
      tx.get(orgCollection(db, orgId, "settings").doc("config")),
    ]);
    if (!taskSnap.exists) return null;
    const task = taskSnap.data();
    if (task.status !== "open") {
      if (task.automationNextAt !== null && task.automationNextAt !== undefined) {
        tx.update(taskRef, { automationNextAt: null });
      }
      return null;
    }

    const config = getFollowUpAutomationConfig(settingsSnap.data() || {});
    if (!config.enabled) {
      // Stop re-reading this due task on every cron pass while the workspace
      // has automation paused. An admin re-enables a bounded batch explicitly.
      tx.update(taskRef, {
        automationNextAt: null,
        automationPausedFor: task.dueAt,
        automationPausedAt: nowIso(),
      });
      return "paused";
    }
    const dueMs = Date.parse(task.dueAt || "");
    if (!Number.isFinite(dueMs)) return null;
    const now = Date.now();
    const taskStamp = safeDocId(`${taskSnap.id}_${task.dueAt}`);
    const activityRef = orgCollection(db, orgId, "activity").doc();
    const reminderAtMs = dueMs - config.reminderMinutesBefore * 60 * 1000;
    const escalationAtMs = dueMs + config.overdueEscalationMinutes * 60 * 1000;

    if (task.overdueEscalatedFor === task.dueAt) {
      if (task.automationNextAt !== null) tx.update(taskRef, { automationNextAt: null });
      return "settled";
    }

    // Tasks begin one day before the due time. The first pass derives the
    // tenant's current settings and schedules exactly one next automation event.
    if (now < reminderAtMs) {
      tx.update(taskRef, { automationNextAt: new Date(reminderAtMs).toISOString() });
      return "scheduled";
    }

    if (now < dueMs && task.reminderSentFor !== task.dueAt) {
      if (task.assignedTo) {
        tx.set(orgCollection(db, orgId, "notifications").doc(`followup_due_${taskStamp}_${safeDocId(task.assignedTo)}`), {
          userId: task.assignedTo,
          text: `Reminder: ${task.type || "Follow-up"} for ${task.leadName || "a lead"} is due at ${new Date(task.dueAt).toLocaleString("en-IN")}.`,
          type: "follow_up_reminder",
          read: false,
          at: nowIso(),
          orgId,
          leadId: task.leadId,
          taskId: taskSnap.id,
          dueAt: task.dueAt,
        }, { merge: true });
      }
      tx.update(taskRef, {
        reminderSentFor: task.dueAt,
        reminderSentAt: nowIso(),
        automationNextAt: new Date(Math.max(now, escalationAtMs)).toISOString(),
      });
      tx.set(activityRef, {
        text: `Follow-up reminder sent: ${task.leadName || task.leadId} → ${task.assignedToName || "assignee"}`,
        at: nowIso(),
        orgId,
        leadId: task.leadId,
        taskId: taskSnap.id,
        source: "follow_up_automation",
      });
      return "reminder";
    }

    if (now >= escalationAtMs && task.overdueEscalatedFor !== task.dueAt) {
      const targets = [...new Set([task.assignedTo, ...adminIds].filter(Boolean))];
      targets.forEach((uid) => {
        tx.set(orgCollection(db, orgId, "notifications").doc(`followup_overdue_${taskStamp}_${safeDocId(uid)}`), {
          userId: uid,
          text: `Overdue follow-up: ${task.type || "Follow-up"} for ${task.leadName || "a lead"} was due ${new Date(task.dueAt).toLocaleString("en-IN")}.`,
          type: "follow_up_escalation",
          read: false,
          at: nowIso(),
          orgId,
          leadId: task.leadId,
          taskId: taskSnap.id,
          dueAt: task.dueAt,
        }, { merge: true });
      });
      tx.update(taskRef, {
        overdueEscalatedFor: task.dueAt,
        overdueEscalatedAt: nowIso(),
        automationNextAt: null,
      });
      tx.set(activityRef, {
        text: `Follow-up SLA escalated: ${task.leadName || task.leadId} (${task.assignedToName || "unassigned"})`,
        at: nowIso(),
        orgId,
        leadId: task.leadId,
        taskId: taskSnap.id,
        source: "follow_up_automation",
      });
      return "escalation";
    }

    // If the app was offline across the reminder window, do not send a late
    // pre-due notification. Queue the single overdue escalation instead.
    tx.update(taskRef, { automationNextAt: new Date(Math.max(now, escalationAtMs)).toISOString() });
    return "scheduled";
  });
}

export async function runFollowUpAutomation(db, { orgId = null, reenrollPaused = false } = {}) {
  const backfill = await backfillLegacyTasks(db, { orgId });
  const reenrollment = reenrollPaused ? await reenrollPausedTasks(db, orgId) : { reenrolled: 0, invalid: 0, pending: false };
  const now = nowIso();
  const tasksRef = orgId
    ? orgCollection(db, orgId, "followUpTasks")
    : db.collectionGroup("followUpTasks");
  const candidates = await tasksRef
    .where("status", "==", "open")
    .where("automationNextAt", "<=", now)
    .get();
  const adminCache = new Map();
  const summary = {
    scanned: 0,
    reminders: 0,
    escalations: 0,
    backfilled: backfill.backfilled,
    invalidTasks: backfill.invalid + reenrollment.invalid,
    migrationPending: backfill.pending,
    reenrolled: reenrollment.reenrolled,
    reenrollmentPending: reenrollment.pending,
  };
  for (const task of candidates.docs) {
    summary.scanned += 1;
    const taskData = task.data();
    const result = await processTask(db, task.ref, taskData, adminCache);
    if (result === "reminder") summary.reminders += 1;
    if (result === "escalation") {
      summary.escalations += 1;
      // reminder_missed trigger: fired once, exactly when the overdue-escalation
      // branch commits (never on the earlier pre-due reminder). Uses
      // taskData.orgId (denormalized on every followUpTasks doc) so this
      // works identically for both the per-org and cross-org collectionGroup
      // cron passes.
      const escalatedAt = nowIso();
      emitWorkflowTrigger(db, {
        orgId: taskData.orgId,
        triggerType: "reminder_missed",
        entityType: "followUpTask",
        entity: { id: task.id, ...taskData, overdueEscalatedFor: taskData.dueAt, overdueEscalatedAt: escalatedAt, orgId: taskData.orgId },
        dedupeToken: `${task.id}_${taskData.dueAt}`,
      }).catch(() => {});
    }
  }
  return summary;
}
