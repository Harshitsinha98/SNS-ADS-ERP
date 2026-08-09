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
  // ── Homepage Chat Widget (OpenAI — paid, professional tone) ──
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4.1-nano",
  openaiBaseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",

  // ── AI Customer Care / WhatsApp (Gemini — free tier, friendly tone) ──
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  geminiBaseUrl: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai",

  // General settings
  defaultConfidenceThreshold: 0.7,
  maxContextMessages: 10,
  maxKnowledgeBaseTokens: 3000,

  // Feature flags
  enabled: Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY),
  customerCareProvider: process.env.AI_CUSTOMER_CARE_PROVIDER || "gemini", // "openai" or "gemini"
  homepageChatProvider: process.env.AI_HOMEPAGE_CHAT_PROVIDER || "openai", // "openai" or "gemini"
};


/**
 * Multi-channel OTP (WhatsApp → SMS → Voice) via MSG91.
 *
 * The whole feature is OFF by default: unless MSG91_AUTH_KEY is present the
 * backend returns `configured: false` and the frontend keeps using Firebase
 * Phone Auth. This lets us ship the code without disrupting the live login.
 *
 * `channelOrder` controls the fallback chain — the first channel that accepts
 * the request wins. In non-production, when no provider is configured, a dev
 * fallback returns the code in the API response so the flow stays testable.
 */
export const otpConfig = {
  // MSG91 handles WhatsApp, SMS and Voice OTP under one auth key.
  msg91AuthKey: process.env.MSG91_AUTH_KEY || "",
  msg91SmsTemplateId: process.env.MSG91_SMS_TEMPLATE_ID || "",
  msg91WhatsappTemplateId: process.env.MSG91_WHATSAPP_TEMPLATE_ID || "",
  msg91WhatsappNumber: process.env.MSG91_WHATSAPP_NUMBER || "",
  msg91VoiceTemplateId: process.env.MSG91_VOICE_TEMPLATE_ID || "",
  msg91SenderId: process.env.MSG91_SENDER_ID || "",

  // ── Direct Meta WhatsApp Cloud API OTP (no BSP / no MSG91) ──────────
  // Preferred channel when configured: sends the approved authentication
  // template straight through Meta's Graph API, so login OTPs don't depend
  // on any BSP account, plan, or markup. Requires a dedicated WhatsApp
  // number's phone_number_id and a long-lived System User access token with
  // whatsapp_business_messaging permission.
  metaWhatsappPhoneNumberId: process.env.WHATSAPP_OTP_PHONE_NUMBER_ID || "",
  metaWhatsappAccessToken: process.env.WHATSAPP_OTP_ACCESS_TOKEN || "",
  metaWhatsappTemplateName: process.env.WHATSAPP_OTP_TEMPLATE_NAME || "",
  metaWhatsappTemplateLang: process.env.WHATSAPP_OTP_TEMPLATE_LANG || "en_US",

  // ── Plivo Voice OTP (outbound call with TTS, no DLT needed) ──────────
  plivoAuthId: process.env.PLIVO_AUTH_ID || "",
  plivoAuthToken: process.env.PLIVO_AUTH_TOKEN || "",
  plivoFromNumber: process.env.PLIVO_FROM_NUMBER || "",
  plivoAnswerUrl: process.env.PLIVO_OTP_ANSWER_URL || "",

  // Fallback chain. Comma-separated. "whatsapp_meta" = direct Meta Cloud API;
  // "whatsapp"/"sms"/"voice" = MSG91 channels.
  channelOrder: (process.env.OTP_CHANNEL_ORDER || "whatsapp_meta,whatsapp,sms,voice")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean),

  // Secret pepper mixed into the OTP hash so a Firestore leak isn't enough.
  hashPepper: process.env.OTP_HASH_PEPPER || "",

  codeLength: Number(process.env.OTP_CODE_LENGTH) || 6,
  ttlSeconds: Number(process.env.OTP_TTL_SECONDS) || 300, // 5 min
  maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS) || 5,
  resendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN) || 30,
  maxSendsPerWindow: Number(process.env.OTP_MAX_SENDS_PER_WINDOW) || 5,
  sendWindowSeconds: Number(process.env.OTP_SEND_WINDOW_SECONDS) || 3600, // 1 hr

  // True when a direct-Meta WhatsApp OTP sender is fully configured.
  get metaWhatsappEnabled() {
    return Boolean(
      this.metaWhatsappPhoneNumberId &&
      this.metaWhatsappAccessToken &&
      this.metaWhatsappTemplateName
    );
  },

  // User-facing channel types that are actually configured and can be offered
  // as "send the code via …" options on the login screen.
  get availableChannels() {
    const list = [];
    const whatsappMsg91 = Boolean(
      this.msg91AuthKey && this.msg91WhatsappTemplateId && this.msg91WhatsappNumber
    );
    if (this.metaWhatsappEnabled || whatsappMsg91) list.push("whatsapp");
    if (this.msg91AuthKey && this.msg91SmsTemplateId) list.push("sms");
    if (this.plivoAuthId && this.plivoAuthToken && this.plivoFromNumber) list.push("voice");
    else if (this.msg91AuthKey && this.msg91VoiceTemplateId) list.push("voice");
    return list;
  },

  get enabled() {
    // Explicit kill-switch: set OTP_MULTICHANNEL_ENABLED=false to fall back to
    // Firebase Phone Auth even while OTP credentials stay configured. Useful
    // when a WhatsApp authentication template is still pending Meta approval or
    // SMS DLT registration isn't done yet — login keeps working via Firebase
    // without having to wipe any keys.
    if (String(process.env.OTP_MULTICHANNEL_ENABLED || "").toLowerCase() === "false") {
      return false;
    }
    // Enabled if EITHER the direct-Meta sender, Plivo voice, OR MSG91 is configured.
    return this.metaWhatsappEnabled || Boolean(this.plivoAuthId && this.plivoAuthToken) || Boolean(this.msg91AuthKey);
  },
};


/**
 * Bridge Call configuration (Plivo two-leg call bridging).
 */
export const bridgeCallConfig = {
  plivoAuthId: process.env.PLIVO_AUTH_ID || "",
  plivoAuthToken: process.env.PLIVO_AUTH_TOKEN || "",
  fromNumber: process.env.PLIVO_BRIDGE_FROM_NUMBER || process.env.PLIVO_FROM_NUMBER || "",
  publicBackendUrl: process.env.PUBLIC_BACKEND_URL || "",
  maxCallDurationSeconds: Number(process.env.BRIDGE_CALL_MAX_DURATION) || 600,
  ringTimeoutSeconds: Number(process.env.BRIDGE_CALL_RING_TIMEOUT) || 22,
  // Async AMD (Answering Machine Detection) analysis window, in milliseconds.
  // Plivo max is 10000ms. Longer = more accurate = fewer false positives on
  // real humans. Detection runs in the background WITHOUT delaying the bridge.
  amdDetectionMs: Math.min(Number(process.env.BRIDGE_CALL_AMD_MS) || 10000, 10000),
  recordByDefault: String(process.env.BRIDGE_CALL_RECORD || "true").toLowerCase() === "true",
  costPerMinuteInr: Number(process.env.BRIDGE_CALL_COST_PER_MIN) || 1,
  allowedPlanIds: (process.env.BRIDGE_CALL_ALLOWED_PLANS || "growth,enterprise,enterprise_plus")
    .split(",").map((s) => s.trim()).filter(Boolean),
  get enabled() {
    return Boolean(this.plivoAuthId && this.plivoAuthToken && this.fromNumber && this.publicBackendUrl);
  },
};
