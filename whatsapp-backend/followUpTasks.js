import express from "express";
import { getAuth } from "firebase-admin/auth";

const TASK_TYPES = new Set(["Call", "WhatsApp", "Meeting", "Email", "Other"]);
const TASK_OUTCOMES = new Set(["Connected", "No answer", "Follow-up required", "Meeting fixed", "Closed-won", "Lost"]);
const CLOSED_STATUSES = new Set(["Closed-Won", "Lost"]);
const MIN_FOLLOW_UP_LEAD_TIME_MS = 5 * 60 * 1000;

const nowIso = () => new Date().toISOString();
const trimText = (value, length = 300) => String(value || "").trim().slice(0, length);
const safeDocId = (value) => String(value || "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 140);
const orgCollection = (db, orgId, name) => db.collection("organizations").doc(orgId).collection(name);

function parseFutureDate(value, label) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) {
    throw Object.assign(new Error(`${label} is required`), { status: 400 });
  }
  if (date.getTime() <= Date.now() + MIN_FOLLOW_UP_LEAD_TIME_MS) {
    throw Object.assign(new Error("Follow-up date and time must be at least five minutes in the future"), { status: 400 });
  }
  if (date.getTime() > Date.now() + 5 * 365 * 24 * 60 * 60 * 1000) {
    throw Object.assign(new Error(`${label} is too far in the future`), { status: 400 });
  }
  return date.toISOString();
}

function taskForLeadRef(db, orgId, leadId) {
  // A lead has one current open follow-up. Completion history is retained in
  // immutable lead notes/activity, while rescheduling updates this live queue item.
  return orgCollection(db, orgId, "followUpTasks").doc(safeDocId(leadId));
}

