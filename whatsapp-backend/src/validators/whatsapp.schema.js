/**
 * Zod schemas for WhatsApp API inputs.
 *
 * ARCHITECTURAL DECISION: Schemas are defined alongside the domain they
 * validate (not in controllers) so they can be reused for:
 * 1. Request validation middleware (via validate.js).
 * 2. Service-layer input validation (defensive programming).
 * 3. Future OpenAPI spec generation.
 *
 * Schemas replicate the exact validation that was previously inline in
 * controllers — no new restrictions are added (zero behavior change).
 */

import { z } from "zod";

export const connectWhatsAppSchema = z.object({
  orgId: z.string().min(1, "Organization ID is required"),
  code: z.string().min(1, "Authorization code is required"),
  wabaId: z.string().regex(/^\d{6,32}$/, "Invalid WhatsApp Business Account ID"),
  phoneNumberId: z.string().regex(/^\d{6,32}$/, "Invalid phone number ID"),
  registrationPin: z.string().regex(/^\d{6}$/, "Enter a six-digit WhatsApp registration PIN"),
});

export const orgIdSchema = z.object({
  orgId: z.string().min(1, "Organization ID is required"),
});

export const sendMessageSchema = z.object({
  orgId: z.string().min(1, "Organization ID is required"),
  leadId: z.string().min(1, "Lead ID is required"),
  text: z.string().min(1).max(4096, "Message must be 1-4096 characters"),
  clientMessageId: z.string().min(1, "Client message ID is required"),
});

export const sendTemplateSchema = z.object({
  orgId: z.string().min(1, "Organization ID is required"),
  leadId: z.string().min(1, "Lead ID is required"),
  templateId: z.string().min(1, "Template ID is required"),
  clientMessageId: z.string().min(1, "Client message ID is required"),
  parameters: z.array(z.string().min(1).max(1024)).default([]),
});
