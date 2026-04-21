import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Availability, AvailabilityStatus } from '@/types';
import { isFirebaseConfigured, subscribeCollection, firestoreSet, firestoreBatchWrite } from '@/lib/firestoreSync';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface AvailabilityState {
  availabilities: Availability[];
  _ready: boolean;
  setAvailability: (studentId: string, date: string, status: AvailabilityStatus, note?: string) => void;
  setBulk: (studentId: string, entries: { date: string; status: AvailabilityStatus; note: string }[]) => void;
  getForStudent: (studentId: string) => Availability[];
  getForDate: (date: string) => Availability[];
}

const COLLECTION = 'availability';

function statusToAvailable(status: AvailabilityStatus): boolean {
  return status === 'yes' || status === 'am' || status === 'pm';
}

export const useAvailabilityStore = isFirebaseConfigured
  ? create<AvailabilityState>()((set, get) => {
      subscribeCollection(
        COLLECTION,
        (id, data) => ({ ...data, id } as Availability),
        (availabilities) => set({ availabilities, _ready: true }),
      );

      return {
        availabilities: [],
        _ready: false,
        setAvailability: async (studentId, date, status, note = '') => {
          const now = new Date().toISOString();
          const existing = get().availabilities.find(
            (a) => a.studentId === studentId && a.date === date,
          );
          const id = existing?.id ?? crypto.randomUUID();
          const doc: Omit<Availability, 'id'> = {
            studentId,
            date,
            available: statusToAvailable(status),
            status,
            note,
            submittedAt: now,
          };
          // 楽観更新
          set((state) => {
            const filtered = state.availabilities.filter((a) => a.id !== id);
            return { availabilities: [...filtered, { ...doc, id }] };
          });
          firestoreSet(COLLECTION, id, doc).catch((e) => console.warn('[availability] set', e));
        },
        setBulk: async (studentId, entries) => {
          const now = new Date().toISOString();
          // 楽観更新
          const other = get().availabilities.filter((a) => a.studentId !== studentId);
          const newDocs = entries.map((e) => ({
            id: crypto.randomUUID(),
            studentId,
            date: e.date,
            available: statusToAvailable(e.status),
            status: e.status,
            note: e.note,
            submittedAt: now,
          }));
          set({ availabilities: [...other, ...newDocs] });

          // Firestoreバッチ: 旧データ削除 + 新データ書き込み
          const ops: { type: 'set' | 'delete'; collection: string; docId: string; data?: Record<string, unknown> }[] = [];
          // 旧データ取得して削除 (getDocs はreadなので完了を待つ)
          if (db) {
            try {
              const q = query(collection(db, COLLECTION), where('studentId', '==', studentId));
              const snap = await getDocs(q);
              snap.docs.forEach((d) => {
                ops.push({ type: 'delete', collection: COLLECTION, docId: d.id });
              });
            } catch (e) {
              console.warn('[availability] getDocs', e);
            }
          }
          // 新データ書き込み
          for (const doc of newDocs) {
            const { id, ...data } = doc;
            ops.push({ type: 'set', collection: COLLECTION, docId: id, data });
          }
          firestoreBatchWrite(ops).catch((e) => console.warn('[availability] batch', e));
        },
        getForStudent: (studentId) =>
          get().availabilities.filter((a) => a.studentId === studentId),
        getForDate: (date) =>
          get().availabilities.filter((a) => a.date === date),
      };
    })
  : create<AvailabilityState>()(
      persist(
        (set, get) => ({
          availabilities: [],
          _ready: true,
          setAvailability: (studentId, date, status, note = '') => {
            const now = new Date().toISOString();
            set((state) => {
              const existing = state.availabilities.find(
                (a) => a.studentId === studentId && a.date === date,
              );
              if (existing) {
                return {
                  availabilities: state.availabilities.map((a) =>
                    a.studentId === studentId && a.date === date
                      ? { ...a, available: statusToAvailable(status), status, note, submittedAt: now }
                      : a,
                  ),
                };
              }
              return {
                availabilities: [
                  ...state.availabilities,
                  { id: crypto.randomUUID(), studentId, date, available: statusToAvailable(status), status, note, submittedAt: now },
                ],
              };
            });
          },
          setBulk: (studentId, entries) => {
            const now = new Date().toISOString();
            set((state) => {
              const other = state.availabilities.filter((a) => a.studentId !== studentId);
              const updated = entries.map((e) => ({
                id: crypto.randomUUID(),
                studentId,
                date: e.date,
                available: statusToAvailable(e.status),
                status: e.status,
                note: e.note,
                submittedAt: now,
              }));
              return { availabilities: [...other, ...updated] };
            });
          },
          getForStudent: (studentId) =>
            get().availabilities.filter((a) => a.studentId === studentId),
          getForDate: (date) =>
            get().availabilities.filter((a) => a.date === date),
        }),
        { name: 'zushi_availability' },
      )
    );
