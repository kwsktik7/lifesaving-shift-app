import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Student } from '@/types';
import { hashPin } from '@/utils/auth';
import { isFirebaseConfigured, subscribeCollection, firestoreSet, firestoreUpdate, firestoreDelete } from '@/lib/firestoreSync';

interface StudentState {
  students: Student[];
  _ready: boolean;
  addStudent: (s: Omit<Student, 'id' | 'pinHash'> & { pin: string; grade?: string; role?: string; hasPwc?: boolean; isLeader?: boolean }) => void;
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
          await firestoreSet(COLLECTION, id, docData);
        },
        updateStudent: async (id, patch) => {
          set((state) => ({
            students: state.students.map((s) => (s.id === id ? { ...s, ...patch } : s)),
          }));
          await firestoreUpdate(COLLECTION, id, patch);
        },
        updateStudentPin: async (id, pin) => {
          const pinHash = hashPin(pin);
          set((state) => ({
            students: state.students.map((s) => (s.id === id ? { ...s, pinHash } : s)),
          }));
          await firestoreUpdate(COLLECTION, id, { pinHash });
        },
        deactivateStudent: async (id) => {
          set((state) => ({
            students: state.students.map((s) => (s.id === id ? { ...s, isActive: false } : s)),
          }));
          await firestoreUpdate(COLLECTION, id, { isActive: false });
        },
        deleteStudent: async (id) => {
          set((state) => ({ students: state.students.filter((s) => s.id !== id) }));
          await firestoreDelete(COLLECTION, id);
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
