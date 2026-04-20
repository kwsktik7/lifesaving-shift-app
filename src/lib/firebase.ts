import { initializeApp } from 'firebase/app';
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Firebase未設定の場合はlocalStorageモードで動作
export const isFirebaseConfigured =
  !!firebaseConfig.apiKey && firebaseConfig.apiKey !== 'your-api-key-here';

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;

// メモリキャッシュのみ (IndexedDBを介さないので安定 + 高速)
export const db = app
  ? initializeFirestore(app, {
      localCache: memoryLocalCache(),
    })
  : null;
export const auth = app ? getAuth(app) : null;
