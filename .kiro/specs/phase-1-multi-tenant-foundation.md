# Phase 1: Multi-Tenant Foundation — Design Specification

**Status:** Draft
**Phase:** 1 of N
**Last Updated:** 2025-07-16

---

## Executive Summary

This specification defines the foundational data model and identity layer changes required to convert the existing single-tenant Lead ERP application into a multi-tenant SaaS product. **Phase 1 focuses exclusively on the data layer** — no UI/UX changes, no billing, no self-serve signup.

### Key Outcomes
- Organizations can be created and isolated from each other
- Users can belong to multiple organizations with different roles
- Security Rules enforce tenant isolation at the database level
- Existing production data is preserved via migration script
- Zero regression for existing users (they become members of a default organization)

---

## Current State Analysis

### Repository Structure
```
lead-erp/                      # Capacitor-wrapped React frontend
├── src/
│   ├── context/
│   │   ├── AuthContext.jsx    # Phone OTP auth, users keyed by phone number
│   │   └── DataContext.jsx    # Central data layer, ALL Firestore operations
│   └── firebase.js            # Firebase client initialization

whatsapp-backend/              # Node.js/Express backend
├── server.js                  # WhatsApp webhook, lead import
└── utils/assignLead.js        # Round-robin assignment logic
```

### Current Data Model (Single-Tenant, Flat)

| Collection | Document ID | Key Fields |
|------------|-------------|------------|
| `users` | `+91XXXXXXXXXX` (phone) | `{ name, role, active }` |
| `leads` | Auto-ID | `{ name, phone, status, assignedTo, ... }` |
| `leads/{id}/notes` | Auto-ID | `{ type, text, visibility, authorName, at }` |
| `leads/{id}/private` | `data` | `{ revenue, revenueUpdatedBy, ... }` |
| `settings` | `config` | `{ statuses[], autoAssign }` |
| `goals` | `config` | `{ [empId]: target }` |
| `meta` | `leadAssignment` | `{ lastIndex }` |
| `notifications` | Auto-ID | `{ userId, text, read, at }` |
| `activity` | Auto-ID | `{ text, at }` |
| `pending_whatsapp` | Auto-ID | `{ phone, name, requirement, queuedAt }` |

### Current Authentication Flow
1. User enters phone number
2. Frontend checks `users/{phoneId}` exists and is active
3. Firebase Phone OTP sent
4. On success, user object created: `{ id: phoneId, phone, ...snap.data() }`
5. `user.role` determines data access (admin reads all leads, employee reads only assigned)

### Critical Issues for Multi-Tenancy
1. **User document keyed by phone number** — same phone can only exist once globally
2. **No tenant/org field** on any document — complete data mingling
3. **No security rules** — all isolation is client-side logic only
4. **Backend writes directly to collections** — needs org context injection
5. **Meta/leadAssignment is global** — assignment counter shared across all tenants


---

## Target Data Model (Multi-Tenant)

### New Collections Structure

