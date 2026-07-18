# Phase 3: Multi-Tenant WhatsApp Backend

**Status:** Draft
**Phase:** 3 of N
**Last Updated:** 2025-07-16
**Prerequisites:** Phase 1 (Multi-Tenant Foundation) must be completed

---

## Executive Summary

This specification redesigns the WhatsApp backend service to support **per-organization WhatsApp Business API connections**, allowing each tenant to connect their own WhatsApp number. Key changes:

1. **Per-Organization WhatsApp Configuration** — Store credentials in Firestore, not .env
2. **Dynamic Webhook Routing** — Route incoming messages to correct organization
3. **Encrypted Credential Storage** — AES-256 encryption for access tokens
4. **Multi-Organization Cron Jobs** — Process pending queues for all organizations

### Key Outcomes
- Each organization connects their own WhatsApp Business number
- Credentials stored securely in Firestore (encrypted)
- Webhooks route automatically to correct organization
- Pending lead queue processed per-organization
- No shared WhatsApp credentials between tenants

---

## Current State Analysis

### Current Architecture (Single WhatsApp Number)

```
┌─────────────────────────────────────────────────────────────┐
│                    Meta WhatsApp API                         │
│                    (Single Phone Number)                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Webhook POST
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  whatsapp-backend/server.js                                  │
│                                                              │
│  - Uses WHATSAPP_ACCESS_TOKEN from .env (single credential) │
│  - Routes ALL messages to DEFAULT_ORG_ID                    │
│  - No credential encryption                                  │
│  - No per-org phone number support                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  organizations/{DEFAULT_ORG_ID}/leads                        │
│                                                              │
│  All WhatsApp leads go to single organization               │
└─────────────────────────────────────────────────────────────┘
```

### Problems with Current Design

| Problem | Impact |
|---------|--------|
| **Single WhatsApp number** | All tenants share one number — no multi-tenant support |
| **Credentials in .env** | Can't have different credentials per organization |
| **No encryption** | Access tokens stored in plaintext |
| **Hardcoded DEFAULT_ORG_ID** | No dynamic routing based on incoming phone number |
| **Single cron job** | Pending queue only processed for default org |
| **No webhook verification** | No way to verify which org a webhook belongs to |

### Current Code Analysis

#### Webhook Handler (server.js:230-245)
```javascript
app.post("/webhook", async (req, res) => {
  // Problem: Routes ALL messages to DEFAULT_ORG_ID
  // No phone_number_id → orgId mapping
  
  const message = change?.messages?.[0];
  // Missing: metadata.phone_number_id to identify which WhatsApp number received this
  
  const result = await importWhatsAppLead({ phone, name, requirement });
  // Problem: importWhatsAppLead only works with DEFAULT_ORG_ID
});
```

#### Cron Job (server.js:260-268)
```javascript
cron.schedule("*/5 * * * *", async () => {
  // Problem: Only processes DEFAULT_ORG_ID pending queue
  const imported = await processPendingQueue();
  // Problem: processPendingQueue() has DEFAULT_ORG_ID hardcoded
});
```

---

## Target Architecture

### Multi-Tenant WhatsApp Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Meta WhatsApp API                         │
│                                                              │
│  Phone: +91-XXXX-0001 (Org A)                               │
│  Phone: +91-XXXX-0002 (Org B)                               │
│  Phone: +91-XXXX-0003 (Org C)                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Webhook POST (includes phone_number_id)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  whatsapp-backend/server.js                                  │
│                                                              │
│  1. Extract phone_number_id from webhook                    │
│  2. Lookup orgId from whatsappConfigs collection            │
│  3. Decrypt org's WhatsApp access token                     │
│  4. Process message for that organization                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  whatsappConfigs/{phone_number_id}                           │
│                                                              │
│  - orgId: string                                            │
│  - phoneNumber: string (E164 format)                        │
│  - encryptedAccessToken: string (AES-256 encrypted)         │
│  - verifyToken: string                                      │
│  - isActive: boolean                                        │
│  - createdAt: timestamp                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  organizations/{orgId}/leads                                 │
│                                                              │
│  Leads routed to correct organization based on              │
│  phone_number_id in webhook                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Model

### New Collection: whatsappConfigs

```
whatsappConfigs/{phone_number_id}              # Keyed by Meta's phone_number_id
├── orgId: string                              # Reference to organization
├── phoneNumber: string                        # Display number (E164: "+91XXXXXXXXXX")
├── displayName: string                        # "Org A Sales"
├── encryptedAccessToken: string               # AES-256-GCM encrypted access token
├── encryptedAccessTokenIV: string             # Initialization vector for decryption
├── verifyToken: string                        # Webhook verification token
├── wabaId: string                             # WhatsApp Business Account ID
├── isActive: boolean                          # Enable/disable this configuration
├── createdBy: string                          # UID of user who set up this config
├── createdAt: timestamp
├── updatedAt: timestamp
└── lastWebhookAt: timestamp                   # Track last received message
```

### Updated Organization Document

```
organizations/{orgId}
├── ... existing fields ...
├── whatsappConfigId: string                   # FK to whatsappConfigs/{phone_number_id}
├── whatsappConnected: boolean                 # Has WhatsApp been configured?
└── whatsappPhoneNumber: string                # Display number for UI
```

### Security Rules for whatsappConfigs

```javascript
match /whatsappConfigs/{phone_number_id} {
  // Read: Org admins only
  allow read: if isAuthenticated() && 
                 isAdmin(resource.data.orgId);
  
  // Create: Org owner only (one config per org)
  allow create: if isAuthenticated() && 
                  request.resource.data.orgId != null &&
                  isOwner(request.resource.data.orgId);
  
  // Update: Org admin only
  allow update: if isAuthenticated() && 
                  isAdmin(resource.data.orgId);
  
  // Delete: Org owner only
  allow delete: if isAuthenticated() && 
                   isOwner(resource.data.orgId);
}
```

---

## Credential Encryption

### Encryption Strategy

**Algorithm:** AES-256-GCM (Galois/Counter Mode)

**Why AES-GCM?**
- Provides both encryption and authentication (AEAD)
- Built-in support in Node.js crypto module
- Industry standard for encrypting API tokens
- IV (initialization vector) ensures same token encrypts differently each time

### Implementation

