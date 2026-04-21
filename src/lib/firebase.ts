import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
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

// long-polling を強制: WebChannel(WebSocket類似)の接続不安定を回避。
// 特定のネットワーク・プロキシ・モバイル環境での書き込みハング問題の解消。
export const db = app
  ? initializeFirestore(app, {
      experimentalForceLongPolling: true,
    })
  : null;
export const auth = app ? getAuth(app) : null;