```
organizations/{orgId}                           # Organization root document
├── name: string
├── slug: string (URL-safe identifier)
├── createdAt: timestamp
├── createdBy: uid
└── settings: { ... }                           # Denormalized for quick access

organizations/{orgId}/leads/{leadId}            # Per-organization leads
├── name, phone, email, source, requirement
├── status, assignedTo, assignedToName
├── priority, blacklisted
├── createdAt, lastUpdated, followUp, lastContactedAt
└── orgId: string (redundant but useful for queries)

organizations/{orgId}/leads/{leadId}/notes/{noteId}
├── type, text, visibility
├── authorId, authorName, authorRole
└── at

organizations/{orgId}/leads/{leadId}/private/financials
├── revenue, revenueUpdatedBy, revenueUpdatedAt
├── dealValue, dealCurrency
└── paymentStatus

organizations/{orgId}/settings/config
├── statuses: string[]
├── autoAssign: "round-robin" | "workload"
└── customFields: {} (future)

organizations/{orgId}/meta/leadAssignment
├── lastIndex: number
└── lastAssignedAt: timestamp

organizations/{orgId}/activity/{activityId}
├── text, at
└── orgId (for queries)

organizations/{orgId}/notifications/{notifId}
├── userId (uid), text, read, at
└── orgId

organizations/{orgId}/goals/config
├── [uid]: target
└── orgId

---

users/{uid}                                     # Global user identity
├── phone: string (E164 format)
├── displayName: string
├── createdAt: timestamp
├── lastLoginAt: timestamp
└── defaultOrgId: string (optional)

memberships/{uid}_{orgId}                       # User ↔ Organization mapping
├── uid: string
├── orgId: string
├── role: "owner" | "admin" | "employee"
├── displayName: string (org-specific name)
├── active: boolean
├── invitedBy: uid
├── joinedAt: timestamp
└── lastActiveAt: timestamp

pending_whatsapp/{pendingId}                    # Moved under org
├── orgId, phone, name, requirement, queuedAt
└── reassigned to: organizations/{orgId}/pending_leads/{id}

---

activity/{activityId}                           # DEPRECATED after migration
notifications/{notifId}                         # DEPRECATED after migration
goals/config                                    # DEPRECATED after migration
settings/config                                 # DEPRECATED after migration
meta/leadAssignment                             # DEPRECATED after migration
```

### Role Hierarchy & Permissions

| Role | Can Do |
|------|--------|
| **owner** | Everything admin can do + delete organization + transfer ownership + manage billing (future) |
| **admin** | Read/write all leads, read/write settings/meta, read/write private financials, manage users (add/remove employees), view all activity |
| **employee** | Read/write assigned leads, read/write notes on assigned leads, read org settings, receive notifications, CANNOT read/write private financials, CANNOT modify org settings |

### Document ID Strategy

| Collection | ID Pattern | Rationale |
|------------|-----------|-----------|
| `organizations` | Auto-generated or slug-based | UUID preferred for uniqueness |
| `users` | Firebase Auth UID | Stable identity across orgs |
| `memberships` | `{uid}_{orgId}` | Composite key for uniqueness, easy lookup |
| `leads` | Auto-generated | Same as current |
| `notes` | Auto-generated | Same as current |
| `private/financials` | Fixed: `data` | Single document per lead |


---

## Identity Layer Redesign

### Problem: Phone Number as User ID
Currently, `users/+91XXXXXXXXXX` ties identity to phone number. This means:
- Same person can't join multiple orgs
- Changing phone number requires data migration
- Can't have same phone in different orgs with different roles

### Solution: Decouple Identity from Membership

```
┌─────────────────────────────────────────────────────────────┐
│                    Firebase Auth UID                         │
│                    (stable identifier)                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  users/{uid}                                                 │
│  - phone: "+91XXXXXXXXXX"                                    │
│  - displayName: "John Doe"                                   │
│  - defaultOrgId: "org_abc123"                                │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│ memberships/      │ │ memberships/      │ │ memberships/      │
│ {uid}_org_abc123  │ │ {uid}_org_def456  │ │ {uid}_org_xyz789  │
│                   │ │                   │ │                   │
│ role: "admin"     │ │ role: "employee"  │ │ role: "owner"     │
│ active: true      │ │ active: true      │ │ active: true      │
└───────────────────┘ └───────────────────┘ └───────────────────┘
```

### Authentication Flow (New)

1. User enters phone number
2. Firebase Phone OTP verification (same as before)
3. On success, auth state gives us `uid` and `phoneNumber`
4. **New:** Query `memberships` where `uid == auth.uid` and `active == true`
5. If no memberships → error "No organization membership found"
6. If one membership → auto-select that org
7. If multiple memberships → show org selector (stored in localStorage for persistence)
8. Load user profile: merge `users/{uid}` + `memberships/{uid}_{orgId}`
9. Set active org in React context

### User Object Structure (In-App)

