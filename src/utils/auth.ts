import { signInAnonymously, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '@/lib/firebase';

// Simple deterministic hash for PINs and passwords.
export function hashPin(pin: string): string {
  let hash = 5381;
  for (let i = 0; i < pin.length; i++) {
    hash = (hash * 33) ^ pin.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

export function verifyPin(input: string, storedHash: string): boolean {
  return hashPin(input) === storedHash;
}

const SESSION_KEY = 'zushi_session';

export type SessionRole = 'admin' | 'student';

export interface Session {
  role: SessionRole;
  studentId?: string;
  studentName?: string;
}

export function getSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(session: Session): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

// --- Firebase Auth ---

/** Firebase Anonymous Auth でサインイン (Firestoreへのセッション書き込みは廃止) */
export async function firebaseSignIn(session: Session): Promise<void> {
  if (!isFirebaseConfigured || !auth) {
    setSession(session);
    return;
  }
  // 匿名認証確保 (Firestoreアクセスに必要)
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
  // セッションはローカル(sessionStorage)のみで管理
  setSession(session);
}

/** 匿名ログインを確実に実行して auth.uid を返す */
export async function ensureAnonAuth(): Promise<string | null> {
  if (!isFirebaseConfigured || !auth) return null;
  if (auth.currentUser) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}

/** 互換性のためのno-op（旧コードから参照される場合の保護） */
export async function ensureFirestoreSession(): Promise<boolean> {
  return false;
}

/** サインアウト */
export async function firebaseSignOut(): Promise<void> {
  clearSession();
  if (isFirebaseConfigured && auth) {
    await signOut(auth);
  }
}

/** Auth状態変更リスナー — 既存セッションの復元に使用 */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  if (!isFirebaseConfigured || !auth) {
    // Firebase未設定時は即座にnullを返す
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

/** FirestoreからセッションDoc読み取り */
export async function getFirestoreSession(uid: string): Promise<Session | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, 'sessions', uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    role: data.role,
    studentId: data.studentId ?? undefined,
    studentName: data.studentName ?? undefined,
  };
}
