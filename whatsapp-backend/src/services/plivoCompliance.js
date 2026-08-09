/**
 * Plivo Compliance API service — handles India DID number compliance for
 * multi-tenant CodeSkate Voice.
 *
 * Flow:
 *   1. getRequirements() → fetch required doc types for India/local/business
 *   2. createComplianceApplication() → submit tenant's docs (multipart/form-data)
 *   3. getComplianceStatus() → poll or receive webhook for approval
 *   4. searchAvailableNumbers() → find available India DIDs
 *   5. buyNumber() → rent the number
 *   6. linkNumberToCompliance() → attach number to accepted compliance app
 *   7. createPlivoApp() → create Plivo Application with answer/hangup URLs
 *   8. assignAppToNumber() → route calls through our backend
 *
 * All India numbers require:
 *   - Registration Certificate (Udyam or Certificate of Incorporation)
 *   - GST Registration Certificate (Form GST REG-06)
 *   - business_name field matching exactly across both docs
 */

import { bridgeCallConfig } from "../config/env.js";
import { logger } from "../middleware/logger.js";

const PLIVO_BASE = "https://api.plivo.com/v1/Account";

function authHeader() {
  return "Basic " + Buffer.from(
    `${bridgeCallConfig.plivoAuthId}:${bridgeCallConfig.plivoAuthToken}`
  ).toString("base64");
}

function accountUrl(path = "") {
  return `${PLIVO_BASE}/${bridgeCallConfig.plivoAuthId}${path}`;
}

// ─── 1. Get Requirements ─────────────────────────────────────────────────────

/**
 * Fetch compliance requirements for India local business numbers.
 * Returns the document_types array (with document_type_id needed for submission).
 */
export async function getIndiaRequirements() {
  const url = `${accountUrl("/Compliance/Requirements")}?country_iso=IN&number_type=local&user_type=business`;
  const res = await fetch(url, { headers: { Authorization: authHeader() } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Requirements fetch failed (${res.status})`);
  }
  const data = await res.json();
  return data;
}

// ─── 2. Create Compliance Application ────────────────────────────────────────

/**
 * Create a compliance application for a tenant.
 *
 * @param {Object} params
 * @param {string} params.businessName - Legal name (must match docs exactly)
 * @param {string} params.email - Contact email
 * @param {string} params.address - Street address
 * @param {string} params.city
 * @param {string} params.state
 * @param {string} params.postalCode
 * @param {string} params.registrationNumber - CIN or Udyam number
 * @param {string} params.alias - Unique friendly name for the application
 * @param {Buffer} params.registrationCertFile - PDF/PNG/JPEG buffer
 * @param {string} params.registrationCertFilename
 * @param {Buffer} params.gstCertFile - PDF/PNG/JPEG buffer
 * @param {string} params.gstCertFilename
 * @param {string} params.registrationDocTypeId - UUID from requirements
 * @param {string} params.gstDocTypeId - UUID from requirements
 * @param {string} params.callbackUrl - HTTPS URL for status webhook
 */
export async function createComplianceApplication(params) {
  const {
    businessName, email, address, city, state, postalCode,
    registrationNumber, alias, registrationCertFile, registrationCertFilename,
    gstCertFile, gstCertFilename, registrationDocTypeId, gstDocTypeId, callbackUrl,
  } = params;

  const dataPayload = {
    country_iso: "IN",
    number_type: "local",
    alias: alias || `CodeSkate-${businessName.slice(0, 40)}`,
    end_user: {
      type: "business",
      name: businessName,
      email: email || "",
      address_line_1: address || "",
      city: city || "",
      state: state || "",
      postal_code: postalCode || "",
      country: "IN",
      business_registration_number: registrationNumber || "",
    },
    documents: [
      {
        document_type_id: registrationDocTypeId,
        data_fields: { business_name: businessName },
      },
      {
        document_type_id: gstDocTypeId,
        data_fields: {},
      },
    ],
    ...(callbackUrl ? { callback_url: callbackUrl, callback_method: "POST" } : {}),
  };

  // Build multipart/form-data manually (no external library)
  const boundary = `----PlivoCompliance${Date.now()}`;
  const parts = [];

  // data field (JSON string)
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="data"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(dataPayload)}\r\n`
  );

  // Registration certificate file
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="documents[0].file"; filename="${registrationCertFilename}"\r\nContent-Type: application/pdf\r\n\r\n`
  );
  const regFileEnd = `\r\n`;

  // GST certificate file
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="documents[1].file"; filename="${gstCertFilename}"\r\nContent-Type: application/pdf\r\n\r\n`
  );
  const gstFileEnd = `\r\n`;

  const ending = `--${boundary}--\r\n`;

  // Concatenate all parts with binary file data
  const textEncoder = new TextEncoder();
  const buffers = [
    textEncoder.encode(parts[0]),
    textEncoder.encode(parts[1]),
    registrationCertFile,
    textEncoder.encode(regFileEnd),
    textEncoder.encode(parts[2]),
    gstCertFile,
    textEncoder.encode(gstFileEnd),
    textEncoder.encode(ending),
  ];

  const totalLength = buffers.reduce((sum, b) => sum + b.length, 0);
  const body = Buffer.concat(buffers.map(b => Buffer.from(b)), totalLength);

  const url = accountUrl("/Compliance/Applications");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  const responseData = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error({ status: res.status, err: responseData }, "Plivo compliance create failed");
    throw new Error(responseData.error || `Compliance creation failed (${res.status})`);
  }

  return responseData; // { compliance_id, status: "submitted", ... }
}

