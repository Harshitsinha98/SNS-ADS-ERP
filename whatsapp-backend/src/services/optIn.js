/**
 * WhatsApp marketing opt-in model (pure functions — no Firestore imports so
 * every lead-creation path and the broadcast engine can share one definition).
 *
 * Meta cannot verify consent; it is the business's declaration. We therefore
 * record WHAT we know, WHERE it came from and WHEN, and only let broadcasts
 * reach leads whose permission status allows it.
 *
 * Statuses (stored on the lead as `whatsappOptIn`):
 *   opted_in      Explicit permission (form/checkbox/reply/declared by admin)
 *   engaged       The customer messaged the business first (implied; a
 *                 permission request can upgrade it to opted_in)
 *   pending       Enquiry / existing customer, WhatsApp permission not yet
 *                 confirmed
 *   not_opted_in  Came from a third-party / purchased list. Never eligible
 *                 for WhatsApp marketing until the person contacts us.
 *   opted_out     Asked us to stop. Never eligible.
 */

export const OPT_IN = Object.freeze({
  OPTED_IN: "opted_in",
  ENGAGED: "engaged",
  PENDING: "pending",
  NOT_OPTED_IN: "not_opted_in",
  OPTED_OUT: "opted_out",
});

const VALID_STATUSES = new Set(Object.values(OPT_IN));

/** Statuses a broadcast is allowed to send to. */
export const BROADCAST_ELIGIBLE = new Set([OPT_IN.OPTED_IN, OPT_IN.ENGAGED]);

/** What the admin tells us about a CSV import (maps to a starting status). */
export const IMPORT_CONSENT_SOURCES = Object.freeze({
  consent_given: { status: OPT_IN.OPTED_IN, source: "import_declared_consent" },
  enquiry: { status: OPT_IN.PENDING, source: "import_enquiry" },
  past_customer: { status: OPT_IN.PENDING, source: "import_past_customer" },
  third_party_list: { status: OPT_IN.NOT_OPTED_IN, source: "import_third_party_list" },
});

/** How consent was collected — required when an admin declares consent. */
export const CONSENT_METHODS = Object.freeze([
  "website_form", "phone_call", "in_person", "whatsapp_chat", "sms_or_email_reply", "signed_form",
]);

const nowIso = () => new Date().toISOString();

/**
 * The status that applies to a lead, including leads created before this
 * feature existed (no `whatsappOptIn` field). Legacy leads who ever messaged us
 * are treated as engaged; everyone else is pending.
 */
export function effectiveOptIn(lead) {
  const stored = lead?.whatsappOptIn;
  if (VALID_STATUSES.has(stored)) return stored;
  if (Number(lead?.lastWhatsAppInboundAtMs) > 0 || lead?.lastWhatsAppInboundAt) return OPT_IN.ENGAGED;
  return OPT_IN.PENDING;
}

export const isBroadcastEligible = (lead) => BROADCAST_ELIGIBLE.has(effectiveOptIn(lead));

/** Count leads per effective status (for the audience summary). */
export function optInBreakdown(leads) {
  const counts = {
    [OPT_IN.OPTED_IN]: 0, [OPT_IN.ENGAGED]: 0, [OPT_IN.PENDING]: 0,
    [OPT_IN.NOT_OPTED_IN]: 0, [OPT_IN.OPTED_OUT]: 0,
  };
  for (const lead of leads) counts[effectiveOptIn(lead)] += 1;
  return counts;
}

/** Fields written on a lead when a permission status is recorded. */
export function optInFields({ status, source, method = null, proof = null, actorId = null }) {
  return {
    whatsappOptIn: status,
    whatsappOptInSource: source,
    whatsappOptInAt: nowIso(),
    ...(method ? { whatsappOptInMethod: method } : {}),
    ...(proof ? { whatsappOptInProof: String(proof).slice(0, 500) } : {}),
    ...(actorId ? { whatsappOptInBy: actorId } : {}),
  };
}

/**
 * Fields for a lead created by (or just re-engaged through) an inbound
 * WhatsApp message. Returns null when nothing should change — opted_out and
 * already-opted-in leads are left alone.
 */
export function inboundEngagementFields(lead, { viaAd = false } = {}) {
  const current = lead ? effectiveOptIn(lead) : null;
  if (current === OPT_IN.OPTED_OUT || current === OPT_IN.OPTED_IN) return null;
  if (current === OPT_IN.ENGAGED && VALID_STATUSES.has(lead?.whatsappOptIn)) return null;
  return optInFields({
    status: OPT_IN.ENGAGED,
    source: viaAd ? "click_to_whatsapp_ad" : "inbound_message",
  });
}

/**
 * Starting permission fields for a CSV import. Missing/unknown source (e.g. an
 * older client) safely defaults to pending — never to opted_in.
 */
export function importOptInFields({ consentSource, consentDeclared, consentMethod, consentNote, actorId }) {
  const config = IMPORT_CONSENT_SOURCES[consentSource];
  if (!config) {
    return optInFields({ status: OPT_IN.PENDING, source: "import_unspecified", actorId });
  }
  if (config.status === OPT_IN.OPTED_IN) {
    if (consentDeclared !== true || !CONSENT_METHODS.includes(consentMethod)) {
      const error = new Error("To import leads as WhatsApp-consented you must confirm the declaration and say how consent was collected");
      error.status = 400;
      throw error;
    }
    return optInFields({
      status: OPT_IN.OPTED_IN, source: config.source, method: consentMethod, proof: consentNote, actorId,
    });
  }
  return optInFields({ status: config.status, source: config.source, actorId });
}

/** Website-form / webhook payloads: only an explicit truthy flag counts. */
export function formConsentFields(rawValue, { source = "website_form" } = {}) {
  const truthy = rawValue === true || ["true", "yes", "on", "1", "y"].includes(String(rawValue || "").trim().toLowerCase());
  return truthy ? optInFields({ status: OPT_IN.OPTED_IN, source }) : {};
}