```javascript
// utils/encryption.js

import crypto from 'crypto';

// Get encryption key from environment (32 bytes = 256 bits)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // Must be 32 characters

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  throw new Error('ENCRYPTION_KEY must be exactly 32 characters');
}

/**
 * Encrypt a plaintext string using AES-256-GCM
 * @param {string} plaintext - The text to encrypt (e.g., access token)
 * @returns {Object} { encrypted, iv, authTag }
 */
export function encrypt(plaintext) {
  const iv = crypto.randomBytes(16); // 16 bytes for AES-GCM
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    Buffer.from(ENCRYPTION_KEY),
    iv
  );
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypt an encrypted string using AES-256-GCM
 * @param {string} encrypted - The encrypted text
 * @param {string} ivHex - Initialization vector (hex encoded)
 * @param {string} authTagHex - Authentication tag (hex encoded)
 * @returns {string} Decrypted plaintext
 */
export function decrypt(encrypted, ivHex, authTagHex) {
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(ENCRYPTION_KEY),
    iv
  );
  
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Verify encryption key is valid
 */
export function testEncryption() {
  const test = 'test-access-token-12345';
  const { encrypted, iv, authTag } = encrypt(test);
  const decrypted = decrypt(encrypted, iv, authTag);
  
  if (decrypted !== test) {
    throw new Error('Encryption test failed');
  }
  
  console.log('✅ Encryption test passed');
}
```

---

## Webhook Routing

### Webhook Payload Analysis

When Meta sends a webhook, the payload includes:

```json
{
  "entry": [{
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "919876543210",
          "phone_number_id": "987654321098765"    // <-- This identifies the org
        },
        "contacts": [{
          "profile": { "name": "John Doe" },
          "wa_id": "919999888877"
        }],
        "messages": [{
          "from": "919999888877",
          "id": "wamid.HBgM...",
          "text": { "body": "I need a quote" }
        }]
      }
    }]
  }]
}
```

### New Webhook Handler

```javascript
// server.js

import { decrypt } from './utils/encryption.js';
import { getOrgByPhoneNumberId } from './utils/whatsappConfig.js';

app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    
    // Extract phone_number_id to identify which org this belongs to
    const phoneNumberId = value?.metadata?.phone_number_id;
    
    if (!phoneNumberId) {
      console.warn('Webhook missing phone_number_id');
      return res.sendStatus(400);
    }
    
    // Lookup organization by phone_number_id
    const config = await getOrgByPhoneNumberId(phoneNumberId);
    
    if (!config || !config.isActive) {
      console.warn(`No active WhatsApp config for phone_number_id: ${phoneNumberId}`);
      return res.sendStatus(200); // Acknowledge but ignore
    }
    
    const orgId = config.orgId;
    
    // Decrypt access token
    const accessToken = decrypt(
      config.encryptedAccessToken,
      config.encryptedAccessTokenIV,
      config.encryptedAccessTokenAuthTag
    );
    
    // Process message for this organization
    const message = value?.messages?.[0];
    const contact = value?.contacts?.[0];
    
    if (message) {
      const phone = message.from;
      const name = contact?.profile?.name || "WhatsApp Lead";
      const requirement = message.text?.body || "[Non-text message]";
      
      const result = await importWhatsAppLeadForOrg(orgId, accessToken, {
        phone,
        name,
        requirement,
        phoneNumberId,
      });
      
      console.log(`Webhook processed for org ${orgId}:`, result);
      
      // Update last webhook timestamp
      await updateLastWebhookTime(phoneNumberId);
    }
    
    res.sendStatus(200);
  } catch (e) {
    console.error("Webhook error:", e);
    res.sendStatus(200); // Always acknowledge to avoid retries
  }
});
```



---

## Multi-Organization Pending Queue Processor

### Problem with Current Implementation

```javascript
// Current: Only processes DEFAULT_ORG_ID
async function processPendingQueue() {
  if (!DEFAULT_ORG_ID) return 0;
  const snap = await orgCollection(DEFAULT_ORG_ID, "pending_leads").get();
  // ... only processes one org
}
```

### Solution: Iterate All Organizations

