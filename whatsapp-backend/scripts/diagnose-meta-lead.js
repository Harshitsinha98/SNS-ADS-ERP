// Diagnose Meta Lead Ads delivery failures.
//
// The webhook only logs Graph's numeric `code`, which is ambiguous: 100 covers
// both "nonexisting field" and "missing lead access". This script replays the
// exact Graph read the webhook performs, using the stored Page token, and
// prints the provider's full error so the cause is unambiguous.
//
// Usage (from whatsapp-backend/):
//   node scripts/diagnose-meta-lead.js                 # connection check only
//   node scripts/diagnose-meta-lead.js <leadgen_id>    # also replay lead read

import "dotenv/config";
import crypto from "crypto";
import { db } from "../src/bootstrap/firebase.js";

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || "v22.0";
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
const leadgenId = process.argv[2] || "";

function decryptToken(value) {
  const key = Buffer.from(process.env.AD_LEADS_ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32) throw new Error("AD_LEADS_ENCRYPTION_KEY is missing or not a 32-byte base64 key");
  const [iv, tag, ciphertext] = String(value || "").split(".");
  if (!iv || !tag || !ciphertext) throw new Error("Stored Page token is malformed");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
}

async function graph(path, token) {
  const response = await fetch(`${GRAPH_URL}/${path}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function report(label, result) {
  if (result.ok) {
    console.log(`✅ ${label}: OK`);
    console.log(`   ${JSON.stringify(result.data).slice(0, 500)}`);
    return;
  }
  const error = result.data?.error || {};
  console.log(`❌ ${label}: HTTP ${result.status}`);
  console.log(`   code=${error.code} subcode=${error.error_subcode ?? "-"} type=${error.type}`);
  console.log(`   message: ${error.message}`);
}

async function main() {
  console.log(`Graph version: ${GRAPH_VERSION}\n`);

  const env = ["META_APP_ID", "META_APP_SECRET", "META_LEAD_WEBHOOK_VERIFY_TOKEN", "AD_LEADS_ENCRYPTION_KEY", "PUBLIC_BACKEND_URL"];
  console.log("── Environment ──");
  env.forEach((name) => {
    const value = process.env[name] || "";
    console.log(`   ${value ? "✅" : "❌"} ${name}: ${value ? `set (${value.length} chars)` : "EMPTY / MISSING"}`);
  });

  console.log("\n── Connected Meta Pages (Firestore) ──");
  const snapshot = await db.collection("adLeadConnections").get();
  const pages = snapshot.docs.filter((doc) => doc.id.startsWith("meta_") && doc.data().pageId);
  if (pages.length === 0) {
    console.log("   ❌ No Meta Page connections found. Connect a Page in the CRM first.");
    process.exit(0);
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

    console.log("\n   ── Graph checks ──");
    report("Token identity (/me)", await graph("me?fields=id,name", token));
    report("Token scopes (/me/permissions)", await graph("me/permissions", token));
    report("App subscription (subscribed_apps)", await graph(`${data.pageId}/subscribed_apps`, token));
    report("Lead forms (leadgen_forms)", await graph(`${data.pageId}/leadgen_forms?fields=id,name,status&limit=5`, token));

    if (leadgenId) {
      console.log("\n   ── Replay the webhook's lead read ──");
      report("Lead (current fields)", await graph(`${leadgenId}?fields=field_data,created_time,ad_id,form_id`, token));
      report("Lead (with adgroup_id — expected to fail)", await graph(`${leadgenId}?fields=field_data,created_time,ad_id,adgroup_id,form_id`, token));
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
