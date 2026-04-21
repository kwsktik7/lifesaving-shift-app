import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Student } from '@/types';
import { hashPin } from '@/utils/auth';
import { isFirebaseConfigured, subscribeCollection, firestoreSet, firestoreUpdate, firestoreDelete } from '@/lib/firestoreSync';

interface StudentState {
  students: Student[];
  _ready: boolean;
  addStudent: (s: Omit<Student, 'id' | 'pinHash'> & { pin: string; grade?: string; role?: string; hasPwc?: boolean; isLeader?: boolean }) => void;
  /** 本人セルフサインアップ用: id を明示指定して作成（Firestoreルールで studentId == auth.uid を要求） */
  createAccount: (data: Omit<Student, 'pinHash'> & { pin: string }) => Promise<void>;
  updateStudent: (id: string, patch: Partial<Omit<Student, 'id' | 'pinHash'>>) => void;
  updateStudentPin: (id: string, pin: string) => void;
  deactivateStudent: (id: string) => void;
  deleteStudent: (id: string) => void;
}

const COLLECTION = 'students';

export const useStudentStore = isFirebaseConfigured
  ? create<StudentState>()((set, _get) => {
      subscribeCollection(
        COLLECTION,
        (id, data) => ({ ...data, id } as Student),
        (students) => set({ students, _ready: true }),
      );

      // 書き込みはfire-and-forget: long-polling下でSDK promise が resolve しない事象への対策
      return {
        students: [],
        _ready: false,
        addStudent: async ({ pin, ...data }) => {
          const id = crypto.randomUUID();
          const student: Student = {
            ...data,
            id,
            pinHash: hashPin(pin),
            grade: data.grade ?? '',
            role: data.role ?? '',
            hasPwc: data.hasPwc ?? false,
            isLeader: data.isLeader ?? false,
          };
          set((state) => ({ students: [...state.students, student] }));
          const { id: _, ...docData } = student;
          firestoreSet(COLLECTION, id, docData).catch((e) => console.warn('[students] addStudent', e));
        },
        createAccount: async ({ pin, id, ...data }) => {
          const student: Student = {
            ...data,
            id,
            pinHash: hashPin(pin),
          };
          const { id: _, ...docData } = student;
          // createAccount はサインアップ直後なので書き込み完了を待つ
          await firestoreSet(COLLECTION, id, docData);
        },
        updateStudent: async (id, patch) => {
          set((state) => ({
            students: state.students.map((s) => (s.id === id ? { ...s, ...patch } : s)),
          }));
          firestoreUpdate(COLLECTION, id, patch).catch((e) => console.warn('[students] updateStudent', e));
        },
        updateStudentPin: async (id, pin) => {
          const pinHash = hashPin(pin);
          set((state) => ({
            students: state.students.map((s) => (s.id === id ? { ...s, pinHash } : s)),
          }));
          firestoreUpdate(COLLECTION, id, { pinHash }).catch((e) => console.warn('[students] updatePin', e));
        },
        deactivateStudent: async (id) => {
          set((state) => ({
            students: state.students.map((s) => (s.id === id ? { ...s, isActive: false } : s)),
          }));
          firestoreUpdate(COLLECTION, id, { isActive: false }).catch((e) => console.warn('[students] deactivate', e));
        },
        deleteStudent: async (id) => {
          set((state) => ({ students: state.students.filter((s) => s.id !== id) }));
          firestoreDelete(COLLECTION, id).catch((e) => console.warn('[students] delete', e));
        },
      };
    })
  : create<StudentState>()(
      persist(
        (set) => ({
          students: [],
          _ready: true,
          addStudent: ({ pin, ...data }) =>
            set((state) => ({
              students: [
                ...state.students,
                {
                  ...data,
                  id: crypto.randomUUID(),
                  pinHash: hashPin(pin),
                  grade: data.grade ?? '',
                  role: data.role ?? '',
                  hasPwc: data.hasPwc ?? false,
                  isLeader: data.isLeader ?? false,
                },
              ],
            })),
          createAccount: async ({ pin, ...data }) => {
            set((state) => ({
              students: [...state.students, { ...data, pinHash: hashPin(pin) } as Student],
            }));
          },
          updateStudent: (id, patch) =>
            set((state) => ({
              students: state.students.map((s) => (s.id === id ? { ...s, ...patch } : s)),
            })),
          updateStudentPin: (id, pin) =>
            set((state) => ({
              students: state.students.map((s) => (s.id === id ? { ...s, pinHash: hashPin(pin) } : s)),
            })),
          deactivateStudent: (id) =>
            set((state) => ({
              students: state.students.map((s) => (s.id === id ? { ...s, isActive: false } : s)),
            })),
          deleteStudent: (id) =>
            set((state) => ({ students: state.students.filter((s) => s.id !== id) })),
        }),
        { name: 'zushi_students' },
      )
    );