```javascript
// utils/pendingQueueProcessor.js

import { db } from './firebase-admin-init.js';
import { decrypt } from './encryption.js';
import { getOrgByPhoneNumberId, getActiveWhatsAppConfigs } from './whatsappConfig.js';

/**
 * Process pending leads for ALL organizations with active WhatsApp configs
 * @returns {Object} { processed: number, orgs: Object }
 */
export async function processAllPendingQueues() {
  const results = {
    processed: 0,
    orgs: {},
  };

  try {
    // 1. Get all active WhatsApp configurations
    const configs = await getActiveWhatsAppConfigs();
    
    if (configs.length === 0) {
      console.log('No active WhatsApp configurations found');
      return results;
    }

    // 2. Process pending queue for each organization
    for (const config of configs) {
      const orgId = config.orgId;
      const phoneNumberId = config.id; // phone_number_id is the document ID
      
      try {
        const count = await processPendingQueueForOrg(orgId, config);
        
        results.orgs[orgId] = {
          processed: count,
          phoneNumberId,
        };
        results.processed += count;
        
        if (count > 0) {
          console.log(`✅ Processed ${count} pending leads for org ${orgId}`);
        }
      } catch (error) {
        console.error(`❌ Error processing queue for org ${orgId}:`, error);
        results.orgs[orgId] = {
          error: error.message,
          processed: 0,
        };
      }
    }

    return results;
  } catch (error) {
    console.error('Error in processAllPendingQueues:', error);
    return results;
  }
}

/**
 * Process pending queue for a single organization
 * @param {string} orgId - Organization ID
 * @param {Object} config - WhatsApp configuration document
 * @returns {number} Number of leads processed
 */
async function processPendingQueueForOrg(orgId, config) {
  // Decrypt access token
  const accessToken = decrypt(
    config.encryptedAccessToken,
    config.encryptedAccessTokenIV,
    config.encryptedAccessTokenAuthTag
  );

  // Get pending leads for this org
  const pendingSnap = await db.collection('organizations')
    .doc(orgId)
    .collection('pending_leads')
    .orderBy('queuedAt', 'asc')
    .limit(50) // Process in batches
    .get();

  if (pendingSnap.empty) {
    return 0;
  }

  let processed = 0;

  for (const doc of pendingSnap.docs) {
    const data = doc.data();
    
    try {
      const result = await importWhatsAppLeadForOrg(orgId, accessToken, {
        phone: data.phone,
        name: data.name,
        requirement: data.requirement,
        phoneNumberId: config.id,
      });

      if (result.status !== 'queued') {
        await doc.ref.delete();
        processed++;
      }
    } catch (error) {
      console.error(`Error processing pending lead ${doc.id}:`, error);
      // Continue processing other leads
    }
  }

  return processed;
}

/**
 * Import a WhatsApp lead for a specific organization
 * @param {string} orgId - Organization ID
 * @param {string} accessToken - Decrypted WhatsApp access token
 * @param {Object} leadData - Lead data { phone, name, requirement, phoneNumberId }
 * @returns {Object} { status: string, leadId?: string }
 */
export async function importWhatsAppLeadForOrg(orgId, accessToken, leadData) {
  const { phone, name, requirement, phoneNumberId } = leadData;

  try {
    // 1. Duplicate Check - org-scoped
    const existing = await db.collection('organizations')
      .doc(orgId)
      .collection('leads')
      .where('phone', '==', phone)
      .limit(1)
      .get();

    if (!existing.empty) {
      const leadId = existing.docs[0].id;
      
      // Add note to existing lead
      await db.collection('organizations')
        .doc(orgId)
        .collection('leads')
        .doc(leadId)
        .collection('notes')
        .add({
          type: 'whatsapp',
          text: `New WhatsApp message: ${requirement}`,
          authorName: 'WhatsApp Sync',
          visibility: 'admin_only',
          at: new Date().toISOString(),
        });
      
      await db.collection('organizations')
        .doc(orgId)
        .collection('leads')
        .doc(leadId)
        .update({
          lastUpdated: new Date().toISOString(),
        });
      
      return { status: 'duplicate', leadId };
    }

    // 2. Get org settings for assignment mode
    const settingsDoc = await db.collection('organizations')
      .doc(orgId)
      .collection('settings')
      .doc('config')
      .get();
    
    const settings = settingsDoc.exists 
      ? settingsDoc.data() 
      : { autoAssign: 'round-robin' };

    let assignedTo = null;
    let assignedToName = null;

    // 3. Lead Assignment
    if (settings.autoAssign === 'workload') {
      const employee = await getNextEmployeeByWorkload(db, orgId);
      if (employee) {
        assignedTo = employee.id;
        assignedToName = employee.name || null;
      }
    } else {
      const employee = await getNextEmployeeRoundRobin(db, orgId);
      if (employee) {
        assignedTo = employee.id;
        assignedToName = employee.name || null;
      }
    }

    // 4. No employees - queue for later
    if (!assignedTo) {
      const existingPending = await db.collection('organizations')
        .doc(orgId)
        .collection('pending_leads')
        .where('phone', '==', phone)
        .limit(1)
        .get();
      
      if (existingPending.empty) {
        await db.collection('organizations')
          .doc(orgId)
          .collection('pending_leads')
          .add({
            phone,
            name,
            requirement,
            orgId,
            phoneNumberId,
            queuedAt: new Date().toISOString(),
          });
      }
      
      return { status: 'queued', reason: 'no_active_employees' };
    }

    // 5. Create lead
    const leadData = {
      name: name || 'WhatsApp Lead',
      phone,
      email: '',
      source: 'WhatsApp',
      requirement: requirement || '',
      status: 'New',
      assignedTo,
      assignedToName,
      blacklisted: false,
      priority: 'Warm',
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      followUp: null,
      lastContactedAt: null,
      orgId,
      whatsappPhoneNumberId: phoneNumberId,
    };

    const leadRef = await db.collection('organizations')
      .doc(orgId)
      .collection('leads')
      .add(leadData);

    // Initial note
    await leadRef.collection('notes').add({
      type: 'system',
      text: 'Lead created via WhatsApp',
      visibility: 'team',
      authorName: 'System',
      at: new Date().toISOString(),
    });

    // Notification
    await db.collection('organizations')
      .doc(orgId)
      .collection('notifications')
      .add({
        userId: assignedTo,
        text: `New WhatsApp lead: ${leadData.name} (${leadRef.id})`,
        read: false,
        at: new Date().toISOString(),
        orgId,
      });

    // Activity log
    await db.collection('organizations')
      .doc(orgId)
      .collection('activity')
      .add({
        text: `📲 WhatsApp lead auto-imported: ${leadData.name} → ${assignedTo}`,
        at: new Date().toISOString(),
        orgId,
      });

    return { status: 'created', leadId: leadRef.id };

  } catch (error) {
    console.error(`Error importing WhatsApp lead for org ${orgId}:`, error);
    throw error;
  }
}
```

---

## WhatsApp Configuration Management

### Utility Functions

```javascript
// utils/whatsappConfig.js

import { db } from './firebase-admin-init.js';
import { encrypt } from './encryption.js';

/**
 * Get WhatsApp configuration by phone_number_id
 * @param {string} phoneNumberId - Meta's phone_number_id
 * @returns {Object|null} Configuration document or null
 */
export async function getOrgByPhoneNumberId(phoneNumberId) {
  const doc = await db.collection('whatsappConfigs').doc(phoneNumberId).get();
  
  if (!doc.exists) return null;
  
  return { id: doc.id, ...doc.data() };
}

/**
 * Get all active WhatsApp configurations
 * @returns {Array} Array of configuration documents
 */
export async function getActiveWhatsAppConfigs() {
  const snap = await db.collection('whatsappConfigs')
    .where('isActive', '==', true)
    .get();

  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get WhatsApp configuration for an organization
 * @param {string} orgId - Organization ID
 * @returns {Object|null} Configuration document or null
 */
export async function getOrgWhatsAppConfig(orgId) {
  const snap = await db.collection('whatsappConfigs')
    .where('orgId', '==', orgId)
    .where('isActive', '==', true)
    .limit(1)
    .get();

  if (snap.empty) return null;

  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Create or update WhatsApp configuration for an organization
 * @param {string} orgId - Organization ID
 * @param {Object} config - Configuration data
 * @returns {Object} Created/updated configuration
 */
export async function upsertWhatsAppConfig(orgId, config) {
  const {
    phoneNumberId,
    phoneNumber,
    displayName,
    accessToken,
    verifyToken,
    wabaId,
    createdBy,
  } = config;

  // Encrypt access token
  const { encrypted, iv, authTag } = encrypt(accessToken);

  const configData = {
    orgId,
    phoneNumber,
    displayName: displayName || 'WhatsApp',
    encryptedAccessToken: encrypted,
    encryptedAccessTokenIV: iv,
    encryptedAccessTokenAuthTag: authTag,
    verifyToken,
    wabaId,
    isActive: true,
    createdBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastWebhookAt: null,
  };

  // Use phone_number_id as document ID
  await db.collection('whatsappConfigs').doc(phoneNumberId).set(configData, { merge: true });

  // Update organization document
  await db.collection('organizations').doc(orgId).update({
    whatsappConfigId: phoneNumberId,
    whatsappConnected: true,
    whatsappPhoneNumber: phoneNumber,
  });

  return { id: phoneNumberId, ...configData };
}

/**
 * Update last webhook timestamp
 * @param {string} phoneNumberId - Phone number ID
 */
export async function updateLastWebhookTime(phoneNumberId) {
  await db.collection('whatsappConfigs').doc(phoneNumberId).update({
    lastWebhookAt: new Date().toISOString(),
  });
}

/**
 * Deactivate WhatsApp configuration
 * @param {string} phoneNumberId - Phone number ID
 */
export async function deactivateWhatsAppConfig(phoneNumberId) {
  await db.collection('whatsappConfigs').doc(phoneNumberId).update({
    isActive: false,
    updatedAt: new Date().toISOString(),
  });

  // Get orgId to update organization document
  const doc = await db.collection('whatsappConfigs').doc(phoneNumberId).get();
  if (doc.exists) {
    await db.collection('organizations').doc(doc.data().orgId).update({
      whatsappConnected: false,
    });
  }
}
```



