import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { ShiftAssignment, Student, SeasonDay, Availability } from '@/types';

interface Props {
  days: SeasonDay[];
  students: Student[];
  shifts: ShiftAssignment[];
  /** 可否データ（オプション: 表示すると○マークが出る） */
  availabilities?: Availability[];
  selectedDate?: string;
  onDateClick?: (date: string) => void;
  /** コンパクト表示（小さいセル） */
  compact?: boolean;
  /** 給与種別（1/V）を隠して出勤のみ表示（学生向け） */
  hidePayType?: boolean;
}

export default function ShiftGrid({
  days,
  students,
  shifts,
  availabilities = [],
  selectedDate,
  onDateClick,
  compact = false,
  hidePayType = false,
}: Props) {
  const openDays = days.filter((d) => d.isOpen);
  const activeStudents = students.filter((s) => s.isActive);

  // shiftMap: "studentId:date" -> ShiftAssignment
  const shiftMap = useMemo(() => {
    const m = new Map<string, ShiftAssignment>();
    for (const s of shifts) {
      if (s.status !== 'cancelled') m.set(`${s.studentId}:${s.date}`, s);
    }
    return m;
  }, [shifts]);

  // availMap: "studentId:date" -> boolean
  const availMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const a of availabilities) m.set(`${a.studentId}:${a.date}`, a.available);
    return m;
  }, [availabilities]);

  // 各学生のシフト数（ソート用）
  const shiftCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of shifts) {
      if (s.status !== 'cancelled') m.set(s.studentId, (m.get(s.studentId) ?? 0) + 1);
    }
    return m;
  }, [shifts]);

  // 3連勤以上の検出: "studentId:date" -> true
  const consecutiveWarning = useMemo(() => {
    const warn = new Set<string>();
    const sortedDates = openDays.map((d) => d.date).sort();
    for (const student of activeStudents) {
      let streak: string[] = [];
      for (let i = 0; i < sortedDates.length; i++) {
        const date = sortedDates[i];
        const hasShift = shiftMap.has(`${student.id}:${date}`);
        if (hasShift) {
          streak.push(date);
        } else {
          if (streak.length >= 3) {
            for (const d of streak) warn.add(`${student.id}:${d}`);
          }
          streak = [];
        }
      }
      if (streak.length >= 3) {
        for (const d of streak) warn.add(`${student.id}:${d}`);
      }
    }
    return warn;
  }, [openDays, activeStudents, shiftMap]);

  const cellSize = compact ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  const nameWidth = compact ? 'w-20' : 'w-24';

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-xs select-none" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: compact ? '80px' : '96px' }} />
          {openDays.map((d) => (
            <col key={d.date} style={{ width: compact ? '32px' : '40px' }} />
          ))}
          <col style={{ width: compact ? '32px' : '40px' }} />
        </colgroup>
        <thead>
          {/* Month row */}
          <MonthHeaderRow openDays={openDays} compact={compact} />
          {/* Date row */}
          <tr>
            <th className={`sticky left-0 z-20 bg-gray-50 border border-gray-200 ${nameWidth} px-1 py-1 text-left font-semibold text-gray-600`}>
              氏名
            </th>
            {openDays.map((d) => {
              const dow = format(parseISO(d.date), 'E', { locale: ja });
              const isSat = dow === '土';
              const isSun = dow === '日';
              const isSelected = d.date === selectedDate;
              return (
                <th
                  key={d.date}
                  className={`border border-gray-200 font-medium cursor-pointer transition-colors ${cellSize} ${
                    isSelected
                      ? 'bg-blue-500 text-white'
                      : isSun
                      ? 'bg-red-50 text-red-600'
                      : isSat
                      ? 'bg-blue-50 text-blue-600'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                  onClick={() => onDateClick?.(d.date)}
                >
                  <div className="flex flex-col items-center leading-tight">
                    <span>{format(parseISO(d.date), 'd')}</span>
                    <span className="text-gray-400" style={{ fontSize: '9px' }}>{dow}</span>
                  </div>
                </th>
              );
            })}
            <th className="border border-gray-200 bg-gray-50 font-semibold text-gray-600 text-center">
              計
            </th>
          </tr>
        </thead>
        <tbody>
          {activeStudents.map((student) => {
            const count = shiftCounts.get(student.id) ?? 0;
            return (
              <tr key={student.id} className="hover:bg-yellow-50/30">
                <td className={`sticky left-0 z-10 bg-white border border-gray-200 px-1.5 font-medium text-gray-800 truncate ${nameWidth}`}
                    title={`${student.name}${student.grade ? ` (${student.grade})` : ''}${student.role ? ` ${student.role}` : ''}`}>
                  <span className="flex items-center gap-0.5">
                    {student.isLeader && <span className="text-red-500" style={{ fontSize: '9px' }}>★</span>}
                    {student.hasPwc && <span className="text-blue-500" style={{ fontSize: '9px' }}>P</span>}
                    <span className="truncate">{student.name}</span>
                    {student.grade && <span className="text-gray-400 ml-0.5 shrink-0" style={{ fontSize: '9px' }}>{student.grade.replace('年', '')}</span>}
                  </span>
                </td>
                {openDays.map((d) => {
                  const shift = shiftMap.get(`${student.id}:${d.date}`);
                  const avail = availMap.get(`${student.id}:${d.date}`);
                  const isSelected = d.date === selectedDate;
                  const isConsecutiveWarn = consecutiveWarning.has(`${student.id}:${d.date}`);

                  return (
                    <td
                      key={d.date}
                      className={`border border-gray-200 text-center cursor-pointer transition-colors ${cellSize} ${
                        isConsecutiveWarn ? 'bg-red-100' : isSelected ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => onDateClick?.(d.date)}
                      title={isConsecutiveWarn ? '3連勤以上' : undefined}
                    >
                      <CellContent shift={shift} avail={avail} hidePayType={hidePayType} />
                    </td>
                  );
                })}
                {/* Count */}
                <td className="border border-gray-200 text-center font-semibold text-gray-600 bg-gray-50">
                  {count > 0 ? count : ''}
                </td>
              </tr>
            );
          })}
          {/* Bottom row: total per day */}
          <tr className="bg-gray-50">
            <td className="sticky left-0 z-10 bg-gray-50 border border-gray-200 px-1.5 font-semibold text-gray-600">
              計
            </td>
            {openDays.map((d) => {
              const count = shifts.filter((s) => s.date === d.date && s.status !== 'cancelled').length;
              return (
                <td
                  key={d.date}
                  className={`border border-gray-200 text-center font-semibold ${cellSize} cursor-pointer text-gray-700`}
                  onClick={() => onDateClick?.(d.date)}
                >
                  {count > 0 ? count : ''}
                </td>
              );
            })}
            <td className="border border-gray-200 bg-gray-50" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CellContent({ shift, avail, hidePayType }: { shift?: ShiftAssignment; avail?: boolean; hidePayType?: boolean }) {
  if (shift) {
    const isDraft = shift.status === 'draft';
    if (hidePayType) {
      // シフト表（配布用）: 勤怠ステータスに関係なくシフト割当として表示
      return (
        <span
          className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-bold ${
            isDraft ? 'bg-blue-100 text-blue-400' : 'bg-blue-500 text-white'
          }`}
          style={{ fontSize: '11px' }}
        >
          出
        </span>
      );
    }
    // 管理者向け（1/V表示）: 勤怠に関係なくシフト割当として1/Vを表示
    return (
      <span
        className={`inline-flex items-center justify-center w-6 h-6 rounded font-bold ${
          shift.payType === '1'
            ? isDraft ? 'bg-green-100 text-green-600 opacity-60' : 'bg-green-500 text-white'
            : isDraft ? 'bg-orange-100 text-orange-500 opacity-60' : 'bg-orange-400 text-white'
        }`}
        style={{ fontSize: '11px' }}
        title={isDraft ? '下書き' : '公開済み'}
      >
        {shift.payType}
      </span>
    );
  }
  if (avail === true) {
    return <span className="text-green-400" style={{ fontSize: '12px' }}>○</span>;
  }
  if (avail === false) {
    return <span className="text-gray-200" style={{ fontSize: '10px' }}>×</span>;
  }
  return null;
}

/** 月ごとに colspan でまとめたヘッダ行 */
function MonthHeaderRow({ openDays, compact }: { openDays: SeasonDay[]; compact: boolean }) {
  const groups: { month: string; count: number }[] = [];
  for (const d of openDays) {
    const m = format(parseISO(d.date), 'M月', { locale: ja });
    if (groups.length > 0 && groups[groups.length - 1].month === m) {
      groups[groups.length - 1].count++;
    } else {
      groups.push({ month: m, count: 1 });
    }
  }

  return (
    <tr>
      <th className={`sticky left-0 z-20 bg-gray-100 border border-gray-200 ${compact ? 'w-20' : 'w-24'}`} />
      {groups.map((g) => (
        <th
          key={g.month}
          colSpan={g.count}
          className="border border-gray-200 bg-gray-100 text-center font-semibold text-gray-600 py-1"
          style={{ fontSize: '11px' }}
        >
          {g.month}
        </th>
      ))}
      <th className="border border-gray-200 bg-gray-100" />
    </tr>
  );
}
