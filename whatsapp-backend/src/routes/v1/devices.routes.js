/**
 * Mobile device registration for push notifications.
 *
 * POST /api/v1/devices/register    { token, platform: "android"|"ios", appVersion?, orgId? }
 * POST /api/v1/devices/unregister  { token }
 */

import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { registerDevice, unregisterDevice } from "../../services/pushNotifications.js";

export function createDeviceRoutes() {
  const router = Router();

  router.post("/register", requireAuth, async (req, res) => {
    try {
      const { token, platform, appVersion, orgId } = req.body || {};
      const result = await registerDevice({ uid: req.authUser.uid, token, platform, appVersion, orgId });
      res.json(result);
    } catch (error) {
      res.status(error.status || 500).json({ error: error.status ? error.message : "Could not register device." });
    }
  });

  router.post("/unregister", requireAuth, async (req, res) => {
    try {
      res.json(await unregisterDevice({ uid: req.authUser.uid, token: req.body?.token }));
    } catch {
      res.status(500).json({ error: "Could not unregister device." });
    }
  });

  return router;
}
