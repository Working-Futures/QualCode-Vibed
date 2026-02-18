import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

// Firebase config is loaded entirely from environment variables.
// See .env.example for the required variables.
// For local development: copy .env.example to .env and fill in your values.
// For deployment: set these as GitHub Actions Secrets.
const requiredEnvVars = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
] as const;

const missingVars = requiredEnvVars.filter(key => !import.meta.env[key]);
if (missingVars.length > 0) {
    throw new Error(
        `Missing required Firebase environment variables: ${missingVars.join(', ')}.\n` +
        'Copy .env.example to .env and fill in your Firebase project values.\n' +
        'See README.md for setup instructions.'
    );
}

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? '',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

let firestoreDb;
try {
    firestoreDb = initializeFirestore(app, {
        ignoreUndefinedProperties: true,
        localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
        })
    });

} catch (e) {
    // Already initialized (e.g., HMR in dev mode) — reuse existing instance
    console.log('[Firebase] Firestore already initialized, reusing existing instance', e);
    firestoreDb = getFirestore(app);
}
export const db = firestoreDb;

export const googleProvider = new GoogleAuthProvider();

export default app;
