import crypto from "crypto";
import express from "express";
import { getAuth } from "firebase-admin/auth";
import { createLeadFromIntake } from "./leadIntake.js";

const nowIso = () => new Date().toISOString();
const trimText = (value, length = 240) => String(value || "").trim().slice(0, length);
const safeDocId = (value) => String(value || "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 180);
const hashValue = (value) => crypto.createHash("sha256").update(String(value || "")).digest("hex");
const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

function asJsonBody(req) {
  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString("utf8"));
    } catch {
      throw Object.assign(new Error("Expected a JSON webhook payload"), { status: 400 });
    }
  }
  return req.body && typeof req.body === "object" ? req.body : {};
}

function encryptedTokenKey() {
  const key = Buffer.from(process.env.AD_LEADS_ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32) {
    throw Object.assign(new Error("Ad lead connections are not configured on the server"), { status: 503 });
  }
  return key;
}

function encryptToken(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptedTokenKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${ciphertext.toString("base64")}`;
}

function decryptToken(value) {
  const [ivValue, tagValue, ciphertextValue] = String(value || "").split(".");
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error("Stored Meta credential is invalid");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptedTokenKey(), Buffer.from(ivValue, "base64"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64")), decipher.final()]).toString("utf8");
}

function connectionRef(db, provider, key) {
  return db.collection("adLeadConnections").doc(`${provider}_${safeDocId(key)}`);
}

function metaConnectionRef(db, pageId) {
  return connectionRef(db, "meta", pageId);
}

function googleConnectionRef(db, orgId) {
  return connectionRef(db, "google", orgId);
}

async function activeAdmin(db, uid, orgId) {
  if (!uid || !orgId) return null;
  const membership = await db.collection("memberships").doc(`${uid}_${orgId}`).get();
  const data = membership.data();
  return membership.exists && data?.active === true && ["owner", "admin"].includes(data?.role) ? data : null;
}

async function takeRateLimit(db, provider, orgId, ip, maxRequests) {
  const windowMs = 10 * 60 * 1000;
  const bucket = Math.floor(Date.now() / windowMs);
  const ref = db.collection("adLeadRateLimits").doc(hashValue(`${provider}:${orgId}:${ip}:${bucket}`));
  return db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    const count = current.exists ? Number(current.data().count || 0) : 0;
    if (count >= maxRequests) return false;
    tx.set(ref, {
      provider,
      orgId,
      bucket,
      count: count + 1,
      updatedAt: nowIso(),
      expiresAtMs: (bucket + 1) * windowMs,
      expiresAt: new Date((bucket + 1) * windowMs),
    }, { merge: true });
    return true;
  });
}

function googleLeadInput(payload) {
  const values = new Map();
  const extra = [];
  (Array.isArray(payload.user_column_data) ? payload.user_column_data : []).forEach((column) => {
    const key = String(column?.column_id || "").toUpperCase();
    const value = trimText(column?.string_value, 1000);
    if (!key || !value) return;
    values.set(key, value);
    if (!["FULL_NAME", "FIRST_NAME", "LAST_NAME", "EMAIL", "WORK_EMAIL", "PHONE_NUMBER", "WORK_PHONE"].includes(key)) {
      extra.push(`${trimText(column?.column_name || key, 100)}: ${value}`);
    }
  });
  const name = values.get("FULL_NAME") || [values.get("FIRST_NAME"), values.get("LAST_NAME")].filter(Boolean).join(" ");
  const campaignId = trimText(payload.campaign_id, 80);
  const formId = trimText(payload.form_id, 80);
  return {
    name,
    phone: values.get("PHONE_NUMBER") || values.get("WORK_PHONE") || "",
    email: values.get("EMAIL") || values.get("WORK_EMAIL") || "",
    requirement: extra.join(" · "),
    externalLeadId: `google:${trimText(payload.lead_id, 160)}`,
    campaign: campaignId ? `Google Ads campaign ${campaignId}` : "Google Ads",
    sourceDetail: `${payload.is_test ? "Test " : ""}Google Ads lead form${formId ? ` ${formId}` : ""}`,
    utmSource: "google",
    utmMedium: "cpc",
    utmCampaign: campaignId,
  };
}

function metaLeadInput(lead, event) {
  const values = new Map();
  const extra = [];
  (Array.isArray(lead.field_data) ? lead.field_data : []).forEach((field) => {
    const key = String(field?.name || "").toLowerCase();
    const value = trimText(Array.isArray(field?.values) ? field.values[0] : field?.value, 1000);
    if (!key || !value) return;
    values.set(key, value);
    if (!["full_name", "first_name", "last_name", "email", "phone_number", "phone"].includes(key)) {
      extra.push(`${key.replace(/_/g, " ")}: ${value}`);
    }
  });
  const name = values.get("full_name") || [values.get("first_name"), values.get("last_name")].filter(Boolean).join(" ");
  const adId = trimText(event?.ad_id || lead?.ad_id, 80);
  const formId = trimText(event?.form_id || lead?.form_id, 80);
  return {
    name,
    phone: values.get("phone_number") || values.get("phone") || "",
    email: values.get("email") || "",
    requirement: extra.join(" · "),
    externalLeadId: `meta:${trimText(event?.leadgen_id, 160)}`,
    campaign: adId ? `Meta ad ${adId}` : "Meta Lead Ads",
    sourceDetail: `Meta instant form${formId ? ` ${formId}` : ""}`,
    utmSource: "meta",
    utmMedium: "paid_social",
    utmCampaign: adId,
  };
}

function publicBackendReady(publicBackendUrl) {
  try {
    return new URL(String(publicBackendUrl || "")).protocol === "https:";
  } catch {
    return false;
  }
}

export function createAdLeadAdminRouter(db, {
  publicBackendUrl = "",
  metaGraphRequest,
  metaAppId = "",
  metaAppSecret = "",
  metaVerifyToken = "",
} = {}) {
  const router = express.Router();

  async function requireAuth(req, res, next) {
    try {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      if (!token) return res.status(401).json({ error: "Missing auth token" });
      req.authUser = await getAuth().verifyIdToken(token);
      return next();
    } catch {
      return res.status(401).json({ error: "Invalid auth token" });
    }
  }

  async function requireOrgAdmin(req, res, next) {
    const orgId = trimText(req.body?.orgId || req.query?.orgId, 140);
    if (!orgId) return res.status(400).json({ error: "Organization is required" });
    const membership = await activeAdmin(db, req.authUser.uid, orgId);
    if (!membership) return res.status(403).json({ error: "Organization admin access required" });
    req.orgId = orgId;
    return next();
  }

  const metaPlatformReady = () => Boolean(metaAppId && metaAppSecret && metaVerifyToken && publicBackendReady(publicBackendUrl) && process.env.AD_LEADS_ENCRYPTION_KEY);
  const callbackUrl = () => `${String(publicBackendUrl).replace(/\/$/, "")}/webhook/ad-leads/meta`;

  router.get("/status", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      const [google, meta] = await Promise.all([
        googleConnectionRef(db, req.orgId).get(),
        connectionRef(db, "metaOrg", req.orgId).get(),
      ]);
      const metaData = meta.exists ? meta.data() : null;
      return res.json({
        google: {
          configured: google.exists && google.data().active === true,
          webhookUrl: publicBackendReady(publicBackendUrl) ? `${String(publicBackendUrl).replace(/\/$/, "")}/webhook/ad-leads/google/${encodeURIComponent(req.orgId)}` : null,
          keyPrefix: google.data()?.keyPrefix || null,
          connectedAt: google.data()?.connectedAt || null,
        },
        meta: {
          connected: Boolean(metaData?.active),
          connectionState: metaData?.connectionState || "disconnected",
          pageId: metaData?.pageId || null,
          pageName: metaData?.pageName || null,
          connectedAt: metaData?.connectedAt || null,
          lastDeliveryAt: metaData?.lastDeliveryAt || null,
          callbackUrl: publicBackendReady(publicBackendUrl) ? callbackUrl() : null,
          platformReady: metaPlatformReady(),
          setupMessage: metaPlatformReady()
            ? "Platform webhook is configured. Sign in to Meta and choose the Page that owns your instant forms."
            : "The platform owner must configure the Meta App webhook once before any workspace can connect a Page.",
        },
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || "Could not load ad lead integrations" });
    }
  });

  router.post("/google", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      if (!publicBackendReady(publicBackendUrl)) {
        return res.status(503).json({ error: "Set PUBLIC_BACKEND_URL to your HTTPS Render address before creating a Google Ads connection" });
      }
      const key = `csk_google_${crypto.randomBytes(32).toString("base64url")}`;
      const ref = googleConnectionRef(db, req.orgId);
      const prior = await ref.get();
      const connectedAt = nowIso();
      await ref.set({
        provider: "google",
        orgId: req.orgId,
        active: true,
        keyHash: hashValue(key),
        keyPrefix: key.slice(0, 16),
        connectedAt: prior.data()?.connectedAt || connectedAt,
        updatedAt: connectedAt,
        connectedBy: req.authUser.uid,
      }, { merge: true });
      return res.status(201).json({
        ok: true,
        webhookUrl: `${String(publicBackendUrl).replace(/\/$/, "")}/webhook/ad-leads/google/${encodeURIComponent(req.orgId)}`,
        key,
        keyPrefix: key.slice(0, 16),
      });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || "Could not create Google Ads connection" });
    }
  });

  router.post("/meta/pages", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      if (!metaPlatformReady()) return res.status(503).json({ error: "Meta Lead Ads is awaiting one-time platform configuration" });
      const userAccessToken = trimText(req.body?.userAccessToken, 5000);
      if (!userAccessToken) return res.status(400).json({ error: "Connect your Meta account to choose a Facebook Page" });
      const result = await metaGraphRequest("me/accounts?fields=id,name", { token: userAccessToken });
      return res.json({ pages: (result.data || []).map((page) => ({ id: String(page.id || ""), name: trimText(page.name, 160) })).filter((page) => /^\d{6,32}$/.test(page.id)) });
    } catch (error) {
      return res.status(error.status || 502).json({ error: "Meta could not load pages. Confirm you have Lead Ads access to the Page." });
    }
  });

  router.post("/meta/connect", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      if (!metaPlatformReady()) return res.status(503).json({ error: "Meta Lead Ads is awaiting one-time platform configuration" });
      const pageId = trimText(req.body?.pageId, 32);
      const userAccessToken = trimText(req.body?.userAccessToken, 5000);
      if (!/^\d{6,32}$/.test(pageId) || !userAccessToken) {
        return res.status(400).json({ error: "Choose a Meta Page to continue" });
      }
      const pages = await metaGraphRequest("me/accounts?fields=id,name,access_token", { token: userAccessToken });
      const page = (pages.data || []).find((candidate) => String(candidate.id) === pageId && candidate.access_token);
      if (!page) return res.status(403).json({ error: "You need Lead Ads access to the selected Meta Page" });
      const ref = metaConnectionRef(db, pageId);
      const orgRef = connectionRef(db, "metaOrg", req.orgId);
      const attemptId = crypto.randomUUID();
      const connectedAt = nowIso();
      const connection = {
        provider: "meta",
        orgId: req.orgId,
        pageId,
        pageName: trimText(page.name, 160) || "Meta Page",
        pageAccessTokenCiphertext: encryptToken(page.access_token),
        active: false,
        connectionState: "connecting",
        connectionAttemptId: attemptId,
        connectedAt,
        updatedAt: connectedAt,
        connectedBy: req.authUser.uid,
      };

      // Reserve the Page and workspace slot before making the external Meta
      // call. This prevents a concurrent workspace from claiming the same
      // Page while its subscription request is in flight.
      await db.runTransaction(async (tx) => {
        const [existing, existingForOrg] = await Promise.all([tx.get(ref), tx.get(orgRef)]);
        if (existing.exists && existing.data().orgId !== req.orgId) {
          throw Object.assign(new Error("This Meta Page is already connected to another workspace"), { status: 409 });
        }
        if (existingForOrg.exists && existingForOrg.data().pageId !== pageId) {
          throw Object.assign(new Error("Disconnect your current Meta Page before connecting a different Page"), { status: 409 });
        }
        if (existing.exists && existing.data().active === true) {
          throw Object.assign(new Error("This Meta Page is already connected to this workspace"), { status: 409 });
        }
        tx.set(ref, connection, { merge: true });
        tx.set(orgRef, { ...connection, provider: "meta_org" }, { merge: true });
      });

      try {
        await metaGraphRequest(`${pageId}/subscribed_apps?subscribed_fields=leadgen`, { method: "POST", token: page.access_token });
      } catch (subscriptionError) {
        await db.runTransaction(async (tx) => {
          const current = await tx.get(ref);
          if (current.exists && current.data().connectionAttemptId === attemptId) {
            tx.update(ref, { connectionState: "failed", connectionErrorAt: nowIso(), updatedAt: nowIso() });
            tx.update(orgRef, { connectionState: "failed", connectionErrorAt: nowIso(), updatedAt: nowIso() });
          }
        }).catch(() => {});
        throw subscriptionError;
      }

      await db.runTransaction(async (tx) => {
        const [current, currentOrg] = await Promise.all([tx.get(ref), tx.get(orgRef)]);
        if (!current.exists || !currentOrg.exists || current.data().connectionAttemptId !== attemptId || currentOrg.data().connectionAttemptId !== attemptId) {
          throw Object.assign(new Error("A newer Meta connection attempt replaced this one. Try again."), { status: 409 });
        }
        tx.update(ref, { active: true, connectionState: "connected", updatedAt: nowIso() });
        tx.update(orgRef, { active: true, connectionState: "connected", updatedAt: nowIso() });
      });
      return res.json({ ok: true, pageId, pageName: trimText(page.name, 160) || "Meta Page" });
    } catch (error) {
      return res.status(error.status || 502).json({ error: error.message || "Could not connect the Meta Page" });
    }
  });

  router.post("/meta/disconnect", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      const orgRef = connectionRef(db, "metaOrg", req.orgId);
      const orgConnection = await orgRef.get();
      const batch = db.batch();
      if (orgConnection.exists) {
        batch.delete(metaConnectionRef(db, orgConnection.data().pageId));
        batch.delete(orgRef);
        await batch.commit();
      }
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ error: "Could not disconnect the Meta Page" });
    }
  });

  return router;
}

export function createAdLeadWebhookRouter(db, { metaGraphRequest, metaAppSecret = "", metaVerifyToken = "" } = {}) {
  const router = express.Router();

  router.get("/meta", (req, res) => {
    const mode = String(req.query["hub.mode"] || "");
    const token = String(req.query["hub.verify_token"] || "");
    const challenge = String(req.query["hub.challenge"] || "");
    if (mode === "subscribe" && challenge && metaVerifyToken && safeEqual(token, metaVerifyToken)) {
      return res.status(200).type("text/plain").send(challenge);
    }
    return res.sendStatus(403);
  });

  router.post("/google/:orgId", async (req, res) => {
    try {
      const orgId = trimText(req.params.orgId, 140);
      const payload = asJsonBody(req);
      const connection = await googleConnectionRef(db, orgId).get();
      if (!connection.exists || connection.data().active !== true || !safeEqual(connection.data().keyHash, hashValue(payload.google_key))) {
        return res.status(401).json({ message: "Invalid Google Ads webhook key" });
      }
      if (!trimText(payload.lead_id, 160)) return res.status(400).json({ message: "Missing Google Ads lead ID" });
      if (!(await takeRateLimit(db, "google", orgId, req.ip, 120))) {
        return res.status(429).json({ message: "Too many Google Ads lead deliveries" });
      }
      const result = await createLeadFromIntake({
        db,
        orgId,
        input: googleLeadInput(payload),
        source: "Google Ads",
        origin: "google_ads",
        actorId: "google_ads_webhook",
      });
      return res.status(200).json({ ok: true, duplicate: result.duplicate === true });
    } catch (error) {
      return res.status(error.status || 500).json({ message: error.message || "Could not receive Google Ads lead" });
    }
  });

  router.post("/meta", async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    try {
      const signature = String(req.headers["x-hub-signature-256"] || "");
      const expected = metaAppSecret ? `sha256=${crypto.createHmac("sha256", metaAppSecret).update(rawBody).digest("hex")}` : "";
      if (!expected || !safeEqual(signature, expected)) return res.sendStatus(401);
      const payload = asJsonBody(req);
      const changes = (payload.entry || []).flatMap((entry) => (entry.changes || []).map((change) => ({ pageId: String(entry.id || change?.value?.page_id || ""), change })));
      for (const { pageId, change } of changes) {
        if (change?.field !== "leadgen" || !change?.value?.leadgen_id) continue;
        const connection = await metaConnectionRef(db, pageId).get();
        if (!connection.exists || connection.data().active !== true) continue;
        const token = decryptToken(connection.data().pageAccessTokenCiphertext);
        const lead = await metaGraphRequest(`${change.value.leadgen_id}?fields=field_data,created_time,ad_id,adgroup_id,form_id`, { token });
        await createLeadFromIntake({
          db,
          orgId: connection.data().orgId,
          input: metaLeadInput(lead, change.value),
          source: "Meta Lead Ads",
          origin: "meta_lead_ads",
          actorId: "meta_lead_ads_webhook",
        });
        await connection.ref.set({ lastDeliveryAt: nowIso(), lastDeliveryLeadId: String(change.value.leadgen_id), updatedAt: nowIso() }, { merge: true });
        await connectionRef(db, "metaOrg", connection.data().orgId).set({ lastDeliveryAt: nowIso(), lastDeliveryLeadId: String(change.value.leadgen_id), updatedAt: nowIso() }, { merge: true });
      }
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error("Meta Lead Ads webhook failed:", error.message);
      return res.status(error.status || 500).json({ error: "Could not receive Meta lead" });
    }
  });

  return router;
}
