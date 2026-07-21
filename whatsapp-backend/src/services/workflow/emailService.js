/**
 * Workflow Email Service.
 *
 * ARCHITECTURAL DECISION: This codebase has no email provider configured
 * today (grep confirms no nodemailer/SendGrid/SES usage anywhere outside an
 * unimplemented planning doc). Rather than either (a) skipping the Email
 * action entirely or (b) hard-coding a specific provider's SDK as a new
 * required dependency, this service:
 *
 * 1. Defines a minimal provider interface (`send({ to, subject, body })`).
 * 2. Ships a "log" provider by default that writes the would-be email into
 *    Firestore (`organizations/{orgId}/emailOutbox`) and logs it — so
 *    Email actions are visible/auditable/testable today with zero new infra.
 * 3. Auto-upgrades to a real provider the moment its env vars are present,
 *    with no changes required to actionExecutors.js or the schema.
 *
 * To wire a real provider later: implement `sendViaSmtp()` /
 * `sendViaSendgrid()` below using whatever SDK is added to package.json,
 * and set the corresponding env vars. Nothing else in the engine changes.
 */

import { db } from "../../bootstrap/firebase.js";
import { orgCollection, nowIso, safeDocId } from "../helpers.js";
import { logger } from "../../middleware/logger.js";

function emailProviderConfig() {
  return {
    sendgridApiKey: process.env.SENDGRID_API_KEY || "",
    smtpHost: process.env.SMTP_HOST || "",
  };
}

async function sendViaLog({ to, subject, body, orgId }) {
  const at = nowIso();
  const outboxRef = orgCollection(db, orgId, "emailOutbox").doc(safeDocId(`${at}_${to.join(",")}`));
  await outboxRef.set({
    to, subject, body, orgId,
    status: "logged",
    createdAt: at,
    note: "No email provider configured — recorded for audit instead of sent. Configure SENDGRID_API_KEY or SMTP_HOST to enable delivery.",
  });
  logger.info({ to, subject, orgId }, "Workflow email logged (no provider configured)");
  return { ok: true, provider: "log" };
}

// Placeholder seam for a real provider. Intentionally unimplemented until a
// provider dependency is added — calling it today returns a clear error
// rather than silently failing or crashing the process on a missing SDK.
async function sendViaSendgrid(/* { to, subject, body } */) {
  throw new Error("SENDGRID_API_KEY is set but the SendGrid SDK integration has not been implemented yet");
}

async function sendViaSmtp(/* { to, subject, body } */) {
  throw new Error("SMTP_HOST is set but the SMTP integration has not been implemented yet");
}

/**
 * Send (or log) a workflow-triggered email. Never throws — returns
 * `{ ok, provider }` or `{ ok: false, error }` so actionExecutors.js can
 * record a clean partial-failure in the run log.
 */
export async function sendWorkflowEmail({ to, subject, body, orgId }) {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (recipients.length === 0) return { ok: false, error: "No recipients supplied" };

  const config = emailProviderConfig();
  try {
    if (config.sendgridApiKey) return await sendViaSendgrid({ to: recipients, subject, body, orgId });
    if (config.smtpHost) return await sendViaSmtp({ to: recipients, subject, body, orgId });
    return await sendViaLog({ to: recipients, subject, body, orgId });
  } catch (error) {
    logger.error({ err: error, orgId }, "Workflow email send failed");
    return { ok: false, error: error.message || "Email delivery failed" };
  }
}
