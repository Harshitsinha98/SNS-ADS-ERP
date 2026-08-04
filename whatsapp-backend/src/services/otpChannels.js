/**
 * OTP delivery channels — WhatsApp, SMS, Voice (all via MSG91).
 *
 * Each sender returns `{ ok, skipped?, error? }`:
 *   - ok:true            → the provider accepted the request
 *   - ok:false,skipped   → this channel isn't configured; try the next one
 *   - ok:false,error     → the provider rejected it; try the next one
 *
 * The orchestrator (`sendViaChannels`) walks `otpConfig.channelOrder` and
 * stops at the first channel that returns ok:true. This gives us the
 * WhatsApp-first-with-SMS/voice-fallback behaviour without any channel being
 * a hard dependency.
 *
 * NOTE: MSG91 is a single provider that covers all three channels, which
 * keeps signup/login independent of any org's own WhatsApp connection.
 */
import { otpConfig } from "../config/env.js";
import { logger } from "../middleware/logger.js";
import { metaGraphRequest } from "./meta.js";

const MSG91_BASE = "https://control.msg91.com/api/v5";

// Both MSG91 and Meta want bare digits with country code, e.g. 919876543210.
function toDigits(e164) {
  return String(e164 || "").replace(/\D/g, "");
}
// Backward-compatible alias used by the MSG91 senders below.
const toMsg91Number = toDigits;

async function postJson(url, headers, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.type === "error") {
    throw new Error(data?.message || `Provider responded ${res.status}`);
  }
  return data;
}

/** WhatsApp OTP via MSG91. */
async function sendWhatsApp(e164, code) {
  const { msg91AuthKey, msg91WhatsappTemplateId, msg91WhatsappNumber } = otpConfig;
  if (!msg91AuthKey || !msg91WhatsappTemplateId || !msg91WhatsappNumber) {
    return { ok: false, skipped: true };
  }
  try {
    await postJson(
      `${MSG91_BASE}/whatsapp/whatsapp-outbound-message/bulk/`,
      { authkey: msg91AuthKey },
      {
        integrated_number: msg91WhatsappNumber,
        content_type: "template",
        payload: {
          messaging_product: "whatsapp",
          type: "template",
          template: {
            name: msg91WhatsappTemplateId,
            language: { code: "en", policy: "deterministic" },
            to_and_components: [
              { to: [toMsg91Number(e164)], components: { body_1: { type: "text", value: code } } },
            ],
          },
        },
      }
    );
    return { ok: true };
  } catch (e) {
    logger.warn({ err: e.message }, "OTP WhatsApp send failed");
    return { ok: false, error: e.message };
  }
}

/**
 * WhatsApp OTP via Meta's WhatsApp Cloud API directly (no BSP).
 *
 * Sends the approved AUTHENTICATION template. Meta requires the OTP code in
 * BOTH the body parameter and the button parameter (the "Copy code" / one-tap
 * button), otherwise the send is rejected. This is the preferred channel: it
 * has no BSP markup and depends only on the org's own Meta app + a long-lived
 * System User token.
 */
async function sendWhatsAppViaMeta(e164, code) {
  const {
    metaWhatsappPhoneNumberId,
    metaWhatsappAccessToken,
    metaWhatsappTemplateName,
    metaWhatsappTemplateLang,
  } = otpConfig;
  if (!metaWhatsappPhoneNumberId || !metaWhatsappAccessToken || !metaWhatsappTemplateName) {
    return { ok: false, skipped: true };
  }
  try {
    const result = await metaGraphRequest(`${metaWhatsappPhoneNumberId}/messages`, {
      method: "POST",
      token: metaWhatsappAccessToken,
      body: {
        messaging_product: "whatsapp",
        to: toDigits(e164),
        type: "template",
        template: {
          name: metaWhatsappTemplateName,
          language: { code: metaWhatsappTemplateLang },
          components: [
            { type: "body", parameters: [{ type: "text", text: code }] },
            {
              type: "button",
              sub_type: "url",
              index: "0",
              parameters: [{ type: "text", text: code }],
            },
          ],
        },
      },
    });
    // Diagnostic: log Meta's accepted message id + resolved WhatsApp id so a
    // non-delivering send can be traced in WhatsApp Manager. `wa_id` confirms
    // Meta recognised the recipient as a WhatsApp user.
    logger.info(
      {
        to: toDigits(e164),
        messageId: result?.messages?.[0]?.id || null,
        waId: result?.contacts?.[0]?.wa_id || null,
        messageStatus: result?.messages?.[0]?.message_status || null,
        template: metaWhatsappTemplateName,
        lang: metaWhatsappTemplateLang,
      },
      "OTP WhatsApp (Meta Cloud API) accepted by provider"
    );
    return { ok: true };
  } catch (e) {
    logger.warn({ err: e.message }, "OTP WhatsApp (Meta Cloud API) send failed");
    return { ok: false, error: e.message };
  }
}

