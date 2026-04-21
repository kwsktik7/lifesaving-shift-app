import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useSeasonStore } from '@/store/seasonStore';
import { useStudentStore } from '@/store/studentStore';
import { useAvailabilityStore } from '@/store/availabilityStore';
import { useShiftStore } from '@/store/shiftStore';
import { getSession } from '@/utils/auth';

// Auth
import LoginPage from '@/pages/LoginPage';

// Layout
import AdminShell from '@/components/layout/AdminShell';
import StudentShell from '@/components/layout/StudentShell';

// Admin pages
import AdminDashboard from '@/pages/admin/AdminDashboard';
import AdminAvailability from '@/pages/admin/AdminAvailability';
import AdminShiftEdit from '@/pages/admin/AdminShiftEdit';
import AdminShiftPublish from '@/pages/admin/AdminShiftPublish';
import AdminPayAllocation from '@/pages/admin/AdminPayAllocation';
import AdminAttendance from '@/pages/admin/AdminAttendance';
import AdminSettings from '@/pages/admin/AdminSettings';

// Student pages
import StudentHome from '@/pages/student/StudentHome';
import StudentAvailability from '@/pages/student/StudentAvailability';

function RequireAuth({ role, children }: { role: 'admin' | 'student'; children: React.ReactNode }) {
  const session = getSession();
  if (!session || session.role !== role) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { settings, _ready: settingsReady } = useSettingsStore();
  const { initSeason, _ready: seasonReady } = useSeasonStore();
  // students/availability/shifts は各ページが使う時に読む(ログイン画面は待たない)
  useStudentStore();
  useAvailabilityStore();
  useShiftStore();

  useEffect(() => {
    if (settingsReady && seasonReady) {
      initSeason(settings.seasonStart, settings.seasonEnd);
    }
  }, [settings.seasonStart, settings.seasonEnd, initSeason, settingsReady, seasonReady]);

  // Firestoreスナップショット到着を全画面で待たない。
  // 各ページが必要なデータの_readyを自分で判定し、必要ならページ内で同期中UIを出す。
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Admin routes */}
        <Route
          path="/admin"
          element={
            <RequireAuth role="admin">
              <AdminShell />
            </RequireAuth>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="availability" element={<AdminAvailability />} />
          <Route path="shift/edit" element={<AdminShiftEdit />} />
          <Route path="shift/publish" element={<AdminShiftPublish />} />
          <Route path="pay" element={<AdminPayAllocation />} />
          <Route path="attendance" element={<AdminAttendance />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>

        {/* Student routes */}
        <Route
          path="/student"
          element={
            <RequireAuth role="student">
              <StudentShell />
            </RequireAuth>
          }
        >
          <Route index element={<StudentHome />} />
          <Route path="availability" element={<StudentAvailability />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
