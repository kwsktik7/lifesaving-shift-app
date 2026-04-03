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

// 書き込みヘルパー
export async function firestoreSet(collectionName: string, docId: string, data: DocumentData) {
  if (!db) return;
  await setDoc(doc(db, collectionName, docId), data);
}

export async function firestoreUpdate(collectionName: string, docId: string, data: DocumentData) {
  if (!db) return;
  await updateDoc(doc(db, collectionName, docId), data);
}

export async function firestoreDelete(collectionName: string, docId: string) {
  if (!db) return;
  await deleteDoc(doc(db, collectionName, docId));
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
  await batch.commit();
}

export { db, isFirebaseConfigured };
