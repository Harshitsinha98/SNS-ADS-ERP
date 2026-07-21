/**
 * Request ID middleware.
 *
 * ARCHITECTURAL DECISION: Every inbound request receives a unique correlation
 * ID. This ID propagates into Pino log lines, error responses, and downstream
 * service calls so that a single user-reported error can be traced across the
 * entire request lifecycle without searching by timestamp.
 *
 * If the reverse proxy (Render/Vercel) already injects an ID header, we reuse
 * it to avoid fragmenting traces across infrastructure boundaries.
 */

import { v4 as uuidv4 } from "uuid";

const HEADER_NAME = "x-request-id";

export function requestId() {
  return (req, res, next) => {
    const id = req.headers[HEADER_NAME] || uuidv4();
    req.id = id;
    res.setHeader(HEADER_NAME, id);
    next();
  };
}
