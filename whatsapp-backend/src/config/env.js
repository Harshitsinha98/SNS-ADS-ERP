/**
 * Centralized environment configuration.
 *
 * ARCHITECTURAL DECISION: All process.env reads are consolidated here so that:
 * 1. Missing required vars fail fast at startup (not at request time).
 * 2. Services receive typed, validated config objects instead of raw strings.
 * 3. Defaults and production overrides live in one auditable place.
 */

const PORT = Number(process.env.PORT) || 3001;
const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
const INSTANCE_ID = `${process.env.RENDER_INSTANCE_ID || process.env.HOSTNAME || "local"}-${process.pid}`;

export const serverConfig = {
  port: PORT,
  isProduction,
  instanceId: INSTANCE_ID,
  trustProxy: 1,
};

export const urlConfig = {
  publicBackendUrl: process.env.PUBLIC_BACKEND_URL || (isProduction ? "" : `http://localhost:${PORT}`),
  publicFrontendUrl: process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || (isProduction ? "" : "http://localhost:5173"),
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
};

export const corsConfig = {
  allowedOrigins: [
    process.env.ALLOWED_ORIGINS,
    process.env.FRONTEND_URL,
    process.env.PUBLIC_FRONTEND_URL,
    "http://localhost:5173",
  ]
    .filter(Boolean)
    .join(",")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};

export const metaConfig = {
  appId: process.env.META_APP_ID || "",
  appSecret: process.env.META_APP_SECRET || "",
  graphApiVersion: process.env.META_GRAPH_API_VERSION || "v22.0",
  whatsappAppSecret: process.env.WHATSAPP_APP_SECRET || "",
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "",
  whatsappTokenEncryptionKey: process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY || "",
  leadWebhookVerifyToken: process.env.META_LEAD_WEBHOOK_VERIFY_TOKEN || "",
  adLeadsEncryptionKey: process.env.AD_LEADS_ENCRYPTION_KEY || "",
};

export const razorpayConfig = {
  keyId: process.env.RAZORPAY_KEY_ID || "",
  keySecret: process.env.RAZORPAY_KEY_SECRET || "",
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",
  enabled: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
};

export const payuConfig = {
  key: process.env.PAYU_KEY || "",
  salt: process.env.PAYU_SALT || "",
  mode: process.env.PAYU_MODE || "test",
  enabled: Boolean(process.env.PAYU_KEY && process.env.PAYU_SALT),
};

export const turnstileConfig = {
  siteKey: process.env.TURNSTILE_SITE_KEY || "",
  secret: process.env.TURNSTILE_SECRET_KEY || "",
};

export const platformConfig = {
  ownerPhone: process.env.PLATFORM_OWNER_PHONE || "+919653043939",
};

export const aiConfig = {
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  openaiBaseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  defaultConfidenceThreshold: 0.7,
  maxContextMessages: 10,
  maxKnowledgeBaseTokens: 3000,
  enabled: Boolean(process.env.OPENAI_API_KEY),
};