---

## API Endpoints

### Backend Routes

```javascript
// routes/whatsapp.js

import express from 'express';
import { db } from '../firebase-admin-init.js';
import { upsertWhatsAppConfig, getOrgWhatsAppConfig, deactivateWhatsAppConfig } from '../utils/whatsappConfig.js';
import { processAllPendingQueues } from '../utils/pendingQueueProcessor.js';

const router = express.Router();

// ============================================================
// GET /api/whatsapp/config/:orgId
// Get WhatsApp configuration for an organization
// ============================================================
router.get('/config/:orgId', async (req, res) => {
  const { orgId } = req.params;
  const uid = req.user?.uid;

  if (!uid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Verify user is admin of this org
    const membership = await db.collection('memberships')
      .doc(`${uid}_${orgId}`)
      .get();

    if (!membership.exists || !['admin', 'owner'].includes(membership.data().role)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const config = await getOrgWhatsAppConfig(orgId);

    if (!config) {
      return res.json({ configured: false });
    }

    // Don't expose encrypted token
    res.json({
      configured: true,
      phoneNumberId: config.id,
      phoneNumber: config.phoneNumber,
      displayName: config.displayName,
      isActive: config.isActive,
      lastWebhookAt: config.lastWebhookAt,
    });

  } catch (error) {
    console.error('Error fetching WhatsApp config:', error);
    res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

// ============================================================
// POST /api/whatsapp/config
// Create or update WhatsApp configuration
// ============================================================
router.post('/config', async (req, res) => {
  const {
    orgId,
    phoneNumberId,
    phoneNumber,
    displayName,
    accessToken,
    verifyToken,
    wabaId,
  } = req.body;

  const uid = req.user?.uid;

  if (!uid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Validate required fields
  if (!orgId || !phoneNumberId || !phoneNumber || !accessToken || !verifyToken) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Verify user is owner of this org (only owners can configure WhatsApp)
    const membership = await db.collection('memberships')
      .doc(`${uid}_${orgId}`)
      .get();

    if (!membership.exists || membership.data().role !== 'owner') {
      return res.status(403).json({ error: 'Only organization owners can configure WhatsApp' });
    }

    // Verify this phone_number_id isn't already used by another org
    const existingConfig = await db.collection('whatsappConfigs')
      .doc(phoneNumberId)
      .get();

    if (existingConfig.exists && existingConfig.data().orgId !== orgId) {
      return res.status(400).json({ 
        error: 'This WhatsApp number is already configured for another organization' 
      });
    }

    // Upsert configuration
    const config = await upsertWhatsAppConfig(orgId, {
      phoneNumberId,
      phoneNumber,
      displayName,
      accessToken,
      verifyToken,
      wabaId,
      createdBy: uid,
    });

    res.json({
      success: true,
      phoneNumberId: config.id,
      phoneNumber: config.phoneNumber,
    });

  } catch (error) {
    console.error('Error saving WhatsApp config:', error);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// ============================================================
// DELETE /api/whatsapp/config/:orgId
// Deactivate WhatsApp configuration
// ============================================================
router.delete('/config/:orgId', async (req, res) => {
  const { orgId } = req.params;
  const uid = req.user?.uid;

  if (!uid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Verify user is owner
    const membership = await db.collection('memberships')
      .doc(`${uid}_${orgId}`)
      .get();

    if (!membership.exists || membership.data().role !== 'owner') {
      return res.status(403).json({ error: 'Only organization owners can disconnect WhatsApp' });
    }

    const config = await getOrgWhatsAppConfig(orgId);

    if (!config) {
      return res.status(404).json({ error: 'WhatsApp not configured' });
    }

    await deactivateWhatsAppConfig(config.id);

    res.json({ success: true, message: 'WhatsApp disconnected' });

  } catch (error) {
    console.error('Error deactivating WhatsApp config:', error);
    res.status(500).json({ error: 'Failed to disconnect WhatsApp' });
  }
});

// ============================================================
// POST /api/whatsapp/verify-webhook
// Verify webhook URL for Meta
// ============================================================
router.get('/verify-webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // For multi-tenant, we need to find which org this verify_token belongs to
  // This is called during initial setup in Meta dashboard
  
  // Simple approach: Use a global verify token for all orgs
  // Better approach: Store verify_token per-org and look it up
  
  if (mode === 'subscribe' && token) {
    // Look up config by verify_token
    db.collection('whatsappConfigs')
      .where('verifyToken', '==', token)
      .limit(1)
      .get()
      .then(snap => {
        if (!snap.empty) {
          return res.status(200).send(challenge);
        }
        res.sendStatus(403);
      })
      .catch(err => {
        console.error('Webhook verification error:', err);
        res.sendStatus(403);
      });
  } else {
    res.sendStatus(403);
  }
});

// ============================================================
// POST /api/whatsapp/sync-all
// Manual trigger to process all pending queues
// ============================================================
router.post('/sync-all', async (req, res) => {
  const uid = req.user?.uid;

  if (!uid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // This should be restricted to super-admins or platform admins
  // For now, allow any authenticated user

  try {
    const results = await processAllPendingQueues();
    
    res.json({
      success: true,
      processed: results.processed,
      orgs: results.orgs,
    });

  } catch (error) {
    console.error('Error syncing all queues:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

export default router;
```

---

## Updated Cron Job

