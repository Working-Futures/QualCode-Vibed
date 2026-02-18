import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

// SECURITY WARNING: Hardcoded fallback keys for debugging deployment.
// These allow the app to work if GitHub Secrets fail.
// For strict open source security, ensure GitHub Actions Secrets are working and remove these fallbacks.
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyC00StWLQnOvG3iJfXzHsOjeFhpOZ0U2G0",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "qualcode-vibed.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "qualcode-vibed",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "qualcode-vibed.firebasestorage.app",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "806254512680",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:806254512680:web:81857af733c65bad83031d",
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-4MQMST1Q4E"
};

// --- DEBUG: Verify Config ---
console.log('[Firebase Config Check]', Object.fromEntries(
    Object.entries(firebaseConfig).map(([k, v]) => [k, v ? (v.length > 5 ? v.substring(0, 5) + '...' : '***') : 'MISSING'])
));

if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'MISSING') {
    throw new Error('Firebase API Key is missing! Check your environment variables.');
}

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
