/**
 * Firestore Security Rules Tests
 * 
 * These tests verify multi-tenant isolation and role-based access control
 * for the SNS ADS ERP multi-tenant system.
 * 
 * Run with: npm run test
 * (Uses Firebase Emulator Suite)
 */

import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import {
  initTestEnv,
  cleanupTestEnv,
  clearDb,
  getDbAsUser,
  getDbAsAdmin,
  getDbAsUnauthenticated,
  createOrganization,
  createMembership,
  createLead,
  createPrivateData,
  assertSucceeds,
  assertFails,
} from './test-helpers.js';

// ============================================================
// TEST SETUP
// ============================================================

beforeAll(async () => {
  await initTestEnv();
});

afterAll(async () => {
  await cleanupTestEnv();
});

beforeEach(async () => {
  await clearDb();
});

// ============================================================
// CROSS-TENANT ISOLATION TESTS (CRITICAL)
// ============================================================

describe('Cross-tenant isolation', () => {
  it('User from Org A CANNOT read Org B leads', async () => {
    const db = getDbAsUser('user_a', { phone: '+911111111111' });
    const adminDb = getDbAsAdmin();

    // Setup: Create two organizations
    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createOrganization(adminDb, 'org_b', { name: 'Org B' });

    // Setup: Create user A membership in Org A only
    await createMembership(adminDb, 'user_a', 'org_a', 'employee');

    // Setup: Create lead in Org B
    await createLead(adminDb, 'org_b', 'lead_b1', { name: 'Secret Lead B' });

    // Test: User A tries to read Org B lead - should FAIL
    await assertFails(
      db.collection('organizations').doc('org_b').collection('leads').doc('lead_b1').get()
    );
  });

  it('User from Org A CANNOT write to Org B leads', async () => {
    const db = getDbAsUser('user_a', { phone: '+911111111111' });
    const adminDb = getDbAsAdmin();

    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createOrganization(adminDb, 'org_b', { name: 'Org B' });
    await createMembership(adminDb, 'user_a', 'org_a', 'employee');

    // Test: User A tries to create lead in Org B - should FAIL
    await assertFails(
      db.collection('organizations').doc('org_b').collection('leads').add({
        name: 'Malicious Lead',
        orgId: 'org_b',
      })
    );
  });

  it('Admin from Org A CANNOT read Org B financials', async () => {
    const db = getDbAsUser('admin_a', { phone: '+912222222222' });
    const adminDb = getDbAsAdmin();

    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createOrganization(adminDb, 'org_b', { name: 'Org B' });
    await createMembership(adminDb, 'admin_a', 'org_a', 'admin');

    // Create lead with private data in Org B
    await createLead(adminDb, 'org_b', 'lead_b1');
    await createPrivateData(adminDb, 'org_b', 'lead_b1', { revenue: 50000 });

    // Test: Admin A tries to read Org B financials - should FAIL
    await assertFails(
      db.collection('organizations').doc('org_b')
        .collection('leads').doc('lead_b1')
        .collection('private').doc('data').get()
    );
  });
});

// ============================================================
// MEMBERSHIP-BASED ACCESS TESTS
// ============================================================

describe('Membership-based access', () => {
  it('User without membership CANNOT read organization data', async () => {
    const db = getDbAsUser('user_no_membership', { phone: '+913333333333' });
    const adminDb = getDbAsAdmin();

    await createOrganization(adminDb, 'org_a', { name: 'Org A' });

    // User not added to any membership
    await createLead(adminDb, 'org_a', 'lead_1');

    // Test: Should NOT be able to read lead
    await assertFails(
      db.collection('organizations').doc('org_a').collection('leads').doc('lead_1').get()
    );
  });

  it('User with inactive membership CANNOT read organization data', async () => {
    const db = getDbAsUser('user_inactive', { phone: '+914444444444' });
    const adminDb = getDbAsAdmin();

    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createMembership(adminDb, 'user_inactive', 'org_a', 'employee', { active: false });

    await createLead(adminDb, 'org_a', 'lead_1');

    // Test: Should NOT be able to read lead with inactive membership
    await assertFails(
      db.collection('organizations').doc('org_a').collection('leads').doc('lead_1').get()
    );
  });
});

// ============================================================
// ROLE-BASED ACCESS TESTS
// ============================================================

