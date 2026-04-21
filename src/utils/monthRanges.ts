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
