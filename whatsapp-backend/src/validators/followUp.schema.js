/**
 * Zod schemas for follow-up task API inputs.
 */

import { z } from "zod";

const taskTypes = z.enum(["Call", "WhatsApp", "Meeting", "Email", "Other"]);
const taskOutcomes = z.enum(["Connected", "No answer", "Follow-up required", "Meeting fixed", "Closed-won", "Lost"]);

export const scheduleFollowUpSchema = z.object({
  orgId: z.string().min(1, "Organization is required"),
  leadId: z.string().min(1, "Lead is required"),
  dueAt: z.string().min(1, "Follow-up date and time is required"),
  type: taskTypes.default("Call"),
  title: z.string().max(180).optional(),
  assignedTo: z.string().optional(),
});

export const completeFollowUpSchema = z.object({
  orgId: z.string().min(1, "Organization is required"),
  outcome: taskOutcomes.default("Connected"),
  note: z.string().max(1600).optional().default(""),
  nextDueAt: z.string().nullable().optional(),
  leadStatus: z.string().max(80).optional().default(""),
  expectedRevision: z.number().int().min(1, "A current follow-up task revision is required"),
});

export const reassignLeadSchema = z.object({
  orgId: z.string().min(1, "Organization is required"),
  assignedTo: z.string().min(1, "Assignee is required"),
});

export const updateLeadStatusSchema = z.object({
  orgId: z.string().min(1, "Organization is required"),
  status: z.string().min(1, "Status is required").max(80),
  blacklisted: z.boolean().optional(),
});
