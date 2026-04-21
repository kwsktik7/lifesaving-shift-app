import { useState } from 'react';
import { useSeasonStore } from '@/store/seasonStore';
import { useStudentStore } from '@/store/studentStore';
import { useShiftStore } from '@/store/shiftStore';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { CheckCircle, XCircle, Users, Save, ArrowRightLeft, Sun, Sunset, Circle, Pencil } from 'lucide-react';
import type { ShiftStatus, AttendanceType } from '@/types';

export default function AdminAttendance() {
  const { days } = useSeasonStore();
  const { students } = useStudentStore();
  const { shifts, updateShift, addReplacementShift } = useShiftStore();

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const dayExists = days.find((d) => d.date === today && d.isOpen);
    return dayExists ? today : (days.filter((d) => d.isOpen)[0]?.date ?? '');
  });

  // 交代モーダル用
  const [replacingShiftId, setReplacingShiftId] = useState<string | null>(null);
  const [replacementAttendance, setReplacementAttendance] = useState<AttendanceType>('full');

  // 編集モード（明示的に変更ボタンを押したとき）
  const [editingDate, setEditingDate] = useState<string | null>(null);

  const publishedDays = days.filter((d) => d.isOpen && shifts.some(
    (s) => s.date === d.date && (s.status === 'published' || s.status === 'attended' || s.status === 'absent')
  ));

  const dayShifts = shifts.filter(
    (s) => s.date === selectedDate && s.status !== 'cancelled' && s.status !== 'draft'
  );

  const attendedCount = dayShifts.filter((s) => s.status === 'attended').length;
  const absentCount = dayShifts.filter((s) => s.status === 'absent').length;
  const pendingCount = dayShifts.filter((s) => s.status === 'published').length;
  const allDone = pendingCount === 0 && dayShifts.length > 0;

  // 全員入力済み = 保存済みとみなす（データから導出するので画面遷移しても維持）
  // ただし明示的に変更ボタンを押した日は編集モード
  const isViewMode = allDone && editingDate !== selectedDate;

  const activeStudents = students.filter((s) => s.isActive);

  function markAttended(shiftId: string, attendance: AttendanceType = 'full') {
    updateShift(shiftId, { status: 'attended' as ShiftStatus, attendance });
  }

  function markAbsent(shiftId: string) {
    updateShift(shiftId, { status: 'absent' as ShiftStatus });
  }

  function markAllAttended() {
    for (const shift of dayShifts) {
      if (shift.status === 'published') {
        updateShift(shift.id, { status: 'attended' as ShiftStatus, attendance: 'full' as AttendanceType });
      }
    }
  }

  function handleSave() {
    // allDoneになった時点で自動的にisViewMode=trueになる
    // editingDateをクリアして閲覧モードに戻す
    setEditingDate(null);
  }

  function handleEdit() {
    setEditingDate(selectedDate);
  }

  function handleDateSelect(date: string) {
    setSelectedDate(date);
    setReplacingShiftId(null);
    setEditingDate(null); // 日付切替時はeditingをリセット
  }

  function handleReplacement(replacementStudentId: string) {
    if (!replacingShiftId) return;
    addReplacementShift(replacingShiftId, replacementStudentId, replacementAttendance);
    setReplacingShiftId(null);
  }

  // 交代候補: この日のシフトに入っていない学生
  const assignedStudentIds = new Set(dayShifts.map((s) => s.studentId));
  const replacementCandidates = activeStudents.filter((s) => !assignedStudentIds.has(s.id));

  const replacingShift = replacingShiftId ? dayShifts.find((s) => s.id === replacingShiftId) : null;
  const replacingStudent = replacingShift ? students.find((s) => s.id === replacingShift.studentId) : null;

  // 交代ペアを作成（元の欠席者 → 交代者）
  const replacementPairs = dayShifts
    .filter((s) => s.status === 'absent' && s.replacedBy)
    .map((absentShift) => {
      const replacementShift = dayShifts.find((s) => s.replacesId === absentShift.id);
      return {
        absentShift,
        absentStudent: students.find((s) => s.id === absentShift.studentId),
        replacementShift,
        replacementStudent: replacementShift ? students.find((s) => s.id === replacementShift.studentId) : null,
      };
    })
    .filter((p) => p.replacementStudent);

  // 通常シフト（交代で入った人を除く）
  const normalShifts = dayShifts.filter((s) => !s.replacesId);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">勤怠入力</h1>
      <p className="text-xs text-gray-400 mb-6">各日の出勤/欠席を記録します。交代や半日勤務にも対応。</p>

      <div className="flex gap-6">
        {/* Date list */}
        <aside className="w-48 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
              公開済みの日
            </div>
            <div className="overflow-y-auto max-h-[600px]">
              {publishedDays.length === 0 ? (
                <p className="text-xs text-gray-400 p-4">シフト公開後に入力できます</p>
              ) : (
                publishedDays.map((d) => {
                  const dayTotal = shifts.filter((s) => s.date === d.date && s.status !== 'cancelled' && s.status !== 'draft').length;
                  const dayAttended = shifts.filter((s) => s.date === d.date && s.status === 'attended').length;
                  const dayAbsent = shifts.filter((s) => s.date === d.date && s.status === 'absent').length;
                  const dayDone = dayAttended + dayAbsent === dayTotal && dayTotal > 0;
                  const dayPending = dayTotal - dayAttended - dayAbsent;
                  return (
                    <button
                      key={d.date}
                      className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-100 flex items-center justify-between transition-colors ${
                        selectedDate === d.date ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                      onClick={() => handleDateSelect(d.date)}
                    >
                      <span>{format(parseISO(d.date), 'M/d(E)', { locale: ja })}</span>
                      {dayDone ? (
                        <span className="text-xs text-green-600 font-bold">✓ 保存済</span>
                      ) : (
                        <span className="text-xs text-gray-400">{dayPending}件未入力</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        {/* Attendance panel */}
        {selectedDate && dayShifts.length > 0 ? (
          <div className="flex-1 space-y-4">
            {/* Summary bar */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-800">
                  {format(parseISO(selectedDate), 'M月d日(E)', { locale: ja })} の勤怠
                </h2>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle size={16} className="text-green-600" />
                    <span className="font-bold text-green-700">{attendedCount}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <XCircle size={16} className="text-red-500" />
                    <span className="font-bold text-red-600">{absentCount}</span>
                  </div>
                  {pendingCount > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Circle size={16} className="text-amber-400" />
                      <span className="font-bold text-amber-600">{pendingCount}</span>
                    </div>
                  )}
                </div>
              </div>
              {/* Progress bar */}
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden flex">
                  {attendedCount > 0 && (
                    <div className="bg-green-500 h-full" style={{ width: `${(attendedCount / dayShifts.length) * 100}%` }} />
                  )}
                  {absentCount > 0 && (
                    <div className="bg-red-400 h-full" style={{ width: `${(absentCount / dayShifts.length) * 100}%` }} />
                  )}
                </div>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {attendedCount + absentCount} / {dayShifts.length}名
                </span>
              </div>
            </div>

            {/* Action bar: Save / Edit */}
            <div className="flex items-center gap-2">
              {!isViewMode && pendingCount > 0 && (
                <button
                  onClick={markAllAttended}
                  className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  <Users size={16} />
                  未入力を全員出勤にする
                </button>
              )}
              <div className="flex-1" />
              {isViewMode ? (
                <button
                  onClick={handleEdit}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Pencil size={16} />
                  変更する
                </button>
              ) : (
                <button
                  onClick={handleSave}
                  className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-colors ${
                    allDone
                      ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  }`}
                >
                  <Save size={16} />
                  {allDone ? 'この日の勤怠を保存' : '入力途中で保存'}
                </button>
              )}
            </div>

            {/* ===== VIEW MODE: 保存済み読み取り専用 ===== */}
            {isViewMode ? (
              <div className="space-y-4">
                {/* 通常出勤者リスト */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="divide-y divide-gray-100">
                    {normalShifts.filter((s) => s.status === 'attended').map((shift) => {
                      const student = students.find((s) => s.id === shift.studentId);
                      const isHalf = shift.attendance === 'am' || shift.attendance === 'pm';
                      return (
                        <div key={shift.id} className="px-4 py-3 flex items-center gap-3">
                          {isHalf ? (
                            <div className="w-7 h-7 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                              {shift.attendance === 'am' ? <Sun size={15} className="text-yellow-600" /> : <Sunset size={15} className="text-yellow-600" />}
                            </div>
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                              <CheckCircle size={15} className="text-green-600" />
                            </div>
                          )}
                          <div className="flex-1">
                            <p className="font-medium text-gray-800">
                              {student?.isLeader && <span className="text-red-500 mr-1" style={{ fontSize: '10px' }}>★</span>}
                              {student?.hasPwc && <span className="text-blue-500 mr-1" style={{ fontSize: '10px' }}>P</span>}
                              {student?.name}
                            </p>
                            <span className="text-xs text-gray-400">{student?.grade}{student?.role ? ` / ${student.role}` : ''}</span>
                          </div>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                            isHalf ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                          }`}>
                            {isHalf ? (shift.attendance === 'am' ? '午前のみ' : '午後のみ') : '出勤'}
                          </span>
                        </div>
                      );
                    })}
                    {/* 欠席者（交代なし） */}
                    {normalShifts.filter((s) => s.status === 'absent' && !s.replacedBy).map((shift) => {
                      const student = students.find((s) => s.id === shift.studentId);
                      return (
                        <div key={shift.id} className="px-4 py-3 flex items-center gap-3 bg-red-50/50">
                          <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                            <XCircle size={15} className="text-red-500" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-gray-800">
                              {student?.isLeader && <span className="text-red-500 mr-1" style={{ fontSize: '10px' }}>★</span>}
                              {student?.hasPwc && <span className="text-blue-500 mr-1" style={{ fontSize: '10px' }}>P</span>}
                              {student?.name}
                            </p>
                            <span className="text-xs text-gray-400">{student?.grade}{student?.role ? ` / ${student.role}` : ''}</span>
                          </div>
                          <span className="text-xs font-bold px-2 py-1 rounded-full bg-red-100 text-red-600">欠席</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 交代セクション */}
                {replacementPairs.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-blue-800 flex items-center gap-2">
                      <ArrowRightLeft size={16} />
                      交代 ({replacementPairs.length}件)
                    </h3>
                    {replacementPairs.map((pair) => {
                      const repIsHalf = pair.replacementShift && (pair.replacementShift.attendance === 'am' || pair.replacementShift.attendance === 'pm');
                      return (
                        <div key={pair.absentShift.id} className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                          <div className="flex items-center gap-3">
                            {/* 欠席者 */}
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                                <XCircle size={15} className="text-red-500" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-gray-800 truncate">
                                  {pair.absentStudent?.isLeader && <span className="text-red-500 mr-1" style={{ fontSize: '10px' }}>★</span>}
                                  {pair.absentStudent?.hasPwc && <span className="text-blue-500 mr-1" style={{ fontSize: '10px' }}>P</span>}
                                  {pair.absentStudent?.name}
                                </p>
                                <span className="text-xs text-gray-400">{pair.absentStudent?.grade}{pair.absentStudent?.role ? ` / ${pair.absentStudent.role}` : ''}</span>
                                <span className="ml-2 text-xs text-red-500 font-medium">欠席</span>
                              </div>
                            </div>

                            {/* 矢印 */}
                            <div className="flex flex-col items-center flex-shrink-0 px-2">
                              <ArrowRightLeft size={20} className="text-blue-500" />
                              <span className="text-[10px] text-blue-500 font-bold mt-0.5">交代</span>
                            </div>

                            {/* 交代者 */}
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${repIsHalf ? 'bg-yellow-100' : 'bg-green-100'}`}>
                                {repIsHalf ? (
                                  pair.replacementShift?.attendance === 'am' ? <Sun size={15} className="text-yellow-600" /> : <Sunset size={15} className="text-yellow-600" />
                                ) : (
                                  <CheckCircle size={15} className="text-green-600" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-gray-800 truncate">
                                  {pair.replacementStudent?.isLeader && <span className="text-red-500 mr-1" style={{ fontSize: '10px' }}>★</span>}
                                  {pair.replacementStudent?.hasPwc && <span className="text-blue-500 mr-1" style={{ fontSize: '10px' }}>P</span>}
                                  {pair.replacementStudent?.name}
                                </p>
                                <span className="text-xs text-gray-400">{pair.replacementStudent?.grade}{pair.replacementStudent?.role ? ` / ${pair.replacementStudent.role}` : ''}</span>
                                <span className={`ml-2 text-xs font-medium ${repIsHalf ? 'text-yellow-600' : 'text-green-600'}`}>
                                  {repIsHalf ? (pair.replacementShift?.attendance === 'am' ? '午前のみ' : '午後のみ') : '終日出勤'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Summary footer (view mode) */}
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-green-700 mb-2">
                    <CheckCircle size={16} />
                    保存済み
                  </div>
                  <div className="flex items-center gap-4 flex-wrap text-sm">
                    <span className="text-gray-700">出勤 <b className="text-green-700">{attendedCount}</b>名</span>
                    <span className="text-gray-700">欠席 <b className="text-red-600">{absentCount}</b>名</span>
                    {dayShifts.some((s) => s.status === 'attended' && (s.attendance === 'am' || s.attendance === 'pm')) && (
                      <span className="text-gray-700">半日 <b className="text-yellow-600">{dayShifts.filter((s) => s.status === 'attended' && (s.attendance === 'am' || s.attendance === 'pm')).length}</b>名</span>
                    )}
                    {replacementPairs.length > 0 && (
                      <span className="text-gray-700">交代 <b className="text-blue-600">{replacementPairs.length}</b>件</span>
                    )}
                  </div>
                  <p className="text-xs text-green-600 mt-2">「給与配分」ページで1/V配分に反映されます。</p>
                </div>
              </div>
            ) : (
              /* ===== EDIT MODE: 編集モード ===== */
              <>
                {/* Student list */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="divide-y divide-gray-100">
                    {dayShifts.map((shift) => {
                      const student = students.find((s) => s.id === shift.studentId);
                      const isAttended = shift.status === 'attended';
                      const isAbsent = shift.status === 'absent';
                      const isPending = shift.status === 'published';
                      const isHalf = isAttended && (shift.attendance === 'am' || shift.attendance === 'pm');
                      const isReplacement = !!shift.replacesId;

                      // 交代された元の人の名前
                      const originalShift = shift.replacesId ? shifts.find((s) => s.id === shift.replacesId) : null;
                      const originalStudent = originalShift ? students.find((s) => s.id === originalShift.studentId) : null;

                      // この人の代わりに入った人
                      const replacedByStudent = shift.replacedBy ? students.find((s) => s.id === shift.replacedBy) : null;

                      return (
                        <div key={shift.id} className={`px-4 py-3.5 ${isPending ? 'bg-amber-50/50' : isReplacement ? 'bg-blue-50/30' : ''}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {/* Status icon */}
                              {isAttended ? (
                                isHalf ? (
                                  <div className="w-7 h-7 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                                    {shift.attendance === 'am' ? <Sun size={15} className="text-yellow-600" /> : <Sunset size={15} className="text-yellow-600" />}
                                  </div>
                                ) : (
                                  <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                                    <CheckCircle size={15} className="text-green-600" />
                                  </div>
                                )
                              ) : isAbsent ? (
                                <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                                  <XCircle size={15} className="text-red-500" />
                                </div>
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                                  <Circle size={15} className="text-gray-400" />
                                </div>
                              )}
                              <div>
                                <p className="font-medium text-gray-800">
                                  {student?.isLeader && <span className="text-red-500 mr-1" style={{ fontSize: '10px' }}>★</span>}
                                  {student?.hasPwc && <span className="text-blue-500 mr-1" style={{ fontSize: '10px' }}>P</span>}
                                  {student?.name ?? '不明'}
                                  {isHalf && (
                                    <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-bold">
                                      {shift.attendance === 'am' ? '午前のみ' : '午後のみ'}
                                    </span>
                                  )}
                                  {isReplacement && originalStudent && (
                                    <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                                      ← {originalStudent.name}の代わり
                                    </span>
                                  )}
                                </p>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-400">{student?.grade}{student?.role ? ` / ${student.role}` : ''}</span>
                                  {isAttended && !isHalf && <span className="text-xs text-green-600 font-medium">出勤（終日）</span>}
                                  {isHalf && <span className="text-xs text-yellow-600 font-medium">{shift.attendance === 'am' ? '午前のみ（半額）' : '午後のみ（半額）'}</span>}
                                  {isAbsent && !replacedByStudent && <span className="text-xs text-red-500 font-medium">欠席</span>}
                                  {isAbsent && replacedByStudent && <span className="text-xs text-red-500 font-medium">欠席 → {replacedByStudent.name}が交代</span>}
                                  {isPending && <span className="text-xs text-amber-500 font-medium">未入力</span>}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-1.5">
                              {/* 出勤（終日） */}
                              <button
                                onClick={() => markAttended(shift.id, 'full')}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                  isAttended && shift.attendance === 'full'
                                    ? 'bg-green-600 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-green-50 hover:text-green-600'
                                }`}
                              >
                                <CheckCircle size={14} />
                                出勤
                              </button>
                              {/* 午前のみ */}
                              <button
                                onClick={() => markAttended(shift.id, 'am')}
                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                  isAttended && shift.attendance === 'am'
                                    ? 'bg-yellow-500 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-yellow-50 hover:text-yellow-600'
                                }`}
                                title="午前のみ（半額）"
                              >
                                <Sun size={14} />
                                午前
                              </button>
                              {/* 午後のみ */}
                              <button
                                onClick={() => markAttended(shift.id, 'pm')}
                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                  isAttended && shift.attendance === 'pm'
                                    ? 'bg-yellow-500 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-yellow-50 hover:text-yellow-600'
                                }`}
                                title="午後のみ（半額）"
                              >
                                <Sunset size={14} />
                                午後
                              </button>
                              {/* 欠席 */}
                              <button
                                onClick={() => markAbsent(shift.id)}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                  isAbsent
                                    ? 'bg-red-600 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600'
                                }`}
                              >
                                <XCircle size={14} />
                                欠席
                              </button>
                              {/* 交代ボタン（欠席時のみ表示） */}
                              {isAbsent && !shift.replacedBy && (
                                <button
                                  onClick={() => { setReplacingShiftId(shift.id); setReplacementAttendance('full'); }}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                                  title="交代者を選ぶ"
                                >
                                  <ArrowRightLeft size={14} />
                                  交代
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Replacement modal */}
                {replacingShiftId && replacingStudent && (
                  <div className="bg-blue-50 border border-blue-300 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-blue-800">
                        <ArrowRightLeft size={16} className="inline mr-1" />
                        {replacingStudent.name}の交代者を選択
                      </p>
                      <button
                        onClick={() => setReplacingShiftId(null)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        キャンセル
                      </button>
                    </div>

                    {/* Attendance type for replacement */}
                    <div className="flex gap-2 text-xs">
                      <span className="text-gray-500 py-1">交代者の勤務:</span>
                      {(['full', 'am', 'pm'] as AttendanceType[]).map((at) => (
                        <button
                          key={at}
                          onClick={() => setReplacementAttendance(at)}
                          className={`px-3 py-1 rounded-full font-medium transition-colors ${
                            replacementAttendance === at
                              ? 'bg-blue-600 text-white'
                              : 'bg-white border border-gray-200 text-gray-600 hover:bg-blue-50'
                          }`}
                        >
                          {at === 'full' ? '終日' : at === 'am' ? '午前のみ' : '午後のみ'}
                        </button>
                      ))}
                    </div>

                    {/* Candidate list */}
                    <div className="bg-white rounded-lg border border-blue-200 divide-y divide-gray-100 max-h-48 overflow-y-auto">
                      {replacementCandidates.length === 0 ? (
                        <p className="text-xs text-gray-400 p-3">交代可能な学生がいません</p>
                      ) : (
                        replacementCandidates.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => handleReplacement(s.id)}
                            className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                          >
                            <span className="text-gray-800">
                              {s.isLeader && <span className="text-red-500 mr-1" style={{ fontSize: '10px' }}>★</span>}
                              {s.hasPwc && <span className="text-blue-500 mr-1" style={{ fontSize: '10px' }}>P</span>}
                              {s.name}
                            </span>
                            <span className="text-xs text-gray-400">{s.grade}{s.role ? ` / ${s.role}` : ''}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Summary footer (edit mode) */}
                {!replacingShiftId && (
                  <div className={`rounded-xl p-4 text-sm ${allDone ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="text-gray-700">出勤 <b className="text-green-700">{attendedCount}</b>名</span>
                      <span className="text-gray-700">欠席 <b className="text-red-600">{absentCount}</b>名</span>
                      {pendingCount > 0 && (
                        <span className="text-gray-700">未入力 <b className="text-amber-600">{pendingCount}</b>名</span>
                      )}
                      {dayShifts.some((s) => s.status === 'attended' && (s.attendance === 'am' || s.attendance === 'pm')) && (
                        <span className="text-gray-700">半日 <b className="text-yellow-600">{dayShifts.filter((s) => s.status === 'attended' && (s.attendance === 'am' || s.attendance === 'pm')).length}</b>名</span>
                      )}
                      {replacementPairs.length > 0 && (
                        <span className="text-gray-700">交代 <b className="text-blue-600">{replacementPairs.length}</b>件</span>
                      )}
                    </div>
                    {allDone && (
                      <p className="text-xs text-green-600 mt-2">全員分の入力が完了しています。保存ボタンを押してください。</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ) : selectedDate ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            この日はシフトが公開されていません
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            日付を選択してください
          </div>
        )}
      </div>
    </div>
  );
}
