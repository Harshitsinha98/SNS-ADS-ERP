/**
 * Action Executor Registry.
 *
 * ARCHITECTURAL DECISION: Every action `type` maps to one executor function
 * in `ACTION_EXECUTORS`, all sharing the signature
 * `(db, orgId, params, ctx) => Promise<{ ok: boolean, detail?, error? }>`.
 * The engine (workflowEngine.js) never branches on action type — it just
 * looks up `ACTION_EXECUTORS[action.type]` and calls it. Adding a new action
 * type is exactly one new entry here plus one new discriminated-union member
 * in validators/workflow.schema.js; no engine code changes.
 *
 * Executors deliberately REUSE existing business logic instead of
 * re-implementing it:
 *  - assign/reassign  → utils/assignLead.js (same round-robin/workload
 *                        counters leads already use, so a workflow-driven
 *                        assignment can never desync from manual assignment)
 *  - reminder         → writes a followUpTasks doc with the exact shape
 *                        followUpAutomation.js already knows how to schedule
 *  - activity/escalation → org-scoped `activity`/`notifications` collections,
 *                        identical shape to every other subsystem's writes
 *
 * `ctx.entity` / `ctx.entityType` / `ctx.entityRef` describe the triggering
 * document; `resolveTemplate()` lets action params reference its fields via
 * `{{fieldName}}` placeholders (e.g. an email body of "Hi {{name}}, ...").
 */

import { getNextEmployeeRoundRobin, getNextEmployeeByWorkload } from "../../../utils/assignLead.js";
import { nowIso, safeDocId, orgCollection } from "../helpers.js";
import { sendWorkflowEmail } from "./emailService.js";

function actionError(message) {
  return { ok: false, error: message };
}

/** Replace `{{field}}` placeholders in a string with values from the entity. */
export function resolveTemplate(text, entity = {}) {
  return String(text ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, path) => {
    const value = path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), entity);
    return value === undefined || value === null ? "" : String(value);
  });
}

async function resolveAssignee(db, orgId, params) {
  if (params.strategy === "specific_employee") {
    if (!params.employeeUid) return null;
    const membership = await db.collection("memberships").doc(`${params.employeeUid}_${orgId}`).get();
    if (!membership.exists || membership.data().active !== true) return null;
    return { id: params.employeeUid, name: membership.data().displayName || null };
  }
  if (params.strategy === "workload") return getNextEmployeeByWorkload(db, orgId);
  return getNextEmployeeRoundRobin(db, orgId);
}

function entityLeadRef(db, orgId, ctx) {
  // Only "lead"-shaped entities (leads themselves, or leads referenced by a
  // follow-up task/ticket/WhatsApp message) can be assigned/status-updated.
  const leadId = ctx.entityType === "lead" ? ctx.entity.id : ctx.entity.leadId;
  return leadId ? orgCollection(db, orgId, "leads").doc(leadId) : null;
}

// ─── Individual executors ───────────────────────────────────────────

async function executeAssign(db, orgId, params, ctx) {
  const leadRef = entityLeadRef(db, orgId, ctx);
  if (!leadRef) return actionError("No lead associated with this event to assign");
  const employee = await resolveAssignee(db, orgId, params);
  if (!employee?.id) return actionError("No eligible employee found for assignment");

  const updatedAt = nowIso();
  await leadRef.update({
    assignedTo: employee.id,
    assignedToName: employee.name || null,
    lastUpdated: updatedAt,
  });
  await orgCollection(db, orgId, "activity").add({
    text: `Workflow assigned lead → ${employee.name || employee.id}`,
    at: updatedAt,
    orgId,
    leadId: leadRef.id,
    source: "workflow_engine",
  });
  return { ok: true, detail: { assignedTo: employee.id, assignedToName: employee.name || null } };
}

async function executeReassign(db, orgId, params, ctx) {
  const result = await executeAssign(db, orgId, params, ctx);
  if (!result.ok) return result;
  if (params.reason) {
    await orgCollection(db, orgId, "activity").add({
      text: `Workflow reassignment reason: ${params.reason}`,
      at: nowIso(),
      orgId,
      leadId: entityLeadRef(db, orgId, ctx)?.id,
      source: "workflow_engine",
    });
  }
  return result;
}