/** SMS OTP via MSG91 OTP API. */
async function sendSMS(e164, code) {
  const { msg91AuthKey, msg91SmsTemplateId } = otpConfig;
  if (!msg91AuthKey || !msg91SmsTemplateId) return { ok: false, skipped: true };
  try {
    const params = new URLSearchParams({
      template_id: msg91SmsTemplateId,
      mobile: toMsg91Number(e164),
      otp: code,
      authkey: msg91AuthKey,
    });
    const res = await fetch(`${MSG91_BASE}/otp?${params.toString()}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.type === "error") throw new Error(data?.message || `SMS provider ${res.status}`);
    return { ok: true };
  } catch (e) {
    logger.warn({ err: e.message }, "OTP SMS send failed");
    return { ok: false, error: e.message };
  }
}

/**
 * Voice-call OTP via Plivo (outbound call with Text-to-Speech).
 *
 * Plivo makes an outbound call to the recipient, and when they pick up, TTS
 * reads out the OTP digits slowly. No DLT registration needed for voice.
 * The call XML is inline via Plivo's answer_url with the phlo/XML approach,
 * but simpler: we use the `call` API with `answer_url` pointing to a data-URI
 * that Plivo fetches — or even simpler, the `answer_method` + inline XML via
 * the speak element in the call creation body param. Plivo supports passing
 * a direct XML document inline or via a URL. We'll use Plivo's PHLO-less
 * approach: create a call that answers with machine_detection OFF and a
 * simple Speak XML response hosted on our backend.
 *
 * Actually the simplest Plivo approach: Use their Outbound Call API with
 * `answer_url` pointing to our backend endpoint that returns XML, OR use
 * their newer `call_with_speak` approach. Simplest: we host a tiny XML
 * endpoint on our backend.
 *
 * SIMPLEST APPROACH: Plivo allows `answer_url` to be a publicly accessible
 * URL. We'll create a simple endpoint OR use a data URL. But actually Plivo
 * requires a real HTTP URL for answer_url.
 *
 * FINAL APPROACH: We use Plivo's call API and point answer_url to our backend
 * at /api/v1/otp/plivo-answer?code=XXXXXX which returns Speak XML.
 */
async function sendVoiceViaPlivo(e164, code) {
  const { plivoAuthId, plivoAuthToken, plivoFromNumber, plivoAnswerUrl } = otpConfig;
  if (!plivoAuthId || !plivoAuthToken || !plivoFromNumber) {
    return { ok: false, skipped: true };
  }
  try {
    const to = toDigits(e164);
    // Plivo wants the number with country code, no + prefix
    const from = toDigits(plivoFromNumber);
    const spokenCode = code.split("").join(". "); // "1. 2. 3. 4. 5. 6"
    const answerUrl = `${plivoAnswerUrl}?code=${encodeURIComponent(spokenCode)}`;

    const auth = Buffer.from(`${plivoAuthId}:${plivoAuthToken}`).toString("base64");
    const res = await fetch(`https://api.plivo.com/v1/Account/${plivoAuthId}/Call/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        from: from,
        to: to,
        answer_url: answerUrl,
        answer_method: "GET",
        time_limit: 59,        // Auto-hangup after 59 seconds — prevents runaway billing
        ring_timeout: 30,      // Give up ringing after 30 seconds if not answered
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) {
      throw new Error(data?.error || data?.message || `Plivo responded ${res.status}`);
    }
    return { ok: true };
  } catch (e) {
    logger.warn({ err: e.message }, "OTP Voice (Plivo) send failed");
    return { ok: false, error: e.message };
  }
}

/** Voice-call OTP via MSG91. */
async function sendVoice(e164, code) {
  const { msg91AuthKey, msg91VoiceTemplateId } = otpConfig;
  if (!msg91AuthKey || !msg91VoiceTemplateId) return { ok: false, skipped: true };
  try {
    const params = new URLSearchParams({
      template_id: msg91VoiceTemplateId,
      mobile: toMsg91Number(e164),
      otp: code,
      authkey: msg91AuthKey,
      otp_via: "voice",
    });
    const res = await fetch(`${MSG91_BASE}/otp?${params.toString()}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.type === "error") throw new Error(data?.message || `Voice provider ${res.status}`);
    return { ok: true };
  } catch (e) {
    logger.warn({ err: e.message }, "OTP Voice send failed");
    return { ok: false, error: e.message };
  }
}

const SENDERS = {
  whatsapp_meta: sendWhatsAppViaMeta, // direct Meta Cloud API (preferred, no BSP)
  whatsapp: sendWhatsApp,             // MSG91 WhatsApp
  sms: sendSMS,                       // MSG91 SMS
  voice_plivo: sendVoiceViaPlivo,     // Plivo voice call (no DLT needed)
  voice: sendVoice,                   // MSG91 voice
};

// Map a user-facing channel type ("whatsapp"/"sms"/"voice") to the internal
// sender keys. WhatsApp covers both the direct-Meta and MSG91 senders.
function matchesType(channel, type) {
  if (type === "whatsapp") return channel === "whatsapp_meta" || channel === "whatsapp";
  if (type === "voice") return channel === "voice_plivo" || channel === "voice";
  return channel === type;
}

/**
 * Try configured channels in order; return the first that succeeds.
 * When `only` is set ("whatsapp"|"sms"|"voice"), restrict to that type — used
 * for user-requested fallbacks ("didn't get it? send SMS / call me").
 * @returns {Promise<{ ok: boolean, channel?: string, tried: string[] }>}
 */
export async function sendViaChannels(e164, code, only = null) {
  const order = only
    ? otpConfig.channelOrder.filter((c) => matchesType(c, only))
    : otpConfig.channelOrder;
  const tried = [];
  for (const channel of order) {
    const sender = SENDERS[channel];
    if (!sender) continue;
    const result = await sender(e164, code);
    tried.push(channel);
    if (result.ok) return { ok: true, channel, tried };
  }
  return { ok: false, tried };
}
