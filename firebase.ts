import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyCoIHisDvkpxyA1KMjNXoNHMZHiIBuWwKs",
    authDomain: "qualcode-vibed.firebaseapp.com",
    projectId: "qualcode-vibed",
    storageBucket: "qualcode-vibed.firebasestorage.app",
    messagingSenderId: "806254512680",
    appId: "1:806254512680:web:81857af733c65bad83031d",
    measurementId: "G-4MQMST1Q4E"
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
    console.log('[Firebase] Firestore initialized with persistentLocalCache');
} catch (e) {
    // Already initialized (e.g., HMR in dev mode) — reuse existing instance
    console.log('[Firebase] Firestore already initialized, reusing existing instance', e);
    firestoreDb = getFirestore(app);
}
export const db = firestoreDb;

export const googleProvider = new GoogleAuthProvider();

export default app;
