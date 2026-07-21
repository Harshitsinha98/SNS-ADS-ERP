/**
 * Health check routes (v1).
 */

import { Router } from "express";
import { healthCheck } from "../../controllers/index.js";

export function createHealthRoutes() {
  const router = Router();

  router.get("/health", healthCheck);

  return router;
}
