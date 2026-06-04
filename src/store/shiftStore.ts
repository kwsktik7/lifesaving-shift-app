import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ShiftAssignment, PayType, ShiftStatus, AttendanceType, StudentSummary } from '@/types';
import { useStudentStore } from './studentStore';
import { useSettingsStore } from './settingsStore';
import { isFirebaseConfigured, subscribeCollection, firestoreSet, firestoreUpdate, firestoreDelete, firestoreBatchWrite } from '@/lib/firestoreSync';

interface ShiftState {
  shifts: ShiftAssignment[];
  _ready: boolean;
  assignShift: (studentId: string, date: string, attendance?: AttendanceType) => void;
  updateShift: (id: string, patch: Partial<Pick<ShiftAssignment, 'payType' | 'status' | 'attendance' | 'replacedBy' | 'replacesId' | 'note'>>) => void;
  addReplacementShift: (originalShiftId: string, replacementStudentId: string, attendance: AttendanceType) => void;
  /**
   * 勤怠入力で出勤者を追加する。status=attended、payType は未確定 (undefined)。
   * 月末に AdminPayAllocation で payType が 1 or V に確定する。
   */
  addExtraAttendance: (studentId: string, date: string, attendance: AttendanceType) => void;
  removeShift: (id: string) => void;
  publishDay: (date: string) => void;
  /** その日の未確定(draft)・公開済(published)シフトを全削除して白紙に戻す (組み直し用)。勤怠済みは触らない。 */
  clearDayShifts: (date: string) => void;
  getShiftsForDate: (date: string) => ShiftAssignment[];
  getShiftsForStudent: (studentId: string) => ShiftAssignment[];
  getSummaries: () => StudentSummary[];
  updateShiftPayType: (id: string, payType: PayType) => void;
  setShiftPayTypesBulk: (updates: { id: string; payType: PayType }[]) => Promise<void>;
  suggestPayTypes: (
    date: string,
    availableStudentIds: string[],
    fullPaySlots: number,
  ) => { studentId: string; payType: PayType }[];
}

const COLLECTION = 'shifts';

function shiftToDoc(s: ShiftAssignment): Record<string, unknown> {
  const { id: _id, ...rest } = s;
  void _id;
  const doc: Record<string, unknown> = { ...rest };
  // Firestore は undefined を受け付けないので未確定のキーを落とす
  for (const k of Object.keys(doc)) {
    if (doc[k] === undefined) delete doc[k];
  }
  return doc;
}

function computeSummaries(shifts: ShiftAssignment[]): StudentSummary[] {
  const students = useStudentStore.getState().students;
  const { fullPayAmount, vPayAmount } = useSettingsStore.getState().settings;

  return students.filter((s) => s.isActive).map((student) => {
    const mine = shifts.filter((s) => s.studentId === student.id && s.status !== 'cancelled' && s.status !== 'draft');
    // 配分未確定 (payType === undefined) は full/V のどちらにも入れない
    const assigned = mine.filter((s) => s.status !== 'absent');
    const fullPayDays = assigned.filter((s) => s.payType === '1').length;
    const vPayDays = assigned.filter((s) => s.payType === 'V').length;
    const totalDays = fullPayDays + vPayDays;

    const attended = mine.filter((s) => s.status === 'attended');
    const attendedFullPayDays = attended.filter((s) => s.payType === '1').length;
    const attendedVPayDays = attended.filter((s) => s.payType === 'V').length;
    const absentDays = mine.filter((s) => s.status === 'absent').length;

    // 給与は payType が確定済みのもののみ計算 (undefined は 0 円扱い)
    let totalPay = 0;
    for (const s of attended) {
      if (s.payType !== '1' && s.payType !== 'V') continue;
      const base = s.payType === '1' ? fullPayAmount : vPayAmount;
      const multiplier = (s.attendance === 'am' || s.attendance === 'pm') ? 0.5 : 1;
      totalPay += base * multiplier;
    }

    return {
      studentId: student.id,
      fullPayDays,
      vPayDays,
      totalDays,
      fullPayRatio: totalDays > 0 ? fullPayDays / totalDays : 0,
      attendedFullPayDays,
      attendedVPayDays,
      attendedDays: attendedFullPayDays + attendedVPayDays,
      absentDays,
      totalPay,
    };
  });
}

function suggestPayTypesLogic(
  shifts: ShiftAssignment[],
  _date: string,
  availableStudentIds: string[],
  fullPaySlots: number,
): { studentId: string; payType: PayType }[] {
  const summaries = computeSummaries(shifts);
  const sorted = [...availableStudentIds].sort((a, b) => {
    const sa = summaries.find((s) => s.studentId === a);
    const sb = summaries.find((s) => s.studentId === b);
    const ra = sa?.fullPayRatio ?? 0;
    const rb = sb?.fullPayRatio ?? 0;
    if (ra !== rb) return ra - rb;
    const ta = sa?.totalDays ?? 0;
    const tb = sb?.totalDays ?? 0;
    return ta - tb;
  });
  return sorted.map((studentId, index) => ({
    studentId,
    payType: index < fullPaySlots ? '1' : 'V',
  }));
}

