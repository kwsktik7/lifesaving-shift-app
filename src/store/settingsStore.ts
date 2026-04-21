import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppSettings } from '@/types';
import { hashPin } from '@/utils/auth';
import { isFirebaseConfigured, subscribeDoc, firestoreSet, firestoreUpdate } from '@/lib/firestoreSync';

interface SettingsState {
  settings: AppSettings;
  _ready: boolean;
  updateSettings: (patch: Partial<Omit<AppSettings, 'adminPasswordHash' | 'leaderPasswordHash'>>) => Promise<void>;
  setAdminPassword: (password: string) => Promise<void>;
  verifyAdminPassword: (password: string) => boolean;
  setLeaderPassword: (password: string) => Promise<void>;
  verifyLeaderPassword: (password: string) => boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  adminPasswordHash: '',
  leaderPasswordHash: '',
  seasonStart: '2025-07-03',
  seasonEnd: '2025-09-06',
  fullPayAmount: 9100,
  vPayAmount: 2000,
  clubName: '逗子ライフセービングクラブ',
  monthlyBudgets: {},
  allocatedMonths: [],
  availabilityLocked: false,
};

const COLLECTION = 'settings';
const DOC_ID = 'main';

// Firestore有効時: リアルタイム同期
// Firestore無効時: localStorage persist（従来動作）
export const useSettingsStore = isFirebaseConfigured
  ? create<SettingsState>()((set, get) => {
      // Firestoreリスナー開始
      subscribeDoc(
        COLLECTION,
        DOC_ID,
        (data) => data as AppSettings,
        (settings) => {
          // 既存ドキュメントにフィールドが存在しない場合のフォールバック
          const merged: AppSettings = {
            ...DEFAULT_SETTINGS,
            ...settings,
            monthlyBudgets: settings.monthlyBudgets ?? {},
            allocatedMonths: settings.allocatedMonths ?? [],
            availabilityLocked: settings.availabilityLocked ?? false,
          };
          set({ settings: merged, _ready: true });
        },
        () => {
          // ドキュメント未作成 → デフォルト書き込み
          firestoreSet(COLLECTION, DOC_ID, DEFAULT_SETTINGS);
          set({ settings: DEFAULT_SETTINGS, _ready: true });
        },
      );

      return {
        settings: DEFAULT_SETTINGS,
        _ready: false,
        updateSettings: async (patch) => {
          // 楽観更新
          set({ settings: { ...get().settings, ...patch } });
          // Firestore部分更新 (updateDocなので他フィールド維持)
          await firestoreUpdate(COLLECTION, DOC_ID, patch as Record<string, unknown>);
        },
        setAdminPassword: async (password) => {
          const adminPasswordHash = hashPin(password);
          set((state) => ({ settings: { ...state.settings, adminPasswordHash } }));
          await firestoreUpdate(COLLECTION, DOC_ID, { adminPasswordHash });
        },
        verifyAdminPassword: (password) => {
          const hash = get().settings.adminPasswordHash;
          if (!hash) return true;
          return hash === hashPin(password);
        },
        setLeaderPassword: async (password) => {
          const leaderPasswordHash = hashPin(password);
          set((state) => ({ settings: { ...state.settings, leaderPasswordHash } }));
          await firestoreUpdate(COLLECTION, DOC_ID, { leaderPasswordHash });
        },
        verifyLeaderPassword: (password) => {
          const hash = get().settings.leaderPasswordHash;
          if (!hash) return false;
          return hash === hashPin(password);
        },
      };
    })
  : create<SettingsState>()(
      persist(
        (set, get) => ({
          settings: DEFAULT_SETTINGS,
          _ready: true,
          updateSettings: async (patch) => {
            set((state) => ({ settings: { ...state.settings, ...patch } }));
          },
          setAdminPassword: async (password) => {
            set((state) => ({
              settings: { ...state.settings, adminPasswordHash: hashPin(password) },
            }));
          },
          verifyAdminPassword: (password) => {
            const hash = get().settings.adminPasswordHash;
            if (!hash) return true;
            return hash === hashPin(password);
          },
          setLeaderPassword: async (password) => {
            set((state) => ({
              settings: { ...state.settings, leaderPasswordHash: hashPin(password) },
            }));
          },
          verifyLeaderPassword: (password) => {
            const hash = get().settings.leaderPasswordHash;
            if (!hash) return false;
            return hash === hashPin(password);
          },
        }),
        { name: 'zushi_settings' },
      )
    );
