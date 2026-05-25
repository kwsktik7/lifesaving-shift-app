import { useState, useMemo } from 'react';
import { useStudentStore } from '@/store/studentStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useSeasonStore } from '@/store/seasonStore';
import { useAvailabilityStore } from '@/store/availabilityStore';
import { sortStudents, GRADE_OPTIONS } from '@/utils/studentSort';
import { Trash2, Pencil, Check, X } from 'lucide-react';
import { parseISO, format } from 'date-fns';

/**
 * 固定の役職リスト。新規学生作成時の選択肢に使う。
 * 監視長/副監視長のみシフト生成に影響する役職 (isLeader=true)。
 * 名簿に合わせて全クラブ共通の固定リストとして扱う。
 */
const FIXED_ROLES: { name: string; isLeader: boolean }[] = [
  { name: '監視長', isLeader: true },
  { name: '副監視長', isLeader: true },
  { name: 'ガード', isLeader: false },
  { name: '競技', isLeader: false },
  { name: '器材', isLeader: false },
  { name: 'レク', isLeader: false },
  { name: 'ジュニア', isLeader: false },
  { name: 'その他', isLeader: false },
];

/** seasonStart〜seasonEnd に含まれる月のキー "YYYY-MM" を列挙 */
function getSeasonMonthKeys(seasonStart: string, seasonEnd: string): { key: string; label: string }[] {
  if (!seasonStart || !seasonEnd) return [];
  const start = parseISO(seasonStart);
  const end = parseISO(seasonEnd);
  const keys: { key: string; label: string }[] = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    keys.push({
      key: format(cur, 'yyyy-MM'),
      label: `${cur.getFullYear()}年${cur.getMonth() + 1}月`,
    });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return keys;
}

