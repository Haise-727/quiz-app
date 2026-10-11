// In your firebase.js file
import { initializeApp } from "firebase/app";
// import { getAnalytics } from "firebase/analytics"; // Temporarily disabled
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, setPersistence, browserLocalPersistence, GoogleAuthProvider, connectAuthEmulator } from "firebase/auth";
import { getDatabase, connectDatabaseEmulator } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app); // Temporarily disabled
export const db = getFirestore(app);
export const auth = getAuth(app);
export const realtimeDb = getDatabase(app);

// Testing without touching real data. With VITE_USE_EMULATORS=true the app talks to the Firebase
// emulators running on this computer (auth 9099, Firestore 8080, Realtime Database 9000) instead
// of the real project, so rules and flows can be tried with nothing at stake. See docs/technical.md.
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectDatabaseEmulator(realtimeDb, '127.0.0.1', 9000);
}

// Set persistence to LOCAL
// This ensures the user remains logged in even after browser restarts
setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log("Firebase persistence set to LOCAL");
  })
  .catch((error) => {
    console.error("Error setting persistence:", error);
  });

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export { app };