```javascript
// AuthContext provides:
{
  uid: "abc123",                    // Firebase Auth UID
  phone: "+919999888877",           // From Firebase Auth
  displayName: "John Doe",          // From users/{uid}
  
  // Active organization context:
  activeOrgId: "org_xyz789",
  activeOrgRole: "admin",
  activeOrgName: "Acme Corp",
  
  // All memberships for org switcher:
  memberships: [
    { orgId: "org_xyz789", role: "admin", orgName: "Acme Corp" },
    { orgId: "org_abc123", role: "employee", orgName: "Beta LLC" }
  ]
}
```


---

## Firestore Security Rules

### Design Principles
1. **Default deny** — all access blocked unless explicitly allowed
2. **Membership required** — user must have active membership to access any org data
3. **Role-based enforcement** — admin-only operations checked in rules
4. **No client-side trust** — rules validate everything, even if UI shows/hides features

### Complete Rules File

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // ============================================================
    // HELPER FUNCTIONS
    // ============================================================
    
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function getMembership(orgId) {
      return get(/databases/$(database)/documents/memberships/$(request.auth.uid)_$(orgId));
    }
    
    function hasActiveMembership(orgId) {
      let membership = getMembership(orgId);
      return membership.exists && membership.data.active == true;
    }
    
    function hasRole(orgId, role) {
      let membership = getMembership(orgId);
      return membership.exists && 
             membership.data.active == true && 
             membership.data.role == role;
    }
    
    function isAdmin(orgId) {
      return hasRole(orgId, 'admin') || hasRole(orgId, 'owner');
    }
    
    function isOwner(orgId) {
      return hasRole(orgId, 'owner');
    }
    
    function isEmployeeOrAbove(orgId) {
      let membership = getMembership(orgId);
      return membership.exists && membership.data.active == true;
    }
    
    // ============================================================
    // GLOBAL USER IDENTITY
    // ============================================================
    
    match /users/{uid} {
      allow read: if isAuthenticated() && request.auth.uid == uid;
      allow create: if isAuthenticated() && request.auth.uid == uid;
      allow update: if isAuthenticated() && request.auth.uid == uid 
                    && !request.resource.data.diff(resource.data).affectedKeys()
                      .hasAny(['phone']); // phone cannot be changed
    }
    
    // ============================================================
    // MEMBERSHIPS (User ↔ Organization mapping)
    // ============================================================
    
    match /memberships/{membershipId} {
      // User can read their own memberships
      allow read: if isAuthenticated() && 
                     request.auth.uid == resource.data.uid;
      
      // User can create their own membership (for first org creation)
      // OR admin can create memberships for their org
      allow create: if isAuthenticated() && (
        // Self-registration (first org creation)
        (request.resource.data.uid == request.auth.uid && 
         request.resource.data.role == 'owner') ||
        // Admin adding members to their org
        (isAdmin(request.resource.data.orgId) && 
         request.auth.uid != request.resource.data.uid)
      );
      
      // Admin can update memberships in their org
      // User can update their own lastActiveAt
      allow update: if isAuthenticated() && 
                      isAdmin(resource.data.orgId) &&
                      request.auth.uid != resource.data.uid
                   || isAuthenticated() && 
                      request.auth.uid == resource.data.uid &&
                      request.resource.data.diff(resource.data)
                        .affectedKeys().hasOnly(['lastActiveAt']);
      
      // Only owner can delete memberships (remove users)
      allow delete: if isAuthenticated() && isOwner(resource.data.orgId);
    }
