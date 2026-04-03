import * as XLSX from 'xlsx';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { ShiftAssignment, Student, AppSettings, SeasonDay } from '@/types';

export function exportAttendanceReport(
  students: Student[],
  shifts: ShiftAssignment[],
  settings: AppSettings,
  seasonDays: SeasonDay[],
  monthLabel?: string,
  startDate?: string,
  endDate?: string
): void {
  const wb = XLSX.utils.book_new();

  // Filter to month range if provided
  const filteredDays = startDate && endDate
    ? seasonDays.filter((d) => d.isOpen && d.date >= startDate && d.date <= endDate)
    : seasonDays.filter((d) => d.isOpen);

  const allDates = filteredDays
    .map((d) => d.date)
    .sort();

  if (allDates.length === 0) return;

  const filteredShifts = startDate && endDate
    ? shifts.filter((s) => s.date >= startDate && s.date <= endDate)
    : shifts;

  // 勤怠表 sheet: one row per student, one col per date
  const summaryHeaders = [
    '氏名',
    ...allDates.map((d) => format(parseISO(d), 'M/d(E)', { locale: ja })),
    '出勤日数',
    '1日数',
    'V日数',
    '給与合計(円)',
  ];

  const summaryRows = students.filter((s) => s.isActive).map((student) => {
    const cells = allDates.map((date) => {
      const shift = filteredShifts.find(
        (s) => s.studentId === student.id && s.date === date && s.status !== 'cancelled' && s.status !== 'draft'
      );
      if (!shift) return '-';
      if (shift.status === 'absent') return '欠';
      if (shift.status === 'attended') {
        const half = shift.attendance === 'am' ? '(午前)' : shift.attendance === 'pm' ? '(午後)' : '';
        return shift.payType + half;
      }
      return '○'; // published but not yet confirmed
    });

    // Pay = attended only (half-day = half pay)
    const attended = filteredShifts.filter(
      (s) => s.studentId === student.id && s.status === 'attended'
    );
    let totalPay = 0;
    let attendedFullPay = 0;
    let attendedVPay = 0;
    for (const s of attended) {
      const multiplier = (s.attendance === 'am' || s.attendance === 'pm') ? 0.5 : 1;
      if (s.payType === '1') {
        attendedFullPay += multiplier;
        totalPay += settings.fullPayAmount * multiplier;
      } else {
        attendedVPay += multiplier;
        totalPay += settings.vPayAmount * multiplier;
      }
    }

    return [student.name, ...cells, attendedFullPay + attendedVPay, attendedFullPay, attendedVPay, totalPay];
  });

  const sheetName = monthLabel ? `勤怠表_${monthLabel}` : '勤怠表';
  const ws = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
  ws['!cols'] = [
    { wch: 12 },
    ...allDates.map(() => ({ wch: 7 })),
    { wch: 8 },
    { wch: 6 },
    { wch: 6 },
    { wch: 12 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // 給与集計 sheet: summary per student (attended only, half-day = 0.5)
  const payHeaders = ['氏名', '1日数', 'V日数', '合計日数', '給与合計(円)'];
  const payRows = students.filter((s) => s.isActive).map((student) => {
    const attended = filteredShifts.filter(
      (s) => s.studentId === student.id && s.status === 'attended'
    );
    let pFullPay = 0, pVPay = 0, pTotalPay = 0;
    for (const s of attended) {
      const mult = (s.attendance === 'am' || s.attendance === 'pm') ? 0.5 : 1;
      if (s.payType === '1') { pFullPay += mult; pTotalPay += settings.fullPayAmount * mult; }
      else { pVPay += mult; pTotalPay += settings.vPayAmount * mult; }
    }
    return [student.name, pFullPay, pVPay, pFullPay + pVPay, pTotalPay];
  });

  const totalFullPay = payRows.reduce((acc, r) => acc + (r[1] as number), 0);
  const totalVPay = payRows.reduce((acc, r) => acc + (r[2] as number), 0);
  const totalPay = payRows.reduce((acc, r) => acc + (r[4] as number), 0);
  payRows.push(['合計', totalFullPay, totalVPay, totalFullPay + totalVPay, totalPay]);

  const ws2 = XLSX.utils.aoa_to_sheet([payHeaders, ...payRows]);
  ws2['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, '給与集計');

  const fileName = monthLabel
    ? `勤怠表_${monthLabel}_${settings.clubName}.xlsx`
    : `勤怠表_${settings.clubName}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

export function exportAllData(): string {
  const keys = ['students', 'season_days', 'availability', 'shifts', 'settings'];
  const data: Record<string, unknown> = {};
  for (const key of keys) {
    const raw = localStorage.getItem(`zushi_${key}`);
    data[key] = raw ? JSON.parse(raw) : null;
  }
  return JSON.stringify({
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    data,
  }, null, 2);
}

export function importAllData(json: string): void {
  const parsed = JSON.parse(json);
  const keys = ['students', 'season_days', 'availability', 'shifts', 'settings'];
  for (const key of keys) {
    if (parsed.data?.[key]) {
      localStorage.setItem(`zushi_${key}`, JSON.stringify(parsed.data[key]));
    }
  }
  window.location.reload();
}
