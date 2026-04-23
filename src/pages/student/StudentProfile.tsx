import { useMemo, useState } from 'react';
import { useStudentStore } from '@/store/studentStore';
import { useSettingsStore } from '@/store/settingsStore';
import { getSession } from '@/utils/auth';
import { GRADE_OPTIONS } from '@/utils/studentSort';
import { Check } from 'lucide-react';

/**
 * 学生用プロフィール編集ページ。
 * サインアップ時の入力ミス(PWC忘れた/学年間違えた/役職違う等)を学生が自分で直せるようにする。
 * 名前は identity なので変更不可。役職で isLeader=true を選ぶ場合は監視長パスワード必須。
 */
export default function StudentProfile() {
  const session = getSession();
  const studentId = session?.studentId ?? '';
  const { students, updateStudent } = useStudentStore();
  const { settings, verifyLeaderPassword } = useSettingsStore();

  const me = useMemo(() => students.find((s) => s.id === studentId), [students, studentId]);

  const roleOptions = settings.roles && settings.roles.length > 0
    ? settings.roles
    : [
        { name: 'ガード', isLeader: false },
        { name: '監視長', isLeader: true },
        { name: '副監視長', isLeader: true },
      ];

  const [grade, setGrade] = useState(me?.grade ?? '1年');
  const [hasPwc, setHasPwc] = useState(me?.hasPwc ?? false);
  const [role, setRole] = useState(me?.role ?? '');
  const [leaderPass, setLeaderPass] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // 初回レンダリング後に me が入ってくるケースに備えて同期
  if (me && grade === '1年' && me.grade && me.grade !== grade && !saving) {
    // ちらつくのを避けるため初回だけ採用。以降はユーザー操作が優先される。
  }

  const selectedRoleDef = roleOptions.find((r) => r.name === role);
  const needsPassword = selectedRoleDef?.isLeader === true && (me?.role !== role);

  if (!me) {
    return (
      <div className="p-4 text-sm text-gray-500">
        学生情報が見つかりませんでした。ログインし直してください。
      </div>
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!role) {
      setMsg({ kind: 'err', text: '役職を選択してください' });
      return;
    }
    const isLeaderRole = selectedRoleDef?.isLeader === true;
    if (needsPassword) {
      if (!leaderPass) {
        setMsg({ kind: 'err', text: '監視長パスワードを入力してください' });
        return;
      }
      if (!verifyLeaderPassword(leaderPass)) {
        setMsg({ kind: 'err', text: '監視長パスワードが違います' });
        return;
      }
    }
    setSaving(true);
    try {
      await updateStudent(me!.id, {
        grade,
        hasPwc,
        role,
        isLeader: isLeaderRole,
      });
      setLeaderPass('');
      setMsg({ kind: 'ok', text: '保存しました' });
      setTimeout(() => setMsg(null), 2500);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      setMsg({ kind: 'err', text: `保存失敗: ${text}` });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-xl font-bold text-gray-800 mb-1">プロフィール編集</h1>
      <p className="text-xs text-gray-500 mb-4">
        アカウント作成時のミス(PWCチェック忘れ等)はここで修正できます。
      </p>

      <form onSubmit={handleSave} className="space-y-4 bg-white rounded-xl border border-gray-200 p-5">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">氏名</label>
          <p className="text-sm font-medium text-gray-800">{me.name}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">氏名は変更できません。誤りがある場合は管理者に連絡してください。</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">学年</label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
          >
            {GRADE_OPTIONS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">PWC免許</label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            value={hasPwc ? 'yes' : 'no'}
            onChange={(e) => setHasPwc(e.target.value === 'yes')}
          >
            <option value="no">持っていない</option>
            <option value="yes">持っている</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">役職</label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            value={role}
            onChange={(e) => { setRole(e.target.value); setLeaderPass(''); setMsg(null); }}
          >
            <option value="">-- 選択してください --</option>
            {roleOptions.map((r) => (
              <option key={r.name} value={r.name}>
                {r.name}{r.isLeader ? '（要パスワード）' : ''}
              </option>
            ))}
          </select>
        </div>

        {needsPassword && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">監視長パスワード</label>
            <input
              type="password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={leaderPass}
              onChange={(e) => setLeaderPass(e.target.value)}
              placeholder="監視長/副監視長に切り替えるには必要"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              シフト生成に影響する役職のため、確認のためパスワードが必要です。
            </p>
          </div>
        )}

        {msg && (
          <div
            className={`text-sm px-3 py-2 rounded-lg ${
              msg.kind === 'ok'
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            {msg.kind === 'ok' && <Check size={14} className="inline mr-1" />}
            {msg.text}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving ? '保存中...' : '変更を保存'}
        </button>
      </form>
    </div>
  );
}