export const useShiftStore = isFirebaseConfigured
  ? create<ShiftState>()((set, get) => {
      subscribeCollection(
        COLLECTION,
        (id, data) => ({ ...data, id } as ShiftAssignment),
        (shifts) => set({ shifts, _ready: true }),
      );

      return {
        shifts: [],
        _ready: false,
        assignShift: async (studentId, date, attendance = 'full') => {
          const existing = get().shifts.find(
            (s) => s.studentId === studentId && s.date === date && s.status !== 'cancelled',
          );
          if (existing) {
            // 既存シフトがあれば attendance だけ更新 (payType には触らない)
            set((state) => ({
              shifts: state.shifts.map((s) => (s.id === existing.id ? { ...s, attendance } : s)),
            }));
            firestoreUpdate(COLLECTION, existing.id, { attendance }).catch((e) => console.warn('[shifts] assign-update', e));
            return;
          }
          // 新規作成時は payType を持たない (未確定)
          const shift: ShiftAssignment = {
            id: crypto.randomUUID(),
            studentId,
            date,
            status: 'draft',
            attendance,
            note: '',
            createdAt: new Date().toISOString(),
          };
          set((state) => ({ shifts: [...state.shifts, shift] }));
          firestoreSet(COLLECTION, shift.id, shiftToDoc(shift)).catch((e) => console.warn('[shifts] assign-new', e));
        },
        updateShift: async (id, patch) => {
          set((state) => ({
            shifts: state.shifts.map((s) => (s.id === id ? { ...s, ...patch } : s)),
          }));
          firestoreUpdate(COLLECTION, id, patch).catch((e) => console.warn('[shifts] update', e));
        },
        addReplacementShift: async (originalShiftId, replacementStudentId, attendance) => {
          const original = get().shifts.find((s) => s.id === originalShiftId);
          if (!original) return;
          // payType は未確定 (給与配分で月末に確定)
          const newShift: ShiftAssignment = {
            id: crypto.randomUUID(),
            studentId: replacementStudentId,
            date: original.date,
            status: 'attended' as ShiftStatus,
            attendance,
            replacesId: originalShiftId,
            note: `${original.studentId}の代わり`,
            createdAt: new Date().toISOString(),
          };
          set((state) => ({
            shifts: [
              ...state.shifts.map((s) =>
                s.id === originalShiftId ? { ...s, replacedBy: replacementStudentId } : s,
              ),
              newShift,
            ],
          }));
          firestoreBatchWrite([
            { type: 'update', collection: COLLECTION, docId: originalShiftId, data: { replacedBy: replacementStudentId } },
            { type: 'set', collection: COLLECTION, docId: newShift.id, data: shiftToDoc(newShift) },
          ]).catch((e) => console.warn('[shifts] replacement', e));
        },
        addExtraAttendance: async (studentId, date, attendance) => {
          // payType は持たない (給与配分時に確定)
          const newShift: ShiftAssignment = {
            id: crypto.randomUUID(),
            studentId,
            date,
            status: 'attended' as ShiftStatus,
            attendance,
            note: '',
            createdAt: new Date().toISOString(),
          };
          set((state) => ({ shifts: [...state.shifts, newShift] }));
          firestoreSet(COLLECTION, newShift.id, shiftToDoc(newShift)).catch((e) =>
            console.warn('[shifts] addExtra', e),
          );
        },
        removeShift: async (id) => {
          set((state) => ({ shifts: state.shifts.filter((s) => s.id !== id) }));
          firestoreDelete(COLLECTION, id).catch((e) => console.warn('[shifts] delete', e));
        },
        publishDay: async (date) => {
          const toPublish = get().shifts.filter((s) => s.date === date && s.status === 'draft');
          set((state) => ({
            shifts: state.shifts.map((s) =>
              s.date === date && s.status === 'draft' ? { ...s, status: 'published' as ShiftStatus } : s,
            ),
          }));
          if (toPublish.length > 0) {
            firestoreBatchWrite(
              toPublish.map((s) => ({
                type: 'update' as const,
                collection: COLLECTION,
                docId: s.id,
                data: { status: 'published' },
              })),
            ).catch((e) => console.warn('[shifts] publish', e));
          }
        },
        clearDayShifts: async (date) => {
          // draft / published のみ削除。attended / absent (勤怠済み) は安全のため残す。
          const toDelete = get().shifts.filter(
            (s) => s.date === date && (s.status === 'draft' || s.status === 'published'),
          );
          if (toDelete.length === 0) return;
          set((state) => ({
            shifts: state.shifts.filter(
              (s) => !(s.date === date && (s.status === 'draft' || s.status === 'published')),
            ),
          }));
          firestoreBatchWrite(
            toDelete.map((s) => ({ type: 'delete' as const, collection: COLLECTION, docId: s.id })),
          ).catch((e) => console.warn('[shifts] clearDay', e));
        },
        getShiftsForDate: (date) =>
          get().shifts.filter((s) => s.date === date && s.status !== 'cancelled'),
        getShiftsForStudent: (studentId) =>
          get().shifts.filter((s) => s.studentId === studentId && s.status !== 'cancelled'),
        getSummaries: () => computeSummaries(get().shifts),
        updateShiftPayType: async (id, payType) => {
          set((state) => ({
            shifts: state.shifts.map((s) => (s.id === id ? { ...s, payType } : s)),
          }));
          firestoreUpdate(COLLECTION, id, { payType }).catch((e) => console.warn('[shifts] updatePayType', e));
        },
        setShiftPayTypesBulk: async (updates) => {
          if (updates.length === 0) return;
          const map = new Map(updates.map((u) => [u.id, u.payType]));
          // 一括で楽観更新（個別updateだとsubscribeCollectionの中間スナップショットで巻き戻る）
          set((state) => ({
            shifts: state.shifts.map((s) => (map.has(s.id) ? { ...s, payType: map.get(s.id)! } : s)),
          }));
          // 単一のbatch.commitで送信 → スナップショットも1回のみ (fire-and-forget)
          firestoreBatchWrite(
            updates.map((u) => ({
              type: 'update' as const,
              collection: COLLECTION,
              docId: u.id,
              data: { payType: u.payType },
            })),
          ).catch((e) => console.warn('[shifts] bulk update', e));
        },
        suggestPayTypes: (date, availableStudentIds, fullPaySlots) =>
          suggestPayTypesLogic(get().shifts, date, availableStudentIds, fullPaySlots),
      };
    })
  : create<ShiftState>()(
      persist(
        (set, get) => ({
          shifts: [],
          _ready: true,
          assignShift: (studentId, date, attendance = 'full') => {
            const existing = get().shifts.find(
              (s) => s.studentId === studentId && s.date === date && s.status !== 'cancelled',
            );
            if (existing) {
              set((state) => ({
                shifts: state.shifts.map((s) => (s.id === existing.id ? { ...s, attendance } : s)),
              }));
              return;
            }
            set((state) => ({
              shifts: [
                ...state.shifts,
                {
                  id: crypto.randomUUID(),
                  studentId,
                  date,
                  status: 'draft',
                  attendance,
                  note: '',
                  createdAt: new Date().toISOString(),
                },
              ],
            }));
          },
          updateShift: (id, patch) =>
            set((state) => ({
              shifts: state.shifts.map((s) => (s.id === id ? { ...s, ...patch } : s)),
            })),
          addReplacementShift: (originalShiftId, replacementStudentId, attendance) => {
            const original = get().shifts.find((s) => s.id === originalShiftId);
            if (!original) return;
            set((state) => ({
              shifts: [
                ...state.shifts.map((s) =>
                  s.id === originalShiftId ? { ...s, replacedBy: replacementStudentId } : s,
                ),
                {
                  id: crypto.randomUUID(),
                  studentId: replacementStudentId,
                  date: original.date,
                  status: 'attended' as ShiftStatus,
                  attendance,
                  replacesId: originalShiftId,
                  note: `${original.studentId}の代わり`,
                  createdAt: new Date().toISOString(),
                },
              ],
            }));
          },
          addExtraAttendance: (studentId, date, attendance) => {
            set((state) => ({
              shifts: [
                ...state.shifts,
                {
                  id: crypto.randomUUID(),
                  studentId,
                  date,
                  status: 'attended' as ShiftStatus,
                  attendance,
                  note: '',
                  createdAt: new Date().toISOString(),
                },
              ],
            }));
          },
          removeShift: (id) =>
            set((state) => ({ shifts: state.shifts.filter((s) => s.id !== id) })),
          publishDay: (date) =>
            set((state) => ({
              shifts: state.shifts.map((s) =>
                s.date === date && s.status === 'draft' ? { ...s, status: 'published' as ShiftStatus } : s,
              ),
            })),
          clearDayShifts: (date) =>
            set((state) => ({
              shifts: state.shifts.filter(
                (s) => !(s.date === date && (s.status === 'draft' || s.status === 'published')),
              ),
            })),
          getShiftsForDate: (date) =>
            get().shifts.filter((s) => s.date === date && s.status !== 'cancelled'),
          getShiftsForStudent: (studentId) =>
            get().shifts.filter((s) => s.studentId === studentId && s.status !== 'cancelled'),
          getSummaries: () => computeSummaries(get().shifts),
          updateShiftPayType: (id, payType) =>
            set((state) => ({
              shifts: state.shifts.map((s) => (s.id === id ? { ...s, payType } : s)),
            })),
          setShiftPayTypesBulk: async (updates) => {
            if (updates.length === 0) return;
            const map = new Map(updates.map((u) => [u.id, u.payType]));
            set((state) => ({
              shifts: state.shifts.map((s) => (map.has(s.id) ? { ...s, payType: map.get(s.id)! } : s)),
            }));
          },
          suggestPayTypes: (date, availableStudentIds, fullPaySlots) =>
            suggestPayTypesLogic(get().shifts, date, availableStudentIds, fullPaySlots),
        }),
        { name: 'zushi_shifts' },
      )
    );
