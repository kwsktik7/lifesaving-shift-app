import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useSeasonStore } from '@/store/seasonStore';
import { useStudentStore } from '@/store/studentStore';
import { useAvailabilityStore } from '@/store/availabilityStore';
import { useShiftStore } from '@/store/shiftStore';
import { getSession } from '@/utils/auth';
import { isFirebaseConfigured } from '@/lib/firebase';

// Auth
import LoginPage from '@/pages/LoginPage';

// Layout
import AdminShell from '@/components/layout/AdminShell';
import StudentShell from '@/components/layout/StudentShell';

// Admin pages
import AdminDashboard from '@/pages/admin/AdminDashboard';
import AdminAvailability from '@/pages/admin/AdminAvailability';
import AdminShiftEdit from '@/pages/admin/AdminShiftEdit';
import AdminShiftCalendar from '@/pages/admin/AdminShiftCalendar';
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

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4">🏄</div>
        <div className="animate-pulse text-gray-500 text-sm">読み込み中...</div>
      </div>
    </div>
  );
}

export default function App() {
  const { settings, _ready: settingsReady } = useSettingsStore();
  const { initSeason, _ready: seasonReady } = useSeasonStore();
  const { _ready: studentsReady } = useStudentStore();
  const { _ready: availReady } = useAvailabilityStore();
  const { _ready: shiftsReady } = useShiftStore();

  useEffect(() => {
    if (settingsReady && seasonReady) {
      initSeason(settings.seasonStart, settings.seasonEnd);
    }
  }, [settings.seasonStart, settings.seasonEnd, initSeason, settingsReady, seasonReady]);

  // Firebase有効時: 全ストアのhydrationを待つ
  if (isFirebaseConfigured && !(settingsReady && seasonReady && studentsReady && availReady && shiftsReady)) {
    return <LoadingScreen />;
  }

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
          <Route path="shift/calendar" element={<AdminShiftCalendar />} />
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
