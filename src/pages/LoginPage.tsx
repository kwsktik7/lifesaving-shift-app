import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { useStudentStore } from '@/store/studentStore';
import { useSettingsStore } from '@/store/settingsStore';
import { firebaseSignIn, verifyPin, ensureAnonAuth } from '@/utils/auth';
import { sortStudents, GRADE_OPTIONS } from '@/utils/studentSort';
import { db } from '@/lib/firebase';

/** 名前の表記揺れ吸収: 全角/半角スペース除去 */
function normalizeName(s: string): string {
  return s.replace(/[\s\u3000]/g, '');
}

type StudentMode = 'login' | 'signup';

/** 役職リストが未設定の場合のフォールバック */
const DEFAULT_ROLES: { name: string; isLeader: boolean }[] = [
  { name: 'ガード', isLeader: false },
  { name: '監視長', isLeader: true },
  { name: '副監視長', isLeader: true },
];

export default function LoginPage() {
  const [tab, setTab] = useState<'admin' | 'student'>('student');
  const [studentMode, setStudentMode] = useState<StudentMode>('login');
  const [adminPass, setAdminPass] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  // 新規アカウント作成フォーム
  const [signupName, setSignupName] = useState('');
  const [signupGrade, setSignupGrade] = useState('1年');
  const [signupHasPwc, setSignupHasPwc] = useState(false);
  // 役職は初期値なし。本人が選択する。
  const [signupRole, setSignupRole] = useState('');
  const [signupLeaderPass, setSignupLeaderPass] = useState('');
  const [signupMonth, setSignupMonth] = useState('');
  const [signupDay, setSignupDay] = useState('');

  const { students, createAccount } = useStudentStore();
  const { settings, _ready: settingsReady, verifyAdminPassword, setAdminPassword, verifyLeaderPassword } = useSettingsStore();
  const navigate = useNavigate();

  // 役職リストは設定から動的に取得。未設定時はデフォルト
  const roleOptions = (settings.roles && settings.roles.length > 0) ? settings.roles : DEFAULT_ROLES;
  const selectedRoleDef = roleOptions.find((r) => r.name === signupRole);

  const activeStudents = sortStudents(students.filter((s) => s.isActive));

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

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const name = signupName.trim();
    if (!name) { setError('名前を入力してください'); return; }
    if (!signupRole) { setError('役職を選択してください'); return; }
    const m = Number(signupMonth);
    const d = Number(signupDay);
    if (!Number.isInteger(m) || m < 1 || m > 12) { setError('誕生月は1〜12で入力してください'); return; }
    if (!Number.isInteger(d) || d < 1 || d > 31) { setError('誕生日は1〜31で入力してください'); return; }
    const pinStr = String(m).padStart(2, '0') + String(d).padStart(2, '0');

    const isLeader = selectedRoleDef?.isLeader ?? false;

    // 監視長/副監視長などシフト生成に影響する役職はパスワード必須
    if (isLeader) {
      if (!signupLeaderPass) {
        setError('監視長パスワードを入力してください');
        return;
      }
      if (!verifyLeaderPassword(signupLeaderPass)) {
        setError('監視長パスワードが違います');
        return;
      }
    }

    setLoading(true);
    try {
      const uid = await ensureAnonAuth();
      if (!uid) {
        setError('認証の初期化に失敗しました');
        return;
      }
      // 重複チェック: 名前(スペース除去) + 誕生日MMDD
      if (db) {
        const normalized = normalizeName(name);
        const snap = await getDocs(collection(db, 'students'));
        const dup = snap.docs.find((d) => {
          const data = d.data() as { name?: string; birthday?: string };
          return normalizeName(data.name ?? '') === normalized && data.birthday === pinStr;
        });
        if (dup) {
          setError('同じ名前・誕生日のアカウントが既に存在します。ログインしてください。');
          return;
        }
      }
      await createAccount({
        id: uid,
        name,
        nameKana: '',
        pin: pinStr,
        isActive: true,
        joinYear: new Date().getFullYear(),
        grade: signupGrade,
        role: signupRole,
        hasPwc: signupHasPwc,
        isLeader,
        birthday: pinStr,
      });
      await firebaseSignIn({ role: 'student', studentId: uid, studentName: name });
      navigate('/student');
    } catch (err) {
      console.error('[signup] failed', err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`アカウント作成に失敗しました: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleStudentLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const student = students.find((s) => s.id === selectedStudent);
    if (!student) {
      setError('学生を選択してください');
      return;
    }
    if (!verifyPin(pin, student.pinHash)) {
      setError('PINが違います');
      return;
    }
    setLoading(true);
    try {
      await firebaseSignIn({ role: 'student', studentId: student.id, studentName: student.name });
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
          studentMode === 'login' ? (
            <form onSubmit={handleStudentLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">名前を選択</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedStudent}
                  onChange={(e) => setSelectedStudent(e.target.value)}
                >
                  <option value="">-- 選択してください --</option>
                  {activeStudents.map((s) => (
                    <option key={s.id} value={s.id}>{s.grade} {s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PIN（4桁／誕生日 月日）</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="0101"
                />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'ログイン中...' : 'ログイン'}
              </button>
              <button
                type="button"
                onClick={() => { setStudentMode('signup'); setError(''); }}
                className="w-full text-sm text-blue-600 hover:text-blue-800 underline"
              >
                新規アカウント作成
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4">
              <p className="text-xs text-gray-500 bg-blue-50 rounded-lg p-2">
                PINは誕生日の月日(4桁)になります。例: 1月1日 → 0101
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">氏名</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  placeholder="山田 太郎"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">学年</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                  value={signupGrade}
                  onChange={(e) => setSignupGrade(e.target.value)}
                >
                  {GRADE_OPTIONS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PWC免許</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                  value={signupHasPwc ? 'yes' : 'no'}
                  onChange={(e) => setSignupHasPwc(e.target.value === 'yes')}
                >
                  <option value="no">持っていない</option>
                  <option value="yes">持っている</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">役職</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                  value={signupRole}
                  onChange={(e) => { setSignupRole(e.target.value); setSignupLeaderPass(''); setError(''); }}
                >
                  <option value="">-- 選択してください --</option>
                  {roleOptions.map((r) => (
                    <option key={r.name} value={r.name}>
                      {r.name}{r.isLeader ? '（要パスワード）' : ''}
                    </option>
                  ))}
                </select>
              </div>
              {selectedRoleDef?.isLeader && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">監視長パスワード</label>
                  <input
                    type="password"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={signupLeaderPass}
                    onChange={(e) => setSignupLeaderPass(e.target.value)}
                    placeholder="管理者から共有されたパスワード"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    シフト生成に影響する役職のため、確認のためパスワードを入力してください。
                  </p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">誕生日（PINになります）</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={12}
                    placeholder="月"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={signupMonth}
                    onChange={(e) => setSignupMonth(e.target.value)}
                  />
                  <span className="text-gray-500 text-sm">月</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={31}
                    placeholder="日"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={signupDay}
                    onChange={(e) => setSignupDay(e.target.value)}
                  />
                  <span className="text-gray-500 text-sm">日</span>
                </div>
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loading ? '作成中...' : 'アカウントを作成してログイン'}
              </button>
              <button
                type="button"
                onClick={() => { setStudentMode('login'); setError(''); }}
                className="w-full text-sm text-gray-500 hover:text-gray-700 underline"
              >
                ログインに戻る
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