```

```javascript
    
    // ============================================================
    // ORGANIZATIONS
    // ============================================================
    
    match /organizations/{orgId} {
      // Read: must be a member
      allow read: if isAuthenticated() && hasActiveMembership(orgId);
      
      // Create: anyone authenticated (self-serve signup — future phase)
      // For Phase 1, creation happens via migration script only
      allow create: if isAuthenticated();
      
      // Update: admin only
      allow update: if isAuthenticated() && isAdmin(orgId);
      
      // Delete: owner only (future — soft delete preferred)
      allow delete: if false; // Disabled in Phase 1
      
      // ============================================================
      // LEADS (per-organization)
      // ============================================================
      
      match /leads/{leadId} {
        // Read: any active member
        allow read: if isAuthenticated() && isEmployeeOrAbove(orgId);
        
        // Create: admin or employee
        allow create: if isAuthenticated() && isEmployeeOrAbove(orgId)
                      && request.resource.data.orgId == orgId;
        
        // Update: admin (any field) or employee (assigned leads only)
        allow update: if isAuthenticated() && (
          (isAdmin(orgId)) ||
          (isEmployeeOrAbove(orgId) && 
           resource.data.assignedTo == request.auth.uid)
        );
        
        // Delete: admin only
        allow delete: if isAuthenticated() && isAdmin(orgId);
        
        // --------------------------------------------------------
        // NOTES subcollection
        // --------------------------------------------------------
        match /notes/{noteId} {
          allow read: if isAuthenticated() && isEmployeeOrAbove(orgId)
                      && (resource.data.visibility == 'team' 
                          || isAdmin(orgId));
          
          allow create: if isAuthenticated() && isEmployeeOrAbove(orgId);
          
          allow update: if isAuthenticated() && isEmployeeOrAbove(orgId)
                        && (isAdmin(orgId) 
                            || resource.data.authorId == request.auth.uid);
          
          allow delete: if isAuthenticated() && isAdmin(orgId);
        }
        
        // --------------------------------------------------------
        // PRIVATE subcollection (financials — admin only)
        // --------------------------------------------------------
        match /private/{docId} {
          allow read: if isAuthenticated() && isAdmin(orgId);
          allow write: if isAuthenticated() && isAdmin(orgId);
        }
      }
      
      // ============================================================
      // SETTINGS (per-organization)
      // ============================================================
      
      match /settings/{settingsId} {
        allow read: if isAuthenticated() && isEmployeeOrAbove(orgId);
        allow write: if isAuthenticated() && isAdmin(orgId);
      }
      
      // ============================================================
      // META (lead assignment counter)
      // ============================================================
      
      match /meta/{metaId} {
        allow read: if isAuthenticated() && isEmployeeOrAbove(orgId);
        allow write: if isAuthenticated() && isAdmin(orgId);
      }
      
      // ============================================================
      // ACTIVITY (per-organization audit log)
      // ============================================================
      
      match /activity/{activityId} {
        allow read: if isAuthenticated() && isEmployeeOrAbove(orgId);
        allow create: if isAuthenticated() && isEmployeeOrAbove(orgId)
                      && request.resource.data.orgId == orgId;
        allow update, delete: if false; // immutable audit log
      }
```

```javascript
      
      // ============================================================
      // NOTIFICATIONS (per-organization)
      // ============================================================
      
      match /notifications/{notifId} {
        allow read: if isAuthenticated() && isEmployeeOrAbove(orgId)
                    && resource.data.userId == request.auth.uid;
        allow create: if isAuthenticated() && isEmployeeOrAbove(orgId);
        allow update: if isAuthenticated() && 
                        resource.data.userId == request.auth.uid;
        allow delete: if isAuthenticated() && 
                        resource.data.userId == request.auth.uid;
      }
      
      // ============================================================
      // GOALS (per-organization)
      // ============================================================
      
      match /goals/{goalsId} {
        allow read: if isAuthenticated() && isEmployeeOrAbove(orgId);
        allow write: if isAuthenticated() && isAdmin(orgId);
      }
      
      // ============================================================
      // PENDING LEADS (WhatsApp queue, per-org)
      // ============================================================
      
      match /pending_leads/{pendingId} {
        allow read: if isAuthenticated() && isAdmin(orgId);
        allow write: if isAuthenticated() && isAdmin(orgId);
      }
    }
    
    // ============================================================
    // LEGACY COLLECTIONS (read-only during migration, then deleted)
    // ============================================================
    
    match /leads/{leadId} {
      allow read, write: if false; // Disabled after migration
    }
    
    match /users/{phoneId} {
      allow read: if isAuthenticated(); // Read-only for migration lookup
      allow write: if false;
    }
    
    match /settings/{doc} {
      allow read, write: if false;
    }
    
    match /activity/{doc} {
      allow read, write: if false;
    }
    
    match /notifications/{doc} {
      allow read, write: if false;
    }
    
    match /goals/{doc} {
      allow read, write: if false;
    }
    
    match /meta/{doc} {
      allow read, write: if false;
    }
    
    match /pending_whatsapp/{doc} {
      allow read, write: if false;
    }
  }
}
```

---

## Migration Strategy

### Overview
A one-time Node.js script using `firebase-admin` SDK that:
1. Creates a default organization
2. Migrates all existing data into that organization
3. Creates `users/{uid}` documents for each existing user
4. Creates `memberships/{uid}_{orgId}` with appropriate roles
5. Validates data integrity post-migration

### Migration Script Architecture

```
migrations/
├── migrate-to-multi-tenant.js    # Main migration entry point
├── steps/
│   ├── 01-create-default-org.js
│   ├── 02-migrate-users.js
│   ├── 03-migrate-leads.js
│   ├── 04-migrate-settings.js
│   ├── 05-migrate-meta.js
│   ├── 06-migrate-activity.js
│   ├── 07-migrate-notifications.js
│   ├── 08-migrate-goals.js
│   ├── 09-migrate-pending-whatsapp.js
│   └── 10-validate-migration.js
├── utils/
│   ├── firebase-admin.js
│   ├── batch-write.js
│   └── logger.js
└── rollback.js                   # Emergency rollback script
```

### Migration Steps Detail

#### Step 1: Create Default Organization
```javascript
// Creates: organizations/{defaultOrgId}
const defaultOrg = {
  name: process.env.DEFAULT_ORG_NAME || "Default Organization",
  slug: "default",
  createdAt: new Date().toISOString(),
  createdBy: "migration-script",
  migrationSource: "single-tenant",
};

