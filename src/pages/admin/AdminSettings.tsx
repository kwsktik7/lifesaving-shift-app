import { useState } from 'react';
import { useStudentStore } from '@/store/studentStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useSeasonStore } from '@/store/seasonStore';
import { exportAllData, importAllData } from '@/utils/export';
import { Trash2, Plus, Download, Upload } from 'lucide-react';

export default function AdminSettings() {
  const { students, addStudent, deactivateStudent, deleteStudent, updateStudentPin } = useStudentStore();
  const { settings, updateSettings, setAdminPassword } = useSettingsStore();
  useSeasonStore();

  const [newName, setNewName] = useState('');
  const [newKana, setNewKana] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newJoinYear, setNewJoinYear] = useState(new Date().getFullYear());
  const [newAdminPass, setNewAdminPass] = useState('');
  const [addError, setAddError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  function handleAddStudent(e: React.FormEvent) {
    e.preventDefault();
    setAddError('');
    if (!newName.trim()) { setAddError('名前を入力してください'); return; }
    if (newPin.length !== 4) { setAddError('PINは4桁で入力してください'); return; }
    addStudent({ name: newName.trim(), nameKana: newKana.trim(), pin: newPin, isActive: true, joinYear: newJoinYear, grade: '', role: '', hasPwc: false, isLeader: false });
    setNewName(''); setNewKana(''); setNewPin('');
    setSuccessMsg('学生を追加しました');
    setTimeout(() => setSuccessMsg(''), 2000);
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

      {/* Admin password */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-4">管理者パスワード変更</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex gap-3">
            <input
              type="password"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="新しいパスワード"
              value={newAdminPass}
              onChange={(e) => setNewAdminPass(e.target.value)}
            />
            <button
              onClick={() => { setAdminPassword(newAdminPass); setNewAdminPass(''); setSuccessMsg('パスワードを変更しました'); setTimeout(() => setSuccessMsg(''), 2000); }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              変更
            </button>
          </div>
        </div>
      </section>

      {/* Student management */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-4">学生管理</h2>

        {/* Add student */}
        <form onSubmit={handleAddStudent} className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-600 mb-3">学生を追加</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input
              type="text"
              placeholder="氏名（例: 山田太郎）"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              type="text"
              placeholder="フリガナ（任意）"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={newKana}
              onChange={(e) => setNewKana(e.target.value)}
            />
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="PIN（4桁）"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
            />
            <input
              type="number"
              placeholder="入学年度"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={newJoinYear}
              onChange={(e) => setNewJoinYear(Number(e.target.value))}
            />
          </div>
          {addError && <p className="text-red-500 text-xs mb-2">{addError}</p>}
          <button
            type="submit"
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            追加
          </button>
        </form>

        {/* Student list */}
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {students.length === 0 ? (
            <p className="px-4 py-6 text-center text-gray-400 text-sm">学生が登録されていません</p>
          ) : (
            students.map((student) => (
              <div key={student.id} className={`flex items-center justify-between px-4 py-3 ${!student.isActive ? 'opacity-50' : ''}`}>
                <div>
                  <p className="text-sm font-medium text-gray-800">{student.name}</p>
                  <p className="text-xs text-gray-400">{student.nameKana} · {student.joinYear}年入学</p>
                </div>
                <div className="flex items-center gap-2">
                  {!student.isActive && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">非アクティブ</span>
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
                  {student.isActive ? (
                    <button
                      onClick={() => deactivateStudent(student.id)}
                      className="text-orange-400 hover:text-orange-600 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : (
                    <button
                      onClick={() => deleteStudent(student.id)}
                      className="text-red-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))
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
    </div>
  );
}

