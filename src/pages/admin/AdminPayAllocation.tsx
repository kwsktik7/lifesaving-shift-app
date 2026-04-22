import { useState, useMemo } from 'react';
import { useSeasonStore } from '@/store/seasonStore';
import { useStudentStore } from '@/store/studentStore';
import { useShiftStore } from '@/store/shiftStore';
import { useSettingsStore } from '@/store/settingsStore';
import { Check, Undo2, Download } from 'lucide-react';
import { exportAttendanceReport } from '@/utils/export';
import { getMonthRanges } from '@/utils/monthRanges';

/** 鶴亀算: 予算と延べ人日から1枠・V枠を計算 */
function tsurukame(budget: number, totalPersonDays: number, fullPay: number, vPay: number, minimizeSurplus = false) {
  // 配分対象の人日がない場合、予算全額が余剰(翌月繰越)となる。
  // ここで surplus:0 を返すと、強制V分以外の予算が消えてしまうので必ず budget を返す。
  if (totalPersonDays === 0) return { fullSlots: 0, vSlots: 0, surplus: budget };
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

/** 1年生は最初の3回の勤務をVで固定 */
const ROOKIE_V_SHIFT_QUOTA = 3;
function isRookie(grade: string): boolean {
  return /1年/.test(grade);
}

/** 最大剰余法で1日数を各学生に配分 */
function distributeFullDays(
  studentDays: { studentId: string; days: number }[],
  totalFullSlots: number
): Map<string, number> {
  // 半日(0.5刻み)を扱うため、内部で全てを2倍して整数化してHamilton最大剰余法で配分、
  // 最後に ÷2 して戻す。加えて各学生の出勤半日数でcapし、fullDaysがその人の
  // totalDaysを超えないように保証(半日しか来てない人にフル1枠振る等のバグを防ぐ)。
  const scale = 2;
  const scaled = studentDays.map((s) => ({
    studentId: s.studentId,
    cap: Math.round(s.days * scale),
  }));
  const totalCap = scaled.reduce((acc, s) => acc + s.cap, 0);
  if (totalCap === 0) return new Map();

  const targetSlots = Math.min(Math.round(totalFullSlots * scale), totalCap);
  const ratio = targetSlots / totalCap;

  const result = scaled.map((s) => {
    const exact = s.cap * ratio;
    const base = Math.min(s.cap, Math.floor(exact));
    return { studentId: s.studentId, base, remainder: exact - base, cap: s.cap };
  });

  // 余り枠をremainder大きい順に+1していく(cap超過は絶対避ける)
  let remaining = targetSlots - result.reduce((acc, r) => acc + r.base, 0);
  const sorted = [...result].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < sorted.length && remaining > 0; i++) {
    if (sorted[i].base < sorted[i].cap) {
      sorted[i].base++;
      remaining--;
    }
  }

  const map = new Map<string, number>();
  for (const r of result) {
    map.set(r.studentId, r.base / scale);
  }
  return map;
}

