/**
 * 予算内で1（フル給与）スロット数を計算する。
 *
 * 予算 = cityMinimum × fullPayAmount
 * 制約: fullPaySlots × fullPayAmount + vPaySlots × vPayAmount ≤ budget
 *
 * actualSlots を増やすほど1スロットが減り、V スロットが増える（予算は変わらない）。
 */
export function computeFullPaySlots(
  cityMinimum: number,
  actualSlots: number,
  fullPayAmount = 9100,
  vPayAmount = 2000
): number {
  const budget = cityMinimum * fullPayAmount;
  const diff = fullPayAmount - vPayAmount; // 7100
  const maxFull = Math.floor((budget - actualSlots * vPayAmount) / diff);
  return Math.max(0, Math.min(maxFull, actualSlots));
}

/** actualSlots の上限（全員 V でも予算を超えない最大人数） */
export function maxActualSlots(
  cityMinimum: number,
  fullPayAmount = 9100,
  vPayAmount = 2000
): number {
  return Math.floor((cityMinimum * fullPayAmount) / vPayAmount);
}

/** その日の実際の給与総額 */
export function computeDayTotalPay(
  cityMinimum: number,
  actualSlots: number,
  fullPayAmount = 9100,
  vPayAmount = 2000
): number {
  const full = computeFullPaySlots(cityMinimum, actualSlots, fullPayAmount, vPayAmount);
  const v = actualSlots - full;
  return full * fullPayAmount + v * vPayAmount;
}
