/**
 * Test helpers for Firestore Security Rules testing
 * Uses @firebase/rules-unit-testing package
 */

import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';

let testEnv = null;

/**
 * Initialize the test environment with Firestore emulator
 */
export async function initTestEnv() {
  if (testEnv) return testEnv;

  testEnv = await initializeTestEnvironment({
    projectId: 'sns-ads-erp-test',
    firestore: {
      rules: readFileSync('../firestore.rules', 'utf8'),
      host: 'localhost',
      port: 8080,
    },
  });

  return testEnv;
}

/**
 * Clean up the test environment
 */
export async function cleanupTestEnv() {
  if (testEnv) {
    await testEnv.cleanup();
    testEnv = null;
  }
}

/**
 * Clear all data in the test database
 */
export async function clearDb() {
  if (!testEnv) throw new Error('Test environment not initialized');
  await testEnv.clearFirestore();
}

/**
 * Get an authenticated Firestore instance for a user
 * @param {string} uid - User ID
 * @param {Object} authData - Additional auth data (phone, etc.)
 * @returns Firestore instance
 */
export function getDbAsUser(uid, authData = {}) {
  if (!testEnv) throw new Error('Test environment not initialized');
  return testEnv.authenticatedContext(uid, authData).firestore();
}

/**
 * Get an unauthenticated Firestore instance
 * @returns Firestore instance
 */
export function getDbAsUnauthenticated() {
  if (!testEnv) throw new Error('Test environment not initialized');
  return testEnv.unauthenticatedContext().firestore();
}

/**
 * Get an admin Firestore instance (bypasses all rules)
 * @returns Firestore instance
 */
export function getDbAsAdmin() {
  if (!testEnv) throw new Error('Test environment not initialized');
  return testEnv.withSecurityRulesDisabled().firestore();
}

/**
 * Setup helper: Create organization
 */
export async function createOrganization(db, orgId, data = {}) {
  await db.collection('organizations').doc(orgId).set({
    name: data.name || 'Test Organization',
    slug: data.slug || 'test-org',
    createdAt: new Date().toISOString(),
    ...data,
  });
}

/**
 * Setup helper: Create membership
 */
export async function createMembership(db, uid, orgId, role = 'employee', extra = {}) {
  await db.collection('memberships').doc(`${uid}_${orgId}`).set({
    uid,
    orgId,
    role,
    active: true,
    displayName: extra.displayName || 'Test User',
    invitedBy: extra.invitedBy || 'test-setup',
    joinedAt: new Date().toISOString(),
    ...extra,
  });
}

/**
 * Setup helper: Create lead
 */
export async function createLead(db, orgId, leadId, data = {}) {
  await db.collection('organizations').doc(orgId)
    .collection('leads').doc(leadId)
    .set({
      name: data.name || 'Test Lead',
      phone: data.phone || '+919999888877',
      status: data.status || 'New',
      assignedTo: data.assignedTo || null,
      orgId,
      createdAt: new Date().toISOString(),
      ...data,
    });
}

/**
 * Setup helper: Create private/financials subcollection
 */
export async function createPrivateData(db, orgId, leadId, data = {}) {
  await db.collection('organizations').doc(orgId)
    .collection('leads').doc(leadId)
    .collection('private').doc('data')
    .set({
      revenue: data.revenue || 10000,
      revenueUpdatedBy: 'admin',
      revenueUpdatedAt: new Date().toISOString(),
      ...data,
    });
}

// Re-export assertion helpers
export { assertSucceeds, assertFails };
