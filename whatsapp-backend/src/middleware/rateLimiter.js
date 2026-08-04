/**
 * In-memory sliding-window rate limiter middleware.
 *
 * Zero external dependencies — suitable for single-instance deployments (Render
 * free/starter). For multi-instance scaling, swap to a Redis-backed store.
 *
 * SECURITY PURPOSE: Prevents distributed OTP spam attacks where a bot sends
 * requests from a single IP to many different phone numbers, racking up
 * WhatsApp/Plivo charges. The per-number limit in otpService protects per
 * recipient; THIS protects the platform from cost abuse per source.
 *
 * Automatic cleanup runs every 5 minutes to prevent memory leaks.
 */

const stores = new Map(); // key → { hits: [timestamps], blockedUntil }

function getStore(namespace) {
  if (!stores.has(namespace)) stores.set(namespace, new Map());
  return stores.get(namespace);
}

// Periodic cleanup: remove entries older than their window + 1 minute.
setInterval(() => {
  const now = Date.now();
  for (const [, store] of stores) {
    for (const [key, entry] of store) {
      // If all hits are stale and not blocked, evict.
      const freshHits = entry.hits.filter((t) => t > now - 3600_000);
      if (freshHits.length === 0 && (!entry.blockedUntil || entry.blockedUntil < now)) {
        store.delete(key);
      }
    }
  }
}, 5 * 60_000);

/**
 * Create a rate-limiting middleware.
 *
 * @param {object} opts
 * @param {string} opts.namespace   Unique name for this limiter's store.
 * @param {number} opts.windowMs    Sliding window duration in ms.
 * @param {number} opts.max         Max requests allowed per window.
 * @param {function} [opts.keyFn]   Extracts the rate-limit key from req (default: IP).
 * @param {string} [opts.message]   Error message on limit exceeded.
 * @param {number} [opts.blockMs]   Optional: block the key for this many ms after exceeding.
 */
export function createRateLimiter({
  namespace,
  windowMs,
  max,
  keyFn = (req) => req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "unknown",
  message = "Too many requests. Please try again later.",
  blockMs = 0,
} = {}) {
  const store = getStore(namespace);

  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    let entry = store.get(key);

    if (!entry) {
      entry = { hits: [], blockedUntil: 0 };
      store.set(key, entry);
    }

    // Check if actively blocked.
    if (entry.blockedUntil && now < entry.blockedUntil) {
      const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({ error: message, retryAfter });
    }

    // Slide the window — keep only recent hits.
    entry.hits = entry.hits.filter((t) => t > now - windowMs);

    if (entry.hits.length >= max) {
      if (blockMs > 0) entry.blockedUntil = now + blockMs;
      const retryAfter = Math.ceil(windowMs / 1000);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({ error: message, retryAfter });
    }

    entry.hits.push(now);
    next();
  };
}
