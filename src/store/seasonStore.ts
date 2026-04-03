import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SeasonDay } from '@/types';
import { eachDayOfInterval, format, parseISO } from 'date-fns';
import { isFirebaseConfigured, subscribeCollection, firestoreSet, firestoreBatchWrite } from '@/lib/firestoreSync';

interface SeasonState {
  days: SeasonDay[];
  _ready: boolean;
  initSeason: (start: string, end: string, defaultMinimum?: number) => void;
  updateDay: (date: string, patch: Partial<Omit<SeasonDay, 'date'>>) => void;
  getDay: (date: string) => SeasonDay | undefined;
}

const COLLECTION = 'seasonDays';

function buildSeasonDays(start: string, end: string, defaultMinimum = 3): SeasonDay[] {
  return eachDayOfInterval({ start: parseISO(start), end: parseISO(end) }).map((d) => ({
    date: format(d, 'yyyy-MM-dd'),
    cityMinimum: defaultMinimum,
    actualSlots: defaultMinimum,
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
        initSeason: async (start, end, defaultMinimum = 3) => {
          const existing = get().days;
          if (existing.length > 0) return;
          const days = buildSeasonDays(start, end, defaultMinimum);
          set({ days });
          await firestoreBatchWrite(
            days.map((d) => ({
              type: 'set' as const,
              collection: COLLECTION,
              docId: d.date,
              data: { cityMinimum: d.cityMinimum, actualSlots: d.actualSlots, isOpen: d.isOpen, note: d.note },
            })),
          );
        },
        updateDay: async (date, patch) => {
          set((state) => ({
            days: state.days.map((d) => (d.date === date ? { ...d, ...patch } : d)),
          }));
          const day = get().days.find((d) => d.date === date);
          if (day) {
            const { date: _, ...rest } = day;
            await firestoreSet(COLLECTION, date, rest);
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
          initSeason: (start, end, defaultMinimum = 3) => {
            const existing = get().days;
            if (existing.length > 0) return;
            set({ days: buildSeasonDays(start, end, defaultMinimum) });
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
