import { useState } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { Lock } from 'lucide-react';

/**
 * 給与配分・設定ページに重ねる専用パスワードのゲート。
 * - settings.ownerPasswordHash が未設定なら素通し（ロックなし）
 * - 設定済みなら、ログインセッション中に1回だけパスワード入力を要求する
 *   （解錠状態は sessionStorage に保持。ログアウトで auth.clearSession がクリアする）
 * 管理者パスワード(キャプテン共有)とは別物で、オーナー専用の保護層。
 */
const UNLOCK_KEY = 'zushi_owner_unlocked';

export default function OwnerGate({ children }: { children: React.ReactNode }) {
  const { settings, _ready, verifyOwnerPassword } = useSettingsStore();
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(UNLOCK_KEY) === '1');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  // 設定の同期待ち（同期前に hash 空と誤判定して素通ししないため）
  if (!_ready) {
    return <div className="p-6 text-sm text-gray-500">読み込み中...</div>;
  }
  // 専用パスワード未設定 → ロックなし
  if (!settings.ownerPasswordHash) return <>{children}</>;
  // すでに解錠済み（このログインセッション中）
  if (unlocked) return <>{children}</>;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (verifyOwnerPassword(input)) {
      sessionStorage.setItem(UNLOCK_KEY, '1');
      setUnlocked(true);
      setError('');
      setInput('');
    } else {
      setError('パスワードが違います');
    }
  }

  return (
    <div className="p-6 flex items-center justify-center min-h-[60vh]">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-gray-200 p-6 w-full max-w-sm shadow-sm"
      >
        <div className="flex items-center gap-2 mb-2">
          <Lock size={18} className="text-gray-500" />
          <h2 className="text-base font-semibold text-gray-800">ロックされています</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
          このページは専用パスワードで保護されています。<br />
          管理者パスワードとは別のパスワードを入力してください。
        </p>
        <input
          type="password"
          autoFocus
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(''); }}
          placeholder="専用パスワード"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
        />
        {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
        <button
          type="submit"
          disabled={!input}
          className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          解除する
        </button>
      </form>
    </div>
  );
}
