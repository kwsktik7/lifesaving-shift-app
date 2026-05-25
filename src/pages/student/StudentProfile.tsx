import { useMemo, useState } from 'react';
import { useStudentStore } from '@/store/studentStore';
import { getSession, verifyPin } from '@/utils/auth';
import { Check } from 'lucide-react';

/**
 * 学生のマイページ。現在はパスワード変更のみを提供する。
 * 氏名・学年・PWC・役職などのプロフィールは管理者が一括管理するため、
 * 学生からは編集できない。
 */
export default function StudentProfile() {
  const session = getSession();
  const studentId = session?.studentId ?? '';
  const { students, updateStudentPin } = useStudentStore();

  const me = useMemo(() => students.find((s) => s.id === studentId), [students, studentId]);

  // パスワード変更フォーム
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [pinMsg, setPinMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  if (!me) {
    return (
      <div className="p-4 text-sm text-gray-500">
        学生情報が見つかりませんでした。ログインし直してください。
      </div>
    );
  }

  async function handleChangePin(e: React.FormEvent) {
    e.preventDefault();
    setPinMsg(null);
    if (!me) return;
    if (!verifyPin(currentPin, me.pinHash)) {
      setPinMsg({ kind: 'err', text: '現在のパスワードが違います' });
      return;
    }
    if (!/^\d{4}$/.test(newPin)) {
      setPinMsg({ kind: 'err', text: '新しいパスワードは4桁の数字で入力してください' });
      return;
    }
    if (newPin !== newPinConfirm) {
      setPinMsg({ kind: 'err', text: '確認用パスワードが一致しません' });
      return;
    }
    if (newPin === currentPin) {
      setPinMsg({ kind: 'err', text: '現在と異なるパスワードを入力してください' });
      return;
    }
    setSavingPin(true);
    try {
      await updateStudentPin(me.id, newPin);
      setCurrentPin('');
      setNewPin('');
      setNewPinConfirm('');
      setPinMsg({ kind: 'ok', text: 'パスワードを変更しました' });
      setTimeout(() => setPinMsg(null), 2500);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      setPinMsg({ kind: 'err', text: `変更失敗: ${text}` });
    } finally {
      setSavingPin(false);
    }
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-xl font-bold text-gray-800 mb-1">パスワード変更</h1>
      <p className="text-xs text-gray-500 mb-4">
        ログインに使うパスワードを変更できます。
      </p>

      <form onSubmit={handleChangePin} className="space-y-4 bg-white rounded-xl border border-gray-200 p-5">
        <div>
          <p className="text-xs text-gray-500">アカウント</p>
          <p className="text-sm font-medium text-gray-800 mt-0.5">{me.name}</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">現在のパスワード</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="0000"
            autoComplete="current-password"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">新しいパスワード（4桁）</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="0000"
            autoComplete="new-password"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">確認のためもう一度</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={newPinConfirm}
            onChange={(e) => setNewPinConfirm(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="0000"
            autoComplete="new-password"
          />
        </div>

        {pinMsg && (
          <div
            className={`text-sm px-3 py-2 rounded-lg ${
              pinMsg.kind === 'ok'
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            {pinMsg.kind === 'ok' && <Check size={14} className="inline mr-1" />}
            {pinMsg.text}
          </div>
        )}

        <button
          type="submit"
          disabled={savingPin || !currentPin || !newPin || !newPinConfirm}
          className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {savingPin ? '変更中...' : 'パスワードを変更'}
        </button>

        <p className="text-[11px] text-gray-400 leading-relaxed pt-1">
          氏名・学年・PWC免許・役職などは管理者が管理しています。誤りがある場合は管理者に連絡してください。
        </p>
      </form>
    </div>
  );
}
