import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

// These values are public by design — they identify the project, they do not
// authorise anything. Access is controlled by firestore.rules.
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

export interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let cached: FirebaseHandles | null = null;

/** Returns null when the app is unconfigured, so callers degrade to no-ops. */
export function getFirebase(): FirebaseHandles | null {
  if (!firebaseConfigured) return null;
  if (!cached) {
    const app = initializeApp(config);
    cached = {
      app,
      auth: getAuth(app),
      // Persistent cache queues writes while offline and flushes them on
      // reconnect, which is what makes "offline" a normal state, not an error.
      db: initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      }),
    };
  }
  return cached;
}
