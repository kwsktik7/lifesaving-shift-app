import type { AttendanceType, PayType, AdultPayType, ShiftAssignment } from '@/types';

/**
 * 給与計算の唯一のソース。
 * アプリ表示・確定処理・Excel出力は必ずこのモジュールを通すことで、数字が食い違わないようにする。
 *
 * 半日(午前のみ/午後のみ)は「付いた枠の単価の半額」。
 *   例) 1枠の半日 = fullPay × 0.5、V枠の半日 = vPay × 0.5
 * payType 未確定(undefined)は給与0(配分前の状態)。
 */
export function shiftPay(
  payType: PayType | undefined,
  attendance: AttendanceType,
  fullPayAmount: number,
  vPayAmount: number,
): number {
  if (payType !== '1' && payType !== 'V') return 0;
  const base = payType === '1' ? fullPayAmount : vPayAmount;
  const mult = attendance === 'am' || attendance === 'pm' ? 0.5 : 1;
  return base * mult;
}

/**
 * 社会人1シフトの給与。学生とはルールが違う:
 *   - 'none' 無給: 常に0円
 *   - 'V'    V単価のみ: 半日(午前/午後)でも V単価まるまる(半額にしない)
 *   - '1'    1単価: 学生の1と同じく、半日は半額
 * 社会人は鶴亀算の配分対象外で、区分は社会人ごとに固定。
 */
export function adultShiftPay(
  adultPayType: AdultPayType | undefined,
  attendance: AttendanceType,
  fullPayAmount: number,
  vPayAmount: number,
): number {
  if (adultPayType === 'V') return vPayAmount; // 半日でも全額
  if (adultPayType === '1') {
    const mult = attendance === 'am' || attendance === 'pm' ? 0.5 : 1;
    return fullPayAmount * mult;
  }
  return 0; // 'none' / undefined
}

export interface PayTypeAssignment {
  id: string;
  payType: PayType;
}

/**
 * 1人分の出勤シフト群に 1枠 / V枠 を割り当てる。
 * 給与配分の「プレビュー(画面表示)」と「確定(Firestore書き込み)」で必ず同一の結果になるよう、
 * 割り当てロジックはここ1箇所に集約する。以前はプレビューが理論値(0.5刻み)、確定が実配分で
 * 食い違い、画面とExcelの金額がズレていた。その再発防止。
 *
 * @param sortedShifts 対象学生の出勤シフト(日付昇順であること)
 * @param fullDaysTarget この学生に割り当てる1枠の人日数(0.5刻み。distributeFullDays の結果)
 * @param forcedVShiftIds 必ずVにするシフトID(1年生の最初3回など)
 */
export function assignPayTypes(
  sortedShifts: ShiftAssignment[],
  fullDaysTarget: number,
  forcedVShiftIds: Set<string>,
): PayTypeAssignment[] {
  // 半日=1, 終日=2 の「ハーフ単位」で1枠残量を管理する(0.5刻みの人日を整数で扱うため)
  let fullRemainingHalf = Math.round(fullDaysTarget * 2);
  const out: PayTypeAssignment[] = [];
  for (const shift of sortedShifts) {
    if (forcedVShiftIds.has(shift.id)) {
      out.push({ id: shift.id, payType: 'V' });
      continue;
    }
    const costHalf = shift.attendance === 'am' || shift.attendance === 'pm' ? 1 : 2;
    if (fullRemainingHalf >= costHalf) {
      out.push({ id: shift.id, payType: '1' });
      fullRemainingHalf -= costHalf;
    } else {
      out.push({ id: shift.id, payType: 'V' });
    }
  }
  return out;
}
