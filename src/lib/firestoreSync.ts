import {
  collection,
  doc,
  onSnapshot,
  writeBatch,
  setDoc,
  updateDoc,
  deleteDoc,
  type DocumentData,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';

// コレクション全体をリアルタイム監視し、Zustand setterに流す
export function subscribeCollection<T>(
  collectionName: string,
  mapper: (id: string, data: DocumentData) => T,
  setter: (items: T[]) => void,
): (() => void) | null {
  if (!db) return null;
  const ref = collection(db, collectionName);
  const unsub = onSnapshot(ref, (snap) => {
    const items = snap.docs.map((d) => mapper(d.id, d.data()));
    setter(items);
  });
  return unsub;
}

// 単一ドキュメントを監視
export function subscribeDoc<T>(
  collectionName: string,
  docId: string,
  mapper: (data: DocumentData) => T,
  setter: (item: T) => void,
  onMissing?: () => void,
): (() => void) | null {
  if (!db) return null;
  const ref = doc(db, collectionName, docId);
  const unsub = onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      setter(mapper(snap.data()!));
    } else {
      onMissing?.();
    }
  });
  return unsub;
}

// 書き込みハング対策: 10秒タイムアウトを追加
function withTimeout<T>(promise: Promise<T>, ms = 10000, label = 'write'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms),
    ),
  ]);
}

// 書き込みヘルパー
export async function firestoreSet(collectionName: string, docId: string, data: DocumentData) {
  if (!db) return;
  await withTimeout(setDoc(doc(db, collectionName, docId), data), 10000, `setDoc ${collectionName}/${docId}`);
}

export async function firestoreUpdate(collectionName: string, docId: string, data: DocumentData) {
  if (!db) return;
  await withTimeout(updateDoc(doc(db, collectionName, docId), data), 10000, `updateDoc ${collectionName}/${docId}`);
}

export async function firestoreDelete(collectionName: string, docId: string) {
  if (!db) return;
  await withTimeout(deleteDoc(doc(db, collectionName, docId)), 10000, `deleteDoc ${collectionName}/${docId}`);
}

export async function firestoreBatchWrite(
  operations: { type: 'set' | 'update' | 'delete'; collection: string; docId: string; data?: DocumentData }[],
) {
  if (!db) return;
  const batch = writeBatch(db);
  for (const op of operations) {
    const ref = doc(db, op.collection, op.docId);
    if (op.type === 'set') batch.set(ref, op.data!);
    else if (op.type === 'update') batch.update(ref, op.data!);
    else batch.delete(ref);
  }
  await withTimeout(batch.commit(), 15000, 'batch.commit');
}

export { db, isFirebaseConfigured };
