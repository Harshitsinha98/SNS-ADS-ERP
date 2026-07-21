/**
 * Global error handler middleware.
 *
 * ARCHITECTURAL DECISION: A centralized error handler provides:
 * 1. Consistent error response shape (`{ error, requestId, code? }`) for all
 *    API consumers — frontend and webhook callers get predictable JSON.
 * 2. Structured logging of unhandled errors with full stack traces in
 *    production logs without leaking internals to clients.
 * 3. A single place to add error reporting (Sentry, Bugsnag) later.
 * 4. Automatic status code extraction from errors that set `.status`.
 *
 * Express requires the 4-arity signature `(err, req, res, next)` to recognize
 * this as an error-handling middleware.
 */

import { logger } from "./logger.js";

export function globalErrorHandler() {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    const message = status < 500
      ? (err.message || "Request failed")
      : "Internal server error";

    // Log full error details server-side
    const logPayload = {
      err,
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      status,
    };

    if (status >= 500) {
      (req.log || logger).error(logPayload, "Unhandled server error");
    } else {
      (req.log || logger).warn(logPayload, "Client error");
    }

    // Never leak stack traces or internal messages to the client in production
    const response = {
      error: message,
      requestId: req.id || null,
    };

    if (err.code) response.code = err.code;

    // Zod validation errors get special treatment
    if (err.name === "ZodError" && err.issues) {
      response.error = "Validation failed";
      response.details = err.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      return res.status(400).json(response);
    }

    return res.status(status).json(response);
  };
}
