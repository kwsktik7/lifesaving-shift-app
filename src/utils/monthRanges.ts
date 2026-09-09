import { parseISO, format } from 'date-fns';

export interface MonthRange {
  label: string;
  year: number;
  month: number;     // 0-indexed
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

/**
 * シーズン開始日〜終了日の期間を月ごとに分割する。
 * 月の先頭・末尾はシーズン範囲内にクランプされる(7/3〜9/6 → 7月は7/3〜7/31, 9月は9/1〜9/6)。
 */
export function getMonthRanges(seasonStart: string, seasonEnd: string): MonthRange[] {
  if (!seasonStart || !seasonEnd) return [];
  const start = parseISO(seasonStart);
  const end = parseISO(seasonEnd);
  const months: MonthRange[] = [];

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

/** 月レンジから予算キー "YYYY-MM" を作る */
export function monthKeyOf(m: MonthRange): string {
  return `${m.year}-${String(m.month + 1).padStart(2, '0')}`;
}

/**
 * 給与計算・勤怠表出力の単位となる「期間」。
 * 単月そのままか、隣接する複数月をまとめたもの。
 */
export interface Period {
  /** 表示名。単月なら "2026年8月"、合算なら "2026年8月〜9月" */
  label: string;
  /** この期間に含まれる月の予算キー ("YYYY-MM")。先頭が最も古い月 */
  monthKeys: string[];
  /** 期間の最初の月の年(繰越表示などの参照用) */
  year: number;
  startDate: string; // 期間全体の開始日 (最初の月の開始日)
  endDate: string;   // 期間全体の終了日 (最後の月の終了日)
}

/**
 * 月レンジ配列を「期間」配列にまとめる。
 * mergedWithPrev に含まれる月キーは「直前の月と同じ期間」に連結される。
 * 例: months=[7月,8月,9月], mergedWithPrev={"2026-09"} → [7月], [8〜9月]
 * 連続して指定すれば3ヶ月以上もまとめられる (例: 8,9 両方指定で 7〜9月)。
 */
export function buildPeriods(months: MonthRange[], mergedWithPrev: Set<string>): Period[] {
  const groups: MonthRange[][] = [];
  for (const m of months) {
    const key = monthKeyOf(m);
    if (groups.length > 0 && mergedWithPrev.has(key)) {
      groups[groups.length - 1].push(m);
    } else {
      groups.push([m]);
    }
  }
  return groups.map((g) => {
    const first = g[0];
    const last = g[g.length - 1];
    let label: string;
    if (g.length === 1) {
      label = first.label;
    } else if (first.year === last.year) {
      // 同年: "2026年8月〜9月"
      label = `${first.label}〜${last.month + 1}月`;
    } else {
      // 年跨ぎ: "2026年12月〜2027年1月"
      label = `${first.label}〜${last.label}`;
    }
    return {
      label,
      monthKeys: g.map(monthKeyOf),
      year: first.year,
      startDate: first.startDate,
      endDate: last.endDate,
    };
  });
}
