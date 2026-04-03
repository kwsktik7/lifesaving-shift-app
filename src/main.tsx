import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { isFirebaseConfigured } from './lib/firebase'
import { migrateLocalStorageToFirestore } from './lib/migrate'

async function init() {
  // Firebase有効時: localStorageからFirestoreへの初回マイグレーション
  if (isFirebaseConfigured) {
    try {
      await migrateLocalStorageToFirestore();
    } catch (err) {
      console.error('[migrate] Migration failed:', err);
    }
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

init();
