import { useMemo } from 'react';
import { useShiftStore } from '@/store/shiftStore';
import { useStudentStore } from '@/store/studentStore';
import { useSeasonStore } from '@/store/seasonStore';
import { getSession } from '@/utils/auth';
import ShiftGrid from '@/components/ShiftGrid';

export default function StudentSchedule() {
  const session = getSession();
  const studentId = session?.studentId ?? '';

  const { shifts } = useShiftStore();
  const { students } = useStudentStore();
  const { days } = useSeasonStore();

  const myShifts = useMemo(() =>
    shifts.filter((s) => s.studentId === studentId && (s.status === 'published' || s.status === 'attended' || s.status === 'absent')),
    [shifts, studentId]
  );

  // 自分だけを1行で表示
  const myStudent = useMemo(() => students.filter((s) => s.id === studentId), [students, studentId]);

  const attendedDays = myShifts.filter((s) => s.status !== 'absent').length;
  const absentDays = myShifts.filter((s) => s.status === 'absent').length;

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-gray-800 mb-4">シフト確認</h1>

      {/* Summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-blue-600">{attendedDays}</p>
            <p className="text-xs text-gray-500">出勤日数（確定）</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-red-400">{absentDays}</p>
            <p className="text-xs text-gray-500">欠席日数</p>
          </div>
        </div>
      </div>

      {/* 自分の行 */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4">
        <p className="text-xs text-gray-400 mb-2">
          <span className="inline-block w-4 h-4 rounded-full bg-blue-500 mr-1 align-middle" />出勤確定
          <span className="text-red-400 mx-2">欠</span>欠席
        </p>
        <ShiftGrid
          days={days}
          students={myStudent}
          shifts={myShifts}
          hidePayType
        />
      </div>

      {/* 全体シフト表（誰が何日入るかだけ表示） */}
      <details className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <summary className="px-4 py-3 text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-50">
          全体シフト表を見る
        </summary>
        <div className="p-3 border-t border-gray-100 overflow-x-auto">
          <ShiftGrid
            days={days}
            students={students}
            shifts={shifts.filter((s) => s.status === 'published' || s.status === 'attended' || s.status === 'absent')}
            hidePayType
            compact
          />
        </div>
      </details>
    </div>
  );
}
