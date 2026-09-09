import { useState, useMemo } from 'react';
import { useSeasonStore } from '@/store/seasonStore';
import { useStudentStore } from '@/store/studentStore';
import { useShiftStore } from '@/store/shiftStore';
import { useSettingsStore } from '@/store/settingsStore';
import { Check, Undo2, Download } from 'lucide-react';
import { exportAttendanceReport } from '@/utils/export';
import { getMonthRanges, buildPeriods, monthKeyOf } from '@/utils/monthRanges';
import { tsurukame, distributeFullDays } from '@/utils/allocation';
import { shiftPay, assignPayTypes, adultShiftPay } from '@/utils/pay';

/** 1年生は最初の3回の勤務をVで固定 */
const ROOKIE_V_SHIFT_QUOTA = 3;
function isRookie(grade: string): boolean {
  return /1年/.test(grade);
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
  // 「前の月と合算」設定を反映した期間(単月 or 合算)の一覧。給与計算・出力の単位。
  const mergedWithPrevKey = (settings.mergedWithPrev ?? []).join(',');
  const periods = useMemo(
    () => buildPeriods(months, new Set(settings.mergedWithPrev ?? [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [months, mergedWithPrevKey]
  );
  const [selectedPeriodIdx, setSelectedPeriodIdx] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  // 合算設定変更で期間数が減ったときに範囲外を選ばないようクランプ
  const selectedPeriod = periods.length > 0 ? Math.min(selectedPeriodIdx, periods.length - 1) : 0;
  const period = periods[selectedPeriod];

  // 学生(鶴亀算の配分対象) と 社会人(区分固定・予算から先取り控除) を分離する
  const activeStudents = students.filter((s) => s.isActive && !s.isAdult);
  const adultStudents = students.filter((s) => s.isActive && s.isAdult);
  const studentIdSet = new Set(activeStudents.map((s) => s.id));

  function handleExport() {
    if (!period || !monthData) return;
    // Excel(勤怠表)には社会人も含める。全 active(学生+社会人)を渡す。
    // 配分未確定の期間は 1/V を出さず出勤印「○」だけを出力する(monthData.hasAllocation)。
    // 合算期間(8〜9月など)は開始日〜終了日をまたいだ1つの勤怠表になる。
    const allActive = students.filter((s) => s.isActive);
    exportAttendanceReport(
      allActive, shifts, settings, days, period.label, period.startDate, period.endDate,
      monthData.hasAllocation,
    );
  }

  /** 半日を0.5で数えた延べ人日を計算 */
  function calcEffectiveDays(shiftList: typeof shifts) {
    return shiftList.reduce((acc, s) => acc + ((s.attendance === 'am' || s.attendance === 'pm') ? 0.5 : 1), 0);
  }

  /**
   * 指定月の社会人給与を区分固定(adultShiftPay)で計算する。鶴亀算とは独立。
   * 社会人給与の合計は学生の月予算から先に差し引かれる。
   */
  function calcAdultPayForMonth(monthStart: string, monthEnd: string) {
    const perAdult = adultStudents.map((a) => {
      const myShifts = shifts.filter(
        (s) => s.studentId === a.id && s.status === 'attended' && s.date >= monthStart && s.date <= monthEnd,
      );
      let pay = 0;
      for (const s of myShifts) {
        pay += adultShiftPay(a.adultPayType, s.attendance, settings.fullPayAmount, settings.vPayAmount);
      }
      return { student: a, count: myShifts.length, pay };
    });
    const total = perAdult.reduce((acc, x) => acc + x.pay, 0);
    return { perAdult, total };
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

  // 全期間の余剰を計算（繰越用）。繰越は期間→期間で流れる(合算月は1期間として1回だけ計算)。
  const allMonthSurplus = useMemo(() => {
    const surplusMap = new Map<number, number>(); // periodIndex -> surplus
    for (let i = 0; i < periods.length; i++) {
      const p = periods[i];
      // 期間予算 = 含まれる各月の予算合計
      const baseBudget = p.monthKeys.reduce((acc, k) => acc + (settings.monthlyBudgets?.[k] ?? 0), 0);
      const carryover = i > 0 ? (surplusMap.get(i - 1) ?? 0) : 0;
      const totalBudget = baseBudget + carryover;

      // 鶴亀算の人日は学生のみ(社会人は配分対象外)
      const attended = shifts.filter(
        (s) => s.date >= p.startDate && s.date <= p.endDate && s.status === 'attended' && studentIdSet.has(s.studentId)
      );
      const personDays = calcEffectiveDays(attended);

      // 社会人給与は予算から先に控除
      const adultPayTotal = calcAdultPayForMonth(p.startDate, p.endDate).total;

      // 1年生の強制V分を控除
      let forcedVEffectiveDays = 0;
      for (const st of activeStudents) {
        if (!isRookie(st.grade)) continue;
        forcedVEffectiveDays += calcRookieForcedV(st.id, p.startDate, p.endDate).effectiveDays;
      }
      const eligibleDays = personDays - forcedVEffectiveDays;
      const eligibleBudget = totalBudget - adultPayTotal - forcedVEffectiveDays * settings.vPayAmount;

      const isLastPeriod = i === periods.length - 1;
      const calc = tsurukame(eligibleBudget, eligibleDays, settings.fullPayAmount, settings.vPayAmount, isLastPeriod);
      surplusMap.set(i, calc.surplus);
    }
    return surplusMap;
  }, [periods, days, shifts, settings, activeStudents]);

  const monthData = useMemo(() => {
    if (!period) return null;

    const monthDays = days.filter((d) => d.isOpen && d.date >= period.startDate && d.date <= period.endDate);
    // 期間予算 = 含まれる各月の予算合計(合算期間は8月+9月など)
    const baseBudget = period.monthKeys.reduce((acc, k) => acc + (settings.monthlyBudgets?.[k] ?? 0), 0);
    const carryover = selectedPeriod > 0 ? (allMonthSurplus.get(selectedPeriod - 1) ?? 0) : 0;
    const budget = baseBudget + carryover;

    // 出勤確定シフト。全員(Excel/勤怠表示用)と、鶴亀算に使う学生のみ を分ける。
    const attendedShifts = shifts.filter(
      (s) => s.date >= period.startDate && s.date <= period.endDate && s.status === 'attended'
    );
    const studentAttendedShifts = attendedShifts.filter((s) => studentIdSet.has(s.studentId));
    const totalPersonDays = calcEffectiveDays(studentAttendedShifts);

    // 社会人給与(区分固定)。予算から先取り控除する。
    const adult = calcAdultPayForMonth(period.startDate, period.endDate);
    const adultPayTotal = adult.total;

    // 勤怠未入力シフト
    const pendingShifts = shifts.filter(
      (s) => s.date >= period.startDate && s.date <= period.endDate && s.status === 'published'
    ).length;

    // 半日勤務を考慮した延べ人日（0.5換算・学生のみ）
    const effectivePersonDays = calcEffectiveDays(studentAttendedShifts);

    // 学生ごとの出勤日数（半日は0.5・学生のみ）
    const studentDaysMap = new Map<string, number>();
    for (const s of studentAttendedShifts) {
      const val = (s.attendance === 'am' || s.attendance === 'pm') ? 0.5 : 1;
      studentDaysMap.set(s.studentId, (studentDaysMap.get(s.studentId) ?? 0) + val);
    }

    // 1年生の強制V（最初3回の勤務はVで固定）
    const rookieForcedVByStudent = new Map<string, { shiftIds: string[]; effectiveDays: number }>();
    let totalRookieForcedVDays = 0;
    const forcedVShiftIds = new Set<string>();
    for (const st of activeStudents) {
      if (!isRookie(st.grade)) continue;
      const forced = calcRookieForcedV(st.id, period.startDate, period.endDate);
      if (forced.effectiveDays > 0) {
        rookieForcedVByStudent.set(st.id, forced);
        totalRookieForcedVDays += forced.effectiveDays;
        forced.shiftIds.forEach((id) => forcedVShiftIds.add(id));
      }
    }

    // 配分対象の延べ人日と予算（社会人給与と強制Vを予算から先に控除）
    const eligibleDays = effectivePersonDays - totalRookieForcedVDays;
    const eligibleBudget = budget - adultPayTotal - totalRookieForcedVDays * settings.vPayAmount;
    const isLastPeriod = selectedPeriod === periods.length - 1;
    const calc = tsurukame(eligibleBudget, eligibleDays, settings.fullPayAmount, settings.vPayAmount, isLastPeriod);

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
        const totalDays = studentDaysMap.get(s.id) ?? 0; // 人日(半日0.5)。予算・繰越計算のため保持
        const fullDaysTarget = fullDaysMap.get(s.id) ?? 0; // 1枠の人日(0.5刻み・内部用)
        // プレビュー段階でも「確定したらどうなるか」を確定と同一ロジック(assignPayTypes)で計算する。
        // これにより画面表示・確定・Excelの金額が構造的に一致する。
        const myShifts = attendedShifts
          .filter((sh) => sh.studentId === s.id)
          .sort((a, b) => a.date.localeCompare(b.date));
        const payMap = new Map(
          assignPayTypes(myShifts, fullDaysTarget, forcedVShiftIds).map((a) => [a.id, a.payType]),
        );
        let fullCount = 0;
        let vCount = 0;
        let pay = 0;
        for (const sh of myShifts) {
          const pt = payMap.get(sh.id);
          if (pt === '1') fullCount += 1;
          else vCount += 1;
          pay += shiftPay(pt, sh.attendance, settings.fullPayAmount, settings.vPayAmount);
        }
        const totalCount = myShifts.length; // 出勤回数(整数)
        const ratio = totalCount > 0 ? fullCount / totalCount : 0;
        return { student: s, totalDays, totalCount, fullDaysTarget, fullCount, vCount, pay, ratio };
      })
      .sort((a, b) => b.totalCount - a.totalCount);

    // 合計補正後（表示用の合計枠数）
    const totalFullSlots = calc.fullSlots;
    const totalVSlots = calc.vSlots + totalRookieForcedVDays;

    // 配分確定状態は明示フラグで管理（fullSlots=0でも確定として扱える）
    // 合算期間は含まれる全ての月が確定済みのときだけ「確定」とみなす。
    const allocated = settings.allocatedMonths ?? [];
    const hasAllocation = period.monthKeys.every((k) => allocated.includes(k));

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
      adultAllocations: adult.perAdult, // 社会人の個人別(区分固定)給与
      adultPayTotal,                    // 社会人給与合計(予算から控除済み)
    };
  }, [period, days, shifts, students, settings, activeStudents, selectedPeriod, periods.length, allMonthSurplus]);

  /** 月の「前の月と合算」設定をトグルする */
  function toggleMerge(monthKey: string, merged: boolean) {
    const current = settings.mergedWithPrev ?? [];
    const next = merged
      ? (current.includes(monthKey) ? current : [...current, monthKey])
      : current.filter((k) => k !== monthKey);

    // グルーピングが変わる月は確定を解除する。
    // 保存済みシフトの payType は「確定時のグルーピングの予算」で計算されている。
    // 合算/分割でその基準予算が変わると、画面(常に現在の期間予算で再計算)と
    // Excel(保存済み payType を読む)が食い違い、月予算を超えることがある。
    // → 変更前後で monthKey が属する期間の全月キーを未確定に戻し、再配分を促す。
    const affected = new Set<string>();
    for (const set of [new Set(current), new Set(next)]) {
      const p = buildPeriods(months, set).find((pp) => pp.monthKeys.includes(monthKey));
      if (p) p.monthKeys.forEach((k) => affected.add(k));
    }
    const allocated = settings.allocatedMonths ?? [];
    const nextAllocated = allocated.filter((k) => !affected.has(k));

    const patch: { mergedWithPrev: string[]; allocatedMonths?: string[] } = { mergedWithPrev: next };
    if (nextAllocated.length !== allocated.length) patch.allocatedMonths = nextAllocated;
    updateSettings(patch);
    // 期間数が変わるので選択を先頭に戻して範囲外参照を防ぐ
    setSelectedPeriodIdx(0);
  }

  async function handleAllocate() {
    if (!monthData || !period) return;
    const updates: { id: string; payType: 'V' | '1' }[] = [];
    for (const alloc of monthData.studentAllocations) {
      const studentShifts = monthData.attendedShifts
        .filter((s) => s.studentId === alloc.student.id)
        .sort((a, b) => a.date.localeCompare(b.date));
      // プレビュー(studentAllocations)と同一の assignPayTypes を使い、表示と確定を完全一致させる
      const assign = assignPayTypes(
        studentShifts,
        monthData.fullDaysMap.get(alloc.student.id) ?? 0,
        monthData.forcedVShiftIds,
      );
      for (const a of assign) updates.push({ id: a.id, payType: a.payType });
    }
    try {
      await setShiftPayTypesBulk(updates);
      // 合算期間は含まれる全ての月キーを確定済みにする
      const current = settings.allocatedMonths ?? [];
      const toAdd = period.monthKeys.filter((k) => !current.includes(k));
      if (toAdd.length > 0) {
        await updateSettings({ allocatedMonths: [...current, ...toAdd] });
      }
      setErrorMsg('');
    } catch (e) {
      console.error('[PayAllocation] allocate failed', e);
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(`配分の保存に失敗しました: ${msg}`);
    }
  }

  async function handleReset() {
    if (!monthData || !period) return;
    // リセットは学生シフトのみ(社会人は payType を使わず区分固定で計算するため触らない)
    const updates = monthData.attendedShifts
      .filter((s) => studentIdSet.has(s.studentId))
      .map((s) => ({ id: s.id, payType: 'V' as const }));
    try {
      await setShiftPayTypesBulk(updates);
      // 合算期間は含まれる全ての月キーの確定を解除する
      const current = settings.allocatedMonths ?? [];
      const keySet = new Set(period.monthKeys);
      if (period.monthKeys.some((k) => current.includes(k))) {
        await updateSettings({ allocatedMonths: current.filter((k) => !keySet.has(k)) });
      }
      setErrorMsg('');
    } catch (e) {
      console.error('[PayAllocation] reset failed', e);
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(`取り消しに失敗しました: ${msg}`);
    }
  }

  if (!period || !monthData) return <div className="p-6 text-gray-400">シーズンデータがありません</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">給与配分</h1>
          <p className="text-xs text-gray-400">設定ページの月別予算と勤怠実績をもとに、期間ごとの1/Vを鶴亀算で計算し均等配分します。</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
        >
          <Download size={16} />
          {period?.label}の勤怠表をXLSX出力
        </button>
      </div>

      {/* 期間タブ(単月 or 合算) */}
      <div className="flex flex-wrap gap-2">
        {periods.map((p, i) => (
          <button
            key={p.monthKeys.join(',')}
            onClick={() => setSelectedPeriodIdx(i)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              i === selectedPeriod ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 月の合算設定(日数の少ない月を隣とまとめて計算・出力する) */}
      {months.length >= 2 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-700 mb-1">月の合算</p>
          <p className="text-xs text-gray-400 mb-3">
            日数の少ない月を前の月とまとめて、1つの予算・給与計算・勤怠表として扱います（例: 9月を8月と合算）。
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {months.slice(1).map((m) => {
              const key = monthKeyOf(m);
              const prev = months[months.indexOf(m) - 1];
              const merged = (settings.mergedWithPrev ?? []).includes(key);
              return (
                <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={merged}
                    onChange={(e) => toggleMerge(key, e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span>{m.month + 1}月を{prev.month + 1}月と合算</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Period summary */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">予算</p>
          <p className="text-lg font-bold text-gray-800">¥{monthData.budget.toLocaleString()}</p>
          <p className="text-xs text-gray-400">{monthData.monthDays.length}日間</p>
          {monthData.carryover > 0 && (
            <p className="text-xs text-blue-600 mt-1">
              (基本 ¥{monthData.baseBudget.toLocaleString()} + 繰越 ¥{monthData.carryover.toLocaleString()})
            </p>
          )}
          {monthData.adultPayTotal > 0 && (
            <p className="text-xs text-orange-600 mt-1">
              うち社会人給与 ¥{monthData.adultPayTotal.toLocaleString()} を先に控除
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
          {monthData.hasAllocation && monthData.surplus > 0 && selectedPeriod < periods.length - 1 && (
            <p className="text-xs text-blue-600 mt-1">→ 次の期間に繰越</p>
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
            <p className="text-sm font-medium text-red-800">{period.label}の予算が未設定です</p>
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
                <td className="px-4 py-3 text-center font-semibold text-gray-700">{alloc.totalCount}</td>
                {monthData.hasAllocation && (
                  <>
                    <td className="px-4 py-3 text-center">
                      <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold">{alloc.fullCount}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs font-bold">{alloc.vCount}</span>
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

      {/* 社会人セクション(区分固定・予算から先取り控除) */}
      {monthData.adultAllocations.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-6">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">社会人（給与区分は固定・月予算から先に控除）</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">氏名</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">区分</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">出勤回数</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">給与</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {monthData.adultAllocations.map((a) => {
                const label =
                  a.student.adultPayType === 'none' ? '無給' : a.student.adultPayType === '1' ? '1単価' : 'V単価';
                return (
                  <tr key={a.student.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{a.student.name}</td>
                    <td className="px-4 py-3 text-center text-xs text-gray-500">{label}</td>
                    <td className="px-4 py-3 text-center font-semibold text-gray-700">{a.count}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">¥{a.pay.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td className="px-4 py-3 text-gray-700" colSpan={3}>社会人 合計</td>
                <td className="px-4 py-3 text-right text-gray-800">¥{monthData.adultPayTotal.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
