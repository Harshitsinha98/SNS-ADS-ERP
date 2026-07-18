/**
 * Seed Firestore with test organization and user
 * Run this script to initialize your Firestore database with the required
 * multi-tenant collections for testing.
 * 
 * Usage: node scripts/seedFirestore.js
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPhoneNumber, RecaptchaVerifier } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';
import readline from 'readline';

// Firebase config - will use environment variables
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Test data
const TEST_ORG_ID = 'org_codeskate_001';
const TEST_ORG_NAME = 'CodeSkate Technologies';
const TEST_ORG_SLUG = 'codeskate-tech';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

async function seedFirestore() {
  try {
    console.log('\n🔥 Firestore Seed Script for CodeSkate ERP\n');
    console.log('This script will create:');
    console.log('  1. Test organization');
    console.log('  2. User identity document');
    console.log('  3. Membership (admin role)');
    console.log('  4. Organization settings');
    console.log('  5. Sample leads\n');

    // Get user's Firebase UID (they should authenticate first)
    console.log('⚠️  IMPORTANT: You need your Firebase Auth UID.');
    console.log('   You can find it in Firebase Console > Authentication > Users\n');
    
    const uid = await question('Enter your Firebase Auth UID: ');
    const phone = await question('Enter your phone number (with country code, e.g., +91XXXXXXXXXX): ');
    const displayName = await question('Enter your display name: ');

    if (!uid || !phone || !displayName) {
      console.error('❌ All fields are required!');
      rl.close();
      return;
    }

    console.log('\n📝 Creating documents...\n');

    // 1. Create organization
    await setDoc(doc(db, 'organizations', TEST_ORG_ID), {
      name: TEST_ORG_NAME,
      slug: TEST_ORG_SLUG,
      createdAt: new Date(),
      createdBy: uid,
      settings: {
        statuses: ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Closed-Won', 'Closed-Lost'],
        autoAssign: 'round-robin',
      },
    });
    console.log('✅ Organization created:', TEST_ORG_ID);

    // 2. Create user identity
    await setDoc(doc(db, 'users', uid), {
      phone: phone,
      displayName: displayName,
      createdAt: new Date(),
      lastLoginAt: new Date(),
      defaultOrgId: TEST_ORG_ID,
    });
    console.log('✅ User created:', uid);

    // 3. Create membership (admin role)
    const membershipId = `${uid}_${TEST_ORG_ID}`;
    await setDoc(doc(db, 'memberships', membershipId), {
      uid: uid,
      orgId: TEST_ORG_ID,
      role: 'owner',
      displayName: displayName,
      active: true,
      invitedBy: uid,
      joinedAt: new Date(),
      lastActiveAt: new Date(),
    });
    console.log('✅ Membership created:', membershipId);

    // 4. Create organization settings
    await setDoc(doc(db, 'organizations', TEST_ORG_ID, 'settings', 'config'), {
      statuses: ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Closed-Won', 'Closed-Lost'],
      autoAssign: 'round-robin',
    });
    console.log('✅ Settings created');

    // 5. Create meta for lead assignment
    await setDoc(doc(db, 'organizations', TEST_ORG_ID, 'meta', 'leadAssignment'), {
      lastIndex: 0,
      lastAssignedAt: new Date(),
    });
    console.log('✅ Meta created');

    // 6. Create sample leads
    const sampleLeads = [
      {
        name: 'Rahul Sharma',
        phone: '+919876543210',
        email: 'rahul@example.com',
        source: 'Website',
        requirement: 'Looking for CRM solution for small business',
        status: 'New',
        priority: 'Hot',
        assignedTo: uid,
        assignedToName: displayName,
        blacklisted: false,
        createdAt: new Date(),
        lastUpdated: new Date(),
        orgId: TEST_ORG_ID,
      },
      {
        name: 'Priya Patel',
        phone: '+919876543211',
        email: 'priya@example.com',
        source: 'WhatsApp',
        requirement: 'Interested in lead management system',
        status: 'Contacted',
        priority: 'Warm',
        assignedTo: uid,
        assignedToName: displayName,
        blacklisted: false,
        createdAt: new Date(Date.now() - 86400000),
        lastUpdated: new Date(Date.now() - 86400000),
        orgId: TEST_ORG_ID,
      },
      {
        name: 'Amit Kumar',
        phone: '+919876543212',
        email: 'amit@example.com',
        source: 'Referral',
        requirement: 'Need sales automation tools',
        status: 'Qualified',
        priority: 'Hot',
        assignedTo: uid,
        assignedToName: displayName,
        blacklisted: false,
        createdAt: new Date(Date.now() - 172800000),
        lastUpdated: new Date(Date.now() - 172800000),
        orgId: TEST_ORG_ID,
      },
    ];

    for (const lead of sampleLeads) {
      const leadRef = doc(collection(db, 'organizations', TEST_ORG_ID, 'leads'));
      await setDoc(leadRef, lead);
    }
    console.log('✅ Sample leads created:', sampleLeads.length);

    // 7. Create activity log
    await setDoc(doc(collection(db, 'organizations', TEST_ORG_ID, 'activity')), {
      text: `${displayName} created organization ${TEST_ORG_NAME}`,
      at: new Date(),
      orgId: TEST_ORG_ID,
    });
    console.log('✅ Activity log created');

    console.log('\n✨ Seeding complete! You can now log in to the app.\n');
    console.log('📊 Summary:');
    console.log(`   Organization: ${TEST_ORG_NAME} (${TEST_ORG_ID})`);
    console.log(`   User: ${displayName} (${uid})`);
    console.log(`   Role: owner`);
    console.log(`   Sample Leads: ${sampleLeads.length}\n`);

    rl.close();
  } catch (error) {
    console.error('\n❌ Error seeding Firestore:', error);
    console.error('\n💡 Common issues:');
    console.error('   - Check your Firebase config in .env file');
    console.error('   - Ensure Firestore is created in Firebase Console');
    console.error('   - Verify your UID is correct\n');
    rl.close();
    process.exit(1);
  }
}

seedFirestore();
