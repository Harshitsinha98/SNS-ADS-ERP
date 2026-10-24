// WhatsApp marketing-permission helpers. Mirrors whatsapp-backend/src/services/optIn.js
// (the backend is the source of truth and enforces it; this is for display).

export const OPT_IN_META = {
  opted_in: { label: "Opted in", className: "bg-success-50 text-success-700 border-success-200", hint: "Gave WhatsApp permission" },
  engaged: { label: "Messaged us", className: "bg-teal-50 text-teal-700 border-teal-200", hint: "Customer messaged the business first" },
  pending: { label: "Permission pending", className: "bg-amber-50 text-amber-700 border-amber-200", hint: "WhatsApp permission not confirmed yet" },
  not_opted_in: { label: "No WhatsApp marketing", className: "bg-red-50 text-red-700 border-red-200", hint: "From a third-party list — cannot be sent WhatsApp marketing" },
  opted_out: { label: "Opted out", className: "bg-red-50 text-red-700 border-red-200", hint: "Asked not to receive WhatsApp messages" },
};

export function effectiveOptIn(lead) {
  if (OPT_IN_META[lead?.whatsappOptIn]) return lead.whatsappOptIn;
  if (Number(lead?.lastWhatsAppInboundAtMs) > 0 || lead?.lastWhatsAppInboundAt) return "engaged";
  return "pending";
}

// "Where did these leads come from?" — chosen on every CSV import.
export const IMPORT_CONSENT_SOURCES = [
  {
    value: "consent_given",
    label: "They agreed to get WhatsApp messages from me",
    help: "Form checkbox, phone call, in person, WhatsApp chat, or signed form. You will confirm a declaration. They can be sent WhatsApp broadcasts right away.",
  },
  {
    value: "enquiry",
    label: "They enquired with me (ad, website, portal, call)",
    help: "Imported as “permission pending”. They will need WhatsApp permission before broadcasts.",
  },
  {
    value: "past_customer",
    label: "Past customers / walk-ins / site visits",
    help: "Imported as “permission pending”. They will need WhatsApp permission before broadcasts.",
  },
  {
    value: "third_party_list",
    label: "A list from someone else (purchased / shared / scraped)",
    help: "Not allowed for WhatsApp marketing by Meta's policy. Use calls, SMS or email, or let them message you first.",
  },
];

export const CONSENT_METHODS = [
  { value: "website_form", label: "Website / landing-page form" },
  { value: "phone_call", label: "Phone call" },
  { value: "in_person", label: "In person / site visit" },
  { value: "whatsapp_chat", label: "WhatsApp chat" },
  { value: "sms_or_email_reply", label: "SMS / email reply" },
  { value: "signed_form", label: "Signed form" },
];