async function executeReminder(db, orgId, params, ctx) {
  const leadRef = entityLeadRef(db, orgId, ctx);
  if (!leadRef) return actionError("No lead associated with this event to remind about");
  const leadSnap = await leadRef.get();
  if (!leadSnap.exists) return actionError("Lead no longer exists");
  const lead = leadSnap.data();

  const dueAt = new Date(Date.now() + Math.max(0, params.afterMinutes) * 60 * 1000).toISOString();
  const createdAt = nowIso();
  // Reuses the exact followUpTasks document shape followUpAutomation.js
  // already knows how to schedule reminders/escalations for — a
  // workflow-created reminder is indistinguishable from a manually
  // scheduled one once written, so no engine changes were needed there.
  const taskRef = orgCollection(db, orgId, "followUpTasks").doc(safeDocId(leadRef.id));
  const existing = await taskRef.get();
  if (existing.exists && existing.data().status === "open") {
    // A lead has exactly one live follow-up (see followUpTasks.js
    // taskForLeadRef doc comment). Do not clobber an existing open task.
    return { ok: true, detail: { skipped: "open_task_exists" } };
  }
  await taskRef.set({
    orgId,
    leadId: leadRef.id,
    leadName: lead.name || "Lead",
    leadPhone: lead.phone || "",
    assignedTo: lead.assignedTo || null,
    assignedToName: lead.assignedToName || null,
    type: params.taskType || "Call",
    title: resolveTemplate(params.title, lead) || `${params.taskType || "Call"} follow-up`,
    priority: lead.priority || "Warm",
    dueAt,
    status: "open",
    createdBy: "workflow_engine",
    createdByName: "Workflow Automation",
    createdAt,
    updatedAt: createdAt,
    reminderSentFor: null,
    reminderSentAt: null,
    overdueEscalatedFor: null,
    overdueEscalatedAt: null,
    automationNextAt: new Date(Math.max(Date.now(), Date.parse(dueAt) - 24 * 60 * 60 * 1000)).toISOString(),
    completedAt: null,
    completedBy: null,
    completedByName: null,
    outcome: null,
    completionNote: null,
    revision: 1,
  });
  return { ok: true, detail: { dueAt } };
}

async function executeWhatsAppTemplate(db, orgId, params, ctx, helpers) {
  const leadRef = entityLeadRef(db, orgId, ctx);
  if (!leadRef) return actionError("No lead associated with this event to message");
  if (!helpers?.metaGraphRequest || !helpers?.decryptWhatsAppToken) {
    return actionError("WhatsApp sending is not configured for the engine");
  }
  const [leadSnap, credentialSnap, templateSnap] = await Promise.all([
    leadRef.get(),
    db.collection("whatsappCredentials").doc(orgId).get(),
    orgCollection(db, orgId, "whatsappTemplates").doc(safeDocId(params.templateId)).get(),
  ]);
  if (!leadSnap.exists) return actionError("Lead no longer exists");
  if (!credentialSnap.exists || credentialSnap.data().connectionState !== "connected") {
    return actionError("WhatsApp Business is not connected for this workspace");
  }
  if (!templateSnap.exists || templateSnap.data().available !== true) {
    return actionError("Selected WhatsApp template is not approved/available");
  }
  const lead = leadSnap.data();
  const credential = credentialSnap.data();
  const template = templateSnap.data();
  const recipient = String(lead.phone || "").replace(/\D/g, "");
  if (!/^\d{7,15}$/.test(recipient)) return actionError("Lead has no valid WhatsApp number");

  const clientMessageId = safeDocId(`${ctx.dedupeKey}_${params.templateId}`);
  const messageRef = leadRef.collection("messages").doc(clientMessageId);
  const provider = await helpers.metaGraphRequest(`${credential.phoneNumberId}/messages`, {
    method: "POST",
    token: helpers.decryptWhatsAppToken(credential.tokenCiphertext),
    body: {
      messaging_product: "whatsapp",
      to: recipient,
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language },
        ...(params.parameters?.length ? {
          components: [{ type: "body", parameters: params.parameters.map((text) => ({ type: "text", text: resolveTemplate(text, lead) })) }],
        } : {}),
      },
      biz_opaque_callback_data: clientMessageId,
    },
  });
  await messageRef.set({
    direction: "outbound",
    type: "template",
    text: template.preview || template.name,
    recipient,
    templateId: params.templateId,
    templateName: template.name,
    status: "sent",
    providerMessageId: provider?.messages?.[0]?.id || null,
    sentAt: nowIso(),
    senderName: "Workflow Automation",
    source: "workflow_engine",
  }, { merge: true });
  return { ok: true, detail: { templateId: params.templateId, messageId: clientMessageId } };
}

