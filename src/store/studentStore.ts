import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Student } from '@/types';
import { hashPin } from '@/utils/auth';
import { isFirebaseConfigured, subscribeCollection, firestoreSet, firestoreUpdate, firestoreDelete } from '@/lib/firestoreSync';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface StudentState {
  students: Student[];
  _ready: boolean;
  /**
   * 学生を追加する。管理者から呼ばれる想定。
   * pin を空文字で渡すと pinHash も birthday も空のまま作成され、
   * 学生が初回ログイン時に自分で PIN を設定するフローになる。
   * order は名簿順 (PDF#1〜) を渡す。省略時は undefined で末尾扱い。
   */
  addStudent: (s: Omit<Student, 'id' | 'pinHash'> & { pin?: string; grade?: string; role?: string; hasPwc?: boolean; isLeader?: boolean; order?: number }) => Promise<string>;
  updateStudent: (id: string, patch: Partial<Omit<Student, 'id' | 'pinHash'>>) => void;
  /** PIN を更新する。pinHash と plaintext (birthday フィールド) の両方を更新する。 */
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
          const hasPin = !!pin;
          const student: Student = {
            ...data,
            id,
            pinHash: hasPin ? hashPin(pin!) : '',
            grade: data.grade ?? '',
            role: data.role ?? '',
            hasPwc: data.hasPwc ?? false,
            isLeader: data.isLeader ?? false,
            // birthday フィールドに PIN の plaintext を保持して管理者から見えるようにする。
            // PIN 未設定なら空文字で初期化（後から学生が設定する）。
            birthday: hasPin ? pin! : '',
          };
          set((state) => ({ students: [...state.students, student] }));
          const { id: _, ...docData } = student;
          // Firestore は undefined を許容しないので除外
          const cleanDoc: Record<string, unknown> = { ...docData };
          for (const k of Object.keys(cleanDoc)) {
            if (cleanDoc[k] === undefined) delete cleanDoc[k];
          }
          firestoreSet(COLLECTION, id, cleanDoc).catch((e) => console.warn('[students] addStudent', e));
          return id;
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
            students: state.students.map((s) => (s.id === id ? { ...s, pinHash, birthday: pin } : s)),
          }));
          firestoreUpdate(COLLECTION, id, { pinHash, birthday: pin }).catch((e) => console.warn('[students] updatePin', e));
        },
        deactivateStudent: async (id) => {
          set((state) => ({
            students: state.students.map((s) => (s.id === id ? { ...s, isActive: false } : s)),
          }));
          firestoreUpdate(COLLECTION, id, { isActive: false }).catch((e) => console.warn('[students] deactivate', e));
        },
        /**
         * 学生を完全削除 (cascade): students / shifts / availability を全て削除し、
         * 他人のシフトに残る「この学生が代わりに入った」「この学生に代わりを頼んだ」参照もクリアする。
         * 削除された学生のシフトが給与配分に幽霊として残らないようにするため。
         */
        deleteStudent: async (id) => {
          set((state) => ({ students: state.students.filter((s) => s.id !== id) }));
          if (!db) {
            firestoreDelete(COLLECTION, id).catch((e) => console.warn('[students] delete', e));
            return;
          }
          try {
            const [shiftsSnap, availSnap, replacedBySnap, replacesSnap] = await Promise.all([
              getDocs(query(collection(db, 'shifts'), where('studentId', '==', id))),
              getDocs(query(collection(db, 'availability'), where('studentId', '==', id))),
              getDocs(query(collection(db, 'shifts'), where('replacedBy', '==', id))),
              getDocs(query(collection(db, 'shifts'), where('replacesId', '==', id))),
            ]);
            const batch = writeBatch(db);
            batch.delete(doc(db, COLLECTION, id));
            shiftsSnap.docs.forEach((d) => batch.delete(d.ref));
            availSnap.docs.forEach((d) => batch.delete(d.ref));
            // 他人のシフトにある「この学生が代わりに来た」参照をクリア
            replacedBySnap.docs.forEach((d) => batch.update(d.ref, { replacedBy: null }));
            // replacesId で元のシフトを指してるものは、元シフトごと消えてるか残ってるかによるが、
            // 代わりの学生がこのidだった場合すでに shiftsSnap で削除対象。念のためクリア。
            replacesSnap.docs.forEach((d) => {
              if (!shiftsSnap.docs.find((sd) => sd.id === d.id)) {
                batch.update(d.ref, { replacesId: null });
              }
            });
            await batch.commit();
          } catch (e) {
            console.warn('[students] cascade delete', e);
            // フォールバック: せめて student doc だけは消す
            firestoreDelete(COLLECTION, id).catch(() => {});
          }
        },
      };
    })
  : create<StudentState>()(
      persist(
        (set) => ({
          students: [],
          _ready: true,
          addStudent: async ({ pin, ...data }) => {
            const id = crypto.randomUUID();
            const hasPin = !!pin;
            set((state) => ({
              students: [
                ...state.students,
                {
                  ...data,
                  id,
                  pinHash: hasPin ? hashPin(pin!) : '',
                  grade: data.grade ?? '',
                  role: data.role ?? '',
                  hasPwc: data.hasPwc ?? false,
                  isLeader: data.isLeader ?? false,
                  birthday: hasPin ? pin! : '',
                },
              ],
            }));
            return id;
          },
          updateStudent: (id, patch) =>
            set((state) => ({
              students: state.students.map((s) => (s.id === id ? { ...s, ...patch } : s)),
            })),
          updateStudentPin: (id, pin) =>
            set((state) => ({
              students: state.students.map((s) => (s.id === id ? { ...s, pinHash: hashPin(pin), birthday: pin } : s)),
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
