import { useState, useMemo } from 'react';
import { useSeasonStore } from '@/store/seasonStore';
import { useStudentStore } from '@/store/studentStore';
import { useShiftStore } from '@/store/shiftStore';
import { useSettingsStore } from '@/store/settingsStore';
import { format, parseISO } from 'date-fns';
import { Check, Undo2, Download } from 'lucide-react';
import { exportAttendanceReport } from '@/utils/export';

/** 月の範囲を取得 */
function getMonthRanges(seasonStart: string, seasonEnd: string) {
  const start = parseISO(seasonStart);
  const end = parseISO(seasonEnd);
  const months: { label: string; year: number; month: number; startDate: string; endDate: string }[] = [];

  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const monthStart = new Date(y, m, 1);
    const monthEnd = new Date(y, m + 1, 0);
    const effectiveStart = monthStart < start ? seasonStart : format(monthStart, 'yyyy-MM-dd');
    const effectiveEnd = monthEnd > end ? seasonEnd : format(monthEnd, 'yyyy-MM-dd');
    months.push({
      label: `${y}年${m + 1}月`,
      year: y,
      month: m,
      startDate: effectiveStart,
      endDate: effectiveEnd,
    });
    cur = new Date(y, m + 1, 1);
  }
  return months;
}

/** 鶴亀算: 予算と延べ人日から1枠・V枠を計算 */
function tsurukame(budget: number, totalPersonDays: number, fullPay: number, vPay: number, minimizeSurplus = false) {
  if (totalPersonDays === 0) return { fullSlots: 0, vSlots: 0, surplus: 0 };
  const diff = fullPay - vPay;
  let fullSlots = Math.max(0, Math.min(totalPersonDays, Math.floor((budget - totalPersonDays * vPay) / diff)));
  // 最終月など余剰を最小化したい場合、1枠を1つ増やして余剰が0以上ならそちらを採用
  if (minimizeSurplus && fullSlots < totalPersonDays) {
    const candidateFull = fullSlots + 1;
    const candidatePay = candidateFull * fullPay + (totalPersonDays - candidateFull) * vPay;
    if (candidatePay <= budget) {
      fullSlots = candidateFull;
    }
  }
  const vSlots = totalPersonDays - fullSlots;
  const actualPay = fullSlots * fullPay + vSlots * vPay;
  return { fullSlots, vSlots, surplus: budget - actualPay };
}

/** 最大剰余法で1日数を各学生に配分 */
function distributeFullDays(
  studentDays: { studentId: string; days: number }[],
  totalFullSlots: number
): Map<string, number> {
  const total = studentDays.reduce((acc, s) => acc + s.days, 0);
  if (total === 0) return new Map();

  const ratio = totalFullSlots / total;
  const result: { studentId: string; base: number; remainder: number }[] = studentDays.map((s) => {
    const exact = s.days * ratio;
    const base = Math.floor(exact);
    return { studentId: s.studentId, base, remainder: exact - base };
  });

  let remaining = totalFullSlots - result.reduce((acc, r) => acc + r.base, 0);
  const sorted = [...result].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < remaining && i < sorted.length; i++) {
    sorted[i].base++;
  }

  const map = new Map<string, number>();
  for (const r of result) {
    map.set(r.studentId, r.base);
  }
  return map;
}

