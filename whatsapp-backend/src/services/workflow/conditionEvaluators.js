/**
 * Condition Evaluator Registry.
 *
 * ARCHITECTURAL DECISION: Every condition type maps to one pure function
 * `(entityValue, operator, conditionValue, ctx) => boolean` in
 * `CONDITION_FIELD_RESOLVERS` (which field on the entity a condition type
 * reads) + `OPERATOR_EVALUATORS` (how an operator compares that field to the
 * condition's configured value). This two-axis design means:
 *
 * 1. Adding a new CONDITION TYPE (e.g. "campaign") = add one line to
 *    CONDITION_FIELD_RESOLVERS. No new operator logic needed.
 * 2. Adding a new OPERATOR (e.g. "greater_than") = add one line to
 *    OPERATOR_EVALUATORS. It instantly works for every condition type.
 * 3. No `if (type === "lead_source")` branches anywhere in the engine —
 *    satisfies the "no hardcoded workflows" requirement at the condition
 *    layer specifically.
 *
 * `ctx.previousEntity` (the entity's state *before* the triggering change)
 * powers the `changed_to`/`changed_from` operators, used for e.g. "when
 * Status changes to Closed-Won".
 */

// ─── Field resolvers: condition type → value(s) on the entity ──────

const CONDITION_FIELD_RESOLVERS = {
  lead_source: (entity) => entity.source ?? null,
  status: (entity) => entity.status ?? null,
  employee: (entity) => entity.assignedTo ?? null,
  city: (entity) => entity.city ?? null,
  product: (entity) => entity.product ?? null,
  // Multi-branch tenants may tag entities with a branchId; single-branch
  // tenants simply never set it, so this condition is a no-op for them
  // (see OPERATOR_EVALUATORS.is_empty defaulting to true on undefined).
  organization: (entity) => entity.branchId ?? null,
  tags: (entity) => (Array.isArray(entity.tags) ? entity.tags : []),
  // AI Customer Care: intent detected by AI classification
  ai_intent: (entity) => entity.aiIntent ?? null,
};

export const CONDITION_TYPES = Object.freeze(Object.keys(CONDITION_FIELD_RESOLVERS));

function previousFieldValue(type, ctx) {
  if (!ctx?.previousEntity) return undefined;
  const resolver = CONDITION_FIELD_RESOLVERS[type];
  return resolver ? resolver(ctx.previousEntity) : undefined;
}

// ─── Operator evaluators: operator → comparison logic ──────────────

function toArray(value) {
  return Array.isArray(value) ? value : [value];
}
function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

const OPERATOR_EVALUATORS = {
  equals: (fieldValue, conditionValue) => normalize(fieldValue) === normalize(conditionValue),
  not_equals: (fieldValue, conditionValue) => normalize(fieldValue) !== normalize(conditionValue),

  in: (fieldValue, conditionValue) => toArray(conditionValue).map(normalize).includes(normalize(fieldValue)),
  not_in: (fieldValue, conditionValue) => !toArray(conditionValue).map(normalize).includes(normalize(fieldValue)),

  // "contains" on a scalar field = substring match; on an array field
  // (e.g. tags) = membership match. Same operator name, resolved by shape.
  contains: (fieldValue, conditionValue) => Array.isArray(fieldValue)
    ? fieldValue.map(normalize).includes(normalize(conditionValue))
    : normalize(fieldValue).includes(normalize(conditionValue)),
  not_contains: (fieldValue, conditionValue) => !OPERATOR_EVALUATORS.contains(fieldValue, conditionValue),

  contains_any: (fieldValue, conditionValue) => {
    const haystack = new Set(toArray(fieldValue).map(normalize));
    return toArray(conditionValue).some((needle) => haystack.has(normalize(needle)));
  },
  contains_all: (fieldValue, conditionValue) => {
    const haystack = new Set(toArray(fieldValue).map(normalize));
    return toArray(conditionValue).every((needle) => haystack.has(normalize(needle)));
  },

  changed_to: (fieldValue, conditionValue, ctx, previousValue) =>
    normalize(fieldValue) === normalize(conditionValue) && normalize(previousValue) !== normalize(conditionValue),
  changed_from: (fieldValue, conditionValue, ctx, previousValue) =>
    normalize(previousValue) === normalize(conditionValue) && normalize(fieldValue) !== normalize(conditionValue),

  is_empty: (fieldValue) => Array.isArray(fieldValue) ? fieldValue.length === 0 : !fieldValue,
  is_not_empty: (fieldValue) => Array.isArray(fieldValue) ? fieldValue.length > 0 : Boolean(fieldValue),
};

export const OPERATOR_TYPES = Object.freeze(Object.keys(OPERATOR_EVALUATORS));

/**
 * Evaluate a single condition against the triggering entity.
 * Unknown condition types or operators fail closed (return false) rather
 * than throwing, so a workflow authored against a not-yet-deployed
 * type/operator never accidentally matches every event.
 */
export function evaluateCondition(condition, entity, ctx = {}) {
  const resolveField = CONDITION_FIELD_RESOLVERS[condition.type];
  const evaluateOperator = OPERATOR_EVALUATORS[condition.operator];
  if (!resolveField || !evaluateOperator) return false;

  const fieldValue = resolveField(entity);
  const previousValue = previousFieldValue(condition.type, ctx);
  return Boolean(evaluateOperator(fieldValue, condition.value, ctx, previousValue));
}

/**
 * Evaluate an entire condition set with ALL (AND) / ANY (OR) logic.
 * An empty condition array always matches — a workflow with zero
 * conditions is intentionally "match every event of this trigger type".
 * Returns per-condition pass/fail detail for the run-log/test-run UI.
 */
export function evaluateConditionSet({ conditionLogic = "ALL", conditions = [] }, entity, ctx = {}) {
  if (conditions.length === 0) return { matched: true, results: [] };

  const results = conditions.map((condition) => ({
    condition,
    passed: evaluateCondition(condition, entity, ctx),
  }));

  const matched = conditionLogic === "ANY"
    ? results.some((r) => r.passed)
    : results.every((r) => r.passed);

  return { matched, results };
}
