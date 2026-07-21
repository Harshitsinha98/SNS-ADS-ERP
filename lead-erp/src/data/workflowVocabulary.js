/**
 * Workflow Automation Engine — frontend vocabulary.
 *
 * ARCHITECTURAL DECISION: This file is the frontend mirror of the backend's
 * registries (conditionEvaluators.js / actionExecutors.js / workflow.schema.js).
 * The UI Builder never hardcodes a `<select>` with trigger/condition/action
 * options inline — it always maps over these arrays. Adding a new
 * trigger/condition/action type on the backend means adding one entry here
 * too, and the Builder UI (pickers, dynamic param forms) updates with zero
 * other frontend code changes — satisfying the "no hardcoded workflows"
 * requirement on the client side as well.
 */

export const TRIGGERS = [
  { value: "lead_created", label: "Lead Created", entityType: "lead" },
  { value: "lead_updated", label: "Lead Updated", entityType: "lead" },
  { value: "reminder_missed", label: "Reminder Missed", entityType: "followUpTask" },
  { value: "ticket_closed", label: "Ticket Closed", entityType: "ticket" },
  { value: "whatsapp_message_received", label: "WhatsApp Message Received", entityType: "whatsappMessage" },
];

// Operators an entity field of a given "shape" supports. A condition type's
// shape ("scalar" | "array") determines which operators are offered — this
// mirrors OPERATOR_EVALUATORS in the backend's conditionEvaluators.js.
const SCALAR_OPERATORS = ["equals", "not_equals", "in", "not_in", "contains", "not_contains", "changed_to", "changed_from", "is_empty", "is_not_empty"];
const ARRAY_OPERATORS = ["contains", "not_contains", "contains_any", "contains_all", "is_empty", "is_not_empty"];

export const CONDITIONS = [
  { value: "lead_source", label: "Lead Source", shape: "scalar", placeholder: "e.g. Website, WhatsApp, Meta Ads" },
  { value: "status", label: "Status", shape: "scalar", placeholder: "e.g. New, Ringing, Closed-Won" },
  { value: "employee", label: "Employee", shape: "scalar", placeholder: "Employee user ID" },
  { value: "city", label: "City", shape: "scalar", placeholder: "e.g. Mumbai" },
  { value: "product", label: "Product", shape: "scalar", placeholder: "e.g. Premium Plan" },
  { value: "organization", label: "Organization / Branch", shape: "scalar", placeholder: "Branch ID (optional)" },
  { value: "tags", label: "Tags", shape: "array", placeholder: "e.g. vip, hot-lead" },
];