const orgRef = await db.collection('organizations').add(defaultOrg);
```

#### Step 2: Migrate Users → Users + Memberships
```javascript
// For each document in legacy users/{phoneId}:
// 1. Find Firebase Auth user by phone (or create if not exists)
// 2. Create users/{uid}
// 3. Create memberships/{uid}_{orgId}

const legacyUsers = await db.collection('users').get();

for (const doc of legacyUsers.docs) {
  const phone = doc.id; // "+91XXXXXXXXXX"
  const data = doc.data();
  
  // Find or create Firebase Auth user
  let userRecord;
  try {
    userRecord = await auth.getUserByPhoneNumber(phone);
  } catch (e) {
    // User exists in Firestore but not in Auth — log for manual review
    console.warn(`No Firebase Auth user for phone: ${phone}`);
    continue;
  }
  
  const uid = userRecord.uid;
  
  // Create users/{uid}
  await db.collection('users').doc(uid).set({
    phone: phone,
    displayName: data.name || "Unknown",
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    defaultOrgId: defaultOrgId,
  });
  
  // Create memberships/{uid}_{orgId}
  const role = data.role || 'employee';
  await db.collection('memberships').doc(`${uid}_${defaultOrgId}`).set({
    uid: uid,
    orgId: defaultOrgId,
    role: role,
    displayName: data.name || "Unknown",
    active: data.active !== false, // default to true if not set
    invitedBy: "migration-script",
    joinedAt: new Date().toISOString(),
    lastActiveAt: null,
  });
}
```

#### Step 3: Migrate Leads (with Notes + Private)
```javascript
// For each document in legacy leads/{leadId}:

const legacyLeads = await db.collection('leads').get();
const batch = db.batch();
let count = 0;

for (const doc of legacyLeads.docs) {
  const leadData = doc.data();
  const leadId = doc.id;
  
  // New lead document
  const newLeadRef = db.collection('organizations')
    .doc(defaultOrgId)
    .collection('leads')
    .doc(leadId); // Preserve original ID
  
  batch.set(newLeadRef, {
    ...leadData,
    orgId: defaultOrgId, // Add org reference
  });
  
  // Migrate notes subcollection
  const notes = await db.collection('leads').doc(leadId).collection('notes').get();
  for (const note of notes.docs) {
    const newNoteRef = newLeadRef.collection('notes').doc(note.id);
    batch.set(newNoteRef, note.data());
  }
  
  // Migrate private subcollection
  const privateDocs = await db.collection('leads').doc(leadId).collection('private').get();
  for (const priv of privateDocs.docs) {
    const newPrivateRef = newLeadRef.collection('private').doc(priv.id);
    batch.set(newPrivateRef, priv.data());
  }
  
  count++;
  if (count % 450 === 0) {
    await batch.commit(); // Firestore batch limit
  }
}

