/**
 * Escalation Service.
 *
 * Checks for active chat sessions where the assigned employee has NOT replied
 * within 3 minutes. Notifies all org admins so they can intervene or reassign.
 *
 * Runs as a cron job every minute (server.js).
 */

import { db } from "../bootstrap/firebase.js";
import { nowIso, orgCollection } from "./helpers.js";
import { logger } from "../middleware/logger.js";

const ESCALATION_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Scan all organizations for active sessions that have breached the 3-minute SLA.
 * For each breached session, notify admins (once — uses an `escalatedAt` flag on the session).
 */
export async function runEscalationCheck() {
  const now = Date.now();
  const threshold = now - ESCALATION_THRESHOLD_MS;

  // Find all active chat sessions started more than 3 minutes ago that haven't been escalated yet
  const orgsSnap = await db.collection("organizations").get();
  let escalated = 0;

  for (const orgDoc of orgsSnap.docs) {
    const orgId = orgDoc.id;
    try {
      // Get all leads with active chat sessions
      const leadsSnap = await db.collection("organizations").doc(orgId).collection("leads")
        .where("aiEnabled", "==", false)
        .where("activeChatSessionEmployee", "!=", null)
        .get();

      for (const leadDoc of leadsSnap.docs) {
        const lead = leadDoc.data();
        const leadId = leadDoc.id;

        // Get the active session
        const sessionsSnap = await orgCollection(db, orgId, "leads").doc(leadId)
          .collection("chatSessions")
          .where("status", "==", "active")
          .limit(1)
          .get();

        if (sessionsSnap.empty) continue;

        const session = sessionsSnap.docs[0].data();
        const sessionId = sessionsSnap.docs[0].id;

        // Skip if already escalated or session is too new
        if (session.escalatedAt) continue;
        if ((session.startedAtMs || 0) > threshold) continue;

        // Check if employee has replied (any outbound message after session start that's NOT from AI)
        const repliesSnap = await orgCollection(db, orgId, "leads").doc(leadId)
          .collection("messages")
          .where("direction", "==", "outbound")
          .where("atMs", ">=", session.startedAtMs)
          .limit(5)
          .get();

        const hasEmployeeReply = repliesSnap.docs.some((d) => {
          const msg = d.data();
          return msg.source !== "ai_customer_care" && msg.source !== "ai";
        });

        if (hasEmployeeReply) continue;

        // ── Employee hasn't replied in 3+ minutes — ESCALATE ──

        // Mark session as escalated (so we don't notify again)
        await sessionsSnap.docs[0].ref.update({
          escalatedAt: nowIso(),
          escalatedAtMs: now,
        });

        // Find all admins/owners in this org
        const membersSnap = await db.collection("memberships")
          .where("orgId", "==", orgId)
          .where("active", "==", true)
          .get();

        const admins = membersSnap.docs
          .map((d) => d.data())
          .filter((m) => m.role === "owner" || m.role === "admin");

        const leadName = lead.name || lead.phone || "Customer";
        const employeeName = session.employeeName || "Agent";

        // Create notification for each admin
        for (const admin of admins) {
          await orgCollection(db, orgId, "notifications").add({
            userId: admin.uid,
            type: "escalation_alert",
            title: "Response Overdue",
            text: `${employeeName} hasn't replied to ${leadName} in 3+ minutes. Chat may need reassignment.`,
            leadId,
            sessionId,
            employeeId: session.employeeId,
            read: false,
            at: nowIso(),
            atMs: Date.now(),
            orgId,
          });
        }

        escalated++;
        logger.info({ orgId, leadId, sessionId, employeeId: session.employeeId }, "Session escalated — admin notified");
      }
    } catch (err) {
      logger.warn({ orgId, err: err.message }, "Escalation check failed for org");
    }
  }

  return { escalated };
}
