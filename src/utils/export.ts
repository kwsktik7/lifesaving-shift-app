import * as XLSX from 'xlsx';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { ShiftAssignment, Student, AppSettings, SeasonDay } from '@/types';
import { sortStudents } from '@/utils/studentSort';
import { shiftPay, adultShiftPay } from '@/utils/pay';

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
  // 列: 学年 / 役職 / 氏名 / ...日付 / 集計
  const summaryHeaders = [
    '学年',
    '役職',
    '氏名',
    ...allDates.map((d) => format(parseISO(d), 'M/d(E)', { locale: ja })),
    '出勤日数',
    '1日数',
    'V日数',
    '給与合計(円)',
  ];

  // 表示順: 監視長→副監視長→3年→4年→2年→1年→その他 (学生のみ。社会人は下に別セクション)
  const orderedStudents = sortStudents(students.filter((s) => s.isActive && !s.isAdult));
  const adultList = students.filter((s) => s.isActive && s.isAdult);
  const summaryRows = orderedStudents.map((student) => {
    const cells = allDates.map((date) => {
      // 勤怠表(実績表)は「実際に出勤した(status=attended)」シフトだけを反映する。
      // シフト作成(draft)・シフト発行(published)は勤怠には一切出さない。
      // → シフトを組んだだけで実績表に印がつく問題を防ぐ。
      const shift = filteredShifts.find(
        (s) => s.studentId === student.id && s.date === date && s.status === 'attended'
      );
      if (!shift) return '-';
      const half = shift.attendance === 'am' ? '(午前)' : shift.attendance === 'pm' ? '(午後)' : '';
      // 給与配分前(payType undefined)は出勤印「○」、配分後は「1」/「V」を表示
      return (shift.payType ?? '○') + half;
    });

    // 給与は出勤(attended)分のみ。1日数/V日数は「枠が付いた回数」(整数)、給与は shiftPay で算出。
    // アプリ(給与配分ページ)と同じ pay モジュールを通すので金額が食い違わない。
    const attended = filteredShifts.filter(
      (s) => s.studentId === student.id && s.status === 'attended'
    );
    let totalPay = 0;
    let fullCount = 0;
    let vCount = 0;
    for (const s of attended) {
      if (s.payType === '1') fullCount += 1;
      else if (s.payType === 'V') vCount += 1;
      totalPay += shiftPay(s.payType, s.attendance, settings.fullPayAmount, settings.vPayAmount);
      // payType undefined(配分前)は shiftPay が0を返す
    }

    return [student.grade, student.role, student.name, ...cells, fullCount + vCount, fullCount, vCount, totalPay];
  });

  // 社会人の行(全学生の下に2行空けて追加)。給与は区分固定(adultShiftPay)。
  // V単価は半日でも全額、1単価は半日半額、無給は0。1日数/V日数列は社会人には該当しないので空。
  const adultSummaryRows = adultList.map((adult) => {
    const cells = allDates.map((date) => {
      const shift = filteredShifts.find(
        (s) => s.studentId === adult.id && s.date === date && s.status === 'attended'
      );
      if (!shift) return '-';
      return shift.attendance === 'am' ? '午前' : shift.attendance === 'pm' ? '午後' : '○';
    });
    const attended = filteredShifts.filter((s) => s.studentId === adult.id && s.status === 'attended');
    let pay = 0;
    for (const s of attended) {
      pay += adultShiftPay(adult.adultPayType, s.attendance, settings.fullPayAmount, settings.vPayAmount);
    }
    const label = adult.adultPayType === 'none' ? '無給' : adult.adultPayType === '1' ? '1単価' : 'V単価';
    return ['社会人', label, adult.name, ...cells, attended.length, '', '', pay];
  });

  const sheetName = monthLabel ? `勤怠表_${monthLabel}` : '勤怠表';
  const blankRow = summaryHeaders.map(() => '');
  const attendanceSheetData = adultSummaryRows.length > 0
    ? [summaryHeaders, ...summaryRows, blankRow, blankRow, ...adultSummaryRows]
    : [summaryHeaders, ...summaryRows];
  const ws = XLSX.utils.aoa_to_sheet(attendanceSheetData);
  ws['!cols'] = [
    { wch: 6 },   // 学年
    { wch: 14 },  // 役職
    { wch: 12 },  // 氏名
    ...allDates.map(() => ({ wch: 7 })),
    { wch: 8 },
    { wch: 6 },
    { wch: 6 },
    { wch: 12 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // 給与集計 sheet: summary per student (attended only, half-day = 0.5)
  const payHeaders = ['学年', '役職', '氏名', '1日数', 'V日数', '合計日数', '給与合計(円)'];
  const payRows = orderedStudents.map((student) => {
    const attended = filteredShifts.filter(
      (s) => s.studentId === student.id && s.status === 'attended'
    );
    let pFull = 0, pV = 0, pTotalPay = 0;
    for (const s of attended) {
      if (s.payType === '1') pFull += 1;
      else if (s.payType === 'V') pV += 1;
      pTotalPay += shiftPay(s.payType, s.attendance, settings.fullPayAmount, settings.vPayAmount);
    }
    return [student.grade, student.role, student.name, pFull, pV, pFull + pV, pTotalPay];
  });

  const totalFullPay = payRows.reduce((acc, r) => acc + (r[3] as number), 0);
  const totalVPay = payRows.reduce((acc, r) => acc + (r[4] as number), 0);
  const totalPay = payRows.reduce((acc, r) => acc + (r[6] as number), 0);
  payRows.push(['', '', '合計', totalFullPay, totalVPay, totalFullPay + totalVPay, totalPay]);

  const ws2 = XLSX.utils.aoa_to_sheet([payHeaders, ...payRows]);
  ws2['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, '給与集計');

  const fileName = monthLabel
    ? `勤怠表_${monthLabel}_${settings.clubName}.xlsx`
    : `勤怠表_${settings.clubName}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/** Excelの数式インジェクション対策: = + - @ で始まる値をシングルクォートで無害化する */
function safeText(value: string): string {
  if (!value) return '';
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

/**
 * 勤怠表(出勤記録のみ)をExcel出力する。給与情報は一切含まない。
 * 「誰が・いつ出勤したか」だけを月単位で一覧にするためのもの。
 * 給与込みの勤怠表が必要な場合は exportAttendanceReport (給与配分ページ) を使う。
 *
 * 対象日は「開設日」と「実際に出勤記録がある日」の和集合。
 * (開設フラグを後から外した日でも、記録済みの出勤が表から消えないようにするため)
 * 行は在籍中の学生に加え、その月に出勤記録がある退会者も含める(記録の取りこぼし防止)。
 */
export function exportAttendanceOnlyXlsx(
  students: Student[],
  shifts: ShiftAssignment[],
  seasonDays: SeasonDay[],
  monthKey: string, // "2026-07" 形式。シート名とファイル名に使う
  startDate: string,
  endDate: string,
): void {
  const attendedInMonth = shifts.filter(
    (s) => s.status === 'attended' && s.date >= startDate && s.date <= endDate,
  );

  const dateSet = new Set<string>(
    seasonDays
      .filter((d) => d.isOpen && d.date >= startDate && d.date <= endDate)
      .map((d) => d.date),
  );
  for (const s of attendedInMonth) dateSet.add(s.date);
  const allDates = Array.from(dateSet).sort();
  if (allDates.length === 0) return;

  const attendedIds = new Set(attendedInMonth.map((s) => s.studentId));
  const orderedStudents = sortStudents(students.filter((s) => s.isActive || attendedIds.has(s.id)));

  // studentId:date → シフト の索引
  const byKey = new Map<string, ShiftAssignment>();
  for (const s of attendedInMonth) byKey.set(`${s.studentId}:${s.date}`, s);

  const header1 = [
    '学年', '役職', '氏名',
    ...allDates.map((d) => format(parseISO(d), 'M/d')),
    '出勤回数', '出勤日数',
  ];
  const header2 = [
    '', '', '',
    ...allDates.map((d) => format(parseISO(d), 'E', { locale: ja })),
    '', '',
  ];

  const rows = orderedStudents.map((student) => {
    let times = 0; // 出勤した回数(半日も1回と数える)
    let days = 0;  // 出勤日数(半日は0.5)
    const cells = allDates.map((date) => {
      const shift = byKey.get(`${student.id}:${date}`);
      if (!shift) return '';
      times += 1;
      if (shift.attendance === 'am') { days += 0.5; return '午前'; }
      if (shift.attendance === 'pm') { days += 0.5; return '午後'; }
      days += 1;
      return '○';
    });
    return [
      safeText(student.grade),
      safeText(student.role),
      safeText(student.name),
      ...cells,
      times,
      days,
    ];
  });

  // 日別の出勤人数 / うちPWC保持者。表の中身と必ず一致するよう同じ索引から数える。
  const dailyTotals = allDates.map(
    (date) => orderedStudents.filter((st) => byKey.has(`${st.id}:${date}`)).length,
  );
  const dailyPwc = allDates.map(
    (date) => orderedStudents.filter((st) => st.hasPwc && byKey.has(`${st.id}:${date}`)).length,
  );
  const totalRow = ['', '', '合計', ...dailyTotals.map((n) => n || ''), '', ''];
  const pwcRow = ['', '', 'PWC', ...dailyPwc.map((n) => n || ''), '', ''];

  const ws = XLSX.utils.aoa_to_sheet([header1, header2, ...rows, totalRow, pwcRow]);
  ws['!cols'] = [
    { wch: 6 },  // 学年
    { wch: 12 }, // 役職
    { wch: 14 }, // 氏名
    ...allDates.map(() => ({ wch: 6 })),
    { wch: 9 },  // 出勤回数
    { wch: 9 },  // 出勤日数
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `勤怠表_${monthKey}`);
  XLSX.writeFile(wb, `勤怠表_${monthKey}.xlsx`);
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
