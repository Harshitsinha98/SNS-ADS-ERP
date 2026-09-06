// Diagnose Meta Lead Ads delivery failures.
//
// The webhook only logs Graph's numeric `code`, which is ambiguous: 100 covers
// both "nonexisting field" and "missing lead access". This script inspects the
// stored Page token and replays the exact Graph read the webhook performs, so
// the cause is unambiguous.
//
// Usage (from whatsapp-backend/):
//   node scripts/diagnose-meta-lead.js                 # connection + scope check
//   node scripts/diagnose-meta-lead.js <leadgen_id>    # also replay lead read

import "dotenv/config";
import crypto from "crypto";
import { db } from "../src/bootstrap/firebase.js";

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || "v22.0";
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
const APP_ID = process.env.META_APP_ID || "";
const APP_SECRET = process.env.META_APP_SECRET || "";
const leadgenId = process.argv[2] || "";

// Scopes the leadgen flow needs. Page tokens inherit the granting user's
// scopes, so a token minted before these were granted will never gain them —
// the Page has to be reconnected.
const REQUIRED_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "leads_retrieval",
];

function decryptToken(value) {
  const key = Buffer.from(process.env.AD_LEADS_ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32) throw new Error("AD_LEADS_ENCRYPTION_KEY is missing or not a 32-byte base64 key");
  const [iv, tag, ciphertext] = String(value || "").split(".");
  if (!iv || !tag || !ciphertext) throw new Error("Stored Page token is malformed");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
}

// Never let one failing probe abort the run: a transport error on an early
// check would otherwise hide the lead read that actually matters.
async function graph(path, token) {
  try {
    const response = await fetch(`${GRAPH_URL}/${path}`, {
      headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch (cause) {
    return { ok: false, status: 0, transportError: cause.message, data: {} };
  }
}

function report(label, result) {
  if (result.transportError) {
    console.log(`   ⚠️  ${label}: could not reach Graph (${result.transportError})`);
    return;
  }
  if (result.ok) {
    console.log(`   ✅ ${label}: OK`);
    console.log(`      ${JSON.stringify(result.data).slice(0, 400)}`);
    return;
  }
  const error = result.data?.error || {};
  console.log(`   ❌ ${label}: HTTP ${result.status}`);
  console.log(`      code=${error.code} subcode=${error.error_subcode ?? "-"} type=${error.type}`);
  console.log(`      message: ${error.message}`);
}

// /me/permissions only exists on User nodes, so it cannot be used to inspect a
// Page token. debug_token works for any token type.
async function reportScopes(token) {
  if (!APP_ID || !APP_SECRET) {
    console.log("   ⚠️  Token scopes: needs META_APP_ID and META_APP_SECRET");
    return;
  }
  const result = await graph(`debug_token?input_token=${encodeURIComponent(token)}&access_token=${APP_ID}|${APP_SECRET}`);
  if (!result.ok) {
    report("Token scopes (debug_token)", result);
    return;
  }
  const info = result.data?.data || {};
  const granted = Array.isArray(info.scopes) ? info.scopes : [];
  console.log(`   ℹ️  Token type=${info.type} app=${info.app_id} valid=${info.is_valid}`);
  console.log(`      expires=${info.expires_at ? new Date(info.expires_at * 1000).toISOString() : "never"}`);
  console.log(`      granted scopes: ${granted.length ? granted.join(", ") : "(none reported)"}`);

  const missing = REQUIRED_SCOPES.filter((scope) => !granted.includes(scope));
  if (missing.length === 0) {
    console.log("   ✅ All required scopes present");
  } else {
    console.log(`   ❌ MISSING scopes: ${missing.join(", ")}`);
    console.log("      → Add them to the Login for Business configuration, then");
    console.log("        disconnect and reconnect the Page so a new token is minted.");
  }
}

async function main() {
  console.log(`Graph version: ${GRAPH_VERSION}\n`);

  console.log("── Environment ──");
  ["META_APP_ID", "META_APP_SECRET", "META_LEAD_WEBHOOK_VERIFY_TOKEN", "AD_LEADS_ENCRYPTION_KEY", "PUBLIC_BACKEND_URL"].forEach((name) => {
    const value = process.env[name] || "";
    console.log(`   ${value ? "✅" : "❌"} ${name}: ${value ? `set (${value.length} chars)` : "EMPTY / MISSING"}`);
  });

  console.log("\n── Connected Meta Pages (Firestore) ──");
  const snapshot = await db.collection("adLeadConnections").get();
  const pages = snapshot.docs.filter((doc) => doc.id.startsWith("meta_") && doc.data().pageId);
  if (pages.length === 0) {
    console.log("   ❌ No Meta Page connections found. Connect a Page in the CRM first.");
    return;
  }

  for (const doc of pages) {
    const data = doc.data();
    console.log(`\n   Page: ${data.pageName} (${data.pageId})`);
    console.log(`   org=${data.orgId} active=${data.active} state=${data.connectionState}`);
    console.log(`   lastDeliveryAt=${data.lastDeliveryAt || "never"}`);

    let token;
    try {
      token = decryptToken(data.pageAccessTokenCiphertext);
      console.log(`   ✅ Page token decrypted (${token.length} chars)`);
    } catch (error) {
      console.log(`   ❌ Token decrypt failed: ${error.message}`);
      continue;
    }

    console.log("\n   ── Token scopes ──");
    await reportScopes(token);

    console.log("\n   ── Graph checks ──");
    report(`Page read (${data.pageId})`, await graph(`${data.pageId}?fields=id,name`, token));
    report("App subscription (subscribed_apps)", await graph(`${data.pageId}/subscribed_apps`, token));
    report("Lead forms (leadgen_forms)", await graph(`${data.pageId}/leadgen_forms?fields=id,name,status&limit=5`, token));

    if (leadgenId) {
      console.log("\n   ── Replay the webhook's lead read ──");
      report("Lead (fields the webhook now requests)", await graph(`${leadgenId}?fields=field_data,created_time,ad_id,form_id`, token));
    } else {
      console.log("\n   ℹ️  Pass a leadgen_id as an argument to replay the failing lead read.");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Diagnostic failed:", error.message);
    process.exit(1);
  });