describe('Role-based access - Employee', () => {
  it('Employee CAN read leads assigned to them', async () => {
    const db = getDbAsUser('employee_1', { phone: '+915555555555' });
    const adminDb = getDbAsAdmin();

    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createMembership(adminDb, 'employee_1', 'org_a', 'employee');
    await createLead(adminDb, 'org_a', 'lead_1', { assignedTo: 'employee_1' });

    // Test: Should be able to read assigned lead
    await assertSucceeds(
      db.collection('organizations').doc('org_a').collection('leads').doc('lead_1').get()
    );
  });

  it('Employee CANNOT read leads assigned to others', async () => {
    const db = getDbAsUser('employee_1', { phone: '+915555555555' });
    const adminDb = getDbAsAdmin();

    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createMembership(adminDb, 'employee_1', 'org_a', 'employee');
    await createMembership(adminDb, 'employee_2', 'org_a', 'employee');
    await createLead(adminDb, 'org_a', 'lead_1', { assignedTo: 'employee_2' });

    // Test: Should NOT be able to read other employee's lead
    await assertFails(
      db.collection('organizations').doc('org_a').collection('leads').doc('lead_1').get()
    );
  });

  it('Employee CANNOT update leads assigned to others', async () => {
    const db = getDbAsUser('employee_1', { phone: '+915555555555' });
    const adminDb = getDbAsAdmin();

    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createMembership(adminDb, 'employee_1', 'org_a', 'employee');
    await createMembership(adminDb, 'employee_2', 'org_a', 'employee');
    await createLead(adminDb, 'org_a', 'lead_1', { assignedTo: 'employee_2' });

    // Test: Should NOT be able to update other employee's lead
    await assertFails(
      db.collection('organizations').doc('org_a').collection('leads').doc('lead_1').update({
        status: 'New',
      })
    );
  });

  it('Employee CANNOT read private financials', async () => {
    const db = getDbAsUser('employee_1', { phone: '+915555555555' });
    const adminDb = getDbAsAdmin();

    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createMembership(adminDb, 'employee_1', 'org_a', 'employee');
    await createLead(adminDb, 'org_a', 'lead_1', { assignedTo: 'employee_1' });
    await createPrivateData(adminDb, 'org_a', 'lead_1');

    // Test: Should NOT be able to read financials
    await assertFails(
      db.collection('organizations').doc('org_a')
        .collection('leads').doc('lead_1')
        .collection('private').doc('data').get()
    );
  });

  it('Employee CANNOT write to org settings', async () => {
    const db = getDbAsUser('employee_1', { phone: '+915555555555' });
    const adminDb = getDbAsAdmin();

    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createMembership(adminDb, 'employee_1', 'org_a', 'employee');

    // Test: Should NOT be able to write settings
    await assertFails(
      db.collection('organizations').doc('org_a').collection('settings').doc('config').set({
        autoAssign: 'round-robin',
      })
    );
  });
});

describe('Role-based access - Admin', () => {
  it('Admin CAN read all leads in organization', async () => {
    const db = getDbAsUser('admin_1', { phone: '+916666666666' });
    const adminDb = getDbAsAdmin();

    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createMembership(adminDb, 'admin_1', 'org_a', 'admin');
    await createMembership(adminDb, 'employee_1', 'org_a', 'employee');
    await createLead(adminDb, 'org_a', 'lead_1', { assignedTo: 'employee_1' });

    // Test: Admin should be able to read all leads
    await assertSucceeds(
      db.collection('organizations').doc('org_a').collection('leads').doc('lead_1').get()
    );
  });

  it('Admin CAN read private financials', async () => {
    const db = getDbAsUser('admin_1', { phone: '+916666666666' });
    const adminDb = getDbAsAdmin();

    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createMembership(adminDb, 'admin_1', 'org_a', 'admin');
    await createLead(adminDb, 'org_a', 'lead_1');
    await createPrivateData(adminDb, 'org_a', 'lead_1');

    // Test: Admin should be able to read financials
    await assertSucceeds(
      db.collection('organizations').doc('org_a')
        .collection('leads').doc('lead_1')
        .collection('private').doc('data').get()
    );
  });

  it('Admin CAN write to org settings', async () => {
    const db = getDbAsUser('admin_1', { phone: '+916666666666' });
    const adminDb = getDbAsAdmin();

    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createMembership(adminDb, 'admin_1', 'org_a', 'admin');

    // Test: Admin should be able to write settings
    await assertSucceeds(
      db.collection('organizations').doc('org_a').collection('settings').doc('config').set({
        autoAssign: 'workload',
      })
    );
  });

  it('Admin CANNOT delete leads directly', async () => {
    const db = getDbAsUser('admin_1', { phone: '+916666666666' });
    const adminDb = getDbAsAdmin();

    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createMembership(adminDb, 'admin_1', 'org_a', 'admin');
    await createLead(adminDb, 'org_a', 'lead_1');

    // Lead lifecycle and quota accounting are backend-owned.
    await assertFails(
      db.collection('organizations').doc('org_a').collection('leads').doc('lead_1').delete()
    );
  });
});