```javascript
// server.js (updated)

import cron from 'node-cron';
import { processAllPendingQueues } from './utils/pendingQueueProcessor.js';

// ============================================================
// CRON: 5-minute safety-net (Process ALL organizations)
// ============================================================
cron.schedule('*/5 * * * *', async () => {
  try {
    console.log('⏱ Running 5-minute pending queue sync for all organizations...');
    
    const results = await processAllPendingQueues();
    
    if (results.processed > 0) {
      console.log(`✅ Processed ${results.processed} pending leads across ${Object.keys(results.orgs).length} organizations`);
      
      // Log details per org
      for (const [orgId, data] of Object.entries(results.orgs)) {
        if (data.processed > 0) {
          console.log(`   - Org ${orgId}: ${data.processed} leads`);
        }
      }
    } else {
      console.log('   No pending leads to process');
    }
  } catch (e) {
    console.error('5-min cron error:', e);
  }
});

// ============================================================
// CRON: Daily WhatsApp health check (runs at midnight)
// ============================================================
cron.schedule('0 0 * * *', async () => {
  try {
    console.log('🔍 Running daily WhatsApp health check...');
    
    const configs = await getActiveWhatsAppConfigs();
    
    for (const config of configs) {
      // Check if webhook received in last 24 hours
      const lastWebhook = config.lastWebhookAt 
        ? new Date(config.lastWebhookAt) 
        : null;
      
      const hoursSinceLastWebhook = lastWebhook
        ? (Date.now() - lastWebhook.getTime()) / (1000 * 60 * 60)
        : Infinity;
      
      if (hoursSinceLastWebhook > 24) {
        console.warn(`⚠️ No webhook received for org ${config.orgId} in ${Math.round(hoursSinceLastWebhook)} hours`);
        
        // Notify org admins
        await notifyAdminsNoWebhook(config.orgId, hoursSinceLastWebhook);
      }
    }
    
    console.log('✅ Daily health check complete');
  } catch (e) {
    console.error('Daily health check error:', e);
  }
});

async function notifyAdminsNoWebhook(orgId, hoursSince) {
  // Get all admins for this org
  const adminsSnap = await db.collection('memberships')
    .where('orgId', '==', orgId)
    .where('role', 'in', ['admin', 'owner'])
    .where('active', '==', true)
    .get();

  const batch = db.batch();

  adminsSnap.docs.forEach(doc => {
    const notifRef = db.collection('organizations')
      .doc(orgId)
      .collection('notifications')
      .doc();
    
    batch.set(notifRef, {
      userId: doc.data().uid,
      text: `⚠️ No WhatsApp messages received in ${Math.round(hoursSince)} hours. Check your WhatsApp configuration.`,
      type: 'system',
      read: false,
      at: new Date().toISOString(),
    });
  });

  await batch.commit();
}
```



---

## Frontend Components

### WhatsApp Setup Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 1: Introduction                              │
│  - Explain what WhatsApp integration provides                        │
│  - Requirements: Meta Business Manager, WhatsApp Business API       │
│  - Link to Meta documentation                                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 2: Create Meta App                           │
│  - Instructions for creating Meta Business Manager account          │
│  - Create WhatsApp Business Account                                 │
│  - Get Phone Number ID and Permanent Access Token                   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 3: Configure Webhook                         │
│  - Display webhook URL: https://api.example.com/webhook             │
│  - Generate verify token (or use existing)                          │
│  - Instructions for Meta dashboard webhook setup                    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 4: Enter Credentials                         │
│  - Phone Number ID (from Meta dashboard)                            │
│  - Access Token (permanent token)                                   │
│  - Display Name (for this WhatsApp number)                          │
│  - Verify Token (generated in step 3)                               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 5: Test & Confirm                            │
│  - Send test message to WhatsApp number                             │
│  - Verify webhook received                                          │
│  - Confirm lead created in system                                   │
│  - Mark setup as complete                                           │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Structure

```
lead-erp/src/
├── pages/
│   └── admin/
│       └── WhatsAppSetup.jsx        # Multi-step setup wizard
├── components/
│   └── whatsapp/
│       ├── SetupStep.jsx            # Individual setup step
│       ├── CredentialsForm.jsx      # Form for API credentials
│       ├── WebhookConfig.jsx        # Webhook URL display
│       ├── TestMessage.jsx          # Send test message
│       └── ConnectionStatus.jsx     # Connected/Disconnected status
└── context/
    └── WhatsAppContext.jsx          # WhatsApp state management
```

### WhatsAppSetup.jsx

```jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Check, ChevronRight, AlertCircle, ExternalLink } from 'lucide-react';

export default function WhatsAppSetup() {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState({
    phoneNumberId: '',
    phoneNumber: '',
    displayName: '',
    accessToken: '',
    verifyToken: generateVerifyToken(),
    wabaId: '',
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [existingConfig, setExistingConfig] = useState(null);

  useEffect(() => {
    loadExistingConfig();
  }, [user]);

  async function loadExistingConfig() {
    if (!user?.activeOrgId) return;
    
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/whatsapp/config/${user.activeOrgId}`, {
        headers: {
          'Authorization': `Bearer ${await user.getIdToken()}`,
        },
      });
      
      const data = await res.json();
      
      if (data.configured) {
        setExistingConfig(data);
        setConfig(prev => ({
          ...prev,
          phoneNumberId: data.phoneNumberId,
          phoneNumber: data.phoneNumber,
          displayName: data.displayName,
        }));
      }
    } catch (e) {
      console.error('Error loading WhatsApp config:', e);
    }
  }

  async function saveConfig() {
    setSaving(true);
    
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/whatsapp/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({
          orgId: user.activeOrgId,
          ...config,
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setStep(5); // Go to test step
      } else {
        alert('Error: ' + data.error);
      }
    } catch (e) {
      alert('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  async function sendTestMessage() {
    setTesting(true);
    setTestResult(null);
    
    try {
      // In production, this would send a test message via WhatsApp API
      // For now, simulate it
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setTestResult({ success: true, message: 'Test message sent successfully!' });
    } catch (e) {
      setTestResult({ success: false, message: 'Failed to send test message' });
    } finally {
      setTesting(false);
    }
  }

  const steps = [
    { number: 1, title: 'Introduction', completed: step > 1 },
    { number: 2, title: 'Create Meta App', completed: step > 2 },
    { number: 3, title: 'Configure Webhook', completed: step > 3 },
    { number: 4, title: 'Enter Credentials', completed: step > 4 },
    { number: 5, title: 'Test & Confirm', completed: false },
  ];

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((s, i) => (
            <div key={s.number} className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                s.completed 
                  ? 'bg-green-500 text-white' 
                  : step === s.number 
                    ? 'bg-ink text-white' 
                    : 'bg-gray-200 text-gray-500'
              }`}>
                {s.completed ? <Check className="w-5 h-5" /> : s.number}
              </div>
              <span className={`ml-2 text-sm ${step === s.number ? 'font-bold' : 'text-gray-500'}`}>
                {s.title}
              </span>
              {i < steps.length - 1 && (
                <div className="w-20 h-0.5 bg-gray-200 mx-4" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        {step === 1 && (
          <IntroductionStep onNext={() => setStep(2)} />
        )}
        
        {step === 2 && (
          <MetaAppStep 
            onNext={() => setStep(3)} 
            onBack={() => setStep(1)} 
          />
        )}
        
        {step === 3 && (
          <WebhookConfigStep 
            verifyToken={config.verifyToken}
            onNext={() => setStep(4)} 
            onBack={() => setStep(2)} 
          />
        )}
        
        {step === 4 && (
          <CredentialsFormStep 
            config={config}
            setConfig={setConfig}
            onNext={saveConfig} 
            onBack={() => setStep(3)}
            saving={saving}
          />
        )}
        
        {step === 5 && (
          <TestStep 
            testResult={testResult}
            onTest={sendTestMessage}
            testing={testing}
          />
        )}
      </div>

      {/* Already Connected Banner */}
      {existingConfig?.configured && (
        <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Check className="w-6 h-6 text-green-600" />
            <div>
              <p className="font-bold text-green-800">WhatsApp Connected</p>
              <p className="text-sm text-green-700">
                Phone: {existingConfig.phoneNumber} | Last message: {existingConfig.lastWebhookAt 
                  ? new Date(existingConfig.lastWebhookAt).toLocaleString() 
                  : 'Never'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IntroductionStep({ onNext }) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Connect WhatsApp Business API</h2>
      <p className="text-gray-600 mb-6">
        Connect your WhatsApp Business number to automatically import leads from WhatsApp messages.
        Each incoming message will create a new lead in your organization.
      </p>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="font-bold text-blue-800 mb-2">Requirements</h3>
        <ul className="text-sm text-blue-700 space-y-2">
          <li className="flex items-center gap-2">
            <Check className="w-4 h-4" /> Meta Business Manager account
          </li>
          <li className="flex items-center gap-2">
            <Check className="w-4 h-4" /> WhatsApp Business Account
          </li>
          <li className="flex items-center gap-2">
            <Check className="w-4 h-4" /> A WhatsApp Business phone number
          </li>
          <li className="flex items-center gap-2">
            <Check className="w-4 h-4" /> Permanent Access Token from Meta
          </li>
        </ul>
      </div>

      <button onClick={onNext} className="bg-ink text-white px-6 py-3 rounded-lg font-medium">
        Get Started <ChevronRight className="inline w-4 h-4" />
      </button>
    </div>
  );
}

function MetaAppStep({ onNext, onBack }) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Create Meta App</h2>
      <p className="text-gray-600 mb-6">
        Follow these steps to create a Meta app and get your WhatsApp Business API credentials.
      </p>

      <div className="space-y-4 mb-6">
        <div className="border rounded-lg p-4">
          <h3 className="font-bold mb-2">Step 1: Create Meta Business Manager Account</h3>
          <p className="text-sm text-gray-600 mb-2">
            Go to Meta Business Manager and create an account if you don't have one.
          </p>
          <a href="https://business.facebook.com/" target="_blank" rel="noopener" 
            className="text-blue-600 text-sm inline-flex items-center gap-1">
            Open Meta Business Manager <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="font-bold mb-2">Step 2: Create WhatsApp Business Account</h3>
          <p className="text-sm text-gray-600 mb-2">
            In Business Manager, create a WhatsApp Business Account and add a phone number.
          </p>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="font-bold mb-2">Step 3: Get Credentials</h3>
          <p className="text-sm text-gray-600 mb-2">
            Navigate to WhatsApp → API Setup and note down:
          </p>
          <ul className="text-sm text-gray-600 list-disc list-inside">
            <li>Phone Number ID</li>
            <li>Permanent Access Token</li>
            <li>WhatsApp Business Account ID (WABA ID)</li>
          </ul>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="px-6 py-3 border rounded-lg">
          Back
        </button>
        <button onClick={onNext} className="bg-ink text-white px-6 py-3 rounded-lg font-medium">
          Next: Configure Webhook
        </button>
      </div>
    </div>
  );
}

function WebhookConfigStep({ verifyToken, onNext, onBack }) {
  const webhookUrl = `${import.meta.env.VITE_BACKEND_URL}/webhook`;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Configure Webhook</h2>
      <p className="text-gray-600 mb-6">
        Configure the webhook URL in your Meta app to receive incoming messages.
      </p>

      <div className="space-y-4 mb-6">
        <div className="border rounded-lg p-4">
          <h3 className="font-bold mb-2">Webhook URL</h3>
          <p className="text-sm text-gray-600 mb-2">
            Copy this URL and paste it in your Meta app's WhatsApp webhook configuration:
          </p>
          <div className="bg-gray-50 p-3 rounded font-mono text-sm break-all">
            {webhookUrl}
          </div>
          <button 
            onClick={() => navigator.clipboard.writeText(webhookUrl)}
            className="text-blue-600 text-sm mt-2"
          >
            Copy to clipboard
          </button>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="font-bold mb-2">Verify Token</h3>
          <p className="text-sm text-gray-600 mb-2">
            Use this token when verifying the webhook in Meta dashboard:
          </p>
          <div className="bg-gray-50 p-3 rounded font-mono text-sm">
            {verifyToken}
          </div>
          <button 
            onClick={() => navigator.clipboard.writeText(verifyToken)}
            className="text-blue-600 text-sm mt-2"
          >
            Copy to clipboard
          </button>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <strong>Important:</strong> After entering the webhook URL in Meta dashboard, 
              click "Verify and Save". The verification should succeed automatically.
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="px-6 py-3 border rounded-lg">
          Back
        </button>
        <button onClick={onNext} className="bg-ink text-white px-6 py-3 rounded-lg font-medium">
          Next: Enter Credentials
        </button>
      </div>
    </div>
  );
}

function CredentialsFormStep({ config, setConfig, onNext, onBack, saving }) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Enter Credentials</h2>
      <p className="text-gray-600 mb-6">
        Enter your WhatsApp Business API credentials.
      </p>

      <form onSubmit={(e) => { e.preventDefault(); onNext(); }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Phone Number ID *</label>
          <input
            type="text"
            required
            value={config.phoneNumberId}
            onChange={(e) => setConfig({ ...config, phoneNumberId: e.target.value })}
            className="w-full border rounded-lg p-3"
            placeholder="e.g., 987654321098765"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Phone Number *</label>
          <input
            type="text"
            required
            value={config.phoneNumber}
            onChange={(e) => setConfig({ ...config, phoneNumber: e.target.value })}
            className="w-full border rounded-lg p-3"
            placeholder="+91 98765 43210"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Display Name</label>
          <input
            type="text"
            value={config.displayName}
            onChange={(e) => setConfig({ ...config, displayName: e.target.value })}
            className="w-full border rounded-lg p-3"
            placeholder="e.g., Sales Team"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Permanent Access Token *</label>
          <input
            type="password"
            required
            value={config.accessToken}
            onChange={(e) => setConfig({ ...config, accessToken: e.target.value })}
            className="w-full border rounded-lg p-3"
            placeholder="Your permanent access token from Meta"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">WhatsApp Business Account ID</label>
          <input
            type="text"
            value={config.wabaId}
            onChange={(e) => setConfig({ ...config, wabaId: e.target.value })}
            className="w-full border rounded-lg p-3"
            placeholder="e.g., 123456789012345"
          />
        </div>

        <div className="flex gap-3 pt-4">
          <button type="button" onClick={onBack} className="px-6 py-3 border rounded-lg">
            Back
          </button>
          <button 
            type="submit" 
            disabled={saving}
            className="bg-ink text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save & Continue'}
          </button>
        </div>
      </form>
    </div>
  );
}

function TestStep({ testResult, onTest, testing }) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Test & Confirm</h2>
      <p className="text-gray-600 mb-6">
        Send a test message to verify your WhatsApp integration is working correctly.
      </p>

      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
        <div className="flex items-center gap-3">
          <Check className="w-6 h-6 text-green-600" />
          <div>
            <p className="font-bold text-green-800">Configuration Saved!</p>
            <p className="text-sm text-green-700">
              Your WhatsApp credentials have been encrypted and stored securely.
            </p>
          </div>
        </div>
      </div>

      <div className="border rounded-lg p-4 mb-6">
        <h3 className="font-bold mb-2">Test Your Integration</h3>
        <p className="text-sm text-gray-600 mb-4">
          Send a WhatsApp message to your configured business number. 
          The message should appear as a new lead in your dashboard within seconds.
        </p>
        
        <button 
          onClick={onTest}
          disabled={testing}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium"
        >
          {testing ? 'Sending...' : 'Send Test Message'}
        </button>

        {testResult && (
          <div className={`mt-4 p-3 rounded ${testResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {testResult.message}
          </div>
        )}
      </div>

      <p className="text-sm text-gray-500">
        Need help? Check the <a href="#" className="text-blue-600 underline">WhatsApp Integration Guide</a>.
      </p>
    </div>
  );
}

