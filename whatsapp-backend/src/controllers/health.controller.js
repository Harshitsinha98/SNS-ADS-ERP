/**
 * Health check controller.
 *
 * ARCHITECTURAL DECISION: A dedicated health endpoint enables:
 * 1. Load balancer (Render) health probes without hitting business routes.
 * 2. Monitoring dashboards to track uptime and Firestore connectivity.
 * 3. Deployment readiness checks — new instances report healthy only after
 *    Firebase Admin SDK initialization completes.
 *
 * The endpoint is intentionally lightweight to avoid false-negative health
 * failures under high load. It verifies the Firestore connection is alive
 * without reading tenant data.
 */

import { db } from "../bootstrap/firebase.js";
import { serverConfig } from "../config/env.js";

const startedAt = new Date().toISOString();

export async function healthCheck(req, res) {
  const uptime = process.uptime();
  let firestoreOk = false;

  try {
    // Lightweight connectivity check — reads a system metadata doc
    await db.collection("systemLocks").doc("__healthcheck__").get();
    firestoreOk = true;
  } catch {
    firestoreOk = false;
  }

  const status = firestoreOk ? "healthy" : "degraded";
  const httpCode = firestoreOk ? 200 : 503;

  return res.status(httpCode).json({
    status,
    version: process.env.npm_package_version || "1.0.0",
    instance: serverConfig.instanceId,
    uptime: Math.floor(uptime),
    startedAt,
    checks: {
      firestore: firestoreOk ? "connected" : "unreachable",
    },
  });
}

/**
 * Minimal root endpoint — confirms the service is running.
 */
export function rootCheck(req, res) {
  res.type("text").send("Codeskate CRM backend is running. Multi-tenant mode is enabled.");
}
