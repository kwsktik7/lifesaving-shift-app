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
  roles: [
    { name: 'ガード', isLeader: false },
    { name: '監視長', isLeader: true },
    { name: '副監視長', isLeader: true },
  ],
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
            roles: settings.roles ?? DEFAULT_SETTINGS.roles,
          };
          set({ settings: merged, _ready: true });
        },
        () => {
          // ドキュメント未作成 → デフォルト書き込み
          firestoreSet(COLLECTION, DOC_ID, DEFAULT_SETTINGS);
          set({ settings: DEFAULT_SETTINGS, _ready: true });
        },
      );

      // 既知の問題: Firestore SDK v11 が long-polling 下で promise を resolve しない場合がある。
      // 書き込み自体はサーバーに届いているのでfire-and-forget方式で運用する。
      return {
        settings: DEFAULT_SETTINGS,
        _ready: false,
        updateSettings: async (patch) => {
          set({ settings: { ...get().settings, ...patch } });
          firestoreUpdate(COLLECTION, DOC_ID, patch as Record<string, unknown>).catch((e) => {
            console.warn('[settings] update promise did not resolve', e);
          });
        },
        setAdminPassword: async (password) => {
          const adminPasswordHash = hashPin(password);
          set((state) => ({ settings: { ...state.settings, adminPasswordHash } }));
          firestoreUpdate(COLLECTION, DOC_ID, { adminPasswordHash }).catch((e) => {
            console.warn('[settings] setAdminPassword promise did not resolve', e);
          });
        },
        verifyAdminPassword: (password) => {
          const hash = get().settings.adminPasswordHash;
          if (!hash) return true;
          return hash === hashPin(password);
        },
        setLeaderPassword: async (password) => {
          const leaderPasswordHash = hashPin(password);
          set((state) => ({ settings: { ...state.settings, leaderPasswordHash } }));
          firestoreUpdate(COLLECTION, DOC_ID, { leaderPasswordHash }).catch((e) => {
            console.warn('[settings] setLeaderPassword promise did not resolve', e);
          });
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
