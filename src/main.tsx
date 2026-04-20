import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { isFirebaseConfigured, auth } from './lib/firebase'
import { migrateLocalStorageToFirestore } from './lib/migrate'
import { signInAnonymously } from 'firebase/auth'

async function init() {
  if (isFirebaseConfigured && auth) {
    // まず匿名認証 → Firestoreセキュリティルール通過のため
    try {
      await signInAnonymously(auth);
      console.log('[auth] Anonymous sign-in complete');
    } catch (err) {
      console.error('[auth] Anonymous sign-in failed:', err);
    }

    // localStorageからFirestoreへの初回マイグレーション
    try {
      await migrateLocalStorageToFirestore();
    } catch (err) {
      console.error('[migrate] Migration failed:', err);
    }
  }

  // 匿名認証完了後にストアのimportが走る（動的import）
  const { default: AppComponent } = await import('./App.tsx');

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppComponent />
    </StrictMode>,
  )
}

init();
