/**
 * Distributed lease / lock service.
 *
 * ARCHITECTURAL DECISION: The `withLease` pattern was embedded inside server.js
 * but is fundamental infrastructure used by cron jobs, queue workers, and admin
 * triggers. Extracting it into a dedicated service:
 * 1. Enables unit testing of locking behavior without Express.
 * 2. Makes the lease TTL, renewal cadence, and release semantics explicit.
 * 3. Allows future migration to Redis-based locking without touching callers.
 *
 * The lease prevents duplicate processing in multi-instance deployments
 * (Render auto-scaling). It uses Firestore transactions for distributed
 * consensus with automatic renewal to prevent premature expiry on long tasks.
 */

import crypto from "crypto";
import { db } from "../bootstrap/firebase.js";
import { serverConfig } from "../config/env.js";
import { nowIso } from "./helpers.js";
import { logger } from "../middleware/logger.js";

/**
 * Acquire a named lease, execute `work`, then release.
 * Returns null if the lease is already held by another process.
 *
 * @param {string} name - Unique lease name
 * @param {number} ttlMs - Time-to-live in milliseconds
 * @param {Function} work - Async function to execute while holding the lease
 * @returns {*} Result of `work()`, or null if lease was not acquired
 */
export async function withLease(name, ttlMs, work) {
  const ref = db.collection("systemLocks").doc(name);
  const holder = `${serverConfig.instanceId}:${crypto.randomUUID()}`;

  const acquired = await db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    const now = Date.now();
    if (current.exists && current.data().expiresAtMs > now) return false;
    tx.set(ref, {
      holder,
      acquiredAt: nowIso(),
      expiresAtMs: now + ttlMs,
    }, { merge: true });
    return true;
  });

  if (!acquired) return null;

  const renew = () =>
    db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (current.exists && current.data().holder === holder) {
        tx.update(ref, { expiresAtMs: Date.now() + ttlMs, renewedAt: nowIso() });
      }
    });

  const renewalTimer = setInterval(() => {
    renew().catch((error) =>
      logger.warn({ lease: name, error: error.message }, "Could not renew lease")
    );
  }, Math.max(1000, Math.floor(ttlMs / 2)));

  try {
    return await work();
  } finally {
    clearInterval(renewalTimer);
    await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (current.exists && current.data().holder === holder) {
        tx.update(ref, { expiresAtMs: 0, releasedAt: nowIso() });
      }
    }).catch((error) =>
      logger.warn({ lease: name, error: error.message }, "Could not release lease")
    );
  }
}
