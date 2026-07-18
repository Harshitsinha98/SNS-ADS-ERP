import 'dotenv/config';
import { db, auth } from './utils/firebase-admin.js';
import { BatchWriter } from './utils/batch-write.js';
import { logSuccess, logError, logInfo, logProgress, logDryRun } from './utils/logger.js';

const DRY_RUN = process.env.DRY_RUN === 'true';
const DEFAULT_ORG_NAME = process.env.DEFAULT_ORG_NAME || 'Default Organization';
const DEFAULT_ORG_SLUG = process.env.DEFAULT_ORG_SLUG || 'default';

// Stats tracking
const stats = {
  users: { total: 0, migrated: 0, skipped: 0 },
  leads: { total: 0, migrated: 0 },
  notes: { total: 0, migrated: 0 },
  private: { total: 0, migrated: 0 },
  settings: { total: 0, migrated: 0 },
  meta: { total: 0, migrated: 0 },
  activity: { total: 0, migrated: 0 },
  notifications: { total: 0, migrated: 0 },
  goals: { total: 0, migrated: 0 },
  pending: { total: 0, migrated: 0 },
};

async function runMigration() {
  console.log('\n========================================');
  console.log('  MULTI-TENANT MIGRATION SCRIPT');
  console.log('========================================\n');
  
  if (DRY_RUN) {
    logDryRun('Running in DRY RUN mode - no changes will be made\n');
  }

  try {
    // Step 1: Create default organization
    logProgress(1, 11, 'Creating default organization...');
    const orgId = await createDefaultOrganization();
    logSuccess(`Default organization created: ${orgId}`);

    // Step 2: Migrate users
    logProgress(2, 11, 'Migrating users...');
    await migrateUsers(orgId);
    logSuccess(`Users migrated: ${stats.users.migrated}, Skipped: ${stats.users.skipped}`);

    // Step 3: Migrate leads
    logProgress(3, 11, 'Migrating leads...');
    await migrateLeads(orgId);
    logSuccess(`Leads migrated: ${stats.leads.migrated}`);

    // Step 4: Migrate settings
    logProgress(4, 11, 'Migrating settings...');
    await migrateSettings(orgId);
    logSuccess(`Settings migrated: ${stats.settings.migrated}`);

    // Step 5: Migrate meta
    logProgress(5, 11, 'Migrating meta (lead assignment)...');
    await migrateMeta(orgId);
    logSuccess(`Meta migrated: ${stats.meta.migrated}`);

    // Step 6: Migrate activity
    logProgress(6, 11, 'Migrating activity...');
    await migrateActivity(orgId);
    logSuccess(`Activity migrated: ${stats.activity.migrated}`);

    // Step 7: Migrate notifications
    logProgress(7, 11, 'Migrating notifications...');
    await migrateNotifications(orgId);
    logSuccess(`Notifications migrated: ${stats.notifications.migrated}`);

    // Step 8: Migrate goals
    logProgress(8, 11, 'Migrating goals...');
    await migrateGoals(orgId);
    logSuccess(`Goals migrated: ${stats.goals.migrated}`);

    // Step 9: Migrate pending WhatsApp leads
    logProgress(9, 11, 'Migrating pending WhatsApp leads...');
    await migratePendingWhatsApp(orgId);
    logSuccess(`Pending leads migrated: ${stats.pending.migrated}`);

    // Step 10: Validation
    logProgress(10, 11, 'Validating migration...');
    await validateMigration(orgId);

    // Step 11: Summary
    logProgress(11, 11, 'Migration complete!');
    printSummary(orgId);

  } catch (error) {
    logError(`Migration failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}



async function createDefaultOrganization() {
  // Check if default org already exists
  const existingOrgs = await db.collection('organizations')
    .where('slug', '==', DEFAULT_ORG_SLUG)
    .limit(1)
    .get();

  if (!existingOrgs.empty) {
    logInfo('Default organization already exists, using existing one');
    return existingOrgs.docs[0].id;
  }

  const orgData = {
    name: DEFAULT_ORG_NAME,
    slug: DEFAULT_ORG_SLUG,
    createdAt: new Date().toISOString(),
    createdBy: 'migration-script',
    migrationSource: 'single-tenant',
  };

  if (DRY_RUN) {
    logDryRun(`Would create organization: ${JSON.stringify(orgData, null, 2)}`);
    return 'dry-run-org-id';
  }

  const ref = await db.collection('organizations').add(orgData);
  return ref.id;
}

async function migrateUsers(orgId) {
  const legacyUsers = await db.collection('users').get();
  stats.users.total = legacyUsers.size;

  for (const doc of legacyUsers.docs) {
    const phone = doc.id;
    const data = doc.data();

    // Get Firebase Auth user by phone
    let userRecord;
    try {
      userRecord = await auth.getUserByPhoneNumber(phone);
    } catch (e) {
      logInfo(`No Firebase Auth user for phone: ${phone} - creating entry in users collection anyway`);
      // For users not in Firebase Auth, we'll skip creating membership
      // They will need to sign up again
      stats.users.skipped++;
      continue;
    }

    const uid = userRecord.uid;

    // Create users/{uid}
    const userData = {
      phone: phone,
      displayName: data.name || 'Unknown',
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
      defaultOrgId: orgId,
    };

    // Create memberships/{uid}_{orgId}
    const membershipData = {
      uid: uid,
      orgId: orgId,
      role: data.role || 'employee',
      displayName: data.name || 'Unknown',
      active: data.active !== false,
      invitedBy: 'migration-script',
      joinedAt: new Date().toISOString(),
      lastActiveAt: null,
    };

    if (DRY_RUN) {
      logDryRun(`Would create user: ${uid}`);
      logDryRun(`Would create membership: ${uid}_${orgId}`);
    } else {
      await db.collection('users').doc(uid).set(userData);
      await db.collection('memberships').doc(`${uid}_${orgId}`).set(membershipData);
    }

    stats.users.migrated++;
  }
}



async function migrateLeads(orgId) {
  const legacyLeads = await db.collection('leads').get();
  stats.leads.total = legacyLeads.size;

  const writer = new BatchWriter(db, DRY_RUN);

  for (const doc of legacyLeads.docs) {
    const leadData = doc.data();
    const leadId = doc.id;

    // New lead document path
    const newLeadRef = db.collection('organizations')
      .doc(orgId)
      .collection('leads')
      .doc(leadId);

    // Add orgId to lead data
    const newLeadData = {
      ...leadData,
      orgId: orgId,
    };

    writer.set(newLeadRef, newLeadData);
    stats.leads.migrated++;

    // Migrate notes subcollection
    const notes = await db.collection('leads').doc(leadId).collection('notes').get();
    stats.notes.total += notes.size;
    
    for (const note of notes.docs) {
      const newNoteRef = newLeadRef.collection('notes').doc(note.id);
      writer.set(newNoteRef, note.data());
      stats.notes.migrated++;
    }

    // Migrate private subcollection
    const privateDocs = await db.collection('leads').doc(leadId).collection('private').get();
    stats.private.total += privateDocs.size;
    
    for (const priv of privateDocs.docs) {
      const newPrivateRef = newLeadRef.collection('private').doc(priv.id);
      writer.set(newPrivateRef, priv.data());
      stats.private.migrated++;
    }
  }

  await writer.commit();
}

async function migrateSettings(orgId) {
  const settingsDoc = await db.collection('settings').doc('config').get();
  
  if (!settingsDoc.exists) {
    logInfo('No settings document found, skipping');
    return;
  }

  stats.settings.total = 1;

  const newSettingsRef = db.collection('organizations')
    .doc(orgId)
    .collection('settings')
    .doc('config');

  if (DRY_RUN) {
    logDryRun(`Would create settings: ${JSON.stringify(settingsDoc.data(), null, 2)}`);
  } else {
    await newSettingsRef.set(settingsDoc.data());
  }

  stats.settings.migrated = 1;
}

async function migrateMeta(orgId) {
  const metaDoc = await db.collection('meta').doc('leadAssignment').get();
  
  if (!metaDoc.exists) {
    logInfo('No meta document found, skipping');
    return;
  }

  stats.meta.total = 1;

  const newMetaRef = db.collection('organizations')
    .doc(orgId)
    .collection('meta')
    .doc('leadAssignment');

  if (DRY_RUN) {
    logDryRun(`Would create meta: ${JSON.stringify(metaDoc.data(), null, 2)}`);
  } else {
    await newMetaRef.set(metaDoc.data());
  }

  stats.meta.migrated = 1;
}



async function migrateActivity(orgId) {
  const activityDocs = await db.collection('activity').get();
  stats.activity.total = activityDocs.size;

  const writer = new BatchWriter(db, DRY_RUN);

  for (const doc of activityDocs.docs) {
    const newActivityRef = db.collection('organizations')
      .doc(orgId)
      .collection('activity')
      .doc(doc.id);

    const data = {
      ...doc.data(),
      orgId: orgId,
    };

    writer.set(newActivityRef, data);
    stats.activity.migrated++;
  }

  await writer.commit();
}

async function migrateNotifications(orgId) {
  const notifDocs = await db.collection('notifications').get();
  stats.notifications.total = notifDocs.size;

  const writer = new BatchWriter(db, DRY_RUN);

  for (const doc of notifDocs.docs) {
    const newNotifRef = db.collection('organizations')
      .doc(orgId)
      .collection('notifications')
      .doc(doc.id);

    const data = {
      ...doc.data(),
      orgId: orgId,
    };

    writer.set(newNotifRef, data);
    stats.notifications.migrated++;
  }

  await writer.commit();
}

async function migrateGoals(orgId) {
  const goalsDoc = await db.collection('goals').doc('config').get();
  
  if (!goalsDoc.exists) {
    logInfo('No goals document found, skipping');
    return;
  }

  stats.goals.total = 1;

  const newGoalsRef = db.collection('organizations')
    .doc(orgId)
    .collection('goals')
    .doc('config');

  const data = {
    ...goalsDoc.data(),
    orgId: orgId,
  };

  if (DRY_RUN) {
    logDryRun(`Would create goals: ${JSON.stringify(data, null, 2)}`);
  } else {
    await newGoalsRef.set(data);
  }

  stats.goals.migrated = 1;
}

async function migratePendingWhatsApp(orgId) {
  const pendingDocs = await db.collection('pending_whatsapp').get();
  stats.pending.total = pendingDocs.size;

  const writer = new BatchWriter(db, DRY_RUN);

  for (const doc of pendingDocs.docs) {
    const newPendingRef = db.collection('organizations')
      .doc(orgId)
      .collection('pending_leads')
      .doc(doc.id);

    const data = {
      ...doc.data(),
      orgId: orgId,
    };

    writer.set(newPendingRef, data);
    stats.pending.migrated++;
  }

  await writer.commit();
}



async function validateMigration(orgId) {
  logInfo('Validating lead count...');
  
  const legacyLeadCount = (await db.collection('leads').get()).size;
  const newLeadSnapshot = await db.collection('organizations')
    .doc(orgId)
    .collection('leads')
    .get();
  const newLeadCount = newLeadSnapshot.size;

  if (legacyLeadCount !== newLeadCount) {
    logError(`Lead count mismatch! Legacy: ${legacyLeadCount}, New: ${newLeadCount}`);
    throw new Error('Migration validation failed');
  }

  logSuccess(`Lead count validated: ${legacyLeadCount} leads`);
  
  // Validate membership count
  const legacyUserCount = (await db.collection('users').get()).size;
  const membershipSnapshot = await db.collection('memberships')
    .where('orgId', '==', orgId)
    .get();

  logInfo(`Users: ${legacyUserCount} → Memberships: ${membershipSnapshot.size}`);
  
  if (membershipSnapshot.size < legacyUserCount) {
    logWarning('Some users were skipped (no Firebase Auth account)');
  }
}

function printSummary(orgId) {
  console.log('\n========================================');
  console.log('  MIGRATION SUMMARY');
  console.log('========================================');
  console.log(`\nOrganization ID: ${orgId}`);
  console.log(`Organization Name: ${DEFAULT_ORG_NAME}`);
  console.log('\n--- Migrated Documents ---');
  console.log(`Users:         ${stats.users.migrated}/${stats.users.total} (skipped: ${stats.users.skipped})`);
  console.log(`Leads:         ${stats.leads.migrated}/${stats.leads.total}`);
  console.log(`  Notes:       ${stats.notes.migrated}/${stats.notes.total}`);
  console.log(`  Private:     ${stats.private.migrated}/${stats.private.total}`);
  console.log(`Settings:      ${stats.settings.migrated}/${stats.settings.total}`);
  console.log(`Meta:          ${stats.meta.migrated}/${stats.meta.total}`);
  console.log(`Activity:      ${stats.activity.migrated}/${stats.activity.total}`);
  console.log(`Notifications: ${stats.notifications.migrated}/${stats.notifications.total}`);
  console.log(`Goals:         ${stats.goals.migrated}/${stats.goals.total}`);
  console.log(`Pending:       ${stats.pending.migrated}/${stats.pending.total}`);
  console.log('\n========================================\n');

  if (DRY_RUN) {
    console.log('🔍 This was a DRY RUN. No changes were made.');
    console.log('   Set DRY_RUN=false to perform actual migration.\n');
  }
}

// Run the migration
runMigration();
