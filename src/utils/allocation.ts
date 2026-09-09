/**
 * 給与配分の純粋計算ロジック(鶴亀算 + 最大剰余法)。
 * React に依存しないので単体テスト・SSR検証が可能。給与配分ページ(AdminPayAllocation)から利用する。
 */

/**
 * 鶴亀算: 予算と延べ人日から1枠(fullPay)・V枠(vPay)の数を計算する。
 * minimizeSurplus=true (最終期間など) は余剰を最小化するよう1枠を1つ増やせるなら増やす。
 */
export function tsurukame(
  budget: number,
  totalPersonDays: number,
  fullPay: number,
  vPay: number,
  minimizeSurplus = false,
): { fullSlots: number; vSlots: number; surplus: number } {
  // 配分対象の人日がない場合、予算全額が余剰(翌期間繰越)となる。
  // ここで surplus:0 を返すと、強制V分以外の予算が消えてしまうので必ず budget を返す。
  if (totalPersonDays === 0) return { fullSlots: 0, vSlots: 0, surplus: budget };
  const diff = fullPay - vPay;
  let fullSlots = Math.max(0, Math.min(totalPersonDays, Math.floor((budget - totalPersonDays * vPay) / diff)));
  // 最終期間など余剰を最小化したい場合、1枠を1つ増やして余剰が0以上ならそちらを採用
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

/**
 * 最大剰余法(Hamilton)で1日数(1枠)を各学生に配分する。
 * 半日(0.5刻み)を扱うため内部で全て2倍して整数化し、最後に÷2して戻す。
 * 各学生の出勤半日数でcapし、fullDaysがその人の総日数を超えないよう保証する。
 */
export function distributeFullDays(
  studentDays: { studentId: string; days: number }[],
  totalFullSlots: number,
): Map<string, number> {
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
