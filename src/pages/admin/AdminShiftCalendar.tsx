import { useSeasonStore } from '@/store/seasonStore';
import { useStudentStore } from '@/store/studentStore';
import { useShiftStore } from '@/store/shiftStore';
import { Printer } from 'lucide-react';
import ShiftGrid from '@/components/ShiftGrid';

export default function AdminShiftCalendar() {
  const { days } = useSeasonStore();
  const { students } = useStudentStore();
  const { shifts } = useShiftStore();

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">シフト表</h1>
          <p className="text-xs text-gray-400 mt-1">
            <span className="inline-block w-4 h-4 rounded bg-green-500 mr-1 align-middle" />1（¥9,100）
            <span className="inline-block w-4 h-4 rounded bg-orange-400 mr-1 align-middle" />V（¥2,000）
            <span className="text-green-400 mr-1">○</span>可否提出済み（シフト未割当）
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50"
        >
          <Printer size={16} />
          印刷
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 overflow-x-auto">
        <ShiftGrid
          days={days}
          students={students}
          shifts={shifts}
        />
      </div>
    </div>
  );
}
