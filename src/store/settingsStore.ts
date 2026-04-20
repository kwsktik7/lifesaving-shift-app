import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppSettings } from '@/types';
import { hashPin } from '@/utils/auth';
import { isFirebaseConfigured, subscribeDoc, firestoreSet, firestoreUpdate } from '@/lib/firestoreSync';

interface SettingsState {
  settings: AppSettings;
  _ready: boolean;
  updateSettings: (patch: Partial<Omit<AppSettings, 'adminPasswordHash' | 'leaderPasswordHash'>>) => Promise<void>;
  setAdminPassword: (password: string) => void;
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
      // 進行中の書き込みパッチ（古いスナップショットによるロールバック防止用）
      let pendingPatch: Partial<AppSettings> | null = null;

      // Firestoreリスナー開始
      subscribeDoc(
        COLLECTION,
        DOC_ID,
        (data) => data as AppSettings,
        (settings) => {
          // 既存ドキュメントにフィールドが存在しない場合のフォールバック
          const base: AppSettings = {
            ...settings,
            monthlyBudgets: settings.monthlyBudgets ?? {},
            allocatedMonths: settings.allocatedMonths ?? [],
            availabilityLocked: settings.availabilityLocked ?? false,
          };
          // 書き込み中のpatchがあれば、スナップショットに上書きマージ
          // （Firestoreのローカルキャッシュが古い値で発火するレースを防ぐ）
          const merged: AppSettings = pendingPatch
            ? {
                ...base,
                ...pendingPatch,
                monthlyBudgets: {
                  ...(base.monthlyBudgets ?? {}),
                  ...(pendingPatch.monthlyBudgets ?? {}),
                },
              }
            : base;
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
          // pendingにマージ（複数の連続更新にも対応）
          pendingPatch = {
            ...(pendingPatch ?? {}),
            ...patch,
            monthlyBudgets: {
              ...(pendingPatch?.monthlyBudgets ?? {}),
              ...(patch.monthlyBudgets ?? {}),
            },
          };
          const merged = { ...get().settings, ...patch };
          set({ settings: merged });
          let writeError: unknown = null;
          try {
            // setDoc(全置換)ではなくupdateDoc(部分更新)を使う：他フィールドを上書きせず、
            // スナップショット競合も最小化される。
            await firestoreUpdate(COLLECTION, DOC_ID, patch as Record<string, unknown>);
          } catch (e) {
            console.error('[settings] update failed', e);
            writeError = e;
            // 失敗時もpendingPatchは保持: ロールバックスナップショットで上書きされないように
          }
          // 成功・失敗に関わらず、遅延クリア:
          // Firestoreの確定/ロールバックスナップショットはpromise解決後に発火することがあるため、
          // pendingPatchを少し保持して上書きを防ぐ。
          setTimeout(() => {
            pendingPatch = null;
          }, 1500);
          // 呼び出し側がエラーを検知できるように再スロー
          if (writeError) throw writeError;
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
          setAdminPassword: (password) =>
            set((state) => ({
              settings: { ...state.settings, adminPasswordHash: hashPin(password) },
            })),
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
