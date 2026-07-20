import crypto from "crypto";
import express from "express";
import { getAuth } from "firebase-admin/auth";
import { getNextEmployeeByWorkload, getNextEmployeeRoundRobin } from "./utils/assignLead.js";

const nowIso = () => new Date().toISOString();
const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const trimText = (value, length = 240) => String(value || "").trim().slice(0, length);
const hashDedupKey = (value) => crypto.createHash("sha256").update(value).digest("hex");

export function normalizeLeadPhone(value) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  // Indian ten-digit website forms are normalized to E.164. Other valid
  // country-code numbers remain supported for future international customers.
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  if (/^\d{7,15}$/.test(digits)) return `+${digits}`;
  return "";
}

export function normalizeLeadEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function phoneAliases(value) {
  const normalized = normalizeLeadPhone(value);
  const raw = String(value || "").trim();
  const digits = normalized.replace(/\D/g, "");
  return [...new Set([raw, normalized, digits, digits.startsWith("91") ? digits.slice(2) : ""]
    .filter(Boolean))];
}

function leadDedupEntries(lead) {
  const entries = [];
  if (lead.externalLeadId) entries.push(["external", lead.externalLeadId]);
  for (const phone of phoneAliases(lead.phone)) entries.push(["phone", phone]);
  if (lead.email) entries.push(["email", lead.email]);
  return [...new Map(entries.map(([type, value]) => [`${type}:${value}`, { type, value }])).values()];
}

function subscriptionAllowsLeadCreation(org) {
  return org.subscriptionStatus === "active"
    || (org.subscriptionStatus === "trialing" && (!org.trialEndsAtMs || org.trialEndsAtMs > Date.now()));
}

function normalizeLeadPayload(input, { source, origin }) {
  const phone = normalizeLeadPhone(input.phone);
  const email = normalizeLeadEmail(input.email);
  if (!phone && !email) {
    const error = new Error("Provide a valid phone number or email address");
    error.status = 400;
    throw error;
  }

  const name = trimText(input.name, 120) || (origin === "website" ? "Website Lead" : "New Lead");
  return {
    name,
    phone,
    email,
    source: trimText(source, 80) || "Website",
    sourceDetail: trimText(input.sourceDetail || input.source, 120) || null,
    campaign: trimText(input.campaign, 120) || null,
    requirement: trimText(input.requirement || input.message, 2000),
    externalLeadId: trimText(input.externalLeadId, 160) || null,
    utmSource: trimText(input.utmSource, 120) || null,
    utmMedium: trimText(input.utmMedium, 120) || null,
    utmCampaign: trimText(input.utmCampaign, 120) || null,
    priority: ["Hot", "Warm", "Cold"].includes(input.priority) ? input.priority : "Warm",
    origin,
  };
}

async function findDuplicateLead(leadsRef, lead) {
  if (lead.externalLeadId) {
    const external = await leadsRef.where("externalLeadId", "==", lead.externalLeadId).limit(1).get();
    if (!external.empty) return { doc: external.docs[0], reason: "external_lead_id" };
  }

  for (const phone of phoneAliases(lead.phone)) {
    const matches = await leadsRef.where("phone", "==", phone).limit(1).get();
    if (!matches.empty) return { doc: matches.docs[0], reason: "phone" };
  }

  if (lead.email) {
    const matches = await leadsRef.where("email", "==", lead.email).limit(1).get();
    if (!matches.empty) return { doc: matches.docs[0], reason: "email" };
  }
  return null;
}

async function reserveLeadCapacity(db, orgId) {
  const orgRef = db.collection("organizations").doc(orgId);
  return db.runTransaction(async (tx) => {
    const orgSnap = await tx.get(orgRef);
    if (!orgSnap.exists) {
      const error = new Error("Organization not found");
      error.status = 404;
      throw error;
    }
    const org = orgSnap.data();
    if (!subscriptionAllowsLeadCreation(org)) {
      const error = new Error("An active subscription or trial is required to create leads");
      error.status = 403;
      throw error;
    }
    const limit = Number(org.leadsLimit || 0);
    const used = Number(org.leadsUsed || 0);
    if (limit > 0 && used + 1 > limit) {
      const error = new Error("Lead limit reached. Upgrade your plan to add more leads.");
      error.status = 409;
      throw error;
    }
    tx.update(orgRef, { leadsUsed: used + 1 });
    return true;
  });
}

