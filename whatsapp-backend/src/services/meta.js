/**
 * Meta / WhatsApp Graph API client service.
 *
 * ARCHITECTURAL DECISION: All Meta Graph API interactions are isolated here:
 * 1. Single point for transport error handling & retry semantics.
 * 2. Token encryption/decryption is co-located with the only consumer.
 * 3. Future rate-limiting, circuit-breaking, or provider switching happens
 *    in one place without touching business logic.
 * 4. The `deliveryUnknown` flag on errors enables callers to distinguish
 *    "definitely not sent" from "might have been sent" — critical for
 *    exactly-once WhatsApp message delivery guarantees.
 */

import crypto from "crypto";
import { metaConfig } from "../config/env.js";
import { logger } from "../middleware/logger.js";

const META_GRAPH_URL = `https://graph.facebook.com/${metaConfig.graphApiVersion}`;

// ─── Token Encryption ───────────────────────────────────────────────

export function requireMetaConfiguration() {
  if (!metaConfig.appId || !metaConfig.appSecret || !metaConfig.whatsappTokenEncryptionKey) {
    throw Object.assign(
      new Error("WhatsApp Embedded Signup is not configured on the server"),
      { status: 503 }
    );
  }
}

function whatsappTokenKey() {
  const key = Buffer.from(metaConfig.whatsappTokenEncryptionKey, "base64");
  if (key.length !== 32) {
    throw Object.assign(
      new Error("WHATSAPP_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key"),
      { status: 503 }
    );
  }
  return key;
}

export function encryptWhatsAppToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", whatsappTokenKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(token), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptWhatsAppToken(value) {
  const [ivValue, tagValue, ciphertextValue] = String(value || "").split(".");
  if (!ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Stored WhatsApp credential is invalid");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    whatsappTokenKey(),
    Buffer.from(ivValue, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

// ─── Graph API Client ───────────────────────────────────────────────

/**
 * Make an authenticated request to the Meta Graph API.
 * Attaches `deliveryUnknown` to errors for exactly-once reconciliation.
 */
export async function metaGraphRequest(path, { method = "GET", token = null, body = null } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(`${META_GRAPH_URL}/${String(path).replace(/^\//, "")}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    const transportCode = cause?.cause?.code || cause?.code || null;
    const definitelyUnsent = new Set([
      "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED",
      "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT",
    ]);
    const error = Object.assign(new Error("WhatsApp provider connection failed"), {
      status: 502,
      transportCode,
    });
    error.deliveryUnknown = !definitelyUnsent.has(transportCode);
    throw error;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    logger.warn(
      { status: response.status, code: data?.error?.code },
      "Meta Graph API request failed"
    );
    throw Object.assign(new Error("WhatsApp provider request failed"), {
      status: 502,
      providerCode: data?.error?.code,
      deliveryUnknown: response.status >= 500,
    });
  }
  return data;
}

/**
 * Exchange a Meta authorization code for an access token.
 */
export async function exchangeMetaAuthorizationCode(code) {
  requireMetaConfiguration();
  const response = await fetch(`${META_GRAPH_URL}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: metaConfig.appId,
      client_secret: metaConfig.appSecret,
      code,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    logger.warn(
      { status: response.status, code: data?.error?.code },
      "Meta authorization-code exchange failed"
    );
    throw Object.assign(
      new Error("Could not verify the WhatsApp connection with Meta"),
      { status: 502 }
    );
  }
  return data;
}

// ─── Helpers ────────────────────────────────────────────────────────

export function validMetaId(value) {
  return /^\d{6,32}$/.test(String(value || ""));
}

export function normalizeWhatsAppRecipient(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return /^\d{7,15}$/.test(digits) ? digits : null;
}

export function isWhatsAppCredentialExpired(credential) {
  const expiresAtMs = Number(credential?.tokenExpiresAtMs || 0);
  return expiresAtMs > 0 && expiresAtMs <= Date.now() + 60 * 1000;
}
