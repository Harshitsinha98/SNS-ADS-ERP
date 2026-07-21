/**
 * Zod validation middleware factory.
 *
 * ARCHITECTURAL DECISION: Validation logic is decoupled from route handlers
 * using a generic middleware factory. Each route declares its expected input
 * shape via a Zod schema; this middleware parses the request body (or query/params)
 * and either attaches the validated data to `req.validated` or short-circuits
 * with a structured 400 response.
 *
 * Benefits:
 * 1. Route handlers always receive pre-validated data — no inline checks.
 * 2. Schema definitions are reusable for documentation generation (OpenAPI).
 * 3. Type coercion (string → number) happens before business logic.
 */

export function validate(schema, source = "body") {
  return (req, res, next) => {
    const data = source === "body" ? req.body
      : source === "query" ? req.query
      : source === "params" ? req.params
      : req.body;

    const result = schema.safeParse(data);
    if (!result.success) {
      return res.status(400).json({
        error: "Validation failed",
        requestId: req.id || null,
        details: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    // Attach parsed (coerced/defaulted) data
    req.validated = result.data;
    return next();
  };
}
