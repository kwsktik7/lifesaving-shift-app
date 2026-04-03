import { useState, useMemo } from 'react';
import { useSeasonStore } from '@/store/seasonStore';
import { useStudentStore } from '@/store/studentStore';
import { useAvailabilityStore } from '@/store/availabilityStore';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { AvailabilityStatus, Availability } from '@/types';

const STATUS_LABEL: Record<AvailabilityStatus, string> = {
  yes: '○', am: '午前', pm: '午後', undecided: '?', no: '×',
};

function statusBadge(status: AvailabilityStatus) {
  switch (status) {
    case 'yes': return 'bg-green-100 text-green-800';
    case 'am': return 'bg-yellow-100 text-yellow-800';
    case 'pm': return 'bg-orange-100 text-orange-700';
    case 'undecided': return 'bg-purple-100 text-purple-800';
    case 'no': return 'bg-red-50 text-red-600';
  }
}

function statusCellBg(status: AvailabilityStatus | undefined) {
  switch (status) {
    case 'yes': return 'text-green-600 font-bold';
    case 'am': return 'text-yellow-600 font-bold';
    case 'pm': return 'text-orange-500 font-bold';
    case 'undecided': return 'text-purple-500 font-bold';
    case 'no': return 'text-red-400';
    default: return 'text-gray-300';
  }
}

