/**
 * Cloudflare R2 upload service for bridge call recordings.
 *
 * Flow:
 *   1. Plivo stores the recording temporarily on their CDN (~90 days).
 *   2. After call completes, we download the MP3 from Plivo CDN.
 *   3. Upload to Cloudflare R2 (S3-compatible, zero egress).
 *   4. Store R2 URL in Firestore → admin can play/download forever.
 *
 * R2 is S3-compatible, so we use raw AWS Signature V4 (no SDK needed).
 * This keeps the backend lightweight — no @aws-sdk dependency.
 */

import crypto from "crypto";
import { r2Config } from "../config/env.js";
import { logger } from "../middleware/logger.js";

// ─── AWS Signature V4 helpers (minimal, R2 compatible) ───────────────────────

function hmacSha256(key, data) {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function getSignatureKey(secretKey, dateStamp, region, service) {
  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

/**
 * Upload a buffer to R2 with AWS Sig V4.
 */
async function putObjectR2(key, body, contentType = "audio/mpeg") {
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = dateStamp + "T" + now.toISOString().slice(11, 19).replace(/:/g, "") + "Z";
  const region = "auto"; // R2 uses "auto"
  const service = "s3";

  const host = `${r2Config.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${r2Config.bucketName}/${key}`;
  const payloadHash = sha256Hex(body);

  const headers = {
    host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    "content-type": contentType,
    "content-length": String(body.length),
  };

  const signedHeaderKeys = Object.keys(headers).sort();
  const signedHeaders = signedHeaderKeys.join(";");
  const canonicalHeaders = signedHeaderKeys.map((k) => `${k}:${headers[k]}\n`).join("");

  const canonicalRequest = [
    "PUT", canonicalUri, "", // method, uri, query (empty)
    canonicalHeaders, signedHeaders, payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = getSignatureKey(r2Config.secretAccessKey, dateStamp, region, service);
  const signature = hmacSha256(signingKey, stringToSign).toString("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${r2Config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${host}${canonicalUri}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...headers, Authorization: authorization },
    body,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`R2 PUT failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  // Return the public URL if configured, otherwise the R2 path
  if (r2Config.publicUrl) {
    return `${r2Config.publicUrl}/${key}`;
  }
  return `${url}`;
}

/**
 * Download a recording from Plivo CDN and upload to R2.
 * Returns the R2 public URL on success, null on failure.
 *
 * @param {string} plivoRecordingUrl - Plivo's temporary CDN URL for the recording
 * @param {string} callId - Bridge call ID (used as folder/filename)
 * @param {string} orgId - Tenant org ID (folder prefix for multi-tenant isolation)
 */
export async function uploadRecordingToR2(plivoRecordingUrl, callId, orgId) {
  if (!r2Config.enabled) {
    logger.debug("R2 not configured — skipping recording upload");
    return null;
  }
  if (!plivoRecordingUrl) return null;

  try {
    // Download from Plivo CDN (their recording URLs include auth in the URL itself)
    const downloadRes = await fetch(plivoRecordingUrl);
    if (!downloadRes.ok) {
      logger.warn({ callId, status: downloadRes.status }, "Failed to download recording from Plivo");
      return null;
    }

    const contentType = downloadRes.headers.get("content-type") || "audio/mpeg";
    const arrayBuf = await downloadRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    if (buffer.length < 100) {
      logger.warn({ callId, size: buffer.length }, "Recording too small — skipping upload");
      return null;
    }

    // R2 key: recordings/{orgId}/{YYYY-MM}/{callId}.mp3
    const now = new Date();
    const monthFolder = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const ext = contentType.includes("wav") ? "wav" : "mp3";
    const key = `recordings/${orgId}/${monthFolder}/${callId}.${ext}`;

    const r2Url = await putObjectR2(key, buffer, contentType);
    logger.info({ callId, key, size: buffer.length }, "Recording uploaded to R2");
    return r2Url;
  } catch (e) {
    logger.error({ callId, err: e.message }, "R2 recording upload failed");
    return null;
  }
}