async function executeEmail(db, orgId, params, ctx) {
  const entity = ctx.entity;
  const recipients = [];
  if (params.to === "lead" && entity.email) recipients.push(entity.email);
  if (params.to === "assignee" && entity.assignedTo) {
    const membership = await db.collection("memberships").doc(`${entity.assignedTo}_${orgId}`).get();
    if (membership.exists && membership.data().email) recipients.push(membership.data().email);
  }
  if (params.to === "admins") {
    const admins = await db.collection("memberships")
      .where("orgId", "==", orgId).where("active", "==", true).get();
    admins.docs.forEach((doc) => {
      const data = doc.data();
      if ((data.role === "owner" || data.role === "admin") && data.email) recipients.push(data.email);
    });
  }
  if (params.to === "custom" && params.customEmail) recipients.push(params.customEmail);

  if (recipients.length === 0) return actionError("No resolvable email recipient for this action");
  const result = await sendWorkflowEmail({
    to: recipients,
    subject: resolveTemplate(params.subject, entity),
    body: resolveTemplate(params.body, entity),
    orgId,
  });
  return result.ok ? { ok: true, detail: { recipients, provider: result.provider } } : actionError(result.error);
}

async function executeActivity(db, orgId, params, ctx) {
  await orgCollection(db, orgId, "activity").add({
    text: resolveTemplate(params.text, ctx.entity),
    at: nowIso(),
    orgId,
    leadId: ctx.entityType === "lead" ? ctx.entity.id : ctx.entity.leadId || null,
    source: "workflow_engine",
  });
  return { ok: true };
}

async function executeEscalation(db, orgId, params, ctx) {
  const targets = [];
  if (params.escalateTo === "specific_employee" && params.employeeUid) {
    targets.push(params.employeeUid);
  } else {
    // "admins" and "assignee_manager" both resolve to org admins today —
    // a manager-hierarchy field does not exist yet on memberships, so this
    // degrades gracefully to the existing admin-escalation behavior used by
    // followUpAutomation.js rather than silently doing nothing.
    const admins = await db.collection("memberships")
      .where("orgId", "==", orgId).where("active", "==", true).get();
    admins.docs.forEach((doc) => {
      const data = doc.data();
      if (data.role === "owner" || data.role === "admin") targets.push(data.uid);
    });
  }
  const text = resolveTemplate(params.message, ctx.entity);
  const at = nowIso();
  const batch = db.batch();
  targets.forEach((uid) => {
    batch.set(orgCollection(db, orgId, "notifications").doc(), {
      userId: uid,
      text,
      type: "workflow_escalation",
      read: false,
      at,
      orgId,
      leadId: ctx.entityType === "lead" ? ctx.entity.id : ctx.entity.leadId || null,
    });
  });
  if (targets.length) await batch.commit();
  return { ok: true, detail: { notified: targets.length } };
}

async function executeUpdateStatus(db, orgId, params, ctx) {
  const leadRef = entityLeadRef(db, orgId, ctx);
  if (!leadRef) return actionError("No lead associated with this event to update");
  await leadRef.update({ status: params.status, lastUpdated: nowIso() });
  return { ok: true, detail: { status: params.status } };
}

// ─── Registry ───────────────────────────────────────────────────────

export const ACTION_EXECUTORS = Object.freeze({
  assign: executeAssign,
  reassign: executeReassign,
  reminder: executeReminder,
  whatsapp_template: executeWhatsAppTemplate,
  email: executeEmail,
  activity: executeActivity,
  escalation: executeEscalation,
  update_status: executeUpdateStatus,
});

export const ACTION_TYPES = Object.freeze(Object.keys(ACTION_EXECUTORS));

/**
 * Execute one action. Never throws — failures are captured and returned so
 * the engine can log a partial-failure run and continue with the next
 * action instead of aborting the whole workflow on one bad action.
 */
export async function executeAction(db, orgId, action, ctx, helpers) {
  const executor = ACTION_EXECUTORS[action.type];
  if (!executor) return actionError(`Unknown action type: ${action.type}`);
  try {
    return await executor(db, orgId, action.params || {}, ctx, helpers);
  } catch (error) {
    return actionError(error.message || "Action execution failed");
  }
}