async function releaseLeadCapacity(db, orgId) {
  const orgRef = db.collection("organizations").doc(orgId);
  await db.runTransaction(async (tx) => {
    const org = await tx.get(orgRef);
    if (!org.exists) return;
    tx.update(orgRef, { leadsUsed: Math.max(0, Number(org.data().leadsUsed || 0) - 1) });
  });
}

async function chooseAssignee(db, orgId) {
  const settings = await db.collection("organizations").doc(orgId).collection("settings").doc("config").get();
  const assigner = settings.exists && settings.data().autoAssign === "workload" ? "workload" : "round-robin";
  const employee = assigner === "workload"
    ? await getNextEmployeeByWorkload(db, orgId)
    : await getNextEmployeeRoundRobin(db, orgId);
  if (!employee?.id) {
    const error = new Error("Add an active employee before creating leads");
    error.status = 409;
    throw error;
  }
  return employee;
}

export async function createLeadFromIntake({ db, orgId, input, source, origin, actorId = "system" }) {
  const lead = normalizeLeadPayload(input, { source, origin });
  const leadsRef = db.collection("organizations").doc(orgId).collection("leads");
  const duplicate = await findDuplicateLead(leadsRef, lead);
  if (duplicate) {
    return { ok: true, duplicate: true, leadId: duplicate.doc.id, duplicateReason: duplicate.reason };
  }

  const employee = await chooseAssignee(db, orgId);
  await reserveLeadCapacity(db, orgId);
  try {
    // Recheck after capacity reservation to prevent simultaneous requests from
    // creating a duplicate lead after the first request's initial check.
    const recheckedDuplicate = await findDuplicateLead(leadsRef, lead);
    if (recheckedDuplicate) {
      await releaseLeadCapacity(db, orgId);
      return { ok: true, duplicate: true, leadId: recheckedDuplicate.doc.id, duplicateReason: recheckedDuplicate.reason };
    }

    const createdAt = nowIso();
    const leadRef = leadsRef.doc();
    const batch = db.batch();
    // These `create` writes form unique, server-owned indexes. If two requests
    // arrive at once with the same phone, email, or provider submission ID,
    // Firestore allows only one batch to commit.
    for (const entry of leadDedupEntries(lead)) {
      batch.create(
        db.collection("organizations").doc(orgId).collection("leadDedup").doc(hashDedupKey(`${entry.type}:${entry.value}`)),
        { leadId: leadRef.id, type: entry.type, createdAt }
      );
    }
    batch.create(leadRef, {
      ...lead,
      status: "New",
      assignedTo: employee.id,
      assignedToName: employee.name || employee.displayName || null,
      blacklisted: false,
      createdAt,
      lastUpdated: createdAt,
      followUp: null,
      lastContactedAt: null,
      orgId,
    });
    batch.create(leadRef.collection("notes").doc("created"), {
      type: "system",
      text: `Lead created via ${lead.source}`,
      authorId: actorId,
      authorName: origin === "manual" ? "Workspace admin" : "Website intake",
      visibility: "team",
      at: createdAt,
    });
    batch.create(db.collection("organizations").doc(orgId).collection("notifications").doc(), {
      userId: employee.id,
      text: `New ${lead.source} lead: ${lead.name} (${leadRef.id})`,
      read: false,
      at: createdAt,
      orgId,
    });
    batch.create(db.collection("organizations").doc(orgId).collection("activity").doc(), {
      text: `${lead.source} lead created: ${lead.name} → ${employee.name || employee.id}`,
      at: createdAt,
      orgId,
      actorId,
      leadId: leadRef.id,
      source: lead.source,
    });
    await batch.commit();
    return { ok: true, duplicate: false, leadId: leadRef.id, assignedTo: employee.id, assignedToName: employee.name || employee.displayName || null };
  } catch (error) {
    await releaseLeadCapacity(db, orgId).catch(() => {});
    // A conflicting unique-index write means another concurrent request won.
    // Return the existing lead instead of surfacing a transient write error.
    const duplicateAfterFailure = await findDuplicateLead(leadsRef, lead).catch(() => null);
    if (duplicateAfterFailure) {
      return {
        ok: true,
        duplicate: true,
        leadId: duplicateAfterFailure.doc.id,
        duplicateReason: duplicateAfterFailure.reason,
      };
    }
    throw error;
  }
}