describe('Role-based access - Owner', () => {
  it('Owner CAN do everything admin can do', async () => {
    const db = getDbAsUser('owner_1', { phone: '+917777777777' });
    const adminDb = getDbAsAdmin();

    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createMembership(adminDb, 'owner_1', 'org_a', 'owner');
    await createLead(adminDb, 'org_a', 'lead_1');
    await createPrivateData(adminDb, 'org_a', 'lead_1');

    // Test: Owner should have same access as admin
    await assertSucceeds(
      db.collection('organizations').doc('org_a').collection('leads').doc('lead_1').get()
    );

    await assertSucceeds(
      db.collection('organizations').doc('org_a')
        .collection('leads').doc('lead_1')
        .collection('private').doc('data').get()
    );
  });
});

// ============================================================
// USER IDENTITY TESTS
// ============================================================

describe('User identity collection', () => {
  it('User CAN read their own user document', async () => {
    const db = getDbAsUser('user_1', { phone: '+918888888888' });
    const adminDb = getDbAsAdmin();

    // Create user document
    await adminDb.collection('users').doc('user_1').set({
      phone: '+918888888888',
      displayName: 'Test User',
    });

    // Test: User should be able to read their own document
    await assertSucceeds(
      db.collection('users').doc('user_1').get()
    );
  });

  it('User CANNOT read another user document', async () => {
    const db = getDbAsUser('user_1', { phone: '+918888888888' });
    const adminDb = getDbAsAdmin();

    await adminDb.collection('users').doc('user_2').set({
      phone: '+919999999999',
      displayName: 'Other User',
    });

    // Test: User should NOT be able to read other user's document
    await assertFails(
      db.collection('users').doc('user_2').get()
    );
  });
});

// ============================================================
// MEMBERSHIP COLLECTION TESTS
// ============================================================

describe('Memberships collection', () => {
  it('User CAN read their own memberships', async () => {
    const db = getDbAsUser('user_1', { phone: '+918888888888' });
    const adminDb = getDbAsAdmin();

    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createMembership(adminDb, 'user_1', 'org_a', 'employee');

    // Test: User should be able to read their own membership
    await assertSucceeds(
      db.collection('memberships').doc('user_1_org_a').get()
    );
  });

  it('User CANNOT read another user memberships', async () => {
    const db = getDbAsUser('user_1', { phone: '+918888888888' });
    const adminDb = getDbAsAdmin();

    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createMembership(adminDb, 'user_2', 'org_a', 'employee');

    // Test: User should NOT be able to read other user's membership
    await assertFails(
      db.collection('memberships').doc('user_2_org_a').get()
    );
  });
});

// ============================================================
// UNAUTHENTICATED ACCESS TESTS
// ============================================================

describe('Unauthenticated access', () => {
  it('Unauthenticated user CANNOT read any data', async () => {
    const db = getDbAsUnauthenticated();
    const adminDb = getDbAsAdmin();

    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createLead(adminDb, 'org_a', 'lead_1');

    // Test: Unauthenticated user should NOT be able to read
    await assertFails(
      db.collection('organizations').doc('org_a').get()
    );

    await assertFails(
      db.collection('organizations').doc('org_a').collection('leads').doc('lead_1').get()
    );
  });
});

// ============================================================
// NOTES SUBCOLLECTION TESTS
// ============================================================

describe('Notes subcollection access', () => {
  it('Employee CAN read team-visible notes on their lead', async () => {
    const db = getDbAsUser('employee_1', { phone: '+915555555555' });
    const adminDb = getDbAsAdmin();

    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createMembership(adminDb, 'employee_1', 'org_a', 'employee');
    await createLead(adminDb, 'org_a', 'lead_1', { assignedTo: 'employee_1' });

    // Create team-visible note
    await adminDb.collection('organizations').doc('org_a')
      .collection('leads').doc('lead_1')
      .collection('notes').doc('note_1')
      .set({
        type: 'worknote',
        text: 'Team note',
        visibility: 'team',
        authorName: 'Admin',
        at: new Date().toISOString(),
      });

    // Test: Employee should be able to read team note
    await assertSucceeds(
      db.collection('organizations').doc('org_a')
        .collection('leads').doc('lead_1')
        .collection('notes').doc('note_1').get()
    );
  });

  it('Employee CANNOT read admin_only notes', async () => {
    const db = getDbAsUser('employee_1', { phone: '+915555555555' });
    const adminDb = getDbAsAdmin();

    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createMembership(adminDb, 'employee_1', 'org_a', 'employee');
    await createLead(adminDb, 'org_a', 'lead_1', { assignedTo: 'employee_1' });

    // Create admin_only note
    await adminDb.collection('organizations').doc('org_a')
      .collection('leads').doc('lead_1')
      .collection('notes').doc('note_1')
      .set({
        text: 'Secret admin note',
        visibility: 'admin_only',
        authorName: 'Admin',
        at: new Date().toISOString(),
      });

    // Test: Employee should NOT be able to read admin_only note
    await assertFails(
      db.collection('organizations').doc('org_a')
        .collection('leads').doc('lead_1')
        .collection('notes').doc('note_1').get()
    );
  });
});

