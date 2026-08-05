import { useState, useMemo, useRef, useEffect } from 'react';
import { useSeasonStore } from '@/store/seasonStore';
import { useStudentStore } from '@/store/studentStore';
import { useShiftStore } from '@/store/shiftStore';
import { useSettingsStore } from '@/store/settingsStore';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { CheckCircle, Sun, Sunset, UserPlus, Trash2, Download } from 'lucide-react';
import type { AttendanceType } from '@/types';
import { sortStudents } from '@/utils/studentSort';
import { getMonthRanges } from '@/utils/monthRanges';
import { exportAttendanceOnlyXlsx } from '@/utils/export';

/**
 * 勤怠入力ページ (シンプル運用版・スマホ対応)。
 * - シフト発行データとは独立に「その日に出勤した人」だけを記録する。
 * - 欠席/交代は扱わない。書く必要のあるのは「誰が来たか」だけ。
 * - payType は持たない (未確定)。月末に AdminPayAllocation で 1/V が振り分けられる。
 * - モバイル: 日付は横スクロールタブ、出勤者行は縦積みでタップしやすく。
 */
export default function AdminAttendance() {
  const { days } = useSeasonStore();
  const { students } = useStudentStore();
  const { shifts, updateShift, addExtraAttendance, removeShift } = useShiftStore();
  const { settings } = useSettingsStore();

  const openDays = useMemo(
    () => days.filter((d) => d.isOpen).sort((a, b) => a.date.localeCompare(b.date)),
    [days],
  );

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const exists = openDays.find((d) => d.date === today);
    return exists ? today : (openDays[0]?.date ?? '');
  });

  // 追加カード state
  const [adding, setAdding] = useState(false);
  const [addAttendance, setAddAttendance] = useState<AttendanceType>('full');
  // 一括選択用: チェックされた学生IDの集合
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 名簿順で並べた active 学生
  const sortedActiveStudents = useMemo(
    () => sortStudents(students.filter((s) => s.isActive)),
    [students],
  );
  const orderIndex = useMemo(() => {
    const m = new Map<string, number>();
    sortedActiveStudents.forEach((s, i) => m.set(s.id, i));
    return m;
  }, [sortedActiveStudents]);

  // 当日の出勤者: status='attended' のシフトのみ。名簿順でソート。
  const dayAttended = useMemo(() => {
    const list = shifts.filter((s) => s.date === selectedDate && s.status === 'attended');
    return list.sort((a, b) => {
      const ai = orderIndex.get(a.studentId) ?? Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.get(b.studentId) ?? Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
  }, [shifts, selectedDate, orderIndex]);

  const attendedStudentIds = new Set(dayAttended.map((s) => s.studentId));
  const candidates = sortedActiveStudents.filter((s) => !attendedStudentIds.has(s.id));

  // 選択中の日付タブをスクロールしてビュー内に入れる
  const tabsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!tabsRef.current) return;
    const el = tabsRef.current.querySelector<HTMLButtonElement>(`[data-date="${selectedDate}"]`);
    if (el) {
      el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedDate]);

  function toggleSelected(studentId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(candidates.map((c) => c.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleBulkAdd() {
    if (selectedIds.size === 0) return;
    const ordered = candidates.filter((c) => selectedIds.has(c.id));
    for (const s of ordered) {
      addExtraAttendance(s.id, selectedDate, addAttendance);
    }
    setSelectedIds(new Set());
    setAdding(false);
  }

  function handleChangeAttendance(shiftId: string, attendance: AttendanceType) {
    updateShift(shiftId, { attendance });
  }

  function handleRemove(shiftId: string, name: string) {
    if (confirm(`${name} の出勤記録を削除しますか?`)) {
      removeShift(shiftId);
    }
  }

  function handleDateSelect(date: string) {
    setSelectedDate(date);
    setAdding(false);
    setSelectedIds(new Set());
  }

  function handleCloseAdd() {
    setAdding(false);
    setSelectedIds(new Set());
  }

  const halfCount = dayAttended.filter((s) => s.attendance === 'am' || s.attendance === 'pm').length;

  // --- 月次の勤怠表出力 (出勤記録のみ。給与は含まない) ---
  // 出力対象の月は「いま選んでいる日付が属する月」。日付タブを切り替えれば対象月も変わる。
  const months = useMemo(
    () => getMonthRanges(settings.seasonStart, settings.seasonEnd),
    [settings.seasonStart, settings.seasonEnd],
  );
  const currentMonth = useMemo(() => {
    if (months.length === 0) return null;
    if (!selectedDate) return months[0];
    return months.find((m) => selectedDate >= m.startDate && selectedDate <= m.endDate) ?? months[0];
  }, [months, selectedDate]);

  const monthAttendedCount = useMemo(() => {
    if (!currentMonth) return 0;
    return shifts.filter(
      (s) => s.status === 'attended' && s.date >= currentMonth.startDate && s.date <= currentMonth.endDate,
    ).length;
  }, [shifts, currentMonth]);

  function handleExportMonth() {
    if (!currentMonth || monthAttendedCount === 0) return;
    const monthKey = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, '0')}`;
    exportAttendanceOnlyXlsx(students, shifts, days, monthKey, currentMonth.startDate, currentMonth.endDate);
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1 sm:mb-2">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">勤怠入力</h1>
        {currentMonth && (
          <button
            onClick={handleExportMonth}
            disabled={monthAttendedCount === 0}
            title="出勤記録だけの勤怠表をExcelで出力します(給与は含みません)"
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              monthAttendedCount > 0
                ? 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Download size={16} />
            {currentMonth.month + 1}月の勤怠表
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-4 sm:mb-6">
        日付を選んで、その日に出勤した人を追加します。給与配分(1日/V日)は月末に「給与配分」ページで設定します。<br />
        「◯月の勤怠表」は、選んでいる日付の月の<strong>出勤記録だけ</strong>をExcelで出力します(給与なし)。
        給与込みの勤怠表は「給与配分」ページから出力してください。
      </p>

      {/* モバイル: 横スクロール日付タブ */}
      <div className="md:hidden mb-4">
        <div
          ref={tabsRef}
          className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory scroll-px-4"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {openDays.length === 0 ? (
            <p className="text-xs text-gray-400">シーズン日が未設定です</p>
          ) : (
            openDays.map((d) => {
              const count = shifts.filter((s) => s.date === d.date && s.status === 'attended').length;
              const isSelected = selectedDate === d.date;
              const dow = format(parseISO(d.date), 'E', { locale: ja });
              return (
                <button
                  key={d.date}
                  data-date={d.date}
                  onClick={() => handleDateSelect(d.date)}
                  className={`flex-shrink-0 snap-start px-3 py-2 rounded-lg border text-center transition-colors min-w-[68px] ${
                    isSelected
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="text-sm font-bold leading-tight">
                    {format(parseISO(d.date), 'M/d')}
                  </div>
                  <div className={`text-[10px] leading-tight mt-0.5 ${isSelected ? 'text-blue-100' : 'text-gray-500'}`}>
                    {dow}
                  </div>
                  <div className={`text-[10px] leading-tight mt-1 font-bold ${
                    isSelected
                      ? 'text-white'
                      : count > 0
                        ? 'text-green-600'
                        : 'text-gray-400'
                  }`}>
                    {count > 0 ? `${count}名` : '-'}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 md:gap-6">
        {/* PC: 縦サイドバー */}
        <aside className="hidden md:block w-48 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
              開設日
            </div>
            <div className="overflow-y-auto max-h-[600px]">
              {openDays.length === 0 ? (
                <p className="text-xs text-gray-400 p-4">シーズン日が未設定です</p>
              ) : (
                openDays.map((d) => {
                  const count = shifts.filter((s) => s.date === d.date && s.status === 'attended').length;
                  return (
                    <button
                      key={d.date}
                      className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-100 flex items-center justify-between transition-colors ${
                        selectedDate === d.date ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                      onClick={() => handleDateSelect(d.date)}
                    >
                      <span>{format(parseISO(d.date), 'M/d(E)', { locale: ja })}</span>
                      <span className={`text-xs ${count > 0 ? 'text-green-600 font-bold' : 'text-gray-400'}`}>
                        {count > 0 ? `${count}名` : '-'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        {/* 右ペイン */}
        {selectedDate ? (
          <div className="flex-1 space-y-4 min-w-0">
            {/* ヘッダー */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="font-semibold text-gray-800">
                  {format(parseISO(selectedDate), 'M月d日(E)', { locale: ja })} の出勤者
                </h2>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle size={16} className="text-green-600" />
                    <span className="font-bold text-green-700">{dayAttended.length}</span>
                    <span className="text-gray-500">名</span>
                  </div>
                  {halfCount > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Sun size={16} className="text-yellow-500" />
                      <span className="font-bold text-yellow-700">{halfCount}</span>
                      <span className="text-gray-500">半日</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 追加ボタン or 候補リスト */}
            {!adding ? (
              <button
                onClick={() => setAdding(true)}
                className="w-full flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-3.5 rounded-lg text-sm font-bold hover:bg-emerald-100 active:bg-emerald-200 transition-colors"
              >
                <UserPlus size={18} />
                出勤者を追加
              </button>
            ) : (
              <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3 sm:p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-emerald-800">
                    <UserPlus size={16} className="inline mr-1" />
                    出勤した人をまとめて選ぶ
                  </p>
                  <button
                    onClick={handleCloseAdd}
                    className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                  >
                    閉じる
                  </button>
                </div>

                {/* 勤務区分 (一括選択した全員に適用) */}
                <div>
                  <p className="text-[11px] text-gray-500 mb-1.5">勤務区分(選んだ全員に適用)</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['full', 'am', 'pm'] as AttendanceType[]).map((at) => (
                      <button
                        key={at}
                        onClick={() => setAddAttendance(at)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          addAttendance === at
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white border border-gray-200 text-gray-700 hover:bg-emerald-50'
                        }`}
                      >
                        {at === 'full' ? '終日' : at === 'am' ? '午前' : '午後'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 全員選択 / クリア */}
                {candidates.length > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex gap-3">
                      <button
                        onClick={selectAll}
                        className="text-emerald-700 hover:text-emerald-900 font-medium py-1"
                      >
                        全員選択 ({candidates.length})
                      </button>
                      {selectedIds.size > 0 && (
                        <button
                          onClick={clearSelection}
                          className="text-gray-500 hover:text-gray-700 py-1"
                        >
                          クリア
                        </button>
                      )}
                    </div>
                    <span className="text-gray-500">選択中: <b className="text-emerald-700">{selectedIds.size}</b>名</span>
                  </div>
                )}

                {/* 候補リスト */}
                <div className="bg-white rounded-lg border border-emerald-200 divide-y divide-gray-100 max-h-[50vh] overflow-y-auto">
                  {candidates.length === 0 ? (
                    <p className="text-xs text-gray-400 p-3">追加できる学生がいません(全員追加済み)</p>
                  ) : (
                    candidates.map((s) => {
                      const checked = selectedIds.has(s.id);
                      return (
                        <label
                          key={s.id}
                          className={`flex items-center gap-3 px-3 py-3 text-sm cursor-pointer transition-colors ${
                            checked ? 'bg-emerald-50' : 'hover:bg-gray-50 active:bg-gray-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelected(s.id)}
                            className="w-5 h-5 accent-emerald-600 flex-shrink-0"
                          />
                          <span className="text-gray-800 flex-1 min-w-0 truncate">
                            {s.isLeader && <span className="text-red-500 mr-1" style={{ fontSize: '10px' }}>★</span>}
                            {s.hasPwc && <span className="text-blue-500 mr-1" style={{ fontSize: '10px' }}>P</span>}
                            {s.name}
                          </span>
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            {s.grade}{s.role ? `/${s.role}` : ''}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>

                {/* 追加ボタン (スマホでは sticky にしたいが本要素は親内なので普通配置) */}
                <button
                  onClick={handleBulkAdd}
                  disabled={selectedIds.size === 0}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-bold transition-colors ${
                    selectedIds.size > 0
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 shadow-sm'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <UserPlus size={18} />
                  {selectedIds.size > 0
                    ? `${selectedIds.size}名を「${addAttendance === 'full' ? '終日' : addAttendance === 'am' ? '午前のみ' : '午後のみ'}」で追加`
                    : '学生を選択してください'}
                </button>
              </div>
            )}

            {/* 出勤者リスト */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {dayAttended.length === 0 ? (
                <p className="text-sm text-gray-400 p-6 text-center">
                  出勤者がまだ追加されていません。<br className="sm:hidden" />
                  上の「出勤者を追加」から登録してください。
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {dayAttended.map((shift) => {
                    const student = students.find((s) => s.id === shift.studentId);
                    const isHalf = shift.attendance === 'am' || shift.attendance === 'pm';
                    return (
                      <div key={shift.id} className="px-3 sm:px-4 py-3">
                        {/* スマホ: 1行目に名前、2行目に勤務区分ボタン+削除。PC: 1行で完結 */}
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isHalf ? 'bg-yellow-100' : 'bg-green-100'}`}>
                            {isHalf ? (
                              shift.attendance === 'am' ? (
                                <Sun size={16} className="text-yellow-600" />
                              ) : (
                                <Sunset size={16} className="text-yellow-600" />
                              )
                            ) : (
                              <CheckCircle size={16} className="text-green-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-800 truncate">
                              {student?.isLeader && <span className="text-red-500 mr-1" style={{ fontSize: '10px' }}>★</span>}
                              {student?.hasPwc && <span className="text-blue-500 mr-1" style={{ fontSize: '10px' }}>P</span>}
                              {student?.name ?? '(不明な学生)'}
                            </p>
                            <span className="text-xs text-gray-400">
                              {student?.grade}{student?.role ? ` / ${student.role}` : ''}
                            </span>
                          </div>
                          {/* PC のみ右側に勤務区分+削除を並べる */}
                          <div className="hidden sm:flex gap-1 items-center">
                            {(['full', 'am', 'pm'] as AttendanceType[]).map((at) => (
                              <button
                                key={at}
                                onClick={() => handleChangeAttendance(shift.id, at)}
                                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                                  shift.attendance === at
                                    ? at === 'full'
                                      ? 'bg-green-600 text-white'
                                      : 'bg-yellow-500 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                              >
                                {at === 'full' ? '終日' : at === 'am' ? '午前' : '午後'}
                              </button>
                            ))}
                            <button
                              onClick={() => handleRemove(shift.id, student?.name ?? '')}
                              className="ml-1 text-gray-300 hover:text-red-500 transition-colors p-1"
                              title="この出勤を削除"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                        {/* スマホ: 2行目に勤務区分+削除を大きめに */}
                        <div className="sm:hidden flex gap-2 mt-2.5 items-center">
                          {(['full', 'am', 'pm'] as AttendanceType[]).map((at) => (
                            <button
                              key={at}
                              onClick={() => handleChangeAttendance(shift.id, at)}
                              className={`flex-1 px-2 py-2 rounded text-xs font-bold transition-colors ${
                                shift.attendance === at
                                  ? at === 'full'
                                    ? 'bg-green-600 text-white'
                                    : 'bg-yellow-500 text-white'
                                  : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                              }`}
                            >
                              {at === 'full' ? '終日' : at === 'am' ? '午前' : '午後'}
                            </button>
                          ))}
                          <button
                            onClick={() => handleRemove(shift.id, student?.name ?? '')}
                            className="text-gray-400 active:text-red-500 transition-colors p-2 -mr-1"
                            title="この出勤を削除"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm py-12">
            日付を選択してください
          </div>
        )}
      </div>
    </div>
  );
}
