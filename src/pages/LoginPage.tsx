import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStudentStore } from '@/store/studentStore';
import { useSettingsStore } from '@/store/settingsStore';
import { firebaseSignIn, verifyPin } from '@/utils/auth';
import { sortStudents } from '@/utils/studentSort';

export default function LoginPage() {
  const [tab, setTab] = useState<'admin' | 'student'>('student');
  const [adminPass, setAdminPass] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [error, setError] = useState('');

  const { students, updateStudentPin } = useStudentStore();
  const { settings, _ready: settingsReady, verifyAdminPassword, setAdminPassword } = useSettingsStore();
  const navigate = useNavigate();

  const activeStudents = useMemo(() => sortStudents(students.filter((s) => s.isActive && !s.isAdult)), [students]);

  // 選択中の学生。PIN未設定 (pinHash が空) の場合は初回PIN設定モードに切り替える。
  const me = useMemo(
    () => students.find((s) => s.id === selectedStudent),
    [students, selectedStudent]
  );
  const needsInitialPin = !!me && !me.pinHash;

  const [loading, setLoading] = useState(false);

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!settings.adminPasswordHash) {
        // 先に session doc を作成 (adminロール確立) → その後 settings 書き込み
        await firebaseSignIn({ role: 'admin' });
        setAdminPassword(adminPass);
        navigate('/admin');
        return;
      }
      if (verifyAdminPassword(adminPass)) {
        await firebaseSignIn({ role: 'admin' });
        navigate('/admin');
      } else {
        setError('パスワードが違います');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleStudentLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!me) {
      setError('学生を選択してください');
      return;
    }
    if (needsInitialPin) {
      // 初回PIN設定モード
      if (!/^\d{4}$/.test(pin)) {
        setError('PINは4桁の数字で入力してください');
        return;
      }
      if (pin !== pinConfirm) {
        setError('確認用PINが一致しません');
        return;
      }
      setLoading(true);
      try {
        await updateStudentPin(me.id, pin);
        await firebaseSignIn({ role: 'student', studentId: me.id, studentName: me.name });
        navigate('/student');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`PIN設定に失敗しました: ${msg}`);
      } finally {
        setLoading(false);
      }
      return;
    }
    // 通常ログイン
    if (!verifyPin(pin, me.pinHash)) {
      setError('PINが違います');
      return;
    }
    setLoading(true);
    try {
      await firebaseSignIn({ role: 'student', studentId: me.id, studentName: me.name });
      navigate('/student');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-sky-100 via-sky-50 to-blue-100 flex items-center justify-center p-4 overflow-hidden">
      <WaveBackground />
      <div className="relative z-10 bg-white/95 backdrop-blur rounded-2xl shadow-xl ring-1 ring-slate-200 w-full max-w-sm p-8">
        <div className="text-center mb-7">
          <img
            src="/pwa-192x192.png"
            alt="逗子SLSC"
            width={88}
            height={88}
            className="mx-auto mb-3 rounded-full ring-2 ring-blue-100 shadow-md object-cover"
          />
          <h1 className="text-xl font-bold text-gray-800 tracking-wide">{settings.clubName}</h1>
          <p className="text-xs text-gray-500 mt-1">シフト管理システム</p>
        </div>

        {/* Tab */}
        <div className="flex rounded-lg overflow-hidden border border-gray-200 mb-6">
          <button
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              tab === 'student' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
            onClick={() => { setTab('student'); setError(''); }}
          >
            学生
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              tab === 'admin' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
            onClick={() => { setTab('admin'); setError(''); }}
          >
            管理者
          </button>
        </div>

        {tab === 'student' ? (
          !me ? (
            // Step 1: 名前選択のみ
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">名前を選択してください</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  value={selectedStudent}
                  onChange={(e) => {
                    setSelectedStudent(e.target.value);
                    setPin('');
                    setPinConfirm('');
                    setError('');
                  }}
                >
                  <option value="">-- 選択してください --</option>
                  {activeStudents.map((s) => (
                    <option key={s.id} value={s.id}>{s.grade} {s.name}</option>
                  ))}
                </select>
              </div>
              {activeStudents.length === 0 && (
                <p className="text-xs text-gray-500">
                  まだ学生が登録されていません。管理者に登録を依頼してください。
                </p>
              )}
            </div>
          ) : (
            // Step 2: 名前選択後 (ウェルカム + パスワード設定/入力)
            <form onSubmit={handleStudentLogin} className="space-y-4">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-center">
                <p className="text-base font-medium text-gray-800">
                  <span className="font-bold">{me.name}</span> さん、ようこそ
                </p>
                <p className="text-sm text-gray-600 mt-1.5">
                  {needsInitialPin
                    ? 'パスワード（4桁の数字）を設定してください'
                    : 'パスワードを入力してください'}
                </p>
              </div>
              {needsInitialPin ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">新しいパスワード（4桁）</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="0000"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">確認のためもう一度</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={pinConfirm}
                      onChange={(e) => setPinConfirm(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="0000"
                    />
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    ここで設定したパスワードが次回以降のログインに使われます。
                    <strong className="text-gray-700">他の人には教えないでください。</strong>
                  </p>
                </>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">パスワード（4桁）</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="0000"
                    autoFocus
                  />
                </div>
              )}
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loading
                  ? '処理中...'
                  : needsInitialPin
                    ? 'パスワードを設定してログイン'
                    : 'ログイン'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedStudent('');
                  setPin('');
                  setPinConfirm('');
                  setError('');
                }}
                className="w-full text-sm text-gray-500 hover:text-gray-700 underline"
              >
                名前を選び直す
              </button>
            </form>
          )
        ) : (
          <form onSubmit={handleAdminLogin} className="space-y-4">
            {!settingsReady ? (
              <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
                設定を同期中... しばらくお待ちください
              </p>
            ) : !settings.adminPasswordHash && (
              <p className="text-sm text-amber-600 bg-amber-50 rounded-lg p-3">
                初回ログインです。管理者パスワードを設定してください。
              </p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">管理者パスワード</label>
              <input
                type="password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={adminPass}
                onChange={(e) => setAdminPass(e.target.value)}
                placeholder="パスワードを入力"
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading || !settingsReady}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'ログイン中...' : !settingsReady ? '読み込み中...' : (settings.adminPasswordHash ? 'ログイン' : 'パスワードを設定してログイン')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * ログイン画面の流れる波。SVG 3レイヤーを translateX で -50% 無限スクロール。
 * CSS transform のみなので GPU 合成で回り、レイアウト/ペイント負荷なし。
 * 各レイヤーで速度・不透明度・縦位置を変え、視差で奥行きを出す。
 */
function WaveBackground() {
  // 2周期分のsinカーブ: 0〜2400幅で波を2つ分繋げ、-50%流しで継ぎ目なし
  const wavePath =
    'M0 100 C 150 40, 450 160, 600 100 S 1050 40, 1200 100 S 1650 160, 1800 100 S 2250 40, 2400 100 L 2400 200 L 0 200 Z';
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] overflow-hidden" aria-hidden>
      {/* 一番奥の波 (ゆっくり) */}
      <svg
        className="wave-layer"
        style={{ animationDuration: '22s', opacity: 0.32, bottom: '14%' }}
        viewBox="0 0 2400 200"
        preserveAspectRatio="none"
      >
        <path d={wavePath} fill="#bae6fd" />
      </svg>
      {/* 中間の波 */}
      <svg
        className="wave-layer"
        style={{ animationDuration: '15s', opacity: 0.55, bottom: '6%' }}
        viewBox="0 0 2400 200"
        preserveAspectRatio="none"
      >
        <path d={wavePath} fill="#7dd3fc" />
      </svg>
      {/* 手前の波 (早い) */}
      <svg
        className="wave-layer"
        style={{ animationDuration: '9s', opacity: 0.75, bottom: 0 }}
        viewBox="0 0 2400 200"
        preserveAspectRatio="none"
      >
        <path d={wavePath} fill="#3b82f6" />
      </svg>
    </div>
  );
}
