import { useState } from 'react';
import { useSeasonStore } from '@/store/seasonStore';
import { useStudentStore } from '@/store/studentStore';
import { useShiftStore } from '@/store/shiftStore';
import { useSettingsStore } from '@/store/settingsStore';
import { FileSpreadsheet, Table, CalendarDays, Shield, Anchor, Users } from 'lucide-react';
import ShiftGrid from '@/components/ShiftGrid';
import { exportShiftScheduleXlsx } from '@/utils/exportShift';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';

export default function AdminShiftPublish() {
  const { days } = useSeasonStore();
  const { students } = useStudentStore();
  const { shifts } = useShiftStore();
  const { settings } = useSettingsStore();

  const [view, setView] = useState<'grid' | 'daily'>('daily');
  const [selectedDate, setSelectedDate] = useState<string>('');

  const publishedShifts = shifts.filter(
    (s) => s.status === 'published' || s.status === 'attended' || s.status === 'absent'
  );

  const shiftDays = days.filter((d) => d.isOpen && publishedShifts.some((s) => s.date === d.date));

  // 日別メンバー用
  const currentDate = selectedDate || shiftDays[0]?.date || '';
  const dayShifts = publishedShifts.filter((s) => s.date === currentDate);
  const dayMembers = dayShifts.map((shift) => {
    const student = students.find((s) => s.id === shift.studentId);
    return { shift, student };
  }).filter((m) => m.student).sort((a, b) => {
    // リーダー → PWC → その他、同カテゴリ内は学年降順
    if (a.student!.isLeader !== b.student!.isLeader) return a.student!.isLeader ? -1 : 1;
    if (a.student!.hasPwc !== b.student!.hasPwc) return a.student!.hasPwc ? -1 : 1;
    return b.student!.grade.localeCompare(a.student!.grade);
  });

  const currentDay = days.find((d) => d.date === currentDate);
  const leaderCount = dayMembers.filter((m) => m.student!.isLeader).length;
  const pwcCount = dayMembers.filter((m) => m.student!.hasPwc).length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">シフト発行</h1>
          <p className="text-xs text-gray-400 mt-1">
            管理者向けのシフト確認と、全体配布用のExcel出力
          </p>
        </div>
        <button
          onClick={() => exportShiftScheduleXlsx(students, publishedShifts, days, settings.clubName)}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
        >
          <FileSpreadsheet size={16} />
          Excel出力（配布用）
        </button>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setView('daily')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            view === 'daily' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <CalendarDays size={15} />
          日別メンバー
        </button>
        <button
          onClick={() => setView('grid')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            view === 'grid' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <Table size={15} />
          一覧表
        </button>
      </div>

      {view === 'daily' ? (
        /* ===== 日別メンバービュー ===== */
        <div className="flex gap-6">
          {/* Date list */}
          <aside className="w-48 flex-shrink-0">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                シフト日
              </div>
              <div className="overflow-y-auto max-h-[600px]">
                {shiftDays.map((d) => {
                  const count = publishedShifts.filter((s) => s.date === d.date).length;
                  const isWeekend = [0, 6].includes(parseISO(d.date).getDay());
                  return (
                    <button
                      key={d.date}
                      className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-100 flex items-center justify-between transition-colors ${
                        currentDate === d.date ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                      onClick={() => setSelectedDate(d.date)}
                    >
                      <span className={isWeekend ? 'text-red-600' : ''}>
                        {format(parseISO(d.date), 'M/d(E)', { locale: ja })}
                      </span>
                      <span className="text-xs text-gray-400">{count}名</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* Member panel */}
          {currentDate && (
            <div className="flex-1 space-y-4">
              {/* Header */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-800 text-lg">
                    {format(parseISO(currentDate), 'M月d日(E)', { locale: ja })}
                  </h2>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5">
                      <Users size={15} className="text-gray-500" />
                      <span className="font-bold text-gray-700">{dayMembers.length}名</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Shield size={15} className="text-red-500" />
                      <span className="font-bold text-red-600">{leaderCount}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Anchor size={15} className="text-blue-500" />
                      <span className="font-bold text-blue-600">{pwcCount}</span>
                    </div>
                  </div>
                </div>
                {currentDay && (
                  <p className="text-xs text-gray-400 mt-1">
                    市役所ミニマム: {currentDay.cityMinimum}名 / 配置: {currentDay.actualSlots}名
                  </p>
                )}
              </div>

              {/* Warnings */}
              {leaderCount === 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700 font-medium">
                  ⚠ 監視長・副監視長がいません
                </div>
              )}
              {pwcCount < 2 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700 font-medium">
                  ⚠ PWC免許保持者が{pwcCount}名しかいません（推奨: 2名以上）
                </div>
              )}

              {/* Member list */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="divide-y divide-gray-100">
                  {dayMembers.map(({ shift, student }) => {
                    if (!student) return null;
                    return (
                      <div key={shift.id} className={`px-4 py-3 flex items-center gap-3 ${
                        student.isLeader ? 'bg-red-50/40' : ''
                      }`}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-800">{student.name}</span>
                            {student.isLeader && (
                              <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                                <Shield size={10} />
                                監視長
                              </span>
                            )}
                            {student.hasPwc && (
                              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                                <Anchor size={10} />
                                PWC
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-400">{student.grade} / {student.role || 'ガード'}</span>
                        </div>
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">シフト</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-3 text-center">
                  <p className="text-xs text-gray-500">合計</p>
                  <p className="text-xl font-bold text-gray-800">{dayMembers.length}<span className="text-xs font-normal text-gray-400">名</span></p>
                </div>
                <div className="bg-red-50 rounded-lg border border-red-200 p-3 text-center">
                  <p className="text-xs text-red-500 flex items-center justify-center gap-1"><Shield size={12} />監視長</p>
                  <p className="text-xl font-bold text-red-700">{leaderCount}<span className="text-xs font-normal text-red-400">名</span></p>
                </div>
                <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                  <p className="text-xs text-blue-500 flex items-center justify-center gap-1"><Anchor size={12} />PWC</p>
                  <p className="text-xl font-bold text-blue-700">{pwcCount}<span className="text-xs font-normal text-blue-400">名</span></p>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ===== 一覧表（従来のShiftGrid） ===== */
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4 overflow-x-auto">
            <div className="mb-3 flex items-center gap-4 text-xs text-gray-500">
              <span>
                <span className="inline-flex w-5 h-5 rounded-full bg-blue-500 text-white items-center justify-center font-bold mr-1">出</span>
                シフト割当
              </span>
            </div>
            <ShiftGrid
              days={days}
              students={students}
              shifts={publishedShifts}
              hidePayType
            />
          </div>
          <p className="text-xs text-gray-400 mt-3">
            ※ Excel出力は学生に配布用です。給与区分（1/V）は含まれません。
          </p>
        </>
      )}
    </div>
  );
}
