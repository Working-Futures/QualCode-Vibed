import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';

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
export const db = initializeFirestore(app, {
    ignoreUndefinedProperties: true
});
export const googleProvider = new GoogleAuthProvider();

export default app;
