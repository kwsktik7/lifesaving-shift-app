import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Vercelの環境変数に改行や前後空白が混入する事故が起きるため必ず trim する。
// projectId に "\n" が入ると Firestore の Listen/channel が壊れて 503 連発し
// onSnapshot の初回データが届かなくなる (= 設定値が永遠にデフォルトのまま)。
function envTrim(v: string | undefined): string | undefined {
  if (typeof v !== 'string') return v;
  return v.trim();
}

const firebaseConfig = {
  apiKey: envTrim(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: envTrim(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: envTrim(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: envTrim(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: envTrim(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: envTrim(import.meta.env.VITE_FIREBASE_APP_ID),
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
