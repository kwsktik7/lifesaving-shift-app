import { useMemo } from 'react';
import { useShiftStore } from '@/store/shiftStore';
import { useStudentStore } from '@/store/studentStore';
import { useSeasonStore } from '@/store/seasonStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useAvailabilityStore } from '@/store/availabilityStore';
import { format, parseISO, isFuture } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Users, CalendarDays, Coins, AlertCircle } from 'lucide-react';

function getMonthRanges(seasonStart: string, seasonEnd: string) {
  const start = parseISO(seasonStart);
  const end = parseISO(seasonEnd);
  const months: { label: string; startDate: string; endDate: string }[] = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const monthStart = new Date(y, m, 1);
    const monthEnd = new Date(y, m + 1, 0);
    months.push({
      label: `${m + 1}月`,
      startDate: monthStart < start ? seasonStart : format(monthStart, 'yyyy-MM-dd'),
      endDate: monthEnd > end ? seasonEnd : format(monthEnd, 'yyyy-MM-dd'),
    });
    cur = new Date(y, m + 1, 1);
  }
  return months;
}

export default function AdminDashboard() {
  const { shifts, getSummaries } = useShiftStore();
  const { students } = useStudentStore();
  const { days } = useSeasonStore();
  const { settings } = useSettingsStore();
  const { availabilities } = useAvailabilityStore();

  const stats = useMemo(() => {
    const activeStudents = students.filter((s) => s.isActive).length;
    const publishedShifts = shifts.filter((s) => s.status === 'published' || s.status === 'attended').length;
    const summaries = getSummaries();
    const totalPay = summaries.reduce((acc, s) => acc + s.totalPay, 0);
    // 市役所予算総額 = Σ(ミニマム × 9100)
    const totalBudget = days.filter((d) => d.isOpen).reduce((acc, d) => acc + d.cityMinimum * settings.fullPayAmount, 0);

    // Days with no shifts published
    const unpublishedOpenDays = days.filter((d) => d.isOpen && isFuture(parseISO(d.date))).filter((d) => {
      const dayShifts = shifts.filter((s) => s.date === d.date && (s.status === 'published' || s.status === 'attended'));
      return dayShifts.length === 0;
    });

    // Students who haven't submitted availability
    const studentsWithAvailability = new Set(availabilities.map((a) => a.studentId));
    const noSubmitCount = students.filter((s) => s.isActive && !studentsWithAvailability.has(s.id)).length;

    return { activeStudents, publishedShifts, totalPay, totalBudget, unpublishedOpenDays, noSubmitCount };
  }, [shifts, students, days, settings, availabilities, getSummaries]);

  const monthlyBudgets = useMemo(() => {
    const months = getMonthRanges(settings.seasonStart, settings.seasonEnd);
    return months.map((m) => {
      const mDays = days.filter((d) => d.isOpen && d.date >= m.startDate && d.date <= m.endDate);
      const budget = mDays.reduce((acc, d) => acc + d.cityMinimum * settings.fullPayAmount, 0);
      const attended = shifts.filter(
        (s) => s.date >= m.startDate && s.date <= m.endDate && s.status === 'attended'
      ).length;
      const published = shifts.filter(
        (s) => s.date >= m.startDate && s.date <= m.endDate && s.status === 'published'
      ).length;
      return { ...m, budget, openDays: mDays.length, attended, published };
    });
  }, [days, shifts, settings]);

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayShifts = shifts.filter((s) => s.date === today && s.status !== 'cancelled');

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">ダッシュボード</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={<Users size={20} />} label="登録学生数" value={`${stats.activeStudents}名`} color="blue" />
        <StatCard icon={<CalendarDays size={20} />} label="公開済みシフト" value={`${stats.publishedShifts}件`} color="green" />
        <StatCard icon={<Coins size={20} />} label="給与総額（概算）" value={`¥${stats.totalPay.toLocaleString()}`} color="purple" />
        <StatCard icon={<Coins size={20} />} label="市役所予算総額" value={`¥${stats.totalBudget.toLocaleString()}`} color="orange" />
      </div>

      {/* Alerts */}
      {(stats.unpublishedOpenDays.length > 0 || stats.noSubmitCount > 0) && (
        <div className="mb-8 space-y-3">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">注意事項</h2>
          {stats.noSubmitCount > 0 && (
            <Alert color="yellow" icon={<AlertCircle size={16} />}>
              {stats.noSubmitCount}名の学生がまだ可否を提出していません
            </Alert>
          )}
          {stats.unpublishedOpenDays.length > 0 && (
            <Alert color="orange" icon={<AlertCircle size={16} />}>
              シフト未公開の営業日が {stats.unpublishedOpenDays.length}日 あります（
              {stats.unpublishedOpenDays.slice(0, 3).map((d) =>
                format(parseISO(d.date), 'M/d', { locale: ja })
              ).join('、')}
              {stats.unpublishedOpenDays.length > 3 ? '...' : ''}）
            </Alert>
          )}
        </div>
      )}

      {/* Monthly budget */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">月別予算</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {monthlyBudgets.map((m) => (
            <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-gray-800">{m.label}</span>
                <span className="text-xs text-gray-400">{m.openDays}日間</span>
              </div>
              <p className="text-lg font-bold text-gray-800 mb-2">¥{m.budget.toLocaleString()}</p>
              <div className="flex gap-3 text-xs">
                <span className="text-green-600">出勤確定: {m.attended}人日</span>
                <span className="text-amber-600">未入力: {m.published}人日</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Today's shifts */}
      <div>
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
          今日のシフト ({format(new Date(), 'M月d日(E)', { locale: ja })})
        </h2>
        {todayShifts.length === 0 ? (
          <p className="text-gray-400 text-sm">今日はシフトがありません</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {todayShifts.map((shift) => {
              const student = students.find((s) => s.id === shift.studentId);
              return (
                <div key={shift.id} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-gray-800">{student?.name ?? '不明'}</span>
                  <div className="flex items-center gap-2">
                    <PayBadge payType={shift.payType} />
                    <StatusBadge status={shift.status} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${colors[color]}`}>
        {icon}
      </div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-800">{value}</p>
    </div>
  );
}

function Alert({ children, color, icon }: { children: React.ReactNode; color: string; icon: React.ReactNode }) {
  const colors: Record<string, string> = {
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    orange: 'bg-orange-50 border-orange-200 text-orange-800',
  };
  return (
    <div className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm ${colors[color]}`}>
      {icon}
      {children}
    </div>
  );
}

function PayBadge({ payType }: { payType: string }) {
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
      payType === '1' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
    }`}>
      {payType === '1' ? '1 (¥9,100)' : 'V (¥2,000)'}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: '下書き', cls: 'bg-gray-100 text-gray-600' },
    published: { label: '公開', cls: 'bg-blue-100 text-blue-700' },
    attended: { label: '出勤', cls: 'bg-green-100 text-green-700' },
    absent: { label: '欠席', cls: 'bg-red-100 text-red-700' },
    cancelled: { label: 'キャンセル', cls: 'bg-gray-100 text-gray-400' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}
