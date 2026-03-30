// server/config/firebase.js
// ============================================
// Firebase Admin SDK Initialization
// Used for: Real-time chat sync, Authentication
// ============================================

const admin = require('firebase-admin');
require('dotenv').config();

let firebaseApp = null;

/**
 * Initialize Firebase Admin SDK
 * Uses service account credentials from environment variables
 */
const initializeFirebase = () => {
  if (firebaseApp) return firebaseApp;

  try {
    // Check if Firebase credentials are configured
    if (!process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID === 'your_firebase_project_id') {
      console.warn('⚠️  Firebase credentials not configured. Firebase features will be disabled.');
      return null;
    }

    const serviceAccount = {
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: process.env.FIREBASE_AUTH_URI,
      token_uri: process.env.FIREBASE_TOKEN_URI,
    };

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log('✅ Firebase Admin SDK initialized successfully.');
    return firebaseApp;
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error.message);
    return null;
  }
};

/**
 * Get Firestore database instance
 */
const getFirestore = () => {
  const app = initializeFirebase();
  if (!app) return null;
  return admin.firestore();
};

/**
 * Get Firebase Auth instance
 */
const getAuth = () => {
  const app = initializeFirebase();
  if (!app) return null;
  return admin.auth();
};

module.exports = { initializeFirebase, getFirestore, getAuth };
