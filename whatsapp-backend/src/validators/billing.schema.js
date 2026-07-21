/**
 * Zod schemas for billing API inputs.
 *
 * These schemas cover payment orders, signup, subscription, team invites,
 * and plan management. They enforce the same constraints that were previously
 * validated inline with manual checks.
 */

import { z } from "zod";

const planIdSchema = z.enum(["starter", "growth", "enterprise"]);
const cycleSchema = z.enum(["monthly", "yearly"]);

export const accountStatusSchema = z.object({
  phone: z.string().min(10, "Enter a valid phone number"),
});

export const trialProvisionSchema = z.object({
  orgName: z.string().min(1, "Organization name is required").max(120),
  fullName: z.string().min(1, "Owner name is required").max(120),
});

export const razorpayOrderSchema = z.object({
  orgId: z.string().min(1),
  planId: planIdSchema,
  cycle: cycleSchema,
});

export const razorpayVerifySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export const signupOrderSchema = z.object({
  orgName: z.string().min(1, "Organization name is required").max(120),
  fullName: z.string().min(1, "Owner name is required").max(120),
  planId: planIdSchema,
  cycle: cycleSchema,
});

export const payuHashSchema = z.object({
  orgId: z.string().min(1),
  planId: planIdSchema,
  cycle: cycleSchema,
  firstname: z.string().max(80).optional(),
  email: z.string().email().max(120).optional(),
  phone: z.string().optional(),
});

export const subscriptionCreateSchema = z.object({
  orgId: z.string().min(1),
  planId: planIdSchema,
  cycle: cycleSchema,
});

export const subscriptionVerifySchema = z.object({
  razorpay_payment_id: z.string().min(1),
  razorpay_subscription_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export const scheduleDowngradeSchema = z.object({
  orgId: z.string().min(1),
  toPlanId: planIdSchema,
  cycle: cycleSchema,
});

export const teamInviteSchema = z.object({
  orgId: z.string().min(1),
  name: z.string().min(1, "A name is required").max(120),
  phone: z.string().min(10, "A valid phone number is required"),
  email: z.string().email().optional().or(z.literal("")),
  role: z.enum(["employee", "admin"]).default("employee"),
});

export const teamMemberStatusSchema = z.object({
  orgId: z.string().min(1),
  uid: z.string().min(1),
  active: z.boolean(),
});

export const teamMemberRoleSchema = z.object({
  orgId: z.string().min(1),
  uid: z.string().min(1),
  role: z.enum(["employee", "admin"]),
});

export const bulkImportSchema = z.object({
  orgId: z.string().min(1),
  rows: z.array(z.object({
    name: z.string().optional(),
    Name: z.string().optional(),
    phone: z.string().optional(),
    Phone: z.string().optional(),
    email: z.string().optional(),
    Email: z.string().optional(),
    source: z.string().optional(),
    Source: z.string().optional(),
    requirement: z.string().optional(),
    Requirement: z.string().optional(),
  }).passthrough()).min(1, "No leads were supplied").max(5000, "Import up to 5,000 leads at a time"),
  assigner: z.enum(["round-robin", "workload"]).default("round-robin"),
  importId: z.string().optional(),
});

export const bulkReassignSchema = z.object({
  orgId: z.string().min(1),
  fromEmployeeId: z.string().min(1),
  toEmployeeId: z.string().min(1),
});

export const platformOrgActionSchema = z.object({
  orgId: z.string().min(1),
  action: z.enum(["activate", "trial", "join"]),
});
