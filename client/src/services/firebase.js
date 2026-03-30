// src/services/firebase.js
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app = null;
let db = null;

try {
  if (firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  }
} catch (err) {
  console.warn('Firebase not configured:', err.message);
}

/**
 * Subscribe to real-time chat messages for a session
 * @param {string} sessionId
 * @param {function} callback - Called with array of messages
 * @returns {function} Unsubscribe function
 */
export const subscribeToChatSession = (sessionId, callback) => {
  if (!db) {
    console.warn('Firebase not available - using API polling');
    return () => {};
  }

  const messagesRef = collection(db, 'chat_sessions', sessionId, 'messages');
  const q = query(messagesRef, orderBy('timestamp', 'asc'), limit(200));

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.() || new Date(),
    }));
    callback(messages);
  }, (error) => {
    console.error('Firebase listener error:', error);
  });
};

export { db };
