import { useState, useMemo } from 'react';
import { useStudentStore } from '@/store/studentStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useSeasonStore } from '@/store/seasonStore';
import { useAvailabilityStore } from '@/store/availabilityStore';
import { exportAllData, importAllData } from '@/utils/export';
import { Trash2, Download, Upload, Pencil, Check, X } from 'lucide-react';
import { parseISO, format } from 'date-fns';

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
  const { students, updateStudent, deleteStudent, updateStudentPin } = useStudentStore();
  const { settings, updateSettings, setAdminPassword, verifyAdminPassword, setLeaderPassword } = useSettingsStore();
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
  const [newLeaderPass, setNewLeaderPass] = useState('');

  // 学生の編集中ステート
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editGrade, setEditGrade] = useState('');
  const [editRole, setEditRole] = useState('');

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

  const GRADE_OPTIONS = ['1年', '2年', '3年', '4年'];
  const gradeOrder = (g: string) => {
    const i = GRADE_OPTIONS.indexOf(g);
    return i === -1 ? 99 : i;
  };

  function startEditStudent(id: string, grade: string, role: string) {
    setEditingStudentId(id);
    setEditGrade(grade || '1年');
    setEditRole(role || '');
  }
  function cancelEditStudent() {
    setEditingStudentId(null);
  }
  async function saveEditStudent(id: string) {
    try {
      await updateStudent(id, { grade: editGrade, role: editRole });
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
  const [savingLeaderPw, setSavingLeaderPw] = useState(false);

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

  async function handleSetLeaderPassword() {
    if (!newLeaderPass) return;
    setSavingLeaderPw(true);
    try {
      await setLeaderPassword(newLeaderPass);
      setNewLeaderPass('');
      setSuccessMsg('監視長パスワードを変更しました');
      setTimeout(() => setSuccessMsg(''), 3000);
      setErrorMsg('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(`保存に失敗しました: ${msg}`);
    } finally {
      setSavingLeaderPw(false);
    }
  }

  function handleExport() {
    const json = exportAllData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zushi_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        importAllData(ev.target?.result as string);
      } catch {
        alert('ファイルの読み込みに失敗しました');
      }
    };
    reader.readAsText(file);
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

      {/* Leader password */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-2">監視長パスワード変更</h2>
        <p className="text-xs text-gray-500 mb-3">
          新規アカウント作成で「監視長」「副監視長」を選択する時に要求されるパスワード。
          現在: {settings.leaderPasswordHash
            ? <span className="text-green-700 font-medium">設定済み</span>
            : <span className="text-red-600 font-medium">未設定</span>}
        </p>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex gap-3 flex-wrap">
            <input
              type="password"
              className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={settings.leaderPasswordHash ? '新しい監視長パスワード' : '監視長パスワードを設定'}
              value={newLeaderPass}
              onChange={(e) => setNewLeaderPass(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSetLeaderPassword(); }}
            />
            <button
              onClick={handleSetLeaderPassword}
              disabled={savingLeaderPw || !newLeaderPass}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                !savingLeaderPw && newLeaderPass
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {savingLeaderPw ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </section>

      {/* Student management */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-4">学生管理</h2>
        <p className="text-xs text-gray-500 mb-3">
          学生はログイン画面の「新規アカウント作成」から自身で登録します。
        </p>

        {/* Student list */}
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {students.length === 0 ? (
            <p className="px-4 py-6 text-center text-gray-400 text-sm">学生が登録されていません</p>
          ) : (
            [...students]
              .sort((a, b) => {
                const ga = gradeOrder(a.grade);
                const gb = gradeOrder(b.grade);
                if (ga !== gb) return ga - gb;
                return (a.nameKana || a.name).localeCompare(b.nameKana || b.name, 'ja');
              })
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
                        <div className="flex items-center gap-2 mt-1">
                          <select
                            value={editGrade}
                            onChange={(e) => setEditGrade(e.target.value)}
                            className="border border-gray-300 rounded-md px-2 py-1 text-xs bg-white"
                          >
                            {GRADE_OPTIONS.map((g) => (
                              <option key={g} value={g}>{g}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="役職"
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value)}
                            className="border border-gray-300 rounded-md px-2 py-1 text-xs flex-1 min-w-0"
                          />
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 truncate">
                          {student.nameKana && `${student.nameKana} · `}
                          {student.grade || '学年未設定'}
                          {student.role && ` · ${student.role}`}
                          {student.birthday && ` · PIN: ${student.birthday}`}
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
                          onClick={() => startEditStudent(student.id, student.grade, student.role)}
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

      {/* Data backup */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-4">データ管理</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex gap-3">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            <Download size={16} />
            バックアップ（JSON）
          </button>
          <label className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors cursor-pointer">
            <Upload size={16} />
            データ復元
            <input type="file" accept=".json" className="hidden" onChange={handleImport} />
          </label>
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