await batch.commit();
```

#### Step 4-9: Migrate Settings, Meta, Activity, Notifications, Goals, Pending

Each follows the same pattern:
1. Read from legacy collection
2. Write to `organizations/{defaultOrgId}/{collection}/{doc}`
3. Add `orgId` field where applicable
4. Use batched writes for efficiency

#### Step 10: Validation

```javascript
// Verify counts match
const legacyLeadCount = (await db.collection('leads').get()).size;
const newLeadCount = (await db.collectionGroup('leads').get()).size;

if (legacyLeadCount !== newLeadCount) {
  throw new Error(`Lead count mismatch: ${legacyLeadCount} → ${newLeadCount}`);
}

// Similar validation for users, notifications, etc.
```

### Migration Execution Plan

1. **Pre-migration backup**: Export entire Firestore to GCS
2. **Run migration script**: In a staging environment first
3. **Validate**: Compare counts, spot-check data
4. **Deploy new code**: Frontend + Backend with multi-tenant queries
5. **Cut over**: Update Security Rules
6. **Monitor**: Watch for errors in first 24 hours
7. **Cleanup**: Delete legacy collections after 7 days (manual)

### Rollback Strategy

If critical issues arise:
1. Revert Security Rules to allow legacy collections
2. Redeploy previous frontend/backend code
3. Data remains in legacy collections until migration is re-run


---

## Code Changes

### Frontend Changes

#### 1. AuthContext.jsx — Identity & Membership Loading

**Key Changes:**
- User object now uses `uid` instead of phone as primary identifier
- Membership query loads all org memberships for the user
- Active organization stored in localStorage for persistence
- `switchOrg()` function to change active organization

**New User Object Structure:**
```javascript
{
  uid: "abc123",                    // Firebase Auth UID
  phone: "+919999888877",           // From Firebase Auth
  displayName: "John Doe",          // From users/{uid}
  activeOrgId: "org_xyz789",        // Current active org
  activeOrgRole: "admin",           // Role in active org
  memberships: [...]                // All org memberships
}
```

#### 2. DataContext.jsx — Multi-Tenant Query Paths

**Key Changes:**
- All collection references changed from `collection(db, "leads")` to `collection(db, "organizations", orgId, "leads")`
- Helper functions `orgCollection()` and `orgDoc()` for consistent path building
- Users list now queries `memberships` filtered by `orgId` instead of global `users`
- Financial data still uses `collectionGroup('private')` but filters by orgId client-side

**Example Query Transformations:**

| Before | After |
|--------|-------|
| `collection(db, "leads")` | `collection(db, "organizations", orgId, "leads")` |
| `doc(db, "settings", "config")` | `doc(db, "organizations", orgId, "settings", "config")` |
| `doc(db, "users", phoneId)` | `doc(db, "memberships", `${uid}_${orgId}`)` |
| `collection(db, "activity")` | `collection(db, "organizations", orgId, "activity")` |

#### 3. Other Frontend Files Requiring Updates

- **Settings page**: Query path change only
- **Lead detail page**: Note writes need org-scoped path
- **User management**: Query memberships, not users
- **Goals page**: Query org-scoped goals

### Backend Changes

#### 1. server.js — Org Context Injection

**Current Problem:**
```javascript
// WhatsApp backend writes directly to global collections
await db.collection("leads").add(leadData);
```

**Multi-Tenant Solution:**
```javascript
// Option A: Per-org webhook endpoint
// POST /webhook/:orgId
// Org ID determined by webhook path

// Option B: Phone number → Org mapping
// Lookup which org this phone belongs to
const membership = await db.collection('memberships')
  .where('uid', '==', assignedToUid)
  .where('active', '==', true)
  .limit(1)
  .get();
