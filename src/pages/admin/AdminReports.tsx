import { useMemo } from 'react';
import { useStudentStore } from '@/store/studentStore';
import { useShiftStore } from '@/store/shiftStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useSeasonStore } from '@/store/seasonStore';
import { Download, TrendingUp } from 'lucide-react';
import { exportAttendanceReport } from '@/utils/export';
import { computeDayTotalPay } from '@/utils/payCalc';

export default function AdminReports() {
  const { students } = useStudentStore();
  const { shifts, getSummaries } = useShiftStore();
  const { settings } = useSettingsStore();
  const { days } = useSeasonStore();

  const summaries = useMemo(() => getSummaries(), [shifts, students]);
  const activeStudents = students.filter((s) => s.isActive);

  const totalStats = useMemo(() => {
    // 1:V比率用（シフト割当済み・未欠席）
    const fullPayDays = summaries.reduce((acc, s) => acc + s.fullPayDays, 0);
    const vPayDays = summaries.reduce((acc, s) => acc + s.vPayDays, 0);
    // 確定給与（出勤済みのみ）
    const attendedFullPayDays = summaries.reduce((acc, s) => acc + s.attendedFullPayDays, 0);
    const attendedVPayDays = summaries.reduce((acc, s) => acc + s.attendedVPayDays, 0);
    const totalPay = summaries.reduce((acc, s) => acc + s.totalPay, 0);
    const absentDays = summaries.reduce((acc, s) => acc + s.absentDays, 0);
    // 市役所予算
    const budgetTotal = days.filter((d) => d.isOpen).reduce((acc, d) => acc + d.cityMinimum * settings.fullPayAmount, 0);
    // 計画給与（発行済みシフトの予算内払額）
    const plannedPayTotal = days.filter((d) => d.isOpen && d.actualSlots > 0).reduce(
      (acc, d) => acc + computeDayTotalPay(d.cityMinimum, d.actualSlots, settings.fullPayAmount, settings.vPayAmount), 0
    );
    return { fullPayDays, vPayDays, attendedFullPayDays, attendedVPayDays, totalPay, absentDays, budgetTotal, plannedPayTotal };
  }, [summaries, days, settings]);

  function handleExport() {
    exportAttendanceReport(activeStudents, shifts, settings, days);
  }

  // Sort by fullPayRatio descending
  const sortedSummaries = [...summaries].sort((a, b) => {
    const ra = a.totalDays > 0 ? a.fullPayDays / a.totalDays : 0;
    const rb = b.totalDays > 0 ? b.fullPayDays / b.totalDays : 0;
    return rb - ra;
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">レポート</h1>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
        >
          <Download size={16} />
          勤怠表をXLSX出力
        </button>
      </div>

      {/* Total stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="市役所予算総額" value={`¥${totalStats.budgetTotal.toLocaleString()}`} sub="Σ(ミニマム×9,100円)" />
        <StatCard label="計画給与総額" value={`¥${totalStats.plannedPayTotal.toLocaleString()}`} sub="発行済みシフト分" />
        <StatCard label="確定給与総額" value={`¥${totalStats.totalPay.toLocaleString()}`} sub="出勤確定分のみ" color="green" />
        <StatCard label="延べ欠席日数" value={`${totalStats.absentDays}日`} sub="全学生合計" color="red" />
      </div>

      {/* 1/V breakdown */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="シフト割当 1日数" value={`${totalStats.fullPayDays}日`} sub="¥9,100 枠（割当済）" />
        <StatCard label="シフト割当 V日数" value={`${totalStats.vPayDays}日`} sub="¥2,000 枠（割当済）" />
        <StatCard label="出勤確定 1日数" value={`${totalStats.attendedFullPayDays}日`} sub="実際に出勤した1枠" color="green" />
        <StatCard label="出勤確定 V日数" value={`${totalStats.attendedVPayDays}日`} sub="実際に出勤したV枠" color="green" />
      </div>

      {/* Per-student summary */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
          <TrendingUp size={16} className="text-gray-500" />
          <span className="font-semibold text-gray-700 text-sm">学生別 集計（1:V比率順）</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">氏名</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">出勤</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">欠席</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">1日数</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">V日数</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">1の割合</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">確定給与</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedSummaries.map((summary) => {
              const student = activeStudents.find((s) => s.id === summary.studentId);
              if (!student) return null;
              const ratio = summary.totalDays > 0 ? summary.fullPayDays / summary.totalDays : 0;
              const isImbalanced = ratio > 0.7 || (ratio < 0.3 && summary.totalDays > 0);

              return (
                <tr key={summary.studentId} className={`hover:bg-gray-50 ${isImbalanced ? 'bg-yellow-50/50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {student.name}
                    {isImbalanced && <span className="ml-2 text-yellow-600 text-xs">⚠</span>}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-700">{summary.attendedDays}</td>
                  <td className="px-4 py-3 text-center">
                    {summary.absentDays > 0 ? (
                      <span className="text-red-600 font-semibold">{summary.absentDays}</span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold">
                      {summary.attendedFullPayDays}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs font-bold">
                      {summary.attendedVPayDays}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-400 rounded-full"
                          style={{ width: `${ratio * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-600 w-10 text-right">
                        {Math.round(ratio * 100)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-gray-800">
                    ¥{summary.totalPay.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        ⚠ は1の割合が70%超または30%未満の学生 / 出勤・1日数・V日数・確定給与はすべて出勤確定分のみ
      </p>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  const valueColor = color === 'green' ? 'text-green-700' : color === 'red' ? 'text-red-600' : 'text-gray-800';
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${valueColor}`}>{value}</p>
      <p className="text-xs text-gray-400">{sub}</p>
    </div>
  );
}