export default function createFollowUpTasksRouter(db) {
  const router = express.Router();

  async function requireAuth(req, res, next) {
    try {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      if (!token) return res.status(401).json({ error: "Missing auth token" });
      req.authUser = await getAuth().verifyIdToken(token);
      return next();
    } catch {
      return res.status(401).json({ error: "Invalid auth token" });
    }
  }

  async function activeMembership(uid, orgId) {
    if (!uid || !orgId) return null;
    const snap = await db.collection("memberships").doc(`${uid}_${orgId}`).get();
    return snap.exists && snap.data().active === true ? snap.data() : null;
  }

  router.post("/schedule", requireAuth, async (req, res) => {
    try {
      const orgId = trimText(req.body?.orgId, 140);
      const leadId = trimText(req.body?.leadId, 140);
      const dueAt = parseFutureDate(req.body?.dueAt, "Follow-up date and time");
      const type = TASK_TYPES.has(req.body?.type) ? req.body.type : "Call";
      const title = trimText(req.body?.title, 180) || `${type} follow-up`;
      if (!orgId || !leadId) return res.status(400).json({ error: "Organization and lead are required" });

      const actorMembership = await activeMembership(req.authUser.uid, orgId);
      if (!actorMembership) return res.status(403).json({ error: "Active organization membership required" });
      const isAdmin = actorMembership.role === "owner" || actorMembership.role === "admin";
      const requestedAssigneeId = trimText(req.body?.assignedTo, 140);
      const leadRef = orgCollection(db, orgId, "leads").doc(leadId);
      const taskRef = taskForLeadRef(db, orgId, leadId);
      const noteRef = leadRef.collection("notes").doc();
      const activityRef = orgCollection(db, orgId, "activity").doc();
      const notificationRef = orgCollection(db, orgId, "notifications").doc();
      const createdAt = nowIso();

      const task = await db.runTransaction(async (tx) => {
        const leadSnap = await tx.get(leadRef);
        if (!leadSnap.exists) throw Object.assign(new Error("Lead not found"), { status: 404 });
        const lead = leadSnap.data();
        if (lead.blacklisted || CLOSED_STATUSES.has(lead.status)) {
          throw Object.assign(new Error("Closed or lost leads cannot receive follow-up tasks"), { status: 409 });
        }

        const assignedTo = isAdmin && requestedAssigneeId ? requestedAssigneeId : lead.assignedTo;
        if (!assignedTo) throw Object.assign(new Error("Assign this lead before scheduling a follow-up"), { status: 409 });
        if (!isAdmin && lead.assignedTo !== req.authUser.uid) {
          throw Object.assign(new Error("This lead is not assigned to you"), { status: 403 });
        }
        if (!isAdmin && assignedTo !== req.authUser.uid) {
          throw Object.assign(new Error("Employees can schedule follow-ups only for themselves"), { status: 403 });
        }

        const assigneeMembership = await tx.get(db.collection("memberships").doc(`${assignedTo}_${orgId}`));
        if (!assigneeMembership.exists || assigneeMembership.data().active !== true) {
          throw Object.assign(new Error("Choose an active team member"), { status: 409 });
        }
        const assignee = assigneeMembership.data();
        const assignedToName = assignee.displayName || lead.assignedToName || "Team member";
        const currentTask = await tx.get(taskRef);
        const previousTask = currentTask.exists ? currentTask.data() : null;
        const dueUnchanged = previousTask?.status === "open" && previousTask?.dueAt === dueAt;
        const initialAutomationNextAt = new Date(Math.max(Date.now(), Date.parse(dueAt) - 24 * 60 * 60 * 1000)).toISOString();
        const taskData = {
          orgId,
          leadId,
          leadName: lead.name || "Lead",
          leadPhone: lead.phone || "",
          assignedTo,
          assignedToName,
          type,
          title,
          priority: lead.priority || "Warm",
          dueAt,
          status: "open",
          createdBy: req.authUser.uid,
          createdByName: actorMembership.displayName || req.authUser.name || "Team member",
          createdAt: previousTask?.createdAt || createdAt,
          updatedAt: createdAt,
          reminderSentFor: dueUnchanged ? previousTask.reminderSentFor || null : null,
          reminderSentAt: dueUnchanged ? previousTask.reminderSentAt || null : null,
          overdueEscalatedFor: dueUnchanged ? previousTask.overdueEscalatedFor || null : null,
          overdueEscalatedAt: dueUnchanged ? previousTask.overdueEscalatedAt || null : null,
          automationNextAt: dueUnchanged ? previousTask.automationNextAt || initialAutomationNextAt : initialAutomationNextAt,
          completedAt: null,
          completedBy: null,
          completedByName: null,
          outcome: null,
          completionNote: null,
          revision: Number(currentTask.data()?.revision || 0) + 1,
        };
        tx.set(taskRef, taskData, { merge: false });
        tx.update(leadRef, {
          followUp: dueAt,
          lastUpdated: createdAt,
          assignedTo,
          assignedToName,
        });
        tx.create(noteRef, {
          type: "worknote",
          text: `${type} follow-up scheduled for ${new Date(dueAt).toLocaleString("en-IN")}${title !== `${type} follow-up` ? ` — ${title}` : ""}.`,
          authorId: req.authUser.uid,
          authorName: actorMembership.displayName || req.authUser.name || "Team member",
          authorRole: actorMembership.role,
          visibility: "team",
          at: createdAt,
        });
        tx.create(activityRef, {
          text: `Follow-up scheduled: ${lead.name || leadId} → ${assignedToName} (${type}, ${new Date(dueAt).toLocaleString("en-IN")})`,
          at: createdAt,
          orgId,
          actorId: req.authUser.uid,
          leadId,
          taskId: taskRef.id,
          source: "follow_up",
        });
        if (assignedTo !== req.authUser.uid) {
          tx.create(notificationRef, {
            userId: assignedTo,
            text: `${type} follow-up due ${new Date(dueAt).toLocaleString("en-IN")}: ${lead.name || "Lead"}`,
            type: "follow_up",
            read: false,
            at: createdAt,
            orgId,
            leadId,
            taskId: taskRef.id,
          });
        }
        return { id: taskRef.id, ...taskData };
      });
      return res.status(201).json({ ok: true, task });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || "Could not schedule follow-up" });
    }
  });

  router.post("/:taskId/complete", requireAuth, async (req, res) => {
    try {
      const orgId = trimText(req.body?.orgId, 140);
      const taskId = safeDocId(req.params.taskId);
      const outcome = TASK_OUTCOMES.has(req.body?.outcome) ? req.body.outcome : "Connected";
      const completionNote = trimText(req.body?.note, 1600);
      const nextDueAt = req.body?.nextDueAt ? parseFutureDate(req.body.nextDueAt, "Next follow-up date and time") : null;
      const expectedRevision = Number(req.body?.expectedRevision);
      if (!orgId || !taskId) return res.status(400).json({ error: "Organization and task are required" });
      if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
        return res.status(400).json({ error: "A current follow-up task revision is required" });
      }

      const actorMembership = await activeMembership(req.authUser.uid, orgId);
      if (!actorMembership) return res.status(403).json({ error: "Active organization membership required" });
      const isAdmin = actorMembership.role === "owner" || actorMembership.role === "admin";
      const taskRef = orgCollection(db, orgId, "followUpTasks").doc(taskId);
      const completedAt = nowIso();

      const result = await db.runTransaction(async (tx) => {
        const taskSnap = await tx.get(taskRef);
        if (!taskSnap.exists) throw Object.assign(new Error("Follow-up task not found"), { status: 404 });
        const task = taskSnap.data();
        const currentRevision = Number(task.revision || 1);
        if (task.status !== "open") throw Object.assign(new Error("This follow-up is already completed"), { status: 409 });
        if (currentRevision !== expectedRevision) {
          throw Object.assign(new Error("This follow-up changed. Refresh the task before completing it."), { status: 409 });
        }
        if (!isAdmin && task.assignedTo !== req.authUser.uid) {
          throw Object.assign(new Error("This follow-up is not assigned to you"), { status: 403 });
        }

        const leadRef = orgCollection(db, orgId, "leads").doc(task.leadId);
        const [leadSnap, settingsSnap] = await Promise.all([
          tx.get(leadRef),
          tx.get(orgCollection(db, orgId, "settings").doc("config")),
        ]);
        if (!leadSnap.exists) throw Object.assign(new Error("Lead not found"), { status: 404 });
        const lead = leadSnap.data();
        const statuses = settingsSnap.data()?.statuses || ["New", "Ringing", "Meeting Fixed", "Negotiation", "Follow-up", "Closed-Won", "Lost"];
        const requestedStatus = trimText(req.body?.leadStatus, 80);
        const outcomeStatus = outcome === "Closed-won" ? "Closed-Won" : outcome === "Lost" ? "Lost" : null;
        if (outcomeStatus && requestedStatus && requestedStatus !== outcomeStatus) {
          throw Object.assign(new Error(`${outcome} must set the lead status to ${outcomeStatus}`), { status: 400 });
        }
        if (outcomeStatus && nextDueAt) {
          throw Object.assign(new Error(`${outcome} cannot have a next follow-up`), { status: 400 });
        }
        const leadStatus = outcomeStatus || (statuses.includes(requestedStatus) ? requestedStatus : lead.status);
        if (CLOSED_STATUSES.has(leadStatus) && !outcomeStatus) {
          throw Object.assign(new Error("Choose the matching Closed-won or Lost outcome before closing a lead"), { status: 400 });
        }
        if (CLOSED_STATUSES.has(leadStatus) && nextDueAt) {
          throw Object.assign(new Error("Closed leads cannot have a next follow-up"), { status: 400 });
        }
        if (!isAdmin && lead.assignedTo !== req.authUser.uid) {
          throw Object.assign(new Error("This lead is no longer assigned to you"), { status: 403 });
        }
        const noteRef = leadRef.collection("notes").doc();
        const activityRef = orgCollection(db, orgId, "activity").doc();
        const actorName = actorMembership.displayName || req.authUser.name || "Team member";
        const noteParts = [`Follow-up completed — ${outcome}.`];
        if (completionNote) noteParts.push(completionNote);
        if (nextDueAt) noteParts.push(`Next follow-up scheduled for ${new Date(nextDueAt).toLocaleString("en-IN")}.`);

        if (nextDueAt && !CLOSED_STATUSES.has(leadStatus)) {
          tx.set(taskRef, {
            ...task,
            status: "open",
            dueAt: nextDueAt,
            updatedAt: completedAt,
            rescheduledAt: completedAt,
            lastOutcome: outcome,
            lastCompletedAt: completedAt,
            lastCompletedBy: req.authUser.uid,
            lastCompletionNote: completionNote || null,
            revision: currentRevision + 1,
            reminderSentFor: null,
            reminderSentAt: null,
            overdueEscalatedFor: null,
            overdueEscalatedAt: null,
            automationNextAt: new Date(Math.max(Date.now(), Date.parse(nextDueAt) - 24 * 60 * 60 * 1000)).toISOString(),
            completedAt: null,
            completedBy: null,
            completedByName: null,
            outcome: null,
            completionNote: null,
          });
        } else {
          tx.update(taskRef, {
            status: "completed",
            updatedAt: completedAt,
            completedAt,
            completedBy: req.authUser.uid,
            completedByName: actorName,
            outcome,
            completionNote: completionNote || null,
            revision: currentRevision + 1,
            automationNextAt: null,
          });
        }
        tx.update(leadRef, {
          followUp: nextDueAt,
          status: leadStatus,
          lastUpdated: completedAt,
          lastContactedAt: completedAt,
        });
        tx.create(noteRef, {
          type: "worknote",
          text: noteParts.join(" "),
          authorId: req.authUser.uid,
          authorName: actorName,
          authorRole: actorMembership.role,
          visibility: "team",
          at: completedAt,
        });
        tx.create(activityRef, {
          text: `Follow-up completed: ${lead.name || task.leadName || task.leadId} — ${outcome}${nextDueAt ? " (rescheduled)" : ""}`,
          at: completedAt,
          orgId,
          actorId: req.authUser.uid,
          leadId: task.leadId,
          taskId,
          source: "follow_up",
        });
        return { status: nextDueAt && !CLOSED_STATUSES.has(leadStatus) ? "open" : "completed", dueAt: nextDueAt };
      });
      return res.json({ ok: true, task: result });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || "Could not complete follow-up" });
    }
  });

  router.post("/:leadId/reassign", requireAuth, async (req, res) => {
    try {
      const orgId = trimText(req.body?.orgId, 140);
      const leadId = safeDocId(req.params.leadId);
      const assignedTo = trimText(req.body?.assignedTo, 140);
      if (!orgId || !leadId || !assignedTo) {
        return res.status(400).json({ error: "Organization, lead, and assignee are required" });
      }
      const actorMembership = await activeMembership(req.authUser.uid, orgId);
      const isAdmin = actorMembership?.role === "owner" || actorMembership?.role === "admin";
      if (!isAdmin) return res.status(403).json({ error: "Organization admin access required" });

      const leadRef = orgCollection(db, orgId, "leads").doc(leadId);
      const taskRef = taskForLeadRef(db, orgId, leadId);
      const membershipRef = db.collection("memberships").doc(`${assignedTo}_${orgId}`);
      const reassignedAt = nowIso();
      const result = await db.runTransaction(async (tx) => {
        const [leadSnap, taskSnap, assigneeMembership] = await Promise.all([
          tx.get(leadRef),
          tx.get(taskRef),
          tx.get(membershipRef),
        ]);
        if (!leadSnap.exists) throw Object.assign(new Error("Lead not found"), { status: 404 });
        if (!assigneeMembership.exists || assigneeMembership.data().active !== true) {
          throw Object.assign(new Error("Choose an active team member"), { status: 409 });
        }
        const lead = leadSnap.data();
        const assignee = assigneeMembership.data();
        const assignedToName = assignee.displayName || "Team member";
        const actorName = actorMembership.displayName || req.authUser.name || "Team member";
        const noteRef = leadRef.collection("notes").doc();
        const activityRef = orgCollection(db, orgId, "activity").doc();
        const notificationRef = orgCollection(db, orgId, "notifications").doc();
        const task = taskSnap.exists ? taskSnap.data() : null;
        const taskTransferred = task?.status === "open";

        tx.update(leadRef, { assignedTo, assignedToName, lastUpdated: reassignedAt });
        if (taskTransferred) {
          tx.update(taskRef, {
            assignedTo,
            assignedToName,
            updatedAt: reassignedAt,
            revision: Number(task.revision || 1) + 1,
          });
        }
        tx.create(noteRef, {
          type: "worknote",
          text: `Lead reassigned to ${assignedToName}${taskTransferred ? "; its open follow-up moved with it." : "."}`,
          authorId: req.authUser.uid,
          authorName: actorName,
          authorRole: actorMembership.role,
          visibility: "team",
          at: reassignedAt,
        });
        tx.create(activityRef, {
          text: `Lead reassigned: ${lead.name || leadId} → ${assignedToName}${taskTransferred ? " (open follow-up transferred)" : ""}`,
          at: reassignedAt,
          orgId,
          actorId: req.authUser.uid,
          leadId,
          taskId: taskRef.id,
          source: "follow_up",
        });
        if (assignedTo !== req.authUser.uid) {
          tx.create(notificationRef, {
            userId: assignedTo,
            text: `${taskTransferred ? "Follow-up and lead" : "Lead"} assigned: ${lead.name || "Lead"}`,
            type: "assignment",
            read: false,
            at: reassignedAt,
            orgId,
            leadId,
            taskId: taskTransferred ? taskRef.id : null,
          });
        }
        return { assignedTo, assignedToName, taskTransferred };
      });
      return res.json({ ok: true, ...result });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || "Could not reassign lead" });
    }
  });

  router.post("/:leadId/status", requireAuth, async (req, res) => {
    try {
      const orgId = trimText(req.body?.orgId, 140);
      const leadId = safeDocId(req.params.leadId);
      const requestedStatus = trimText(req.body?.status, 80);
      const blacklisted = typeof req.body?.blacklisted === "boolean" ? req.body.blacklisted : null;
      if (!orgId || !leadId || !requestedStatus) {
        return res.status(400).json({ error: "Organization, lead, and status are required" });
      }
      const actorMembership = await activeMembership(req.authUser.uid, orgId);
      if (!actorMembership) return res.status(403).json({ error: "Active organization membership required" });
      const isAdmin = actorMembership.role === "owner" || actorMembership.role === "admin";
      if (blacklisted !== null && !isAdmin) return res.status(403).json({ error: "Only admins can change blacklist status" });

      const leadRef = orgCollection(db, orgId, "leads").doc(leadId);
      const taskRef = taskForLeadRef(db, orgId, leadId);
      const changedAt = nowIso();
      const result = await db.runTransaction(async (tx) => {
        const [leadSnap, taskSnap, settingsSnap] = await Promise.all([
          tx.get(leadRef),
          tx.get(taskRef),
          tx.get(orgCollection(db, orgId, "settings").doc("config")),
        ]);
        if (!leadSnap.exists) throw Object.assign(new Error("Lead not found"), { status: 404 });
        const lead = leadSnap.data();
        if (!isAdmin && lead.assignedTo !== req.authUser.uid) {
          throw Object.assign(new Error("This lead is not assigned to you"), { status: 403 });
        }
        const statuses = settingsSnap.data()?.statuses || ["New", "Ringing", "Meeting Fixed", "Negotiation", "Follow-up", "Closed-Won", "Lost"];
        if (!statuses.includes(requestedStatus)) {
          throw Object.assign(new Error("Choose a valid lead status"), { status: 400 });
        }
        const nextBlacklisted = blacklisted === null ? Boolean(lead.blacklisted) : blacklisted;
        const leadStatus = nextBlacklisted ? "Lost" : requestedStatus;
        const terminal = CLOSED_STATUSES.has(leadStatus);
        const task = taskSnap.exists ? taskSnap.data() : null;
        const resolvesTask = terminal && task?.status === "open";
        const actorName = actorMembership.displayName || req.authUser.name || "Team member";
        const noteRef = leadRef.collection("notes").doc();
        const activityRef = orgCollection(db, orgId, "activity").doc();

        tx.update(leadRef, {
          status: leadStatus,
          blacklisted: nextBlacklisted,
          followUp: terminal ? null : lead.followUp || null,
          lastUpdated: changedAt,
          ...(terminal ? { lastContactedAt: changedAt } : {}),
        });
        if (resolvesTask) {
          tx.update(taskRef, {
            status: "completed",
            updatedAt: changedAt,
            completedAt: changedAt,
            completedBy: req.authUser.uid,
            completedByName: actorName,
            outcome: leadStatus === "Closed-Won" ? "Closed-won" : "Lost",
            completionNote: `Lead status set to ${leadStatus}.`,
            revision: Number(task.revision || 1) + 1,
            automationNextAt: null,
          });
        }
        tx.create(noteRef, {
          type: "worknote",
          text: `Lead status changed to ${leadStatus}${resolvesTask ? "; open follow-up completed." : "."}`,
          authorId: req.authUser.uid,
          authorName: actorName,
          authorRole: actorMembership.role,
          visibility: "team",
          at: changedAt,
        });
        tx.create(activityRef, {
          text: `Lead status changed: ${lead.name || leadId} → ${leadStatus}${resolvesTask ? " (follow-up completed)" : ""}`,
          at: changedAt,
          orgId,
          actorId: req.authUser.uid,
          leadId,
          taskId: resolvesTask ? taskRef.id : null,
          source: "follow_up",
        });
        return { status: leadStatus, blacklisted: nextBlacklisted, taskCompleted: resolvesTask };
      });
      return res.json({ ok: true, ...result });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || "Could not update lead status" });
    }
  });

  return router;
}
