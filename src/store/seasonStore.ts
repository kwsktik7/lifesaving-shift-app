import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SeasonDay } from '@/types';
import { eachDayOfInterval, format, parseISO } from 'date-fns';
import { isFirebaseConfigured, subscribeCollection, firestoreSet, firestoreBatchWrite } from '@/lib/firestoreSync';

interface SeasonState {
  days: SeasonDay[];
  _ready: boolean;
  initSeason: (start: string, end: string) => void;
  updateDay: (date: string, patch: Partial<Omit<SeasonDay, 'date'>>) => void;
  getDay: (date: string) => SeasonDay | undefined;
}

const COLLECTION = 'seasonDays';

function buildSeasonDays(start: string, end: string): SeasonDay[] {
  return eachDayOfInterval({ start: parseISO(start), end: parseISO(end) }).map((d) => ({
    date: format(d, 'yyyy-MM-dd'),
    isOpen: true,
    note: '',
  }));
}

export const useSeasonStore = isFirebaseConfigured
  ? create<SeasonState>()((set, get) => {
      subscribeCollection(
        COLLECTION,
        (id, data) => ({ ...data, date: id } as SeasonDay),
        (days) => set({ days: days.sort((a, b) => a.date.localeCompare(b.date)), _ready: true }),
      );

      return {
        days: [],
        _ready: false,
        /**
         * 期間の start/end に合わせて seasonDays を差分更新する。
         * - 新期間に含まれない既存日 → 削除
         * - 既存に無い新期間日 → 追加
         * - 既に一致している日は isOpen/note を保持したまま残す
         * これで「設定でシーズン開始日/終了日を変えるだけで全カレンダーが更新」される。
         */
        initSeason: async (start, end) => {
          if (!start || !end) return;
          const target = buildSeasonDays(start, end);
          const targetDates = new Set(target.map((d) => d.date));
          const existing = get().days;
          const existingDates = new Set(existing.map((d) => d.date));

          const toDelete = existing.filter((d) => !targetDates.has(d.date));
          const toAdd = target.filter((d) => !existingDates.has(d.date));
          if (toDelete.length === 0 && toAdd.length === 0) return;

          // 楽観更新: 範囲内の既存日は設定保持、範囲外を削除、新規追加
          const kept = existing.filter((d) => targetDates.has(d.date));
          const merged = [...kept, ...toAdd].sort((a, b) => a.date.localeCompare(b.date));
          set({ days: merged });

          const ops = [
            ...toDelete.map((d) => ({ type: 'delete' as const, collection: COLLECTION, docId: d.date })),
            ...toAdd.map((d) => ({
              type: 'set' as const,
              collection: COLLECTION,
              docId: d.date,
              data: { isOpen: d.isOpen, note: d.note },
            })),
          ];
          firestoreBatchWrite(ops).catch((e) => console.warn('[season] initSeason', e));
        },
        updateDay: async (date, patch) => {
          set((state) => ({
            days: state.days.map((d) => (d.date === date ? { ...d, ...patch } : d)),
          }));
          const day = get().days.find((d) => d.date === date);
          if (day) {
            const { date: _, ...rest } = day;
            firestoreSet(COLLECTION, date, rest).catch((e) => console.warn('[season] updateDay', e));
          }
        },
        getDay: (date) => get().days.find((d) => d.date === date),
      };
    })
  : create<SeasonState>()(
      persist(
        (set, get) => ({
          days: [],
          _ready: true,
          initSeason: (start, end) => {
            const existing = get().days;
            if (existing.length > 0) return;
            set({ days: buildSeasonDays(start, end) });
          },
          updateDay: (date, patch) =>
            set((state) => ({
              days: state.days.map((d) => (d.date === date ? { ...d, ...patch } : d)),
            })),
          getDay: (date) => get().days.find((d) => d.date === date),
        }),
        { name: 'zushi_season_days' },
      )
    );
