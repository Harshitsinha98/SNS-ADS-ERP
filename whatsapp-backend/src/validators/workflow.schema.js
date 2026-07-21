/**
 * Zod schemas for the Workflow Automation Engine.
 *
 * ARCHITECTURAL DECISION: The trigger/condition/action vocabulary is a closed
 * set of enums today, but every new type is additive (append to an enum +
 * add a registry entry in conditionEvaluators.js/actionExecutors.js) — no
 * schema restructuring is required to extend the engine. Action params use
 * z.discriminatedUnion on `type` so each action gets its own strictly-typed
 * params shape while still living in one heterogeneous `actions[]` array.
 */

import { z } from "zod";

// ─── Triggers ───────────────────────────────────────────────────────

export const TRIGGER_TYPES = [
  "lead_created",
  "lead_updated",
  "reminder_missed",
  "ticket_closed",
  "whatsapp_message_received",
];
export const triggerTypeSchema = z.enum(TRIGGER_TYPES);

// ─── Conditions ─────────────────────────────────────────────────────

export const CONDITION_TYPES = [
  "lead_source",
  "status",
  "employee",
  "city",
  "product",
  "organization",
  "tags",
];
export const conditionTypeSchema = z.enum(CONDITION_TYPES);

export const CONDITION_OPERATORS = [
  "equals", "not_equals",
  "in", "not_in",
  "contains", "not_contains", "contains_any", "contains_all",
  "changed_to", "changed_from",
  "is_empty", "is_not_empty",
];
export const conditionOperatorSchema = z.enum(CONDITION_OPERATORS);

export const conditionSchema = z.object({
  type: conditionTypeSchema,
  operator: conditionOperatorSchema,
  value: z.union([z.string().max(200), z.array(z.string().max(200)).max(50)]).optional(),
}).refine(
  (condition) => ["is_empty", "is_not_empty"].includes(condition.operator) || condition.value !== undefined,
  { message: "value is required unless operator is is_empty/is_not_empty" }
);

// ─── Actions ────────────────────────────────────────────────────────

const assignParamsSchema = z.object({
  strategy: z.enum(["round_robin", "workload", "specific_employee"]).default("round_robin"),
  employeeUid: z.string().optional(),
});

const reminderParamsSchema = z.object({
  afterMinutes: z.number().int().min(0).max(43200).default(0), // up to 30 days
  taskType: z.enum(["Call", "WhatsApp", "Meeting", "Email", "Other"]).default("Call"),
  title: z.string().max(180).optional(),
});

const whatsappTemplateParamsSchema = z.object({
  templateId: z.string().min(1, "Template is required"),
  parameters: z.array(z.string().max(1024)).max(10).default([]),
});

const emailParamsSchema = z.object({
  to: z.enum(["lead", "assignee", "admins", "custom"]).default("assignee"),
  customEmail: z.string().email().optional(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
});

const activityParamsSchema = z.object({
  text: z.string().min(1).max(500),
});

const escalationParamsSchema = z.object({
  escalateTo: z.enum(["admins", "assignee_manager", "specific_employee"]).default("admins"),
  employeeUid: z.string().optional(),
  message: z.string().min(1).max(500),
});

const updateStatusParamsSchema = z.object({
  status: z.string().min(1).max(80),
});

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("assign"), params: assignParamsSchema }),
  z.object({ type: z.literal("reassign"), params: assignParamsSchema.extend({ reason: z.string().max(300).optional() }) }),
  z.object({ type: z.literal("reminder"), params: reminderParamsSchema }),
  z.object({ type: z.literal("whatsapp_template"), params: whatsappTemplateParamsSchema }),
  z.object({ type: z.literal("email"), params: emailParamsSchema }),
  z.object({ type: z.literal("activity"), params: activityParamsSchema }),
  z.object({ type: z.literal("escalation"), params: escalationParamsSchema }),
  z.object({ type: z.literal("update_status"), params: updateStatusParamsSchema }),
]);

export const ACTION_TYPES = ["assign", "reassign", "reminder", "whatsapp_template", "email", "activity", "escalation", "update_status"];

// ─── Workflow definition (one version's payload) ───────────────────

export const workflowDefinitionSchema = z.object({
  conditionLogic: z.enum(["ALL", "ANY"]).default("ALL"),
  conditions: z.array(conditionSchema).max(20).default([]),
  actions: z.array(actionSchema).min(1, "At least one action is required").max(20),
});

// ─── API request schemas ───────────────────────────────────────────

export const createWorkflowSchema = z.object({
  orgId: z.string().min(1),
  name: z.string().min(1, "Name is required").max(120),
  description: z.string().max(500).optional().default(""),
  triggerType: triggerTypeSchema,
  priority: z.number().int().min(0).max(1000).default(100),
  stopOnMatch: z.boolean().default(false),
});

export const saveDraftSchema = z.object({
  orgId: z.string().min(1),
  definition: workflowDefinitionSchema,
  changeNote: z.string().max(300).optional(),
});

export const publishWorkflowSchema = z.object({
  orgId: z.string().min(1),
});

export const updateWorkflowMetaSchema = z.object({
  orgId: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  stopOnMatch: z.boolean().optional(),
});

export const workflowStatusSchema = z.object({
  orgId: z.string().min(1),
  status: z.enum(["active", "paused", "archived"]),
});

export const rollbackWorkflowSchema = z.object({
  orgId: z.string().min(1),
  toVersion: z.number().int().min(1),
});

export const testRunWorkflowSchema = z.object({
  orgId: z.string().min(1),
  sampleEntity: z.record(z.string(), z.any()).default({}),
  previousEntity: z.record(z.string(), z.any()).optional(),
});

export const listWorkflowRunsSchema = z.object({
  orgId: z.string().min(1),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});
