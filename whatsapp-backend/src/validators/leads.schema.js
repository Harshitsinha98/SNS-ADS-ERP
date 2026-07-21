/**
 * Zod schemas for lead intake API inputs.
 */

import { z } from "zod";

export const manualLeadSchema = z.object({
  orgId: z.string().min(1),
  name: z.string().max(120).optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  source: z.string().max(80).optional(),
  sourceDetail: z.string().max(120).optional(),
  requirement: z.string().max(2000).optional(),
  campaign: z.string().max(120).optional(),
  priority: z.enum(["Hot", "Warm", "Cold"]).optional(),
  externalLeadId: z.string().max(160).optional(),
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(120).optional(),
}).refine(
  (data) => Boolean(data.phone || data.email),
  { message: "Provide a valid phone number or email address" }
);

export const websiteLeadSchema = z.object({
  name: z.string().max(120).optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  requirement: z.string().max(2000).optional(),
  source: z.string().max(80).optional(),
  sourceDetail: z.string().max(120).optional(),
  campaign: z.string().max(120).optional(),
  priority: z.enum(["Hot", "Warm", "Cold"]).optional(),
  externalLeadId: z.string().max(160).optional(),
}).passthrough();

export const integrationConfigSchema = z.object({
  orgId: z.string().min(1),
  allowedDomains: z.union([z.array(z.string()), z.string()]).optional(),
  formTitle: z.string().max(100).optional(),
  submitLabel: z.string().max(60).optional(),
  successMessage: z.string().max(240).optional(),
});
