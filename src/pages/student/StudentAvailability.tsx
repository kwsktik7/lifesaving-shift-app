import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSeasonStore } from '@/store/seasonStore';
import { useAvailabilityStore } from '@/store/availabilityStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useStudentStore } from '@/store/studentStore';
import { getSession } from '@/utils/auth';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Check, Pencil, CheckSquare, Square, ChevronDown, Lock, User, ChevronRight } from 'lucide-react';
import type { AvailabilityStatus } from '@/types';

const STATUS_OPTIONS: { value: AvailabilityStatus | 'clear'; label: string; color: string }[] = [
  { value: 'yes', label: '○ 終日可', color: 'text-green-600' },
  { value: 'am', label: '午前のみ', color: 'text-yellow-600' },
  { value: 'pm', label: '午後のみ', color: 'text-orange-500' },
  { value: 'undecided', label: '? 未定', color: 'text-purple-500' },
  { value: 'no', label: '× 不可', color: 'text-red-500' },
  { value: 'clear', label: '− クリア', color: 'text-gray-400' },
];

const STATUS_LABEL: Record<AvailabilityStatus, string> = {
  yes: '○', am: '午前', pm: '午後', undecided: '?', no: '×',
};

export default function StudentAvailability() {
  const session = getSession();
  const studentId = session?.studentId ?? '';

  const { days } = useSeasonStore();
  const { availabilities, setBulk } = useAvailabilityStore();
  const { settings } = useSettingsStore();
  const { students } = useStudentStore();
  const me = students.find((s) => s.id === studentId);

  const locked = !!settings.availabilityLocked;
  const openDays = days.filter((d) => d.isOpen);

  const hasSubmitted = availabilities.some((a) => a.studentId === studentId);
  // ロック中は常に閲覧モード
  const [editing, setEditing] = useState(!hasSubmitted && !locked);

  // localAvail: date → { status, note }
  const [localAvail, setLocalAvail] = useState<Map<string, { status: AvailabilityStatus; note: string }>>(() => {
    const m = new Map<string, { status: AvailabilityStatus; note: string }>();
    for (const a of availabilities.filter((a) => a.studentId === studentId)) {
      const status = a.status ?? (a.available ? 'yes' : 'no');
      m.set(a.date, { status, note: a.note ?? '' });
    }
    return m;
  });

  // 複数選択モード
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [showBatchDropdown, setShowBatchDropdown] = useState(false);

  // 未定メモ一括入力モーダル
  const [pendingUndecidedNote, setPendingUndecidedNote] = useState<string | null>(null);
  const [batchNote, setBatchNote] = useState('');

  // メモ入力中の日付（個別）
  const [editingNoteDate, setEditingNoteDate] = useState<string | null>(null);

  const toggleSelect = useCallback((date: string) => {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }, []);

  const selectAllInMonth = useCallback((monthDates: string[]) => {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      const allSelected = monthDates.every((d) => next.has(d));
      if (allSelected) {
        monthDates.forEach((d) => next.delete(d));
      } else {
        monthDates.forEach((d) => next.add(d));
      }
      return next;
    });
  }, []);

  // ドロップダウン選択で即適用
  const applyStatus = useCallback((status: AvailabilityStatus | 'clear', note = '') => {
    if (selectedDates.size === 0) return;
    setLocalAvail((prev) => {
      const next = new Map(prev);
      for (const date of selectedDates) {
        if (status === 'clear') {
          next.delete(date);
        } else {
          const existing = next.get(date);
          next.set(date, {
            status,
            note: status === 'undecided' ? note : (existing?.note ?? ''),
          });
        }
      }
      return next;
    });
    setSelectedDates(new Set());
  }, [selectedDates]);

  const handleDropdownSelect = useCallback((value: AvailabilityStatus | 'clear') => {
    setShowBatchDropdown(false);
    if (selectedDates.size === 0) return;
    if (value === 'undecided') {
      // 未定はメモ入力モーダルを出す
      setPendingUndecidedNote('');
      setBatchNote('');
    } else {
      applyStatus(value);
    }
  }, [selectedDates, applyStatus]);

  const confirmUndecidedWithNote = useCallback(() => {
    applyStatus('undecided', batchNote);
    setPendingUndecidedNote(null);
    setBatchNote('');
  }, [applyStatus, batchNote]);

  const setNote = useCallback((date: string, note: string) => {
    setLocalAvail((prev) => {
      const next = new Map(prev);
      const current = next.get(date);
      if (current) {
        next.set(date, { ...current, note });
      }
      return next;
    });
  }, []);

  const [saveError, setSaveError] = useState('');
  function handleSave() {
    if (locked) return;
    // 未定(undecided)で理由メモが空のものがあれば保存拒否
    const undecidedWithoutNote: string[] = [];
    for (const [date, val] of localAvail.entries()) {
      if (val.status === 'undecided' && !val.note.trim()) {
        undecidedWithoutNote.push(date);
      }
    }
    if (undecidedWithoutNote.length > 0) {
      const sorted = undecidedWithoutNote.sort();
      const preview = sorted.slice(0, 5).map((d) => format(parseISO(d), 'M/d', { locale: ja })).join(', ');
      const more = sorted.length > 5 ? ` 他${sorted.length - 5}件` : '';
      setSaveError(`未定の日は必ず理由と確定予定時期を記入してください。未記入: ${preview}${more}`);
      return;
    }
    setSaveError('');
    const entries = openDays
      .filter((d) => localAvail.has(d.date))
      .map((d) => {
        const val = localAvail.get(d.date)!;
        return { date: d.date, status: val.status, note: val.note };
      });
    setBulk(studentId, entries);
    setEditing(false);
  }

  // Group by month
  const months = useMemo(() => {
    const m = new Map<string, typeof openDays>();
    for (const d of openDays) {
      const month = d.date.slice(0, 7);
      if (!m.has(month)) m.set(month, []);
      m.get(month)!.push(d);
    }
    return Array.from(m.entries());
  }, [openDays]);

  const submittedCount = localAvail.size;
  const availableCount = [...localAvail.values()].filter((v) => v.status === 'yes' || v.status === 'am' || v.status === 'pm').length;
  const unavailableCount = [...localAvail.values()].filter((v) => v.status === 'no').length;
  const undecidedCount = [...localAvail.values()].filter((v) => v.status === 'undecided').length;

  function cellStyle(status: AvailabilityStatus | undefined) {
    switch (status) {
      case 'yes': return 'bg-green-100 border-green-500';
      case 'am': return 'bg-yellow-50 border-yellow-400';
      case 'pm': return 'bg-orange-50 border-orange-400';
      case 'undecided': return 'bg-purple-50 border-purple-300';
      case 'no': return 'bg-red-50 border-red-400';
      default: return 'bg-gray-50 border-gray-200';
    }
  }

  function cellTextColor(status: AvailabilityStatus | undefined) {
    switch (status) {
      case 'yes': return 'text-green-600';
      case 'am': return 'text-yellow-600';
      case 'pm': return 'text-orange-500';
      case 'undecided': return 'text-purple-500';
      case 'no': return 'text-red-500';
      default: return 'text-gray-300';
    }
  }

  function renderCell(date: string, status: AvailabilityStatus | undefined, dow: number, isEditing: boolean) {
    const isSelected = selectedDates.has(date);
    // 日=0 赤, 土=6 青, 平日 グレー
    const dateColor = dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-600' : 'text-gray-700';

    const inner = (
      <>
        <span className={`text-xs font-medium ${dateColor}`}>
          {format(parseISO(date), 'd')}
        </span>
        <span className={`font-bold leading-none ${cellTextColor(status)}`} style={{ fontSize: status === 'am' || status === 'pm' ? '9px' : '13px' }}>
          {status ? STATUS_LABEL[status] : ''}
        </span>
      </>
    );

    if (isEditing) {
      return (
        <div key={date} className="flex flex-col items-center gap-0.5">
          <button
            onClick={() => toggleSelect(date)}
            className={`w-full aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 border-2 transition-all active:scale-95 relative ${
              isSelected
                ? 'border-blue-500 ring-2 ring-blue-200'
                : cellStyle(status)
            }`}
          >
            {inner}
            {isSelected && (
              <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                <Check size={10} className="text-white" />
              </div>
            )}
          </button>
          {/* 未定の場合メモ入力リンク */}
          {status === 'undecided' && !isSelected && (
            <button
              onClick={() => setEditingNoteDate(date)}
              className="text-[9px] text-purple-500 hover:text-purple-700 leading-tight"
            >
              {localAvail.get(date)?.note ? 'メモ有' : '+メモ'}
            </button>
          )}
        </div>
      );
    }

    return (
      <div
        key={date}
        className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 border-2 ${cellStyle(status)}`}
      >
        {inner}
        {status === 'undecided' && localAvail.get(date)?.note && (
          <span className="text-[8px] text-purple-400 leading-tight truncate max-w-full px-0.5">メモ有</span>
        )}
      </div>
    );
  }

  // 確認画面（閲覧モード）: ロック中も必ずここに来る
  if (!editing || locked) {
    return (
      <div className="p-4">
        {me && <MyProfileCard student={me} />}
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-800">可否提出</h1>
        </div>

        {locked && (
          <div className="bg-red-50 border border-red-300 rounded-xl p-4 mb-3 flex items-center gap-3">
            <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
              <Lock size={16} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-red-800">シフト提出は締め切られました</p>
              <p className="text-xs text-red-600">変更したい場合は管理者に連絡してください。</p>
            </div>
          </div>
        )}

        {hasSubmitted && (
          <div className="bg-green-50 border border-green-300 rounded-xl p-4 mb-5 flex items-center gap-3">
            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
              <Check size={18} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-green-800">提出済みです</p>
              <p className="text-xs text-green-600">
                ○ {availableCount}日 / × {unavailableCount}日{undecidedCount > 0 ? ` / 未定 ${undecidedCount}日` : ''} / 全{submittedCount}日入力済み
              </p>
            </div>
          </div>
        )}

        {!locked && (
          <div className="mb-5">
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <Pencil size={16} />
              変更する
            </button>
          </div>
        )}

        <Legend />

        <div className="space-y-6">
          {months.map(([month, monthDays]) => (
            <div key={month}>
              <h2 className="text-sm font-semibold text-gray-600 mb-3">
                {format(parseISO(month + '-01'), 'yyyy年M月', { locale: ja })}
              </h2>
              <div className="grid grid-cols-7 gap-1.5">
                {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
                  <div key={d} className={`text-center text-xs py-1 font-medium ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-400'}`}>{d}</div>
                ))}
                {(() => {
                  const firstDay = parseISO(monthDays[0].date);
                  return Array.from({ length: firstDay.getDay() }).map((_, i) => <div key={`s-${i}`} />);
                })()}
                {monthDays.map((day) => {
                  const val = localAvail.get(day.date);
                  const dow = parseISO(day.date).getDay();
                  return renderCell(day.date, val?.status, dow, false);
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 編集画面
  return (
    <div className="p-4 pb-48">
      {me && <MyProfileCard student={me} />}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">可否提出</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            入力済み: {submittedCount}日 / ○: {availableCount}日
            {undecidedCount > 0 && <span className="text-purple-500"> / 未定: {undecidedCount}日</span>}
          </p>
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-3">日付をタップして選択 → 下のバーでまとめて入力</p>

      <Legend />

      {/* Calendar by month */}
      <div className="space-y-6">
        {months.map(([month, monthDays]) => {
          const monthDateList = monthDays.map((d) => d.date);
          const allSelected = monthDateList.every((d) => selectedDates.has(d));
          return (
            <div key={month}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-600">
                  {format(parseISO(month + '-01'), 'yyyy年M月', { locale: ja })}
                </h2>
                <button
                  onClick={() => selectAllInMonth(monthDateList)}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
                    allSelected
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {allSelected ? <CheckSquare size={12} /> : <Square size={12} />}
                  全選択
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
                  <div key={d} className={`text-center text-xs py-1 font-medium ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-400'}`}>{d}</div>
                ))}
                {(() => {
                  const firstDay = parseISO(monthDays[0].date);
                  return Array.from({ length: firstDay.getDay() }).map((_, i) => <div key={`s-${i}`} />);
                })()}
                {monthDays.map((day) => {
                  const val = localAvail.get(day.date);
                  const dow = parseISO(day.date).getDay();
                  return renderCell(day.date, val?.status, dow, true);
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* メモ入力モーダル（個別） */}
      {editingNoteDate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center sm:items-center" onClick={() => setEditingNoteDate(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800">
              {format(parseISO(editingNoteDate), 'M月d日(E)', { locale: ja })} のメモ
            </h3>
            <p className="text-xs text-gray-500">
              未定の理由と、<b>いつ頃確定しそうか</b>を必ず記入してください。
            </p>
            <textarea
              autoFocus
              className="w-full border border-purple-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"
              rows={3}
              placeholder="例: 部活の試合次第。7/10までに確定予定"
              value={localAvail.get(editingNoteDate)?.note ?? ''}
              onChange={(e) => setNote(editingNoteDate, e.target.value)}
            />
            <button
              onClick={() => setEditingNoteDate(null)}
              disabled={!(localAvail.get(editingNoteDate)?.note?.trim())}
              className="w-full py-2 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* 未定メモ入力モーダル（一括用） */}
      {pendingUndecidedNote !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center sm:items-center" onClick={() => setPendingUndecidedNote(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800">
              未定メモ（{selectedDates.size}日分）
            </h3>
            <p className="text-xs text-gray-500">
              未定の理由と、<b>いつ頃確定しそうか</b>を必ず記入してください。<br />
              <span className="text-gray-400">（例: "部活の試合日程が7/10に確定予定"、"バイトシフトが月末に確定"）</span>
            </p>
            <textarea
              autoFocus
              className="w-full border border-purple-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"
              rows={3}
              placeholder="例: テスト期間のため。7/20までに確定予定"
              value={batchNote}
              onChange={(e) => setBatchNote(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={confirmUndecidedWithNote}
                disabled={!batchNote.trim()}
                className="flex-1 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                未定にする
              </button>
              <button
                onClick={() => setPendingUndecidedNote(null)}
                className="px-4 py-2.5 border border-gray-200 text-gray-500 rounded-lg text-sm hover:bg-gray-50"
              >
                やめる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 保存エラー表示 */}
      {saveError && (
        <div className="fixed bottom-20 left-4 right-4 bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-3 text-sm shadow-lg z-50">
          {saveError}
        </div>
      )}

      {/* 下部固定バー */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40">
        {/* 選択中 → ドロップダウン表示 / 未選択 → 保存ボタンのみ */}
        {selectedDates.size > 0 ? (
          <>
            <div className="px-4 pt-3 pb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-blue-600">
                {selectedDates.size}日 選択中
              </p>
              <button
                onClick={() => setSelectedDates(new Set())}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                選択解除
              </button>
            </div>

            {/* ステータス選択（選ぶと即適用） */}
            <div className="px-4 pb-3">
              <div className="relative">
                <button
                  onClick={() => setShowBatchDropdown(!showBatchDropdown)}
                  className="w-full flex items-center justify-between px-4 py-3 border border-gray-300 rounded-xl bg-white text-sm font-medium"
                >
                  <span className="text-gray-500">ステータスを選択して適用</span>
                  <ChevronDown size={16} className="text-gray-400" />
                </button>
                {showBatchDropdown && (
                  <div className="absolute bottom-full mb-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-50">
                    {STATUS_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => handleDropdownSelect(opt.value)}
                        className={`w-full text-left px-4 py-3 text-sm font-medium hover:bg-gray-50 ${opt.color} border-b border-gray-100 last:border-0`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="px-4 py-3 flex gap-2">
            <button
              onClick={handleSave}
              className="flex-1 py-3 rounded-xl text-base font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              保存する
            </button>
            {hasSubmitted && (
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-3 rounded-xl text-sm text-gray-500 hover:bg-gray-100 transition-colors border border-gray-200"
              >
                キャンセル
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 自分のプロフィール情報を一目で確認 & 編集画面へのリンク */
function MyProfileCard({ student }: { student: { name: string; grade: string; role: string; hasPwc: boolean } }) {
  return (
    <Link
      to="/student/profile"
      className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-4 hover:bg-blue-100 transition-colors"
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
          <User size={16} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-800 truncate">{student.name}</p>
          <p className="text-[11px] text-gray-500 truncate">
            {student.grade} / {student.role || 'ガード'} / PWC: {student.hasPwc ? 'あり' : 'なし'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 text-xs text-blue-600 font-medium flex-shrink-0">
        マイページ
        <ChevronRight size={14} />
      </div>
    </Link>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-2 mb-4 text-xs text-gray-600">
      <span className="flex items-center gap-1">
        <span className="w-6 h-6 rounded bg-green-100 border-2 border-green-500 flex items-center justify-center text-green-600 font-bold text-xs">○</span>
        終日可
      </span>
      <span className="flex items-center gap-1">
        <span className="w-6 h-6 rounded bg-yellow-50 border-2 border-yellow-400 flex items-center justify-center text-yellow-600 font-bold" style={{ fontSize: '8px' }}>午前</span>
        午前のみ
      </span>
      <span className="flex items-center gap-1">
        <span className="w-6 h-6 rounded bg-orange-50 border-2 border-orange-400 flex items-center justify-center text-orange-500 font-bold" style={{ fontSize: '8px' }}>午後</span>
        午後のみ
      </span>
      <span className="flex items-center gap-1">
        <span className="w-6 h-6 rounded bg-purple-50 border-2 border-purple-300 flex items-center justify-center text-purple-500 font-bold text-xs">?</span>
        未定
      </span>
      <span className="flex items-center gap-1">
        <span className="w-6 h-6 rounded bg-red-50 border-2 border-red-400 flex items-center justify-center text-red-500 font-bold text-xs">×</span>
        不可
      </span>
    </div>
  );
}
