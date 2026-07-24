/**
 * CORS configuration middleware.
 *
 * ARCHITECTURAL DECISION: CORS config is extracted so the allowed-origins list
 * can be tested independently and updated without touching route wiring. The
 * exact same origin-checking logic from server.js is preserved — no behavioral
 * change.
 */

import cors from "cors";
import { corsConfig } from "../config/env.js";

const allowedOrigins = new Set(corsConfig.allowedOrigins);

export function createCors() {
  return cors({
    origin(origin, callback) {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error("Origin is not allowed"));
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
}
