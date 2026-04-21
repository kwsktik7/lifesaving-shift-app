import { Outlet, useNavigate } from 'react-router-dom';
import { firebaseSignOut, getSession } from '@/utils/auth';
import { LogOut } from 'lucide-react';

export default function StudentShell() {
  const navigate = useNavigate();
  const session = getSession();

  function logout() {
    firebaseSignOut();
    navigate('/login');
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/pwa-192x192.png" alt="逗子SLSC" width={28} height={28} className="rounded-full object-cover" />
          <div>
            <p className="text-sm font-bold text-gray-800">逗子SLSCシフト管理</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{session?.studentName}</span>
          <button
            onClick={logout}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
