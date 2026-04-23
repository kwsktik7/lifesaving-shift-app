import * as XLSX from 'xlsx';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { ShiftAssignment, Student, SeasonDay } from '@/types';
import { sortStudents } from '@/utils/studentSort';

/**
 * シフト表をExcel出力（給与区分なし、シフト割当の有無のみ。勤怠は反映しない）
 * monthLabel / startDate / endDate を渡すと指定月だけのシートになる。
 * 列順は 学年 / 役職 / 氏名 / 日付... / 合計。
 * 並び順は sortStudents と同じ(監視長→副監視長→3→4→2→1→その他)。
 */
export function exportShiftScheduleXlsx(
  students: Student[],
  shifts: ShiftAssignment[],
  seasonDays: SeasonDay[],
  clubName: string,
  monthLabel?: string,
  startDate?: string,
  endDate?: string,
): void {
  const wb = XLSX.utils.book_new();
  const allOpenDays = seasonDays.filter((d) => d.isOpen).sort((a, b) => a.date.localeCompare(b.date));
  const openDays = startDate && endDate
    ? allOpenDays.filter((d) => d.date >= startDate && d.date <= endDate)
    : allOpenDays;
  if (openDays.length === 0) return;

  const activeStudents = sortStudents(students.filter((s) => s.isActive));

  // Header rows: 学年 / 役職 / 氏名 / 日付... / 合計
  const header1 = ['学年', '役職', '氏名', ...openDays.map((d) => format(parseISO(d.date), 'M/d')), '合計'];
  const header2 = ['', '', '', ...openDays.map((d) => format(parseISO(d.date), 'E', { locale: ja })), ''];

  const rows = activeStudents.map((student) => {
    let count = 0;
    const cells = openDays.map((d) => {
      const shift = shifts.find(
        (s) => s.studentId === student.id && s.date === d.date && s.status !== 'cancelled' && s.status !== 'draft'
      );
      if (!shift) return '';
      count++;
      return '○';
    });
    return [student.grade || '', student.role || '', student.name, ...cells, count];
  });

  // Per-day totals (全員/PWC持ち) の各行
  const studentById = new Map(activeStudents.map((s) => [s.id, s]));
  const totals = openDays.map((d) => {
    return shifts.filter(
      (s) => s.date === d.date && s.status !== 'cancelled' && s.status !== 'draft'
    ).length;
  });
  const pwcTotals = openDays.map((d) => {
    return shifts.filter((s) => {
      if (s.date !== d.date || s.status === 'cancelled' || s.status === 'draft') return false;
      return studentById.get(s.studentId)?.hasPwc === true;
    }).length;
  });
  const totalRow = ['', '', '合計', ...totals.map((t) => t || ''), ''];
  const pwcRow = ['', '', 'PWC合計', ...pwcTotals.map((t) => t || ''), ''];

  const data = [header1, header2, ...rows, totalRow, pwcRow];
  const ws = XLSX.utils.aoa_to_sheet(data);

  ws['!cols'] = [
    { wch: 6 },   // 学年
    { wch: 14 },  // 役職
    { wch: 14 },  // 氏名
    ...openDays.map(() => ({ wch: 5 })),
    { wch: 5 },   // 合計
  ];

  const sheetName = monthLabel ? `シフト表_${monthLabel}` : 'シフト表';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const fileName = monthLabel
    ? `シフト表_${monthLabel}_${clubName}.xlsx`
    : `シフト表_${clubName}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * シフト表をPDF出力（ブラウザのprint-to-PDFを活用）
 */
export function exportShiftSchedulePdf(
  students: Student[],
  shifts: ShiftAssignment[],
  seasonDays: SeasonDay[],
  clubName: string
): void {
  const openDays = seasonDays.filter((d) => d.isOpen).sort((a, b) => a.date.localeCompare(b.date));
  if (openDays.length === 0) return;

  const activeStudents = students.filter((s) => s.isActive);

  // Build HTML table
  const dateHeaders = openDays.map((d) => {
    const day = format(parseISO(d.date), 'd');
    const dow = format(parseISO(d.date), 'E', { locale: ja });
    const isSat = dow === '土';
    const isSun = dow === '日';
    const color = isSun ? '#dc2626' : isSat ? '#2563eb' : '#374151';
    return `<th style="font-size:9px;padding:2px 3px;text-align:center;border:1px solid #ccc;color:${color};min-width:22px;"><div>${day}</div><div style="font-size:7px;color:#999;">${dow}</div></th>`;
  }).join('');

  // Month header
  const monthGroups: { month: string; count: number }[] = [];
  for (const d of openDays) {
    const m = format(parseISO(d.date), 'M月');
    if (monthGroups.length > 0 && monthGroups[monthGroups.length - 1].month === m) {
      monthGroups[monthGroups.length - 1].count++;
    } else {
      monthGroups.push({ month: m, count: 1 });
    }
  }
  const monthHeaders = monthGroups.map((g) =>
    `<th colspan="${g.count}" style="font-size:10px;padding:3px;text-align:center;border:1px solid #ccc;background:#f3f4f6;">${g.month}</th>`
  ).join('');

  const studentRows = activeStudents.map((student) => {
    let count = 0;
    const cells = openDays.map((d) => {
      const shift = shifts.find(
        (s) => s.studentId === student.id && s.date === d.date && s.status !== 'cancelled' && s.status !== 'draft'
      );
      if (!shift) return '<td style="border:1px solid #e5e7eb;text-align:center;font-size:9px;padding:2px;">-</td>';
      count++;
      return '<td style="border:1px solid #e5e7eb;text-align:center;font-size:9px;padding:2px;color:#2563eb;font-weight:bold;">○</td>';
    }).join('');
    const leaderBadge = student.isLeader ? '<span style="color:#dc2626;font-size:8px;">★</span>' : '';
    const pwcBadge = student.hasPwc ? '<span style="color:#2563eb;font-size:8px;">P</span>' : '';
    return `<tr>
      <td style="border:1px solid #e5e7eb;padding:2px 4px;font-size:10px;white-space:nowrap;font-weight:500;">${leaderBadge}${pwcBadge}${student.name}</td>
      <td style="border:1px solid #e5e7eb;text-align:center;font-size:9px;color:#666;">${student.grade || ''}</td>
      ${cells}
      <td style="border:1px solid #e5e7eb;text-align:center;font-size:10px;font-weight:bold;">${count}</td>
    </tr>`;
  }).join('');

  // Totals row
  const totalCells = openDays.map((d) => {
    const c = shifts.filter(
      (s) => s.date === d.date && s.status !== 'cancelled' && s.status !== 'draft'
    ).length;
    return `<td style="border:1px solid #e5e7eb;text-align:center;font-size:9px;padding:2px;background:#f9fafb;font-weight:600;">${c || ''}</td>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>シフト表 - ${clubName}</title>
<style>
  @page { size: landscape; margin: 8mm; }
  body { font-family: 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif; margin: 0; padding: 8px; }
  h1 { font-size: 16px; margin: 0 0 8px 0; }
  table { border-collapse: collapse; }
</style>
</head><body>
<h1>${clubName} シフト表</h1>
<table>
  <thead>
    <tr><th style="border:1px solid #ccc;background:#f3f4f6;" colspan="2"></th>${monthHeaders}<th style="border:1px solid #ccc;background:#f3f4f6;"></th></tr>
    <tr><th style="font-size:9px;padding:2px 4px;text-align:left;border:1px solid #ccc;background:#f3f4f6;">氏名</th><th style="font-size:9px;padding:2px;border:1px solid #ccc;background:#f3f4f6;">学年</th>${dateHeaders}<th style="font-size:9px;padding:2px;border:1px solid #ccc;background:#f3f4f6;">計</th></tr>
  </thead>
  <tbody>
    ${studentRows}
    <tr style="background:#f9fafb;">
      <td style="border:1px solid #e5e7eb;padding:2px 4px;font-size:10px;font-weight:bold;" colspan="2">合計</td>
      ${totalCells}
      <td style="border:1px solid #e5e7eb;"></td>
    </tr>
  </tbody>
</table>
<p style="font-size:8px;color:#999;margin-top:8px;">★=監視長/副監視長　P=PWC免許保持者</p>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) {
    win.onload = () => {
      setTimeout(() => {
        win.print();
        URL.revokeObjectURL(url);
      }, 300);
    };
  }
}
