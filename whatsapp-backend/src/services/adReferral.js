/**
 * Click-to-WhatsApp (CTWA) ad attribution.
 *
 * When a customer taps a Meta "Click to WhatsApp" ad (Facebook / Instagram),
 * the FIRST inbound message carries a `referral` object:
 *   { source_url, source_id, source_type: "ad"|"post", headline, body,
 *     media_type, image_url, video_url, thumbnail_url, ctwa_clid }
 * See: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples#ad-click
 *
 * We normalise it into a small, bounded object stored on the lead and the
 * message so the CRM can show "came from ad X" and report per-ad performance.
 */

const MAX = 300;

function clip(value, max = MAX) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max) : text;
}

/** @returns {null | {sourceType, sourceId, sourceUrl, headline, body, mediaType, ctwaClid, imageUrl}} */
export function parseAdReferral(message) {
  const ref = message?.referral;
  if (!ref || typeof ref !== "object") return null;
  const parsed = {
    sourceType: clip(ref.source_type, 40) || "ad",
    sourceId: clip(ref.source_id, 120),
    sourceUrl: clip(ref.source_url, 600),
    headline: clip(ref.headline, 200),
    body: clip(ref.body, 500),
    mediaType: clip(ref.media_type, 40),
    imageUrl: clip(ref.image_url || ref.thumbnail_url, 600),
    ctwaClid: clip(ref.ctwa_clid, 300),
  };
  // A referral without any identifying field is not useful attribution.
  if (!parsed.sourceId && !parsed.sourceUrl && !parsed.headline && !parsed.ctwaClid) return null;
  return parsed;
}

export const CTWA_SOURCE = "Meta Ads (Click-to-WhatsApp)";

/** Human readable campaign label used on the lead. */
export function adCampaignLabel(referral) {
  if (!referral) return null;
  if (referral.headline) return referral.headline;
  if (referral.sourceId) return `Meta ad ${referral.sourceId}`;
  return "Meta Click-to-WhatsApp ad";
}

/** Fields merged into a NEW lead created from a CTWA click. */
export function adLeadFields(referral) {
  if (!referral) return {};
  return {
    source: CTWA_SOURCE,
    campaign: adCampaignLabel(referral),
    sourceDetail: referral.sourceType === "post" ? "Meta boosted post" : "Meta Click-to-WhatsApp ad",
    adReferral: { ...referral, capturedAt: new Date().toISOString() },
    adId: referral.sourceId || null,
  };
}
