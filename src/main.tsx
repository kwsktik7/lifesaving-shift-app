import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { isFirebaseConfigured, auth } from './lib/firebase'
import { migrateLocalStorageToFirestore } from './lib/migrate'
import { signInAnonymously } from 'firebase/auth'

// 既存のService Worker(旧PWA)を全削除 + キャッシュクリア。
// 旧バージョンがSWにインストールされてる端末では、この関数実行時点で既に
// 古いバンドルが走ってしまっている (SWがHTML/JSをインターセプトするため)。
// よって、SWを消したあと強制的に1回リロードして最新HTMLを取り直す。
// sessionStorageのフラグで無限ループを防止。
async function cleanupServiceWorkers() {
  let hadOldSw = false;
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      if (regs.length > 0) hadOldSw = true;
      for (const reg of regs) {
        await reg.unregister();
      }
    } catch {}
  }
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      if (keys.length > 0) hadOldSw = true;
      for (const k of keys) await caches.delete(k);
    } catch {}
  }
  if (hadOldSw && !sessionStorage.getItem('sw_cleaned_once')) {
    sessionStorage.setItem('sw_cleaned_once', '1');
    // 古いSWが返したHTML/JSが走ってるので最新版を取り直すために1回だけ再読込
    window.location.reload();
    // reload中は後続処理を走らせない
    await new Promise(() => {});
  }
}

async function init() {
  await cleanupServiceWorkers();

  if (isFirebaseConfigured && auth) {
    // 匿名認証 → Firestoreセキュリティルール通過のため (ここは短時間で終わるので待つ)
    try {
      await signInAnonymously(auth);
      console.log('[auth] Anonymous sign-in complete');
    } catch (err) {
      console.error('[auth] Anonymous sign-in failed:', err);
    }

    // localStorage → Firestore マイグレーションは重い (getDocs が長時間ブロックする)
    // React描画の裏で非同期実行し、描画を遅延させない
    migrateLocalStorageToFirestore().catch((err) => {
      console.error('[migrate] Migration failed:', err);
    });
  }

  const { default: AppComponent } = await import('./App.tsx');

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppComponent />
    </StrictMode>,
  )
}

init();