export default function createLeadIntakeRouter(db, { publicBackendUrl = "" } = {}) {
  const router = express.Router();
  const rateWindows = new Map();

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
    const orgId = String(req.body?.orgId || req.params?.orgId || "").trim();
    const membership = await db.collection("memberships").doc(`${req.authUser.uid}_${orgId}`).get();
    const role = membership.data()?.role;
    if (!membership.exists || membership.data()?.active !== true || !["owner", "admin"].includes(role)) {
      return res.status(403).json({ error: "Organization admin access required" });
    }
    req.orgId = orgId;
    return next();
  }

  router.post("/manual", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      const result = await createLeadFromIntake({
        db,
        orgId: req.orgId,
        input: req.body,
        source: trimText(req.body?.source, 80) || "Manual",
        origin: "manual",
        actorId: req.authUser.uid,
      });
      res.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Could not create lead" });
    }
  });

  router.post("/website-key", requireAuth, requireOrgAdmin, async (req, res) => {
    try {
      const secret = `csk_live_${crypto.randomBytes(24).toString("base64url")}`;
      const keyHash = crypto.createHash("sha256").update(secret).digest("hex");
      await db.collection("websiteLeadKeys").doc(req.orgId).set({
        orgId: req.orgId,
        keyHash,
        keyPrefix: secret.slice(0, 13),
        createdBy: req.authUser.uid,
        createdAt: nowIso(),
        active: true,
      });
      res.json({
        ok: true,
        key: secret,
        endpoint: `${String(publicBackendUrl).replace(/\/$/, "")}/api/leads/website/${req.orgId}`,
      });
    } catch (error) {
      res.status(500).json({ error: "Could not create website intake key" });
    }
  });

  router.post("/website/:orgId", async (req, res) => {
    try {
      const orgId = String(req.params.orgId || "").trim();
      const suppliedKey = String(req.headers["x-codeskate-intake-key"] || "").trim();
      if (!orgId || !suppliedKey) return res.status(401).json({ error: "Website intake key is required" });

      const keySnap = await db.collection("websiteLeadKeys").doc(orgId).get();
      const keyData = keySnap.data();
      const keyHash = crypto.createHash("sha256").update(suppliedKey).digest("hex");
      if (!keySnap.exists || keyData.active !== true || !safeEqual(keyData.keyHash, keyHash)) {
        return res.status(401).json({ error: "Invalid website intake key" });
      }

      const rateKey = `${orgId}:${req.ip}`;
      const now = Date.now();
      const window = rateWindows.get(rateKey) || { startedAt: now, count: 0 };
      if (now - window.startedAt > 10 * 60 * 1000) {
        window.startedAt = now;
        window.count = 0;
      }
      window.count += 1;
      rateWindows.set(rateKey, window);
      if (window.count > 30) return res.status(429).json({ error: "Too many intake requests. Please try again later." });

      const result = await createLeadFromIntake({
        db,
        orgId,
        input: req.body || {},
        source: "Website",
        origin: "website",
        actorId: "website_intake",
      });
      res.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Could not receive website lead" });
    }
  });

  return router;
}