// ============================================================
// ACTIVITY LOG TESTS
// ============================================================

describe('Activity log access', () => {
  it('Admin CAN read activity log', async () => {
    const db = getDbAsUser('admin_1', { phone: '+916666666666' });
    const adminDb = getDbAsAdmin();

    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createMembership(adminDb, 'admin_1', 'org_a', 'admin');

    await adminDb.collection('organizations').doc('org_a')
      .collection('activity').doc('activity_1')
      .set({
        text: 'Lead created',
        at: new Date().toISOString(),
        orgId: 'org_a',
      });

    // Test: Admin should be able to read activity
    await assertSucceeds(
      db.collection('organizations').doc('org_a')
        .collection('activity').doc('activity_1').get()
    );
  });

  it('Activity log is immutable (cannot update or delete)', async () => {
    const db = getDbAsUser('admin_1', { phone: '+916666666666' });
    const adminDb = getDbAsAdmin();

    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createMembership(adminDb, 'admin_1', 'org_a', 'admin');

    await adminDb.collection('organizations').doc('org_a')
      .collection('activity').doc('activity_1')
      .set({
        text: 'Lead created',
        at: new Date().toISOString(),
        orgId: 'org_a',
      });

    // Test: Should NOT be able to update activity
    await assertFails(
      db.collection('organizations').doc('org_a')
        .collection('activity').doc('activity_1')
        .update({ text: 'Modified' })
    );

    // Test: Should NOT be able to delete activity
    await assertFails(
      db.collection('organizations').doc('org_a')
        .collection('activity').doc('activity_1').delete()
    );
  });
});


// ============================================================
// PRIVILEGE ESCALATION AND ENTITLEMENT REGRESSIONS
// ============================================================

describe('Server-owned privileges and billing', () => {
  it('Authenticated user CANNOT create an owner membership in another org', async () => {
    const db = getDbAsUser('attacker', { phone: '+919111111111' });
    const adminDb = getDbAsAdmin();
    await createOrganization(adminDb, 'target_org', { name: 'Target' });

    await assertFails(
      db.collection('memberships').doc('attacker_target_org').set({
        uid: 'attacker', orgId: 'target_org', role: 'owner', active: true,
      })
    );
  });

  it('Employee CANNOT promote their own membership', async () => {
    const db = getDbAsUser('employee_1', { phone: '+915555555555' });
    const adminDb = getDbAsAdmin();
    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createMembership(adminDb, 'employee_1', 'org_a', 'employee');

    await assertFails(
      db.collection('memberships').doc('employee_1_org_a').update({ role: 'owner' })
    );
  });

  it('Organization admin CANNOT self-activate a paid plan or raise limits', async () => {
    const db = getDbAsUser('admin_1', { phone: '+916666666666' });
    const adminDb = getDbAsAdmin();
    await createOrganization(adminDb, 'org_a', {
      name: 'Org A', subscriptionStatus: 'expired', seatsLimit: 1, leadsLimit: 10,
    });
    await createMembership(adminDb, 'admin_1', 'org_a', 'admin');

    await assertFails(
      db.collection('organizations').doc('org_a').update({
        subscriptionStatus: 'active', seatsLimit: 999, leadsLimit: 999999,
      })
    );
  });

  it('Employee CANNOT create a lead directly and bypass quota accounting', async () => {
    const db = getDbAsUser('employee_1', { phone: '+915555555555' });
    const adminDb = getDbAsAdmin();
    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createMembership(adminDb, 'employee_1', 'org_a', 'employee');

    await assertFails(
      db.collection('organizations').doc('org_a').collection('leads').doc('forged').set({
        orgId: 'org_a', assignedTo: 'employee_1', name: 'Bypass attempt',
      })
    );
  });

  it('Employee CANNOT write a note to another employee’s lead', async () => {
    const db = getDbAsUser('employee_1', { phone: '+915555555555' });
    const adminDb = getDbAsAdmin();
    await createOrganization(adminDb, 'org_a', { name: 'Org A' });
    await createMembership(adminDb, 'employee_1', 'org_a', 'employee');
    await createMembership(adminDb, 'employee_2', 'org_a', 'employee');
    await createLead(adminDb, 'org_a', 'lead_2', { assignedTo: 'employee_2' });

    await assertFails(
      db.collection('organizations').doc('org_a').collection('leads').doc('lead_2').collection('notes').doc('forged').set({
        authorId: 'employee_1', visibility: 'team', text: 'Unauthorized note', at: new Date().toISOString(),
      })
    );
  });
});
