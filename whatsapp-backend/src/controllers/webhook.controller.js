/**
 * Meta webhook controller.
 *
 * ARCHITECTURAL DECISION: Webhook verification and payload dispatch are
 * separated from WhatsApp business logic. The controller:
 * 1. Verifies the Meta signature (security boundary).
 * 2. Routes messages to processInboundMessage() and statuses to reconciliation.
 * 3. Returns appropriate HTTP codes for Meta retry semantics.
 *
 * Meta retries on 5xx, so idempotent processing (via claimInboundMessage)
 * is essential. The controller ensures the retry-friendly response contract.
 */

import crypto from "crypto";
import { metaConfig } from "../config/env.js";
import { safeEqual } from "../services/helpers.js";
import {
  processInboundMessage,
  reconcileOutboundWhatsAppStatus,
  resolveOrgId,
} from "../services/index.js";
import { logger } from "../middleware/logger.js";

/**
 * GET /webhook — Meta webhook verification (subscribe handshake).
 */
export function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && metaConfig.whatsappVerifyToken && safeEqual(token, metaConfig.whatsappVerifyToken)) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

/**
 * POST /webhook — Meta webhook payload ingestion.
 */
export async function handleWebhook(req, res) {
  const secret = metaConfig.whatsappAppSecret;
  const signature = req.headers["x-hub-signature-256"];
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");

  if (!secret || !signature) {
    return res.status(503).json({ error: "Webhook signature verification is not configured" });
  }

  const expected = `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
  if (!safeEqual(expected, signature)) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  try {
    const payload = JSON.parse(raw.toString("utf8") || "{}");
    const entryCount = Array.isArray(payload.entry) ? payload.entry.length : 0;
    const changeCount = (payload.entry || []).reduce(
      (count, entry) => count + (entry.changes || []).length, 0
    );
    logger.info({ entryCount, changeCount }, "WhatsApp webhook received");

    const results = [];
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const orgId = await resolveOrgId(value.metadata?.phone_number_id);
        if (!orgId) {
          logger.warn(
            { phoneNumberId: value.metadata?.phone_number_id || "missing" },
            "Dropped WhatsApp event for unknown phone_number_id"
          );
          continue;
        }
        const contactsById = new Map(
          (value.contacts || []).map((contact) => [contact.wa_id, contact])
        );
        for (const message of value.messages || []) {
          const contact = contactsById.get(message.from) || value.contacts?.[0];
          results.push(await processInboundMessage({ orgId, message, contact }));
        }
        for (const status of value.statuses || []) {
          results.push(await reconcileOutboundWhatsAppStatus(orgId, status));
        }
      }
    }
    return res.status(200).json({ ok: true, processed: results.length });
  } catch (error) {
    logger.error({ err: error }, "WhatsApp webhook error");
    // Meta retries 5xx responses; all processing is idempotent by message ID.
    return res.status(500).json({ error: "Temporary webhook processing failure" });
  }
}