export default function AdminAvailability() {
  const { days } = useSeasonStore();
  const { students } = useStudentStore();
  const { availabilities } = useAvailabilityStore();
  const [view, setView] = useState<'by-date' | 'by-student'>('by-date');

  const activeStudents = students.filter((s) => s.isActive);

  // availMap: date → studentId → Availability
  const availMap = useMemo(() => {
    const m = new Map<string, Map<string, Availability>>();
    for (const a of availabilities) {
      if (!m.has(a.date)) m.set(a.date, new Map());
      m.get(a.date)!.set(a.studentId, a);
    }
    return m;
  }, [availabilities]);

  const openDays = days.filter((d) => d.isOpen);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">可否一覧</h1>
        <div className="flex rounded-lg overflow-hidden border border-gray-200">
          <button
            className={`px-4 py-2 text-sm font-medium ${view === 'by-date' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
            onClick={() => setView('by-date')}
          >日別</button>
          <button
            className={`px-4 py-2 text-sm font-medium ${view === 'by-student' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
            onClick={() => setView('by-student')}
          >学生別</button>
        </div>
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap gap-2 mb-4 text-xs text-gray-600">
        <span className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-green-100 text-green-800 flex items-center justify-center font-bold text-xs">○</span>終日可</span>
        <span className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-yellow-100 text-yellow-800 flex items-center justify-center font-bold" style={{ fontSize: '7px' }}>午前</span>午前のみ</span>
        <span className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-orange-100 text-orange-700 flex items-center justify-center font-bold" style={{ fontSize: '7px' }}>午後</span>午後のみ</span>
        <span className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-purple-100 text-purple-800 flex items-center justify-center font-bold text-xs">?</span>未定</span>
        <span className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-red-50 text-red-600 flex items-center justify-center font-bold text-xs">×</span>不可</span>
      </div>

      {view === 'by-date' ? (
        <ByDateView openDays={openDays} students={activeStudents} availMap={availMap} />
      ) : (
        <ByStudentView openDays={openDays} students={activeStudents} availMap={availMap} />
      )}
    </div>
  );
}

function ByDateView({ openDays, students, availMap }: {
  openDays: { date: string; cityMinimum: number; actualSlots: number }[];
  students: { id: string; name: string; isLeader?: boolean; hasPwc?: boolean; grade?: string }[];
  availMap: Map<string, Map<string, Availability>>;
}) {
  const [expandedMemos, setExpandedMemos] = useState<Set<string>>(new Set());

  const toggleMemoExpand = (date: string) => {
    setExpandedMemos((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {openDays.map((day) => {
        const dayMap = availMap.get(day.date) ?? new Map<string, Availability>();

        // Group students by status
        const yesStudents: typeof students = [];
        const amStudents: typeof students = [];
        const pmStudents: typeof students = [];
        const undecidedStudents: { student: typeof students[0]; note: string }[] = [];
        const noStudents: typeof students = [];
        const notSubmitted: typeof students = [];

        for (const s of students) {
          const a = dayMap.get(s.id);
          if (!a) { notSubmitted.push(s); continue; }
          const status = a.status ?? (a.available ? 'yes' : 'no');
          switch (status) {
            case 'yes': yesStudents.push(s); break;
            case 'am': amStudents.push(s); break;
            case 'pm': pmStudents.push(s); break;
            case 'undecided': undecidedStudents.push({ student: s, note: a.note ?? '' }); break;
            case 'no': noStudents.push(s); break;
          }
        }

        const availableAll = [...yesStudents, ...amStudents, ...pmStudents];
        const availLeaders = availableAll.filter((s) => s.isLeader);
        const availPwcCount = availableAll.filter((s) => s.hasPwc).length;
        const hasUndecidedMemos = undecidedStudents.some((u) => u.note);
        const isMemoExpanded = expandedMemos.has(day.date);

        return (
          <div key={day.date} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">
                {format(parseISO(day.date), 'M月d日(E)', { locale: ja })}
              </h3>
              <div className="flex gap-2 text-xs">
                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                  ミニマム {day.cityMinimum}名
                </span>
                <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                  ○ {yesStudents.length}名
                </span>
                {amStudents.length > 0 && (
                  <span className="bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full">
                    午前 {amStudents.length}名
                  </span>
                )}
                {pmStudents.length > 0 && (
                  <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">
                    午後 {pmStudents.length}名
                  </span>
                )}
                {undecidedStudents.length > 0 && (
                  <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                    未定 {undecidedStudents.length}名
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded-full ${availLeaders.length > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {availLeaders.length > 0 ? '✓' : '!'} 監視長
                </span>
                <span className={`px-2 py-0.5 rounded-full ${availPwcCount >= 2 ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                  PWC {availPwcCount}名
                </span>
              </div>
            </div>

            {/* 監視長・副監視長 */}
            {availLeaders.length > 0 && (
              <div className="mb-2">
                <span className="text-xs font-bold text-red-600 mr-2">★ 監視長・副監視長:</span>
                {availLeaders.map((s) => {
                  const a = dayMap.get(s.id);
                  const st = a?.status ?? 'yes';
                  return (
                    <span key={s.id} className={`text-xs px-2 py-1 rounded-lg mr-1 ${statusBadge(st)}`}>
                      {STATUS_LABEL[st]} {s.name}
                    </span>
                  );
                })}
              </div>
            )}

            {/* 終日可 */}
            {yesStudents.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {yesStudents.filter(s => !s.isLeader).map((s) => (
                  <span key={s.id} className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-lg">
                    {s.hasPwc && <span className="text-blue-500 mr-0.5">P</span>}
                    ○ {s.name}
                  </span>
                ))}
              </div>
            )}

            {/* 午前のみ */}
            {amStudents.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {amStudents.filter(s => !s.isLeader).map((s) => (
                  <span key={s.id} className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-lg">
                    {s.hasPwc && <span className="text-blue-500 mr-0.5">P</span>}
                    午前 {s.name}
                  </span>
                ))}
              </div>
            )}

            {/* 午後のみ */}
            {pmStudents.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {pmStudents.filter(s => !s.isLeader).map((s) => (
                  <span key={s.id} className="bg-orange-100 text-orange-700 text-xs px-2 py-1 rounded-lg">
                    {s.hasPwc && <span className="text-blue-500 mr-0.5">P</span>}
                    午後 {s.name}
                  </span>
                ))}
              </div>
            )}

            {/* 未定 */}
            {undecidedStudents.length > 0 && (
              <div className="mb-2">
                <div className="flex flex-wrap gap-1.5">
                  {undecidedStudents.map(({ student: s, note }) => (
                    <span key={s.id} className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-lg" title={note || undefined}>
                      {s.hasPwc && <span className="text-blue-500 mr-0.5">P</span>}
                      ? {s.name}
                      {note && <span className="ml-1 text-purple-400">📝</span>}
                    </span>
                  ))}
                </div>
                {/* メモ展開 */}
                {hasUndecidedMemos && (
                  <button
                    onClick={() => toggleMemoExpand(day.date)}
                    className="text-xs text-purple-500 hover:text-purple-700 mt-1.5 underline"
                  >
                    {isMemoExpanded ? 'メモを閉じる' : '未定メモを表示'}
                  </button>
                )}
                {isMemoExpanded && (
                  <div className="mt-2 space-y-1.5">
                    {undecidedStudents.filter(u => u.note).map(({ student: s, note }) => (
                      <div key={s.id} className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-xs">
                        <span className="font-bold text-purple-700">{s.name}:</span>
                        <span className="text-purple-600 ml-1">{note}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 不可 */}
            {noStudents.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {noStudents.map((s) => (
                  <span key={s.id} className="bg-red-50 text-red-600 text-xs px-2 py-1 rounded-lg">
                    × {s.name}
                  </span>
                ))}
              </div>
            )}

            {/* 未提出 */}
            {notSubmitted.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {notSubmitted.map((s) => (
                  <span key={s.id} className="bg-gray-100 text-gray-400 text-xs px-2 py-1 rounded-lg">
                    未 {s.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ByStudentView({ openDays, students, availMap }: {
  openDays: { date: string }[];
  students: { id: string; name: string; isLeader?: boolean; hasPwc?: boolean; grade?: string }[];
  availMap: Map<string, Map<string, Availability>>;
}) {
  const [selectedMemo, setSelectedMemo] = useState<{ name: string; date: string; note: string } | null>(null);

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="text-xs min-w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="sticky left-0 bg-white px-4 py-3 text-left font-semibold text-gray-700 border-r border-gray-200">
                氏名
              </th>
              {openDays.map((d) => (
                <th key={d.date} className="px-2 py-3 text-center font-medium text-gray-600 whitespace-nowrap">
                  {format(parseISO(d.date), 'M/d', { locale: ja })}
                  <br />
                  <span className="text-gray-400">{format(parseISO(d.date), 'E', { locale: ja })}</span>
                </th>
              ))}
              <th className="px-3 py-3 text-center font-semibold text-gray-700 border-l border-gray-200">計</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {students.map((student) => {
              let yesCount = 0;
              let partialCount = 0;
              return (
                <tr key={student.id} className="hover:bg-gray-50">
                  <td className="sticky left-0 bg-white px-4 py-2 font-medium text-gray-800 border-r border-gray-200 whitespace-nowrap">
                    <span className="flex items-center gap-0.5">
                      {student.isLeader && <span className="text-red-500" style={{ fontSize: '9px' }}>★</span>}
                      {student.hasPwc && <span className="text-blue-500" style={{ fontSize: '9px' }}>P</span>}
                      {student.name}
                    </span>
                  </td>
                  {openDays.map((d) => {
                    const dayMap = availMap.get(d.date);
                    const a = dayMap?.get(student.id);
                    const status = a ? (a.status ?? (a.available ? 'yes' : 'no')) : undefined;
                    if (status === 'yes') yesCount++;
                    if (status === 'am' || status === 'pm') partialCount++;
                    const hasNote = status === 'undecided' && a?.note;
                    return (
                      <td
                        key={d.date}
                        className={`px-2 py-2 text-center ${statusCellBg(status)} ${hasNote ? 'cursor-pointer hover:bg-purple-50' : ''}`}
                        style={{ fontSize: status === 'am' || status === 'pm' ? '8px' : undefined }}
                        title={hasNote ? `メモ: ${a!.note}` : undefined}
                        onClick={hasNote ? () => setSelectedMemo({
                          name: student.name,
                          date: format(parseISO(d.date), 'M月d日(E)', { locale: ja }),
                          note: a!.note,
                        }) : undefined}
                      >
                        {status ? STATUS_LABEL[status] : '-'}
                        {hasNote && <span className="block text-purple-300" style={{ fontSize: '7px', lineHeight: 1 }}>📝</span>}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center font-semibold text-gray-600 border-l border-gray-200">
                    {yesCount + partialCount > 0 ? (
                      <span>
                        {yesCount}
                        {partialCount > 0 && <span className="text-yellow-600 text-xs ml-0.5">+{partialCount}</span>}
                      </span>
                    ) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* メモ表示モーダル */}
      {selectedMemo && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setSelectedMemo(null)}>
          <div className="bg-white rounded-2xl max-w-sm w-full mx-4 p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800">{selectedMemo.name} — {selectedMemo.date}</h3>
            <p className="text-sm text-gray-500">未定メモ</p>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-700">
              {selectedMemo.note}
            </div>
            <button
              onClick={() => setSelectedMemo(null)}
              className="w-full py-2 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-700"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </>
  );
}