export const OPERATORS = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "in", label: "is any of" },
  { value: "not_in", label: "is none of" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "contains_any", label: "contains any of" },
  { value: "contains_all", label: "contains all of" },
  { value: "changed_to", label: "changed to" },
  { value: "changed_from", label: "changed from" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

/** Operators available for a given condition type, in vocabulary order. */
export function operatorsForCondition(conditionType) {
  const condition = CONDITIONS.find((c) => c.value === conditionType);
  const allowed = new Set(condition?.shape === "array" ? ARRAY_OPERATORS : SCALAR_OPERATORS);
  return OPERATORS.filter((op) => allowed.has(op.value));
}

/** Whether an operator needs a value input at all. */
export function operatorNeedsValue(operator) {
  return !["is_empty", "is_not_empty"].includes(operator);
}

/** Whether an operator's value should be entered as a comma-separated list. */
export function operatorTakesMultipleValues(operator) {
  return ["in", "not_in", "contains_any", "contains_all"].includes(operator);
}

// ── Actions ──────────────────────────────────────────────────────────

/**
 * Each action's `fields[]` drives the Builder's dynamic params form.
 * `field.type` is one of: "text" | "textarea" | "number" | "select" | "tags"
 */
export const ACTIONS = [
  {
    value: "assign",
    label: "Assign",
    description: "Assign the lead to an employee using a chosen strategy.",
    fields: [
      { name: "strategy", label: "Strategy", type: "select", default: "round_robin", options: [
        { value: "round_robin", label: "Round robin" },
        { value: "workload", label: "Lowest workload" },
        { value: "specific_employee", label: "Specific employee" },
      ] },
      { name: "employeeUid", label: "Employee", type: "employee-select", showWhen: { field: "strategy", equals: "specific_employee" } },
    ],
  },
  {
    value: "reassign",
    label: "Reassign",
    description: "Reassign the lead to a different employee, with an optional reason.",
    fields: [
      { name: "strategy", label: "Strategy", type: "select", default: "round_robin", options: [
        { value: "round_robin", label: "Round robin" },
        { value: "workload", label: "Lowest workload" },
        { value: "specific_employee", label: "Specific employee" },
      ] },
      { name: "employeeUid", label: "Employee", type: "employee-select", showWhen: { field: "strategy", equals: "specific_employee" } },
      { name: "reason", label: "Reason (optional)", type: "text", placeholder: "e.g. SLA breach" },
    ],
  },
  {
    value: "reminder",
    label: "Reminder",
    description: "Schedule a follow-up task for the lead's owner.",
    fields: [
      { name: "afterMinutes", label: "Remind after (minutes)", type: "number", default: 0, min: 0, max: 43200 },
      { name: "taskType", label: "Task type", type: "select", default: "Call", options: [
        { value: "Call", label: "Call" }, { value: "WhatsApp", label: "WhatsApp" },
        { value: "Meeting", label: "Meeting" }, { value: "Email", label: "Email" }, { value: "Other", label: "Other" },
      ] },
      { name: "title", label: "Task title (optional)", type: "text", placeholder: "e.g. Follow up on {{name}}" },
    ],
  },
  {
    value: "whatsapp_template",
    label: "WhatsApp Template",
    description: "Send an approved WhatsApp template to the lead.",
    fields: [
      { name: "templateId", label: "Template", type: "whatsapp-template-select" },
      { name: "parameters", label: "Template parameters (comma-separated, supports {{field}})", type: "tags", placeholder: "e.g. {{name}}, {{city}}" },
    ],
  },
  {
    value: "email",
    label: "Email",
    description: "Send an email using the fallback email service (logs if no provider is configured).",
    fields: [
      { name: "to", label: "Send to", type: "select", default: "assignee", options: [
        { value: "lead", label: "The lead" }, { value: "assignee", label: "Assigned employee" },
        { value: "admins", label: "Organization admins" }, { value: "custom", label: "Custom address" },
      ] },
      { name: "customEmail", label: "Custom email address", type: "text", showWhen: { field: "to", equals: "custom" } },
      { name: "subject", label: "Subject", type: "text", placeholder: "e.g. New hot lead: {{name}}" },
      { name: "body", label: "Body", type: "textarea", placeholder: "Supports {{field}} placeholders, e.g. {{name}}, {{phone}}, {{status}}" },
    ],
  },
  {
    value: "activity",
    label: "Activity",
    description: "Log a note in the organization's activity feed.",
    fields: [
      { name: "text", label: "Activity text", type: "textarea", placeholder: "e.g. Workflow matched for {{name}}" },
    ],
  },
  {
    value: "escalation",
    label: "Escalation",
    description: "Notify admins (or a specific employee) about this event.",
    fields: [
      { name: "escalateTo", label: "Escalate to", type: "select", default: "admins", options: [
        { value: "admins", label: "Organization admins" },
        { value: "assignee_manager", label: "Assignee's manager (falls back to admins)" },
        { value: "specific_employee", label: "Specific employee" },
      ] },
      { name: "employeeUid", label: "Employee", type: "employee-select", showWhen: { field: "escalateTo", equals: "specific_employee" } },
      { name: "message", label: "Message", type: "textarea", placeholder: "e.g. SLA breached for {{name}}" },
    ],
  },
  {
    value: "update_status",
    label: "Update Status",
    description: "Change the lead's status.",
    fields: [
      { name: "status", label: "New status", type: "status-select" },
    ],
  },
];

export function actionFieldDefs(actionType) {
  return ACTIONS.find((a) => a.value === actionType)?.fields || [];
}

export function defaultParamsForAction(actionType) {
  const defaults = {};
  actionFieldDefs(actionType).forEach((field) => {
    if (field.default !== undefined) defaults[field.name] = field.default;
    else if (field.type === "tags") defaults[field.name] = [];
    else defaults[field.name] = "";
  });
  return defaults;
}