function generateVerifyToken() {
  return 'verify_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
```



---

## Security Considerations

### Credential Storage

| Aspect | Implementation |
|--------|----------------|
| **Encryption Algorithm** | AES-256-GCM (authenticated encryption) |
| **Key Management** | ENCRYPTION_KEY stored in environment (32 characters) |
| **IV (Initialization Vector)** | Random 16 bytes per encryption |
| **Auth Tag** | Required for decryption verification |
| **Storage** | Firestore document with encrypted + IV + authTag fields |

### Key Rotation Strategy

```javascript
// scripts/rotateEncryptionKey.js

import { db } from '../firebase-admin-init.js';
import { decrypt, encrypt } from '../utils/encryption.js';

/**
 * Rotate encryption key for all WhatsApp configurations
 * 
 * Process:
 * 1. Set NEW_ENCRYPTION_KEY in environment
 * 2. Run this script
 * 3. Update ENCRYPTION_KEY to NEW_ENCRYPTION_KEY
 * 4. Restart servers
 */
async function rotateEncryptionKey() {
  const oldKey = process.env.ENCRYPTION_KEY;
  const newKey = process.env.NEW_ENCRYPTION_KEY;

  if (!oldKey || !newKey) {
    throw new Error('Both ENCRYPTION_KEY and NEW_ENCRYPTION_KEY must be set');
  }

  // Temporarily set to old key for decryption
  process.env.ENCRYPTION_KEY = oldKey;

  const configs = await db.collection('whatsappConfigs').get();
  
  console.log(`Rotating encryption key for ${configs.size} configurations...`);

  for (const doc of configs.docs) {
    const data = doc.data();
    
    try {
      // Decrypt with old key
      const plaintext = decrypt(
        data.encryptedAccessToken,
        data.encryptedAccessTokenIV,
        data.encryptedAccessTokenAuthTag
      );

      // Switch to new key
      process.env.ENCRYPTION_KEY = newKey;

      // Re-encrypt with new key
      const { encrypted, iv, authTag } = encrypt(plaintext);

      // Update document
      await doc.ref.update({
        encryptedAccessToken: encrypted,
        encryptedAccessTokenIV: iv,
        encryptedAccessTokenAuthTag: authTag,
        keyRotatedAt: new Date().toISOString(),
      });

      console.log(`✅ Rotated key for ${doc.id}`);

      // Switch back to old key for next iteration
      process.env.ENCRYPTION_KEY = oldKey;
    } catch (error) {
      console.error(`❌ Failed to rotate key for ${doc.id}:`, error);
    }
  }

  console.log('Key rotation complete!');
}
```

### Webhook Security

| Threat | Mitigation |
|--------|------------|
| **Spoofed webhooks** | Verify X-Hub-Signature-256 header (HMAC-SHA256) |
| **Replay attacks** | Check timestamp in payload, reject old messages |
| **Credential exposure** | Never log access tokens, use encrypted storage |
| **Unauthorized access** | Verify phone_number_id maps to active config |

### Webhook Signature Verification (Optional Enhancement)

```javascript
import crypto from 'crypto';

function verifyWebhookSignature(payload, signature, appSecret) {
  const expectedSignature = 'sha256=' + 
    crypto
      .createHmac('sha256', appSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

---

## Environment Variables

### Required Environment Variables

```bash
# Encryption
ENCRYPTION_KEY=your-32-character-encryption-key-here!!

# Firebase Admin SDK
# (serviceAccountKey.json file)

# Server Configuration
PORT=3001

# Legacy (for backward compatibility during migration)
DEFAULT_ORG_ID=your_default_org_id
WHATSAPP_VERIFY_TOKEN=legacy_verify_token
WHATSAPP_ACCESS_TOKEN=legacy_access_token
WHATSAPP_PHONE_NUMBER_ID=legacy_phone_number_id
```

### Generating Encryption Key

```bash
# Generate a secure 32-character encryption key
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

---

## Migration Strategy

### Step-by-Step Migration

1. **Add encryption utilities** — Deploy `utils/encryption.js`
2. **Create whatsappConfigs collection** — Run migration script for default org
3. **Update webhook handler** — Deploy new multi-tenant webhook
4. **Update cron job** — Deploy multi-org pending queue processor
5. **Add API endpoints** — Deploy WhatsApp configuration routes
6. **Deploy frontend** — WhatsApp setup wizard
7. **Verify functionality** — Test with default org
8. **Remove legacy env vars** — After all orgs migrated

### Migration Script for Default Org

```javascript
// scripts/migrateWhatsAppConfig.js

import { db } from '../firebase-admin-init.js';
import { encrypt } from '../utils/encryption.js';
import 'dotenv/config';

async function migrateDefaultOrg() {
  const orgId = process.env.DEFAULT_ORG_ID;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!orgId || !phoneNumberId || !accessToken) {
    throw new Error('Missing required environment variables');
  }

  // Encrypt access token
  const { encrypted, iv, authTag } = encrypt(accessToken);

  // Create whatsappConfigs document
  await db.collection('whatsappConfigs').doc(phoneNumberId).set({
    orgId,
    phoneNumber: process.env.WHATSAPP_PHONE_NUMBER || '+919999888877',
    displayName: 'Default WhatsApp',
    encryptedAccessToken: encrypted,
    encryptedAccessTokenIV: iv,
    encryptedAccessTokenAuthTag: authTag,
    verifyToken,
    wabaId: process.env.WHATSAPP_WABA_ID || null,
    isActive: true,
    createdBy: 'migration-script',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastWebhookAt: null,
  });

  // Update organization document
  await db.collection('organizations').doc(orgId).update({
    whatsappConfigId: phoneNumberId,
    whatsappConnected: true,
    whatsappPhoneNumber: process.env.WHATSAPP_PHONE_NUMBER || '+919999888877',
  });

  console.log(`✅ Migrated WhatsApp config for org ${orgId}`);
  console.log(`   Phone Number ID: ${phoneNumberId}`);
}

migrateDefaultOrg();
```

---

## Implementation Checklist

### Phase 3A: Backend Infrastructure

- [ ] Create `utils/encryption.js` with AES-256-GCM encryption/decryption
- [ ] Create `utils/whatsappConfig.js` with configuration management functions
- [ ] Create `utils/pendingQueueProcessor.js` with multi-org processing
- [ ] Create `routes/whatsapp.js` with configuration API endpoints
- [ ] Update `server.js` webhook handler for multi-tenant routing
- [ ] Update `server.js` cron job for multi-org pending queue
- [ ] Add daily webhook health check cron job
- [ ] Test encryption/decryption with sample token

### Phase 3B: Database & Security

- [ ] Create `whatsappConfigs` collection structure
- [ ] Add Firestore Security Rules for `whatsappConfigs`
- [ ] Update organization document schema (add whatsapp fields)
- [ ] Create Firestore indexes for whatsappConfigs queries
- [ ] Write Security Rules tests for configuration access

### Phase 3C: Migration

- [ ] Run migration script for default org
- [ ] Verify legacy webhook still works during transition
- [ ] Test new multi-tenant webhook routing
- [ ] Verify encryption key works in staging environment
- [ ] Document key rotation process

### Phase 3D: Frontend

- [ ] Create `WhatsAppSetup.jsx` multi-step wizard
- [ ] Create `WhatsAppContext.jsx` for state management
- [ ] Add WhatsApp setup link to admin settings page
- [ ] Add connection status indicator to dashboard
- [ ] Add "Disconnect WhatsApp" functionality

### Phase 3E: Testing & Documentation

- [ ] Test webhook with multiple phone_number_ids
- [ ] Test pending queue processing for multiple orgs
- [ ] Test credential encryption/decryption
- [ ] Test key rotation process
- [ ] Write API documentation for WhatsApp endpoints
- [ ] Create user guide for WhatsApp setup

### Phase 3F: Monitoring & Alerting

- [ ] Add webhook health monitoring (daily check)
- [ ] Set up alerts for failed webhook processing
- [ ] Set up alerts for encryption errors
- [ ] Add logging for configuration changes
- [ ] Create dashboard for WhatsApp status per org

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Encryption key leaked | Low | Critical | Rotate key immediately, use separate key per environment |
| Webhook not routed to correct org | Low | High | Test thoroughly, verify phone_number_id mapping |
| Access token expires | Medium | High | Use permanent tokens, implement token refresh |
| Meta rate limits exceeded | Medium | Medium | Implement backoff, queue messages |
| Pending queue processing failure | Low | Medium | Retry logic, manual sync button |
| Phone number disconnected from Meta | Low | High | Daily health check, admin notifications |

---

## Out of Scope (Future Phases)

The following are explicitly **NOT** part of Phase 3:

- **Outbound WhatsApp messages** — This phase only handles inbound lead creation
- **WhatsApp Template Messages** — Not implementing outbound marketing messages
- **Multi-number per org** — Each org can only connect one WhatsApp number in Phase 3
- **WhatsApp Business API webhook subscription management** — Manual setup in Meta dashboard
- **Message analytics dashboard** — No WhatsApp message statistics
- **Auto-reply messages** — No automated responses to incoming messages
- **WhatsApp Flow integration** — No interactive forms

---

## Success Criteria

Phase 3 is complete when:

1. ✅ Each organization can connect their own WhatsApp Business number
2. ✅ Credentials are encrypted before storage (AES-256-GCM)
3. ✅ Webhooks route to correct organization based on phone_number_id
4. ✅ Pending queue processed for all organizations with active WhatsApp configs
5. ✅ Admin can configure WhatsApp via frontend setup wizard
6. ✅ Daily health check notifies admins if no webhooks received
7. ✅ Legacy DEFAULT_ORG_ID migration completed
8. ✅ Security Rules prevent cross-org configuration access
9. ✅ All tests pass in staging environment
10. ✅ Documentation complete for setup process

---

## Appendix: Webhook Flow Diagram

```
Meta WhatsApp API
        │
        │ POST /webhook
        │ Body: { entry: [{ changes: [{ value: { metadata: { phone_number_id: "123" } } }] }] }
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  whatsapp-backend/server.js                                          │
│                                                                      │
│  1. Extract phone_number_id from webhook payload                    │
│  2. Query whatsappConfigs/{phone_number_id}                         │
│  3. If found and active:                                            │
│     - Decrypt access_token using ENCRYPTION_KEY                     │
│     - Get orgId from config                                         │
│     - Process message for orgId                                     │
│  4. If not found:                                                   │
│     - Log warning                                                   │
│     - Return 200 (acknowledge but ignore)                           │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  importWhatsAppLeadForOrg(orgId, accessToken, leadData)             │
│                                                                      │
│  - Check for duplicates in org/{orgId}/leads                        │
│  - Auto-assign using org settings (round-robin/workload)            │
│  - Create lead in org/{orgId}/leads                                 │
│  - Create notification for assigned user                            │
│  - Log activity in org/{orgId}/activity                             │
│  - Update lastWebhookAt in whatsappConfigs                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

**Document End**
