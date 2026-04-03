import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppSettings } from '@/types';
import { hashPin } from '@/utils/auth';
import { isFirebaseConfigured, subscribeDoc, firestoreSet } from '@/lib/firestoreSync';

interface SettingsState {
  settings: AppSettings;
  _ready: boolean;
  updateSettings: (patch: Partial<Omit<AppSettings, 'adminPasswordHash'>>) => void;
  setAdminPassword: (password: string) => void;
  verifyAdminPassword: (password: string) => boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  adminPasswordHash: '',
  seasonStart: '2025-07-03',
  seasonEnd: '2025-09-06',
  fullPayAmount: 9100,
  vPayAmount: 2000,
  clubName: '逗子ライフセービングクラブ',
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
        (settings) => set({ settings, _ready: true }),
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
          const merged = { ...get().settings, ...patch };
          set({ settings: merged });
          await firestoreSet(COLLECTION, DOC_ID, merged);
        },
        setAdminPassword: async (password) => {
          const merged = { ...get().settings, adminPasswordHash: hashPin(password) };
          set({ settings: merged });
          await firestoreSet(COLLECTION, DOC_ID, merged);
        },
        verifyAdminPassword: (password) => {
          const hash = get().settings.adminPasswordHash;
          if (!hash) return true;
          return hash === hashPin(password);
        },
      };
    })
  : create<SettingsState>()(
      persist(
        (set, get) => ({
          settings: DEFAULT_SETTINGS,
          _ready: true,
          updateSettings: (patch) =>
            set((state) => ({ settings: { ...state.settings, ...patch } })),
          setAdminPassword: (password) =>
            set((state) => ({
              settings: { ...state.settings, adminPasswordHash: hashPin(password) },
            })),
          verifyAdminPassword: (password) => {
            const hash = get().settings.adminPasswordHash;
            if (!hash) return true;
            return hash === hashPin(password);
          },
        }),
        { name: 'zushi_settings' },
      )
    );