export default function AdminSettings() {
  const { students, addStudent, updateStudent, deleteStudent, updateStudentPin } = useStudentStore();
  const { settings, updateSettings, setAdminPassword, verifyAdminPassword } = useSettingsStore();
  const { availabilities } = useAvailabilityStore();
  useSeasonStore();

  // studentId → 提出件数(availableなもののみ) の集計
  const submitCountByStudent = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of availabilities) {
      m.set(a.studentId, (m.get(a.studentId) ?? 0) + 1);
    }
    return m;
  }, [availabilities]);

  const [newAdminPass, setNewAdminPass] = useState('');

  // 学生追加フォーム
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentGrade, setNewStudentGrade] = useState<string>(GRADE_OPTIONS[0]);
  const [newStudentRole, setNewStudentRole] = useState('');
  const [newStudentHasPwc, setNewStudentHasPwc] = useState(false);
  const [addingStudent, setAddingStudent] = useState(false);

  // 学生の編集中ステート
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editGrade, setEditGrade] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editHasPwc, setEditHasPwc] = useState(false);

  // 削除モーダル用ステート
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deletePw, setDeletePw] = useState('');
  const [deleteErr, setDeleteErr] = useState('');
  const [deleting, setDeleting] = useState(false);

  function openDeleteModal(id: string, name: string) {
    setDeleteTarget({ id, name });
    setDeletePw('');
    setDeleteErr('');
  }
  function closeDeleteModal() {
    setDeleteTarget(null);
    setDeletePw('');
    setDeleteErr('');
    setDeleting(false);
  }
  async function confirmDelete() {
    if (!deleteTarget) return;
    if (!verifyAdminPassword(deletePw)) {
      setDeleteErr('管理者パスワードが違います');
      return;
    }
    setDeleting(true);
    setDeleteErr('');
    try {
      await deleteStudent(deleteTarget.id);
      setSuccessMsg(`「${deleteTarget.name}」を削除しました`);
      setTimeout(() => setSuccessMsg(''), 2000);
      closeDeleteModal();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDeleteErr(`削除に失敗しました: ${msg}`);
      setDeleting(false);
    }
  }

  async function handleAddStudent() {
    const name = newStudentName.trim();
    if (!name) {
      setErrorMsg('氏名を入力してください');
      return;
    }
    // 同名チェック
    if (students.some((s) => s.name === name && s.isActive)) {
      setErrorMsg(`「${name}」は既に登録されています`);
      return;
    }
    setAddingStudent(true);
    try {
      const selectedRole = FIXED_ROLES.find((r) => r.name === newStudentRole);
      await addStudent({
        name,
        nameKana: '',
        // pin は省略 (空) → 学生が初回ログイン時に設定する
        isActive: true,
        joinYear: new Date().getFullYear(),
        grade: newStudentGrade,
        role: newStudentRole,
        hasPwc: newStudentHasPwc,
        isLeader: selectedRole?.isLeader ?? false,
      });
      setNewStudentName('');
      setNewStudentGrade(GRADE_OPTIONS[0]);
      setNewStudentRole('');
      setNewStudentHasPwc(false);
      setErrorMsg('');
      setSuccessMsg(`「${name}」を追加しました。本人が初回ログイン時にPINを設定します。`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(`追加に失敗しました: ${msg}`);
    } finally {
      setAddingStudent(false);
    }
  }

  function startEditStudent(s: { id: string; name: string; grade: string; role: string; hasPwc: boolean }) {
    setEditingStudentId(s.id);
    setEditName(s.name);
    setEditGrade(s.grade || '1年');
    setEditRole(s.role || '');
    setEditHasPwc(s.hasPwc);
  }
  function cancelEditStudent() {
    setEditingStudentId(null);
  }
  async function saveEditStudent(id: string) {
    const name = editName.trim();
    if (!name) {
      setErrorMsg('氏名を入力してください');
      return;
    }
    const isLeader = FIXED_ROLES.find((r) => r.name === editRole)?.isLeader ?? false;
    try {
      await updateStudent(id, {
        name,
        grade: editGrade,
        role: editRole,
        hasPwc: editHasPwc,
        isLeader,
      });
      setEditingStudentId(null);
      setErrorMsg('');
      setSuccessMsg('学生情報を更新しました');
      setTimeout(() => setSuccessMsg(''), 2000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSuccessMsg('');
      setErrorMsg(`更新に失敗しました: ${msg}`);
    }
  }
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const monthKeys = useMemo(
    () => getSeasonMonthKeys(settings.seasonStart, settings.seasonEnd),
    [settings.seasonStart, settings.seasonEnd]
  );

  // 各月の入力下書き (空文字 = 未変更で settings の値を使う)
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({});
  // 直近で保存成功した月キー (✓表示用)
  const [justSavedBudget, setJustSavedBudget] = useState<Set<string>>(new Set());
  // 保存中の月キー
  const [savingBudget, setSavingBudget] = useState<Set<string>>(new Set());

  function budgetDisplay(key: string): string {
    if (key in budgetDrafts) return budgetDrafts[key];
    const v = settings.monthlyBudgets?.[key];
    return v && v > 0 ? String(v) : '';
  }

  function handleBudgetInput(key: string, value: string) {
    setBudgetDrafts((d) => ({ ...d, [key]: value }));
  }

  async function saveBudget(key: string) {
    const draft = budgetDrafts[key];
    const num = !draft ? 0 : Number(draft);
    if (Number.isNaN(num) || num < 0) {
      setErrorMsg(`${key} の金額が不正です`);
      return;
    }
    const latest = useSettingsStore.getState().settings.monthlyBudgets ?? {};
    const nextBudgets = { ...latest, [key]: num };
    setSavingBudget((s) => new Set(s).add(key));
    try {
      await updateSettings({ monthlyBudgets: nextBudgets });
      setBudgetDrafts((d) => { const next = { ...d }; delete next[key]; return next; });
      setJustSavedBudget((s) => new Set(s).add(key));
      setTimeout(() => {
        setJustSavedBudget((s) => { const next = new Set(s); next.delete(key); return next; });
      }, 2500);
      setErrorMsg('');
    } catch (e) {
      console.error('[AdminSettings] saveBudget failed', e);
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(`保存に失敗しました: ${msg}`);
    } finally {
      setSavingBudget((s) => { const next = new Set(s); next.delete(key); return next; });
    }
  }

  // パスワード変更状態
  const [savingAdminPw, setSavingAdminPw] = useState(false);

  async function handleSetAdminPassword() {
    if (!newAdminPass) return;
    setSavingAdminPw(true);
    try {
      await setAdminPassword(newAdminPass);
      setNewAdminPass('');
      setSuccessMsg('管理者パスワードを変更しました');
      setTimeout(() => setSuccessMsg(''), 3000);
      setErrorMsg('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(`保存に失敗しました: ${msg}`);
    } finally {
      setSavingAdminPw(false);
    }
  }

  return (
    <div className="p-6 space-y-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-800">設定</h1>

      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-3 text-sm">
          {errorMsg}
        </div>
      )}

      {/* Club settings */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-4">クラブ設定</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">クラブ名</label>
            <input
              type="text"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={settings.clubName}
              onChange={(e) => updateSettings({ clubName: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">シーズン開始日</label>
              <input
                type="date"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={settings.seasonStart}
                onChange={(e) => updateSettings({ seasonStart: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">シーズン終了日</label>
              <input
                type="date"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={settings.seasonEnd}
                onChange={(e) => updateSettings({ seasonEnd: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">1日の給与（円）</label>
              <input
                type="number"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={settings.fullPayAmount}
                onChange={(e) => updateSettings({ fullPayAmount: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">V日の給与（円）</label>
              <input
                type="number"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={settings.vPayAmount}
                onChange={(e) => updateSettings({ vPayAmount: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Monthly budgets */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-2">月別予算</h2>
        <p className="text-xs text-gray-500 mb-4">
          市役所から提示される月ごとの予算を入力し、各行の「保存」ボタンで確定してください。
        </p>
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          {monthKeys.length === 0 ? (
            <p className="text-sm text-gray-400">シーズン開始日・終了日を先に設定してください。</p>
          ) : (
            monthKeys.map((m) => {
              const displayValue = budgetDisplay(m.key);
              const stored = settings.monthlyBudgets?.[m.key] ?? 0;
              const draft = budgetDrafts[m.key];
              const hasChange = draft !== undefined && Number(draft || 0) !== stored;
              const isSaving = savingBudget.has(m.key);
              const justSaved = justSavedBudget.has(m.key);
              return (
                <div key={m.key} className="flex items-center gap-3 flex-wrap">
                  <label className="text-sm font-medium text-gray-700 w-24">{m.label}</label>
                  <div className="relative flex-1 min-w-[180px]">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">¥</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1000}
                      placeholder="0"
                      className="border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={displayValue}
                      onChange={(e) => handleBudgetInput(m.key, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveBudget(m.key); }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => saveBudget(m.key)}
                    disabled={isSaving || !hasChange}
                    className={`flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      hasChange && !isSaving
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {isSaving ? '保存中...' : '保存'}
                  </button>
                  {justSaved && (
                    <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                      <Check size={14} /> 保存済み
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Admin password */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-2">管理者パスワード変更</h2>
        <p className="text-xs text-gray-500 mb-3">
          現在: {settings.adminPasswordHash
            ? <span className="text-green-700 font-medium">設定済み</span>
            : <span className="text-red-600 font-medium">未設定</span>}
        </p>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex gap-3 flex-wrap">
            <input
              type="password"
              className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="新しいパスワード"
              value={newAdminPass}
              onChange={(e) => setNewAdminPass(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSetAdminPassword(); }}
            />
            <button
              onClick={handleSetAdminPassword}
              disabled={savingAdminPw || !newAdminPass}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                !savingAdminPw && newAdminPass
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {savingAdminPw ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </section>

      {/* Student management */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-4">学生管理</h2>
        <p className="text-xs text-gray-500 mb-3">
          ここで学生を登録します。PINは設定しません — 学生が初回ログイン時に自分で設定します。
        </p>

        {/* Add student form */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="氏名"
              className="col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={newStudentName}
              onChange={(e) => setNewStudentName(e.target.value)}
            />
            <select
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
              value={newStudentGrade}
              onChange={(e) => setNewStudentGrade(e.target.value)}
            >
              {GRADE_OPTIONS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <select
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
              value={newStudentRole}
              onChange={(e) => setNewStudentRole(e.target.value)}
            >
              <option value="">役職（任意）</option>
              {FIXED_ROLES.map((r) => (
                <option key={r.name} value={r.name}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={newStudentHasPwc}
                onChange={(e) => setNewStudentHasPwc(e.target.checked)}
                className="w-4 h-4"
              />
              PWC免許あり
            </label>
            <button
              onClick={handleAddStudent}
              disabled={addingStudent || !newStudentName.trim()}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                !addingStudent && newStudentName.trim()
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {addingStudent ? '追加中...' : '学生を追加'}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 leading-relaxed">
            PINは学生本人が初回ログイン時に設定します。設定後は管理者画面に表示され、PIN変更も可能です。
          </p>
        </div>

        {/* Student list */}
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {students.length === 0 ? (
            <p className="px-4 py-6 text-center text-gray-400 text-sm">学生が登録されていません</p>
          ) : (
            sortStudents(students)
              .map((student) => {
                const isEditing = editingStudentId === student.id;
                const submitted = (submitCountByStudent.get(student.id) ?? 0) > 0;
                return (
                  <div key={student.id} className={`flex items-center justify-between px-4 py-3 gap-3 ${!student.isActive ? 'opacity-50' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-800 truncate">{student.name}</p>
                        {student.hasPwc && (
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">PWC</span>
                        )}
                        {student.isLeader && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">★</span>
                        )}
                        {submitted ? (
                          <span className="text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                            シフト提出済
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            未提出
                          </span>
                        )}
                      </div>
                      {isEditing ? (
                        <div className="mt-2 space-y-2">
                          <input
                            type="text"
                            placeholder="氏名"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                          />
                          <div className="flex items-center gap-2 flex-wrap">
                            <select
                              value={editGrade}
                              onChange={(e) => setEditGrade(e.target.value)}
                              className="border border-gray-300 rounded-md px-2 py-1 text-xs bg-white"
                            >
                              {GRADE_OPTIONS.map((g) => (
                                <option key={g} value={g}>{g}</option>
                              ))}
                            </select>
                            <select
                              value={editRole}
                              onChange={(e) => setEditRole(e.target.value)}
                              className="border border-gray-300 rounded-md px-2 py-1 text-xs bg-white flex-1 min-w-[100px]"
                            >
                              <option value="">役職なし</option>
                              {FIXED_ROLES.map((r) => (
                                <option key={r.name} value={r.name}>{r.name}</option>
                              ))}
                            </select>
                            <label className="flex items-center gap-1 text-xs text-gray-700 cursor-pointer whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={editHasPwc}
                                onChange={(e) => setEditHasPwc(e.target.checked)}
                                className="w-3.5 h-3.5"
                              />
                              PWC
                            </label>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 truncate">
                          {student.nameKana && `${student.nameKana} · `}
                          {student.grade || '学年未設定'}
                          {student.role && ` · ${student.role}`}
                          {student.birthday
                            ? ` · PIN: ${student.birthday}`
                            : ' · PIN: 未設定'}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => saveEditStudent(student.id)}
                            className="text-green-600 hover:text-green-800 transition-colors"
                            title="保存"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={cancelEditStudent}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                            title="キャンセル"
                          >
                            <X size={16} />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => startEditStudent(student)}
                          className="text-gray-400 hover:text-blue-600 transition-colors"
                          title="編集"
                        >
                          <Pencil size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const newPin = prompt('新しいPINを入力（4桁）');
                          if (newPin && newPin.length === 4) updateStudentPin(student.id, newPin);
                        }}
                        className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1"
                      >
                        PIN変更
                      </button>
                      <button
                        onClick={() => openDeleteModal(student.id, student.name)}
                        className="text-red-400 hover:text-red-600 transition-colors"
                        title="削除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </section>

      {/* 学生削除モーダル */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-800 mb-2">学生を削除</h3>
            <p className="text-sm text-gray-600 mb-4">
              「<span className="font-bold">{deleteTarget.name}</span>」を完全に削除します。<br />
              この操作は取り消せません。管理者パスワードを入力してください。
            </p>
            <input
              type="password"
              autoFocus
              placeholder="管理者パスワード"
              value={deletePw}
              onChange={(e) => { setDeletePw(e.target.value); setDeleteErr(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmDelete(); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-2"
            />
            {deleteErr && <p className="text-red-500 text-xs mb-2">{deleteErr}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={closeDeleteModal}
                disabled={deleting}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting || !deletePw}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

