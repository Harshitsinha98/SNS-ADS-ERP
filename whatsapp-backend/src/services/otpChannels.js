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

const MSG91_BASE = "https://control.msg91.com/api/v5";

// MSG91 wants bare digits with country code, e.g. 919876543210.
function toMsg91Number(e164) {
  return String(e164 || "").replace(/\D/g, "");
}

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

const SENDERS = { whatsapp: sendWhatsApp, sms: sendSMS, voice: sendVoice };

/**
 * Try each configured channel in order; return the first that succeeds.
 * @returns {Promise<{ ok: boolean, channel?: string, tried: string[] }>}
 */
export async function sendViaChannels(e164, code) {
  const tried = [];
  for (const channel of otpConfig.channelOrder) {
    const sender = SENDERS[channel];
    if (!sender) continue;
    const result = await sender(e164, code);
    tried.push(channel);
    if (result.ok) return { ok: true, channel, tried };
  }
  return { ok: false, tried };
}
