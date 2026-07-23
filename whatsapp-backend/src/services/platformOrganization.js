/**
 * Platform Organization Directory Service.
 *
 * The platform console needs cross-tenant organization intelligence without
 * opening an unbounded browser listener. This service keeps the expensive
 * joins (owner profile and WhatsApp credential) bounded to a single cursor
 * page and calculates presentation-safe directory records on the server.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const SCAN_BATCH_SIZE = 50;
const MAX_SCAN_BATCHES = 5;

export function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toIso(value) {
  const ms = toMillis(value);
  return ms ? new Date(ms).toISOString() : null;
}

export function calculateHealthScore(org, now = Date.now()) {
  let score = 100;
  const lastPaymentAt = toMillis(org.lastPayment?.at);
  const lastActivityAt = Math.max(
    Number(org.lastActivityAtMs || 0),
    toMillis(org.lastActivityAt),
    lastPaymentAt,
    toMillis(org.createdAt)
  );
  const daysInactive = lastActivityAt ? Math.floor((now - lastActivityAt) / DAY_MS) : 999;
  const usageRatio = Number(org.leadsLimit || 0) > 0
    ? Number(org.leadsUsed || 0) / Number(org.leadsLimit)
    : 0;

  if (daysInactive > 30) score -= 25;
  else if (daysInactive > 7) score -= 12;
  if (usageRatio < 0.1) score -= 15;
  if (org.subscriptionStatus === "past_due") score -= 25;
  if (org.subscriptionStatus === "expired" || org.subscriptionStatus === "deleted") score -= 50;
  return Math.max(0, score);
}

function hasSearchMatch(value, search) {
  if (!search) return true;
  const needle = String(search).trim().toLowerCase();
  if (!needle) return true;
  return [
    value.id,
    value.name,
    value.ownerName,
    value.ownerPhone,
    value.ownerEmail,
    value.planName,
    value.country,
    value.state,
  ].some((candidate) => String(candidate || "").toLowerCase().includes(needle));
}

function hasFiltersMatch(value, filters, now) {
  const revenue = Number(value.revenueGenerated || 0);
  const inactive = Number(value.lastActivityAtMs || 0) < now - (7 * DAY_MS);
  const health = Number(value.healthScore || 0);

  if (filters.country && String(value.country || "").toLowerCase() !== filters.country.toLowerCase()) return false;
  if (filters.state && String(value.state || "").toLowerCase() !== filters.state.toLowerCase()) return false;
  if (filters.revenueMin !== null && revenue < filters.revenueMin) return false;
  if (filters.revenueMax !== null && revenue > filters.revenueMax) return false;
  if (filters.health === "healthy" && health < 70) return false;
  if (filters.health === "attention" && (health < 40 || health >= 70)) return false;
  if (filters.health === "at_risk" && health >= 40) return false;
  if (filters.inactive && !inactive) return false;
  return hasSearchMatch(value, filters.search);
}

async function getOwnerMap(db, orgIds) {
  if (!orgIds.length) return new Map();
  const membershipSnapshots = await Promise.all(
    Array.from({ length: Math.ceil(orgIds.length / 30) }, (_, index) => orgIds.slice(index * 30, (index + 1) * 30))
      .map((orgIdChunk) => db.collection("memberships")
        .where("orgId", "in", orgIdChunk)
        .where("active", "==", true)
        .where("role", "==", "owner")
        .get())
  );
  const membershipDocs = membershipSnapshots.flatMap((snapshot) => snapshot.docs);

  const ownerMemberships = new Map();
  for (const membershipDoc of membershipDocs) {
    const membership = membershipDoc.data();
    if (membership.role === "owner" && !ownerMemberships.has(membership.orgId)) {
      ownerMemberships.set(membership.orgId, membership);
    }
  }

  const userIds = [...new Set([...ownerMemberships.values()].map((member) => member.uid).filter(Boolean))];
  const userSnapshots = userIds.length
    ? await db.getAll(...userIds.map((uid) => db.collection("users").doc(uid)))
    : [];
  const users = new Map(userSnapshots.filter((snap) => snap.exists).map((snap) => [snap.id, snap.data()]));

  const owners = new Map();
  for (const [orgId, membership] of ownerMemberships) {
    const user = users.get(membership.uid) || {};
    owners.set(orgId, {
      name: user.displayName || membership.displayName || "—",
      phone: user.phone || membership.phone || null,
      email: user.email || membership.email || null,
      lastLoginAt: user.lastLoginAt || membership.lastActiveAt || null,
    });
  }
  return owners;
}

async function getWhatsAppMap(db, orgIds) {
  if (!orgIds.length) return new Map();
  const snapshots = await db.getAll(...orgIds.map((orgId) => db.collection("whatsappCredentials").doc(orgId)));
  return new Map(snapshots.map((snap, index) => {
    const credential = snap.exists ? snap.data() : null;
    const state = credential?.connectionState;
    const expired = Number(credential?.tokenExpiresAtMs || 0) > 0 && Number(credential.tokenExpiresAtMs) <= Date.now();
    return [orgIds[index], state === "connected" && !expired ? "connected" : state || "not_connected"];
  }));
}

export async function enrichOrganizations(db, documents) {
  const now = Date.now();
  const orgIds = documents.map((document) => document.id);
  const [owners, whatsappStates] = await Promise.all([
    getOwnerMap(db, orgIds),
    getWhatsAppMap(db, orgIds),
  ]);

  return documents.map((document) => {
    const org = document.data();
    const owner = owners.get(document.id) || {};
    const lastActivityAtMs = Math.max(
      Number(org.lastActivityAtMs || 0),
      toMillis(org.lastActivityAt),
      toMillis(org.lastPayment?.at),
      toMillis(org.createdAt)
    );
    return {
      id: document.id,
      name: org.name || "Unnamed organization",
      ownerName: org.ownerName || owner.name || "—",
      ownerPhone: org.ownerPhone || owner.phone || null,
      ownerEmail: org.ownerEmail || owner.email || null,
      planId: org.planId || "—",
      planName: org.planName || org.planId || "—",
      subscriptionStatus: org.subscriptionStatus || "unknown",
      seatsUsed: Number(org.seatsUsed || 0),
      seatsLimit: Number(org.seatsLimit || 0),
      leadsUsed: Number(org.leadsUsed || 0),
      leadsLimit: Number(org.leadsLimit || 0),
      healthScore: Number.isFinite(Number(org.healthScore)) ? Number(org.healthScore) : calculateHealthScore(org, now),
      lastLoginAt: toIso(org.lastLoginAt || owner.lastLoginAt),
      createdAt: toIso(org.createdAt),
      revenueGenerated: Number(org.lifetimeRevenue ?? org.revenueGenerated ?? org.totalRevenue ?? 0),
      whatsappStatus: org.whatsappStatus || whatsappStates.get(document.id) || "not_connected",
      currentVersion: org.currentVersion || "1.0.0",
      country: org.country || "—",
      state: org.state || "—",
      lastActivityAt: toIso(org.lastActivityAt || org.lastPayment?.at || org.createdAt),
      lastActivityAtMs,
      trialEndsAt: toIso(org.trialEndsAt),
      currentPeriodEndMs: Number(org.currentPeriodEndMs || 0),
      sourceDocumentId: document.id,
    };
  });
}

function buildPrimaryQuery(db, filters) {
  let query = db.collection("organizations");
  // Firestore supports a bounded, indexed primary filter. Other filters are
  // applied on this server after enrichment so the browser never scans tenants.
  if (filters.status) query = query.where("subscriptionStatus", "==", filters.status);
  if (filters.plan) query = query.where("planId", "==", filters.plan);
  else if (!filters.status && filters.country) query = query.where("country", "==", filters.country);
  else if (!filters.status && filters.state) query = query.where("state", "==", filters.state);
  return query.orderBy("createdAt", "desc");
}

export async function listOrganizationDirectory(db, filters) {
  const now = Date.now();
  let cursorDoc = null;
  if (filters.cursor) {
    const cursorSnapshot = await db.collection("organizations").doc(filters.cursor).get();
    if (cursorSnapshot.exists) cursorDoc = cursorSnapshot;
  }

  const records = [];
  let scanned = 0;
  let lastScanned = cursorDoc;
  let moreSourceRows = false;

  for (let batch = 0; batch < MAX_SCAN_BATCHES && records.length < filters.limit; batch += 1) {
    let query = buildPrimaryQuery(db, filters).limit(SCAN_BATCH_SIZE);
    if (lastScanned) query = query.startAfter(lastScanned);
    const snapshot = await query.get();
    if (snapshot.empty) break;

    scanned += snapshot.docs.length;
    lastScanned = snapshot.docs[snapshot.docs.length - 1];
    moreSourceRows = snapshot.docs.length === SCAN_BATCH_SIZE;
    const enriched = await enrichOrganizations(db, snapshot.docs);
    for (const record of enriched) {
      if (hasFiltersMatch(record, filters, now)) records.push(record);
      if (records.length >= filters.limit) break;
    }
    if (snapshot.docs.length < SCAN_BATCH_SIZE) break;
  }

  const lastReturned = records[records.length - 1];
  return {
    organizations: records,
    // Start after the last accepted record. This preserves cursor correctness
    // if a scanned batch also contains rows that did not match secondary filters.
    nextCursor: (records.length === filters.limit || (records.length === 0 && moreSourceRows))
      ? (lastReturned?.sourceDocumentId || lastScanned?.id || null)
      : null,
    scanned,
  };
}

export function organizationMatchesFilter(record, filters) {
  return hasFiltersMatch(record, filters, Date.now());
}



/**
 * Build a low-contention organization-directory event. Consumers listen to the
 * latest event instead of every organization document, preserving realtime
 * refresh without an unbounded tenant listener.
 */
export function newOrganizationDirectoryEvent(db, orgId, type) {
  const ref = db.collection("platformOrganizationEvents").doc();
  return {
    ref,
    data: {
      orgId,
      type,
      at: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (7 * DAY_MS)).toISOString(),
    },
  };
}