const orgId = membership.docs[0].data().orgId;

await db.collection('organizations')
  .doc(orgId)
  .collection('leads')
  .add(leadData);
```

**For Phase 1:** Since there's only one default organization, hardcode the org ID via environment variable:
```javascript
const DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID;

await db.collection('organizations')
  .doc(DEFAULT_ORG_ID)
  .collection('leads')
  .add(leadData);
```

#### 2. utils/assignLead.js — Org-Scoped Round Robin

**Current:**
```javascript
const counterRef = db.collection('meta').doc('leadAssignment');
```

**Multi-Tenant:**
```javascript
const counterRef = db.collection('organizations')
  .doc(orgId)
  .collection('meta')
  .doc('leadAssignment');
```


---

## Security Rules Test Cases

### Test Environment Setup

Use Firebase Emulator Suite to verify rules:

```bash
# Install emulator
npm install -g firebase-tools

# Initialize emulator in project
firebase init emulators

# Run tests
firebase emulators:exec --only firestore "npm run test:rules"
```

### Test File Structure

```
firestore-tests/
├── rules.test.js           # Jest tests for Security Rules
├── firebase.json           # Emulator config
└── test-helpers.js         # Test utilities
```

### Critical Test Cases

#### Test 1: Cross-Tenant Isolation (MUST PASS)

```javascript
describe("Cross-tenant isolation", () => {
  it("User from Org A CANNOT read Org B's leads", async () => {
    const orgA = "org_a";
    const orgB = "org_b";
    const userA = { uid: "user_a", phone: "+911111111111" };
    
    // Setup: Create user A membership in Org A
    await firebase.assertSucceeds(
      db.collection('memberships').doc(`${userA.uid}_${orgA}`).set({
        uid: userA.uid,
        orgId: orgA,
        role: 'employee',
        active: true,
      })
    );
    
    // Setup: Create lead in Org B
    await adminDb.collection('organizations').doc(orgB).collection('leads').doc('lead_b').set({
      name: "Secret Lead",
      orgId: orgB,
    });
    
    // Test: User A tries to read Org B lead
    await firebase.assertFails(
      db.collection('organizations').doc(orgB).collection('leads').doc('lead_b').get()
    );
  });
});
```

#### Test 2: Employee Cannot Access Private Financials

```javascript
describe("Financial data access", () => {
  it("Employee CANNOT read private/financials subcollection", async () => {
    const orgId = "test_org";
    const employee = { uid: "employee_1" };
    
    // Setup employee membership
    await firebase.assertSucceeds(
      db.collection('memberships').doc(`${employee.uid}_${orgId}`).set({
        uid: employee.uid,
        orgId: orgId,
        role: 'employee',
        active: true,
      })
    );
    
    // Test: Employee tries to read private data
    await firebase.assertFails(
      db.collection('organizations').doc(orgId)
        .collection('leads').doc('lead_1')
        .collection('private').doc('data').get()
    );
  });
  
  it("Admin CAN read private/financials subcollection", async () => {
    const orgId = "test_org";
    const admin = { uid: "admin_1" };
    
    await firebase.assertSucceeds(
      db.collection('memberships').doc(`${admin.uid}_${orgId}`).set({
        uid: admin.uid,
        orgId: orgId,
        role: 'admin',
        active: true,
      })
    );
    
    await firebase.assertSucceeds(
      db.collection('organizations').doc(orgId)
        .collection('leads').doc('lead_1')
        .collection('private').doc('data').get()
    );
  });
});
```

#### Test 3: Employee Can Only Update Assigned Leads

```javascript
describe("Lead update restrictions", () => {
  it("Employee CANNOT update lead assigned to another employee", async () => {
    const orgId = "test_org";
    const employee1 = { uid: "emp_1" };
    const employee2 = { uid: "emp_2" };
    
    // Setup memberships
    await setupMembership(employee1.uid, orgId, 'employee');
    await setupMembership(employee2.uid, orgId, 'employee');
    
    // Create lead assigned to employee 2
    await adminDb.collection('organizations').doc(orgId)
      .collection('leads').doc('lead_1').set({
        assignedTo: employee2.uid,
        orgId: orgId,
      });
    
    // Test: Employee 1 tries to update
    await firebase.assertFails(
      db.collection('organizations').doc(orgId)
        .collection('leads').doc('lead_1').update({ status: "New" })
    );
  });
});
```


---

## Implementation Checklist

### Phase 1A: Files to Create

- [ ] `firestore.rules` — Complete Security Rules
- [ ] `firebase.json` — Firebase project configuration
- [ ] `firestore.indexes.json` — Required composite indexes
- [ ] `migrations/migrate-to-multi-tenant.js` — Migration script entry point
- [ ] `migrations/utils/firebase-admin.js` — Admin SDK initialization
- [ ] `migrations/utils/batch-write.js` — Batch write utilities
- [ ] `firestore-tests/rules.test.js` — Security Rules tests

### Phase 1B: Files to Modify

- [ ] `lead-erp/src/context/AuthContext.jsx` — Add membership loading, org selection
- [ ] `lead-erp/src/context/DataContext.jsx` — Update all collection paths to org-scoped
- [ ] `whatsapp-backend/server.js` — Add org context to lead creation
- [ ] `whatsapp-backend/utils/assignLead.js` — Update meta counter path
- [ ] `whatsapp-backend/package.json` — Add migration script dependencies

### Phase 1C: Configuration Changes

- [ ] `lead-erp/.env.example` — Add `VITE_DEFAULT_ORG_ID` variable
- [ ] `whatsapp-backend/.env.example` — Add `DEFAULT_ORG_ID` variable
- [ ] GitHub Actions / CI — Add Security Rules test step

### Phase 1D: Firebase Console Changes

- [ ] Create Firestore composite indexes for org-scoped queries
- [ ] Deploy Security Rules to staging project
- [ ] Run migration script on staging
- [ ] Verify data integrity post-migration
- [ ] Deploy to production

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Migration script fails mid-way | Medium | High | Run in staging first, backup before migration, idempotent script design |
| Security Rules break existing users | Medium | Critical | Test with emulator, gradual rollout, monitor error logs |
| Backend doesn't receive org context | Low | High | Environment variable fallback for default org in Phase 1 |
| Performance degradation with org-scoped queries | Low | Medium | Create proper indexes, monitor query performance |
| User has no membership after migration | Low | High | Migration creates memberships for all existing users |

---

## Out of Scope (Future Phases)

The following are explicitly **NOT** part of Phase 1:

- **Billing/Subscriptions**: No Stripe integration, no payment collection
- **Self-Serve Signup**: Org creation is manual/migration-only
- **WhatsApp Per-Tenant Routing**: Backend uses default org environment variable
- **Android App Rebrand**: No Play Store changes required
- **Platform/Super-Admin Role**: No cross-org admin capabilities
- **Organization Invite Flow**: Users added manually by admin for now
- **Organization Settings UI**: Settings document exists but no UI to change it
- **Data Export/Import**: No org data portability features

---

## Success Criteria

Phase 1 is complete when:

1. ✅ Security Rules prevent cross-tenant data access (verified by emulator test)
2. ✅ Existing users can log in and see their data in the default organization
3. ✅ All CRUD operations work with org-scoped paths
4. ✅ WhatsApp backend creates leads in the default organization
5. ✅ Lead assignment round-robin counter is org-scoped
6. ✅ Employee users cannot access private financial data
7. ✅ Admin users can access all data within their organization
8. ✅ Migration script has been run successfully on production
9. ✅ No data loss during migration (count validation passes)

---

## Appendix: Firestore Indexes Required

```json
{
  "indexes": [
    {
      "collectionGroup": "leads",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "assignedTo", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "leads",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "assignedTo", "order": "ASCENDING" },
        { "fieldPath": "lastUpdated", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "notifications",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "read", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "activity",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "at", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "memberships",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "uid", "order": "ASCENDING" },
        { "fieldPath": "active", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "memberships",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "orgId", "order": "ASCENDING" },
        { "fieldPath": "active", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

---

**Document End**
