/**
 * Pino structured logging middleware.
 *
 * ARCHITECTURAL DECISION: Replacing console.log/console.error with Pino gives:
 * 1. Structured JSON logs parseable by Render/CloudWatch/Datadog log ingestors.
 * 2. Automatic request-level context (method, url, status, duration, requestId).
 * 3. Configurable log levels per environment (debug in dev, info in prod).
 * 4. Child loggers on `req.log` for request-scoped context without threading.
 *
 * We keep pino-http as the Express-level integration and export a standalone
 * `logger` for background jobs (cron, queue workers) that have no request.
 */

import pino from "pino";
import pinoHttp from "pino-http";
import { serverConfig } from "../config/env.js";

export const logger = pino({
  level: process.env.LOG_LEVEL || (serverConfig.isProduction ? "info" : "debug"),
  ...(serverConfig.isProduction
    ? {}
    : { transport: { target: "pino/file", options: { destination: 1 } } }),
  base: { service: "codeskate-crm", instance: serverConfig.instanceId },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

/**
 * Express middleware that attaches `req.log` (child logger with requestId)
 * and logs request completion with status/duration.
 */
export function httpLogger() {
  return pinoHttp({
    logger,
    genReqId: (req) => req.id, // Uses ID from requestId middleware
    customLogLevel(req, res, err) {
      if (res.statusCode >= 500 || err) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    customSuccessMessage(req, res) {
      return `${req.method} ${req.url} ${res.statusCode}`;
    },
    customErrorMessage(req, res) {
      return `${req.method} ${req.url} ${res.statusCode}`;
    },
    // Redact sensitive headers from log output
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url,
          remoteAddress: req.remoteAddress,
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  });
}
