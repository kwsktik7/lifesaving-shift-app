import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStudentStore } from '@/store/studentStore';
import { useSettingsStore } from '@/store/settingsStore';
import { firebaseSignIn, verifyPin } from '@/utils/auth';

export default function LoginPage() {
  const [tab, setTab] = useState<'admin' | 'student'>('student');
  const [adminPass, setAdminPass] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const { students } = useStudentStore();
  const { settings, verifyAdminPassword, setAdminPassword } = useSettingsStore();
  const navigate = useNavigate();

  const activeStudents = students.filter((s) => s.isActive);

  const [loading, setLoading] = useState(false);

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!settings.adminPasswordHash) {
        setAdminPassword(adminPass);
        await firebaseSignIn({ role: 'admin' });
        navigate('/admin');
        return;
      }
      if (verifyAdminPassword(adminPass)) {
        await firebaseSignIn({ role: 'admin' });
        navigate('/admin');
      } else {
        setError('パスワードが違います');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleStudentLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const student = students.find((s) => s.id === selectedStudent);
    if (!student) {
      setError('学生を選択してください');
      return;
    }
    if (!verifyPin(pin, student.pinHash)) {
      setError('PINが違います');
      return;
    }
    setLoading(true);
    try {
      await firebaseSignIn({ role: 'student', studentId: student.id, studentName: student.name });
      navigate('/student');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-8">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🏄</div>
          <h1 className="text-xl font-bold text-gray-800">{settings.clubName}</h1>
          <p className="text-sm text-gray-500">シフト管理システム</p>
        </div>

        {/* Tab */}
        <div className="flex rounded-lg overflow-hidden border border-gray-200 mb-6">
          <button
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              tab === 'student' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
            onClick={() => { setTab('student'); setError(''); }}
          >
            学生
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              tab === 'admin' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
            onClick={() => { setTab('admin'); setError(''); }}
          >
            管理者
          </button>
        </div>

        {tab === 'student' ? (
          <form onSubmit={handleStudentLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名前を選択</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value)}
              >
                <option value="">-- 選択してください --</option>
                {activeStudents.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PIN（4桁）</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="0000"
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleAdminLogin} className="space-y-4">
            {!settings.adminPasswordHash && (
              <p className="text-sm text-amber-600 bg-amber-50 rounded-lg p-3">
                初回ログインです。管理者パスワードを設定してください。
              </p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">管理者パスワード</label>
              <input
                type="password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={adminPass}
                onChange={(e) => setAdminPass(e.target.value)}
                placeholder="パスワードを入力"
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'ログイン中...' : (settings.adminPasswordHash ? 'ログイン' : 'パスワードを設定してログイン')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
