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
      // and any allow-listed origin. For disallowed origins return `false`
      // (clean CORS rejection) rather than throwing — a thrown Error surfaces
      // as HTTP 500, which broke OTP/login requests coming from the Capacitor
      // native app (Origin: https://localhost).
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
}
