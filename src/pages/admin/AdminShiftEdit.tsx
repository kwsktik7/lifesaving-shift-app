import { useState, useMemo } from 'react';
import { useSeasonStore } from '@/store/seasonStore';
import { useStudentStore } from '@/store/studentStore';
import { useAvailabilityStore } from '@/store/availabilityStore';
import { useShiftStore } from '@/store/shiftStore';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Check, X, Plus } from 'lucide-react';
import type { Student, ShiftAssignment } from '@/types';
import ShiftGrid from '@/components/ShiftGrid';

export default function AdminShiftEdit() {
  const { days, updateDay } = useSeasonStore();
  const { students } = useStudentStore();
  const { availabilities } = useAvailabilityStore();
  const { shifts, assignShift, removeShift, publishDay, getShiftsForDate } = useShiftStore();

  const openDays = days.filter((d) => d.isOpen);
  const [selectedDate, setSelectedDate] = useState<string>(openDays[0]?.date ?? '');

  const activeStudents = students.filter((s) => s.isActive);

  const dayData = useMemo(() => {
    if (!selectedDate) return null;
    return days.find((d) => d.date === selectedDate) ?? null;
  }, [days, selectedDate]);

  const dayAvailMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const a of availabilities.filter((a) => a.date === selectedDate)) {
      m.set(a.studentId, a.available);
    }
    return m;
  }, [availabilities, selectedDate]);

  const dayShifts = useMemo(() => getShiftsForDate(selectedDate), [shifts, selectedDate]);

  const availableStudents = activeStudents.filter((s) => dayAvailMap.get(s.id) === true);

  function handlePublish() {
    publishDay(selectedDate);
  }

  function handleAddStudent(studentId: string) {
    assignShift(studentId, selectedDate, 'V'); // payType は後で月次配分で決まる
  }

  const draftCount = dayShifts.filter((s) => s.status === 'draft').length;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">シフト作成</h1>

      {/* ── カレンダーグリッド（クリックで日付選択） ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs text-gray-400 mb-3">
          日付列をクリックして編集 ／
          <span className="inline-flex w-4 h-4 rounded-full bg-blue-500 text-white items-center justify-center font-bold mx-1 align-middle" style={{ fontSize: '9px' }}>出</span>シフト確定
          <span className="text-green-400 mx-1">○</span>出勤可（未割当）
          <span className="ml-2 text-gray-400">※ 1/Vの配分は「給与配分」ページで月単位で行います</span>
        </p>
        <ShiftGrid
          days={days}
          students={students}
          shifts={shifts}
          availabilities={availabilities}
          selectedDate={selectedDate}
          onDateClick={setSelectedDate}
          compact
          hidePayType
        />
      </div>

      {/* ── 選択日の編集パネル ── */}
      {dayData ? (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-gray-800 border-b border-gray-200 pb-2">
            {format(parseISO(selectedDate), 'M月d日(E)', { locale: ja })} の編集
          </h2>

          {/* Day settings */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 mb-1">現在のシフト人数</p>
            <p className="text-2xl font-bold text-gray-800">{dayShifts.length}<span className="text-sm text-gray-400 ml-1">名</span></p>
          </div>

          {/* Actions */}
          {draftCount > 0 && (
            <button
              onClick={handlePublish}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              <Check size={16} />
              確定・公開 ({draftCount}件)
            </button>
          )}

          {/* Available students table - split by role */}
          {(() => {
            const leaders = availableStudents.filter((s) => s.isLeader);
            const pwcHolders = availableStudents.filter((s) => s.hasPwc && !s.isLeader);
            const others = availableStudents.filter((s) => !s.isLeader && !s.hasPwc);
            const hasLeaderOnShift = dayShifts.some((ds) => {
              const st = activeStudents.find((s) => s.id === ds.studentId);
              return st?.isLeader;
            });
            const pwcOnShift = dayShifts.filter((ds) => {
              const st = activeStudents.find((s) => s.id === ds.studentId);
              return st?.hasPwc;
            }).length;

            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">
                    出勤可能な学生 ({availableStudents.length}名)
                  </span>
                  <div className="flex gap-3 text-xs">
                    <span className={`px-2 py-1 rounded-full font-medium ${hasLeaderOnShift ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {hasLeaderOnShift ? '✓' : '!'} 監視長/副監視長
                    </span>
                    <span className={`px-2 py-1 rounded-full font-medium ${pwcOnShift >= 2 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      PWC: {pwcOnShift}名
                    </span>
                    <span className="text-gray-400">シフト: {dayShifts.length}名</span>
                  </div>
                </div>

                {leaders.length > 0 && (
                  <StudentSection
                    title="監視長・副監視長" titleColor="text-red-700" bgColor="bg-red-50" borderColor="border-red-200"
                    students={leaders} dayShifts={dayShifts}
                    onAdd={handleAddStudent} onRemove={removeShift}
                  />
                )}
                {pwcHolders.length > 0 && (
                  <StudentSection
                    title="PWC免許保持者" titleColor="text-blue-700" bgColor="bg-blue-50" borderColor="border-blue-200"
                    students={pwcHolders} dayShifts={dayShifts}
                    onAdd={handleAddStudent} onRemove={removeShift}
                  />
                )}
                <StudentSection
                  title="その他" titleColor="text-gray-700" bgColor="bg-gray-50" borderColor="border-gray-200"
                  students={others} dayShifts={dayShifts}
                  onAdd={handleAddStudent} onRemove={removeShift}
                />

                {availableStudents.length === 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 px-4 py-8 text-center text-gray-400 text-sm">
                    この日に○を提出した学生がいません
                  </div>
                )}
              </div>
            );
          })()}

          {/* Note */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">メモ</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="この日のメモ..."
              value={dayData.note}
              onChange={(e) => updateDay(selectedDate, { note: e.target.value })}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center text-gray-400 py-12">
          グリッドの日付列をクリックして編集してください
        </div>
      )}
    </div>
  );
}

