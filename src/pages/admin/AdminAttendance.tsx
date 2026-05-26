import { useState, useMemo } from 'react';
import { useSeasonStore } from '@/store/seasonStore';
import { useStudentStore } from '@/store/studentStore';
import { useShiftStore } from '@/store/shiftStore';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { CheckCircle, Sun, Sunset, UserPlus, Trash2 } from 'lucide-react';
import type { AttendanceType } from '@/types';
import { sortStudents } from '@/utils/studentSort';

/**
 * 勤怠入力ページ (シンプル運用版)。
 * - シフト発行データとは独立に「その日に出勤した人」だけを記録する。
 * - 欠席/交代は扱わない。書く必要のあるのは「誰が来たか」だけ。
 * - payType は暫定で V として保存され、月末に AdminPayAllocation で 1/V を振り分ける。
 */
export default function AdminAttendance() {
  const { days } = useSeasonStore();
  const { students } = useStudentStore();
  const { shifts, updateShift, addExtraAttendance, removeShift } = useShiftStore();

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

  function handleAdd(studentId: string) {
    addExtraAttendance(studentId, selectedDate, addAttendance);
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
  }

  const halfCount = dayAttended.filter((s) => s.attendance === 'am' || s.attendance === 'pm').length;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">勤怠入力</h1>
      <p className="text-xs text-gray-400 mb-6">
        日付を選んで、その日に出勤した人を追加します。給与配分(1日/V日)は月末に「給与配分」ページで一括設定します。
      </p>

      <div className="flex gap-6">
        {/* 日付リスト */}
        <aside className="w-48 flex-shrink-0">
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
          <div className="flex-1 space-y-4">
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
                className="w-full flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-3 rounded-lg text-sm font-medium hover:bg-emerald-100 transition-colors"
              >
                <UserPlus size={18} />
                出勤者を追加
              </button>
            ) : (
              <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-emerald-800">
                    <UserPlus size={16} className="inline mr-1" />
                    出勤した人を選ぶ
                  </p>
                  <button
                    onClick={() => setAdding(false)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    閉じる
                  </button>
                </div>

                {/* 勤務区分 */}
                <div className="flex gap-2 text-xs flex-wrap">
                  <span className="text-gray-500 py-1">勤務:</span>
                  {(['full', 'am', 'pm'] as AttendanceType[]).map((at) => (
                    <button
                      key={at}
                      onClick={() => setAddAttendance(at)}
                      className={`px-3 py-1 rounded-full font-medium transition-colors ${
                        addAttendance === at
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-600 hover:bg-emerald-50'
                      }`}
                    >
                      {at === 'full' ? '終日' : at === 'am' ? '午前のみ' : '午後のみ'}
                    </button>
                  ))}
                </div>

                {/* 候補リスト */}
                <div className="bg-white rounded-lg border border-emerald-200 divide-y divide-gray-100 max-h-72 overflow-y-auto">
                  {candidates.length === 0 ? (
                    <p className="text-xs text-gray-400 p-3">追加できる学生がいません(全員追加済み)</p>
                  ) : (
                    candidates.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleAdd(s.id)}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-emerald-50 transition-colors"
                      >
                        <span className="text-gray-800">
                          {s.isLeader && <span className="text-red-500 mr-1" style={{ fontSize: '10px' }}>★</span>}
                          {s.hasPwc && <span className="text-blue-500 mr-1" style={{ fontSize: '10px' }}>P</span>}
                          {s.name}
                        </span>
                        <span className="text-xs text-gray-400">
                          {s.grade}{s.role ? ` / ${s.role}` : ''}
                        </span>
                      </button>
                    ))
                  )}
                </div>
                <p className="text-[11px] text-gray-500">
                  選んだ人が即座に出勤者リストに追加されます。
                </p>
              </div>
            )}

            {/* 出勤者リスト */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {dayAttended.length === 0 ? (
                <p className="text-sm text-gray-400 p-6 text-center">
                  出勤者がまだ追加されていません。上の「出勤者を追加」から登録してください。
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {dayAttended.map((shift) => {
                    const student = students.find((s) => s.id === shift.studentId);
                    const isHalf = shift.attendance === 'am' || shift.attendance === 'pm';
                    return (
                      <div key={shift.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                        {/* アイコン */}
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${isHalf ? 'bg-yellow-100' : 'bg-green-100'}`}>
                          {isHalf ? (
                            shift.attendance === 'am' ? (
                              <Sun size={15} className="text-yellow-600" />
                            ) : (
                              <Sunset size={15} className="text-yellow-600" />
                            )
                          ) : (
                            <CheckCircle size={15} className="text-green-600" />
                          )}
                        </div>

                        {/* 氏名 */}
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

                        {/* 勤務区分切替 */}
                        <div className="flex gap-1">
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
                        </div>

                        {/* 削除 */}
                        <button
                          onClick={() => handleRemove(shift.id, student?.name ?? '')}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                          title="この出勤を削除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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
