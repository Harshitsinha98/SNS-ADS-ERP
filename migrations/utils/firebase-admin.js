import admin from 'firebase-admin';
import 'dotenv/config';

// Parse Firebase private key from environment
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
      privateKey: privateKey,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      clientId: process.env.FIREBASE_CLIENT_ID,
    }),
  });
}

export const db = admin.firestore();
export const auth = admin.auth();

console.log('✅ Firebase Admin initialized for project:', process.env.FIREBASE_PROJECT_ID);