function StudentSection({
  title, titleColor, bgColor, borderColor, students, dayShifts, onAdd, onRemove,
}: {
  title: string;
  titleColor: string;
  bgColor: string;
  borderColor: string;
  students: Student[];
  dayShifts: ShiftAssignment[];
  onAdd: (studentId: string) => void;
  onRemove: (shiftId: string) => void;
}) {
  if (students.length === 0) return null;
  return (
    <div className={`rounded-xl border ${borderColor} overflow-hidden`}>
      <div className={`px-4 py-2 ${bgColor} border-b ${borderColor}`}>
        <span className={`text-xs font-bold ${titleColor}`}>{title} ({students.length}名)</span>
      </div>
      <table className="w-full text-sm bg-white">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">氏名</th>
            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 w-16">学年</th>
            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 w-20">状態</th>
            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 w-16">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {students.map((student) => {
            const shift = dayShifts.find((s) => s.studentId === student.id);
            return (
              <tr key={student.id} className={`hover:bg-gray-50 ${shift ? 'bg-blue-50/30' : ''}`}>
                <td className="px-4 py-3 font-medium text-gray-800">
                  {student.name}
                  {student.role && <span className="ml-2 text-xs text-gray-400">{student.role}</span>}
                </td>
                <td className="px-4 py-3 text-center text-xs text-gray-500">{student.grade}</td>
                <td className="px-4 py-3 text-center">
                  {shift ? (
                    <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
                      出勤
                    </span>
                  ) : (
                    <span className="text-gray-300 text-xs">未割当</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {shift ? (
                    <button
                      onClick={() => onRemove(shift.id)}
                      className="text-red-400 hover:text-red-600 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  ) : (
                    <button
                      onClick={() => onAdd(student.id)}
                      className="text-blue-500 hover:text-blue-700 transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