export default function AdminPayAllocation() {
  const { days } = useSeasonStore();
  const { students } = useStudentStore();
  const { shifts, setShiftPayTypesBulk } = useShiftStore();
  const { settings, updateSettings } = useSettingsStore();

  const months = useMemo(
    () => getMonthRanges(settings.seasonStart, settings.seasonEnd),
    [settings.seasonStart, settings.seasonEnd]
  );
  const [selectedMonth, setSelectedMonth] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
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

  /**
   * 1年生ごとに当月の強制Vシフト数（と延べ人日）を算出。
   * シーズン開始から当月前までに出勤確定した回数を差し引き、残り枠を当月の出勤分から時系列順で消費する。
   */
  function calcRookieForcedV(
    studentId: string,
    monthStart: string,
    monthEnd: string,
  ): { shiftIds: string[]; effectiveDays: number } {
    const priorCount = shifts.filter(
      (s) => s.studentId === studentId && s.status === 'attended' && s.date < monthStart,
    ).length;
    const quota = Math.max(0, ROOKIE_V_SHIFT_QUOTA - priorCount);
    if (quota === 0) return { shiftIds: [], effectiveDays: 0 };
    const thisMonth = shifts
      .filter(
        (s) =>
          s.studentId === studentId &&
          s.status === 'attended' &&
          s.date >= monthStart &&
          s.date <= monthEnd,
      )
      .sort((a, b) => a.date.localeCompare(b.date));
    const forced = thisMonth.slice(0, quota);
    const effectiveDays = forced.reduce(
      (acc, s) => acc + ((s.attendance === 'am' || s.attendance === 'pm') ? 0.5 : 1),
      0,
    );
    return { shiftIds: forced.map((s) => s.id), effectiveDays };
  }

  // 全月の余剰を計算（繰越用）
  const allMonthSurplus = useMemo(() => {
    const surplusMap = new Map<number, number>(); // monthIndex -> surplus
    for (let i = 0; i < months.length; i++) {
      const m = months[i];
      const monthKey = `${m.year}-${String(m.month + 1).padStart(2, '0')}`;
      const baseBudget = settings.monthlyBudgets?.[monthKey] ?? 0;
      const carryover = i > 0 ? (surplusMap.get(i - 1) ?? 0) : 0;
      const totalBudget = baseBudget + carryover;

      const attended = shifts.filter(
        (s) => s.date >= m.startDate && s.date <= m.endDate && s.status === 'attended'
      );
      const personDays = calcEffectiveDays(attended);

      // 1年生の強制V分を控除
      let forcedVEffectiveDays = 0;
      for (const st of activeStudents) {
        if (!isRookie(st.grade)) continue;
        forcedVEffectiveDays += calcRookieForcedV(st.id, m.startDate, m.endDate).effectiveDays;
      }
      const eligibleDays = personDays - forcedVEffectiveDays;
      const eligibleBudget = totalBudget - forcedVEffectiveDays * settings.vPayAmount;

      const isLastMonth = i === months.length - 1;
      const calc = tsurukame(eligibleBudget, eligibleDays, settings.fullPayAmount, settings.vPayAmount, isLastMonth);
      surplusMap.set(i, calc.surplus);
    }
    return surplusMap;
  }, [months, days, shifts, settings, activeStudents]);

  const monthData = useMemo(() => {
    if (!month) return null;

    const monthDays = days.filter((d) => d.isOpen && d.date >= month.startDate && d.date <= month.endDate);
    const monthKey = `${month.year}-${String(month.month + 1).padStart(2, '0')}`;
    const baseBudget = settings.monthlyBudgets?.[monthKey] ?? 0;
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

    // 学生ごとの出勤日数（半日は0.5）
    const studentDaysMap = new Map<string, number>();
    for (const s of attendedShifts) {
      const val = (s.attendance === 'am' || s.attendance === 'pm') ? 0.5 : 1;
      studentDaysMap.set(s.studentId, (studentDaysMap.get(s.studentId) ?? 0) + val);
    }

    // 1年生の強制V（最初3回の勤務はVで固定）
    const rookieForcedVByStudent = new Map<string, { shiftIds: string[]; effectiveDays: number }>();
    let totalRookieForcedVDays = 0;
    const forcedVShiftIds = new Set<string>();
    for (const st of activeStudents) {
      if (!isRookie(st.grade)) continue;
      const forced = calcRookieForcedV(st.id, month.startDate, month.endDate);
      if (forced.effectiveDays > 0) {
        rookieForcedVByStudent.set(st.id, forced);
        totalRookieForcedVDays += forced.effectiveDays;
        forced.shiftIds.forEach((id) => forcedVShiftIds.add(id));
      }
    }

    // 配分対象の延べ人日と予算（強制Vを除外）
    const eligibleDays = effectivePersonDays - totalRookieForcedVDays;
    const eligibleBudget = budget - totalRookieForcedVDays * settings.vPayAmount;
    const isLastMonth = selectedMonth === months.length - 1;
    const calc = tsurukame(eligibleBudget, eligibleDays, settings.fullPayAmount, settings.vPayAmount, isLastMonth);

    // 各学生の配分対象日数（総日数 - 強制V日数）
    const studentDays = activeStudents
      .filter((s) => studentDaysMap.has(s.id))
      .map((s) => {
        const totalDays = studentDaysMap.get(s.id) ?? 0;
        const forcedV = rookieForcedVByStudent.get(s.id)?.effectiveDays ?? 0;
        return { studentId: s.id, days: Math.max(0, totalDays - forcedV) };
      });

    const fullDaysMap = distributeFullDays(studentDays, calc.fullSlots);

    const studentAllocations = activeStudents
      .filter((s) => studentDaysMap.has(s.id))
      .map((s) => {
        const totalDays = studentDaysMap.get(s.id) ?? 0;
        const forcedVDays = rookieForcedVByStudent.get(s.id)?.effectiveDays ?? 0;
        const fullDays = fullDaysMap.get(s.id) ?? 0;
        const vDays = totalDays - fullDays;
        const pay = fullDays * settings.fullPayAmount + vDays * settings.vPayAmount;
        const ratio = totalDays > 0 ? fullDays / totalDays : 0;
        return { student: s, totalDays, fullDays, vDays, forcedVDays, pay, ratio };
      })
      .sort((a, b) => b.totalDays - a.totalDays);

    // 合計補正後（表示用の合計枠数）
    const totalFullSlots = calc.fullSlots;
    const totalVSlots = calc.vSlots + totalRookieForcedVDays;

    // 配分確定状態は明示フラグで管理（fullSlots=0でも確定として扱える）
    const hasAllocation = (settings.allocatedMonths ?? []).includes(monthKey);

    return {
      monthDays,
      baseBudget,
      carryover,
      budget,
      totalPersonDays,
      effectivePersonDays,
      pendingShifts,
      ...calc,
      fullSlots: totalFullSlots,
      vSlots: totalVSlots,
      studentAllocations,
      attendedShifts,
      fullDaysMap,
      forcedVShiftIds,
      rookieForcedVByStudent,
      totalRookieForcedVDays,
      hasAllocation,
    };
  }, [month, days, shifts, students, settings, activeStudents, selectedMonth, allMonthSurplus]);

  async function handleAllocate() {
    if (!monthData || !month) return;
    const monthKey = `${month.year}-${String(month.month + 1).padStart(2, '0')}`;
    const updates: { id: string; payType: 'V' | '1' }[] = [];
    for (const alloc of monthData.studentAllocations) {
      const studentShifts = monthData.attendedShifts
        .filter((s) => s.studentId === alloc.student.id)
        .sort((a, b) => a.date.localeCompare(b.date));

      // fullRemaining は半日単位で管理(×2 整数化)。半日シフトは -1、終日シフトは -2 消費。
      // 配分された fullDays が 0.5 刻みでも破綻しないようにするため。
      let fullRemainingHalf = Math.round(alloc.fullDays * 2);
      for (const shift of studentShifts) {
        // 1年生の最初3回の勤務は強制V
        if (monthData.forcedVShiftIds.has(shift.id)) {
          updates.push({ id: shift.id, payType: 'V' });
          continue;
        }
        const costHalf = (shift.attendance === 'am' || shift.attendance === 'pm') ? 1 : 2;
        if (fullRemainingHalf >= costHalf) {
          updates.push({ id: shift.id, payType: '1' });
          fullRemainingHalf -= costHalf;
        } else {
          updates.push({ id: shift.id, payType: 'V' });
        }
      }
    }
    try {
      await setShiftPayTypesBulk(updates);
      const current = settings.allocatedMonths ?? [];
      if (!current.includes(monthKey)) {
        await updateSettings({ allocatedMonths: [...current, monthKey] });
      }
      setErrorMsg('');
    } catch (e) {
      console.error('[PayAllocation] allocate failed', e);
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(`配分の保存に失敗しました: ${msg}`);
    }
  }

  async function handleReset() {
    if (!monthData || !month) return;
    const monthKey = `${month.year}-${String(month.month + 1).padStart(2, '0')}`;
    const updates = monthData.attendedShifts.map((s) => ({ id: s.id, payType: 'V' as const }));
    try {
      await setShiftPayTypesBulk(updates);
      const current = settings.allocatedMonths ?? [];
      if (current.includes(monthKey)) {
        await updateSettings({ allocatedMonths: current.filter((k) => k !== monthKey) });
      }
      setErrorMsg('');
    } catch (e) {
      console.error('[PayAllocation] reset failed', e);
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(`取り消しに失敗しました: ${msg}`);
    }
  }

  if (!month || !monthData) return <div className="p-6 text-gray-400">シーズンデータがありません</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">給与配分</h1>
          <p className="text-xs text-gray-400">設定ページの月別予算と勤怠実績をもとに、月ごとの1/Vを鶴亀算で計算し均等配分します。</p>
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

      {errorMsg && (
        <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-3 text-sm">
          {errorMsg}
        </div>
      )}

      {/* Missing budget warning */}
      {monthData.baseBudget === 0 && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-4 flex items-center gap-3">
          <span className="text-red-600 text-lg">⚠</span>
          <div>
            <p className="text-sm font-medium text-red-800">{month.label}の予算が未設定です</p>
            <p className="text-xs text-red-600">設定ページの「月別予算」で金額を入力してください。</p>
          </div>
        </div>
      )}

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
