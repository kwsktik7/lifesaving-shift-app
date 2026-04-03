import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { firebaseSignOut } from '@/utils/auth';
import {
  LayoutDashboard, CalendarDays, Users,
  Settings, LogOut, CheckSquare, Calendar, Send, Coins
} from 'lucide-react';

const nav = [
  { to: '/admin', label: 'ダッシュボード', icon: LayoutDashboard, end: true },
  { to: '/admin/availability', label: '可否一覧', icon: Users },
  { to: '/admin/shift/edit', label: 'シフト作成', icon: CalendarDays },
  { to: '/admin/shift/calendar', label: 'シフト表（管理）', icon: Calendar },
  { to: '/admin/shift/publish', label: 'シフト発行', icon: Send },
  { to: '/admin/pay', label: '給与配分', icon: Coins },
  { to: '/admin/attendance', label: '勤怠入力', icon: CheckSquare },
  { to: '/admin/settings', label: '設定', icon: Settings },
];

export default function AdminShell() {
  const navigate = useNavigate();

  function logout() {
    firebaseSignOut();
    navigate('/login');
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏄</span>
            <div>
              <p className="text-xs font-bold text-gray-800 leading-tight">逗子LSC</p>
              <p className="text-xs text-gray-400">管理者</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-gray-200">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 w-full transition-colors"
          >
            <LogOut size={18} />
            ログアウト
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