// ─── 3. Get Compliance Status ────────────────────────────────────────────────

export async function getComplianceStatus(complianceId) {
  const url = `${accountUrl(`/Compliance/Applications/${complianceId}`)}?expand=end_user,documents,linked_numbers`;
  const res = await fetch(url, { headers: { Authorization: authHeader() } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Status fetch failed (${res.status})`);
  }
  return res.json();
}

// ─── 4. Search Available Numbers ─────────────────────────────────────────────

export async function searchAvailableNumbers({ region, limit = 5 } = {}) {
  let url = `${accountUrl("/PhoneNumber")}?country_iso=IN&type=local&limit=${limit}`;
  if (region) url += `&region=${encodeURIComponent(region)}`;
  const res = await fetch(url, { headers: { Authorization: authHeader() } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Number search failed (${res.status})`);
  }
  const data = await res.json();
  return data.objects || [];
}

// ─── 5. Buy (Rent) Number ────────────────────────────────────────────────────

export async function buyNumber(phoneNumber) {
  const url = `${accountUrl("/PhoneNumber")}/${phoneNumber}/`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Number purchase failed (${res.status})`);
  }
  return data; // { numbers: [{...}], status: "fulfilled" }
}

// ─── 6. Link Number to Compliance ────────────────────────────────────────────

export async function linkNumberToCompliance(phoneNumber, complianceId) {
  const url = accountUrl("/Compliance/Applications/Numbers");
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      numbers: [{ number: phoneNumber, compliance_id: complianceId }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Link failed (${res.status})`);
  }
  return data;
}

// ─── 7. Create Plivo Application (answer/hangup URLs) ────────────────────────

export async function createPlivoApp({ appName, answerUrl, hangupUrl }) {
  const url = accountUrl("/Application/");
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      app_name: appName,
      answer_url: answerUrl,
      answer_method: "GET",
      hangup_url: hangupUrl,
      hangup_method: "POST",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `App creation failed (${res.status})`);
  }
  return data; // { app_id, api_id }
}

// ─── 8. Assign Application to Number ─────────────────────────────────────────

export async function assignAppToNumber(phoneNumber, appId) {
  const url = `${accountUrl("/Number")}/${phoneNumber}/`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `App assignment failed (${res.status})`);
  }
  return data;
}