export default function AdminPayAllocation() {
  const { days } = useSeasonStore();
  const { students } = useStudentStore();
  const { shifts, updateShiftPayType } = useShiftStore();
  const { settings } = useSettingsStore();

  const months = useMemo(
    () => getMonthRanges(settings.seasonStart, settings.seasonEnd),
    [settings.seasonStart, settings.seasonEnd]
  );
  const [selectedMonth, setSelectedMonth] = useState(0);
  const month = months[selectedMonth];

  const activeStudents = students.filter((s) => s.isActive);

  function handleExport() {
    if (!month) return;
    exportAttendanceReport(activeStudents, shifts, settings, days, month.label, month.startDate, month.endDate);
  }

  /** 半日を0.5で数えた延べ人日を計算 */
  function calcEffectiveDays(shiftList: typeof shifts) {
    return shiftList.reduce((acc, s) => acc + ((s.attendance === 'am' || s.attendance === 'pm') ? 0.5 : 1), 0);
  }

  // 全月の余剰を計算（繰越用）
  const allMonthSurplus = useMemo(() => {
    const surplusMap = new Map<number, number>(); // monthIndex -> surplus
    for (let i = 0; i < months.length; i++) {
      const m = months[i];
      const mDays = days.filter((d) => d.isOpen && d.date >= m.startDate && d.date <= m.endDate);
      const baseBudget = mDays.reduce((acc, d) => acc + d.cityMinimum * settings.fullPayAmount, 0);
      const carryover = i > 0 ? (surplusMap.get(i - 1) ?? 0) : 0;
      const totalBudget = baseBudget + carryover;

      const attended = shifts.filter(
        (s) => s.date >= m.startDate && s.date <= m.endDate && s.status === 'attended'
      );
      const personDays = calcEffectiveDays(attended);
      const isLastMonth = i === months.length - 1;
      const calc = tsurukame(totalBudget, personDays, settings.fullPayAmount, settings.vPayAmount, isLastMonth);
      surplusMap.set(i, calc.surplus);
    }
    return surplusMap;
  }, [months, days, shifts, settings]);

  const monthData = useMemo(() => {
    if (!month) return null;

    const monthDays = days.filter((d) => d.isOpen && d.date >= month.startDate && d.date <= month.endDate);
    const baseBudget = monthDays.reduce((acc, d) => acc + d.cityMinimum * settings.fullPayAmount, 0);
    const carryover = selectedMonth > 0 ? (allMonthSurplus.get(selectedMonth - 1) ?? 0) : 0;
    const budget = baseBudget + carryover;

    // 出勤確定シフトのみ
    const attendedShifts = shifts.filter(
      (s) => s.date >= month.startDate && s.date <= month.endDate && s.status === 'attended'
    );
    const totalPersonDays = calcEffectiveDays(attendedShifts);

    // 勤怠未入力シフト
    const pendingShifts = shifts.filter(
      (s) => s.date >= month.startDate && s.date <= month.endDate && s.status === 'published'
    ).length;

    // 半日勤務を考慮した延べ人日（0.5換算）
    const effectivePersonDays = calcEffectiveDays(attendedShifts);
    const isLastMonth = selectedMonth === months.length - 1;
    const calc = tsurukame(budget, effectivePersonDays, settings.fullPayAmount, settings.vPayAmount, isLastMonth);

    // 学生ごとの出勤日数（半日は0.5）
    const studentDaysMap = new Map<string, number>();
    for (const s of attendedShifts) {
      const val = (s.attendance === 'am' || s.attendance === 'pm') ? 0.5 : 1;
      studentDaysMap.set(s.studentId, (studentDaysMap.get(s.studentId) ?? 0) + val);
    }

    const studentDays = activeStudents
      .filter((s) => studentDaysMap.has(s.id))
      .map((s) => ({ studentId: s.id, days: studentDaysMap.get(s.id) ?? 0 }));

    const fullDaysMap = distributeFullDays(studentDays, calc.fullSlots);

    const studentAllocations = studentDays.map((sd) => {
      const student = activeStudents.find((s) => s.id === sd.studentId)!;
      const fullDays = fullDaysMap.get(sd.studentId) ?? 0;
      const vDays = sd.days - fullDays;
      const pay = fullDays * settings.fullPayAmount + vDays * settings.vPayAmount;
      const ratio = sd.days > 0 ? fullDays / sd.days : 0;
      return { student, totalDays: sd.days, fullDays, vDays, pay, ratio };
    }).sort((a, b) => b.totalDays - a.totalDays);

    const hasAllocation = attendedShifts.some((s) => s.payType === '1');

    return {
      monthDays,
      baseBudget,
      carryover,
      budget,
      totalPersonDays,
      effectivePersonDays,
      pendingShifts,
      ...calc,
      studentAllocations,
      attendedShifts,
      fullDaysMap,
      hasAllocation,
    };
  }, [month, days, shifts, students, settings, activeStudents, selectedMonth, allMonthSurplus]);

  function handleAllocate() {
    if (!monthData || !month) return;
    for (const alloc of monthData.studentAllocations) {
      const studentShifts = monthData.attendedShifts
        .filter((s) => s.studentId === alloc.student.id)
        .sort((a, b) => a.date.localeCompare(b.date));

      let fullRemaining = alloc.fullDays;
      for (const shift of studentShifts) {
        if (fullRemaining > 0) {
          updateShiftPayType(shift.id, '1');
          fullRemaining--;
        } else {
          updateShiftPayType(shift.id, 'V');
        }
      }
    }
  }

  function handleReset() {
    if (!monthData || !month) return;
    for (const shift of monthData.attendedShifts) {
      updateShiftPayType(shift.id, 'V');
    }
  }

  if (!month || !monthData) return <div className="p-6 text-gray-400">シーズンデータがありません</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">給与配分</h1>
          <p className="text-xs text-gray-400">勤怠入力で出勤確定した実績をもとに、月ごとの1/Vを鶴亀算で計算し均等配分します。</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
        >
          <Download size={16} />
          {month?.label}の勤怠表をXLSX出力
        </button>
      </div>

      {/* Month tabs */}
      <div className="flex gap-2">
        {months.map((m, i) => (
          <button
            key={m.label}
            onClick={() => setSelectedMonth(i)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              i === selectedMonth ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Month summary */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">月予算</p>
          <p className="text-lg font-bold text-gray-800">¥{monthData.budget.toLocaleString()}</p>
          <p className="text-xs text-gray-400">{monthData.monthDays.length}日間</p>
          {monthData.carryover > 0 && (
            <p className="text-xs text-blue-600 mt-1">
              (基本 ¥{monthData.baseBudget.toLocaleString()} + 繰越 ¥{monthData.carryover.toLocaleString()})
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">出勤確定</p>
          <p className="text-lg font-bold text-gray-800">{monthData.totalPersonDays}人日</p>
          <p className="text-xs text-gray-400">{monthData.studentAllocations.length}名</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">1枠（¥{settings.fullPayAmount.toLocaleString()}）</p>
          <p className={`text-lg font-bold ${monthData.hasAllocation ? 'text-green-700' : 'text-gray-400'}`}>
            {monthData.hasAllocation ? `${monthData.fullSlots}枠` : '未確定'}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">V枠（¥{settings.vPayAmount.toLocaleString()}）</p>
          <p className={`text-lg font-bold ${monthData.hasAllocation ? 'text-orange-600' : 'text-gray-400'}`}>
            {monthData.hasAllocation ? `${monthData.vSlots}枠` : '未確定'}
          </p>
        </div>
        <div className={`rounded-xl border p-4 ${
          !monthData.hasAllocation ? 'bg-gray-50 border-gray-200'
          : monthData.surplus > 0 ? 'bg-amber-50 border-amber-300' : 'bg-green-50 border-green-300'
        }`}>
          <p className="text-xs text-gray-500">余剰</p>
          <p className={`text-lg font-bold ${
            !monthData.hasAllocation ? 'text-gray-400'
            : monthData.surplus > 0 ? 'text-amber-700' : 'text-green-700'
          }`}>
            {monthData.hasAllocation ? `¥${monthData.surplus.toLocaleString()}` : '未確定'}
          </p>
          {monthData.hasAllocation && monthData.surplus > 0 && selectedMonth < months.length - 1 && (
            <p className="text-xs text-blue-600 mt-1">→ 翌月に繰越</p>
          )}
        </div>
      </div>

      {/* Pending attendance warning */}
      {monthData.pendingShifts > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-center gap-3">
          <span className="text-amber-600 text-lg">⚠</span>
          <div>
            <p className="text-sm font-medium text-amber-800">勤怠未入力のシフトが {monthData.pendingShifts}件 あります</p>
            <p className="text-xs text-amber-600">勤怠入力ページで出勤/欠席を記録してから配分を確定してください。未入力分は計算に含まれません。</p>
          </div>
        </div>
      )}

      {/* Allocate / Re-allocate buttons */}
      <div className="flex items-center gap-4">
        {!monthData.hasAllocation ? (
          <button
            onClick={handleAllocate}
            disabled={monthData.totalPersonDays === 0}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              monthData.totalPersonDays === 0
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            <Check size={16} />
            1/V配分を確定
          </button>
        ) : (
          <>
            <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
              <Check size={16} />
              配分確定済み
            </span>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 bg-white border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <Undo2 size={16} />
              配分を取り消す
            </button>
          </>
        )}
        {monthData.totalPersonDays === 0 && !monthData.hasAllocation && (
          <span className="text-xs text-gray-400">出勤確定データがありません</span>
        )}
      </div>

      {/* Per-student table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <span className="text-sm font-semibold text-gray-700">
            {monthData.hasAllocation ? '学生別配分結果（出勤日数順）' : '学生別出勤実績（出勤日数順）'}
          </span>
          {!monthData.hasAllocation && monthData.totalPersonDays > 0 && (
            <span className="ml-3 text-xs text-gray-400">※ 配分ボタンを押すと1/V・給与が確定します</span>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">氏名</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">学年</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">出勤日数</th>
              {monthData.hasAllocation && (
                <>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">1日数</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">V日数</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">1の割合</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">給与</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {monthData.studentAllocations.map((alloc) => (
              <tr key={alloc.student.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">
                  {alloc.student.isLeader && <span className="text-red-500 mr-1" style={{ fontSize: '10px' }}>★</span>}
                  {alloc.student.hasPwc && <span className="text-blue-500 mr-1" style={{ fontSize: '10px' }}>P</span>}
                  {alloc.student.name}
                </td>
                <td className="px-4 py-3 text-center text-xs text-gray-500">{alloc.student.grade}</td>
                <td className="px-4 py-3 text-center font-semibold text-gray-700">{alloc.totalDays}</td>
                {monthData.hasAllocation && (
                  <>
                    <td className="px-4 py-3 text-center">
                      <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold">{alloc.fullDays}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs font-bold">{alloc.vDays}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center gap-1">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-green-400 rounded-full" style={{ width: `${alloc.ratio * 100}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 w-10 text-right">{Math.round(alloc.ratio * 100)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">¥{alloc.pay.toLocaleString()}</td>
                  </>
                )}
              </tr>
            ))}
            {monthData.studentAllocations.length === 0 && (
              <tr>
                <td colSpan={monthData.hasAllocation ? 7 : 3} className="px-4 py-8 text-center text-gray-400">
                  出勤確定データがありません。勤怠入力ページで出勤を記録してください。
                </td>
              </tr>
            )}
          </tbody>
          {monthData.studentAllocations.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td className="px-4 py-3 text-gray-700" colSpan={2}>合計</td>
                <td className="px-4 py-3 text-center text-gray-700">{monthData.totalPersonDays}</td>
                {monthData.hasAllocation && (
                  <>
                    <td className="px-4 py-3 text-center text-green-700">{monthData.fullSlots}</td>
                    <td className="px-4 py-3 text-center text-orange-600">{monthData.vSlots}</td>
                    <td className="px-4 py-3 text-center text-gray-500 text-xs">
                      {monthData.totalPersonDays > 0 ? Math.round((monthData.fullSlots / monthData.totalPersonDays) * 100) : 0}%
                    </td>
                    <td className="px-4 py-3 text-right text-gray-800">
                      ¥{(monthData.fullSlots * settings.fullPayAmount + monthData.vSlots * settings.vPayAmount).toLocaleString()}
                    </td>
                  </>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
