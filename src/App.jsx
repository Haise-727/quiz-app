import React from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';

// Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import GuestTakeQuiz from './pages/Guest/GuestTakeQuiz';

import TeacherHome from './pages/Teacher/TeacherHome';
import CreateQuiz from './pages/Teacher/CreateQuiz';
import YourQuizzes from './pages/Teacher/YourQuizzes';
import MediaTest from './pages/Teacher/MediaTest';
import Grading from './pages/Teacher/Grading';

import StudentDashboard from './pages/Student/StudentDashboard';
import AttendQuiz from './pages/Student/AttendQuiz';
import TakeQuiz from './pages/Student/TakeQuiz';
import YourResults from './pages/Student/YourResults';

import './App.css';
import 'tui-image-editor/dist/tui-image-editor.css';
import 'tui-color-picker/dist/tui-color-picker.css';

// ─── Route guards ──────────────────────────────────────────────────────────────

const Spinner = () => (
  <div className="flex items-center justify-center min-h-screen bg-[#0d0d20]">
    <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
  </div>
);

/**
 * Requires the user to be authenticated.
 * If `role` is provided, also enforces it — a wrong-role user is sent to their own home.
 */
const ProtectedRoute = ({ children, role }) => {
  const { currentUser, userRole, loading, roleLoaded } = useAuth();

  // Still fetching auth state or Firestore role
  if (loading || !roleLoaded) return <Spinner />;

  // Not logged in → send to login
  if (!currentUser) return <Navigate to="/login" replace />;

  // Logged in but no Firestore profile yet (interrupted Google sign-up)
  if (userRole === null) return <Navigate to="/login" replace />;

  // Correct auth but wrong role → redirect to their actual home
  if (role && userRole !== role) {
    return <Navigate to={userRole === 'teacher' ? '/teacher/home' : '/student/dashboard'} replace />;
  }

  return children;
};

/** Preserves old /guest/quiz/:quizId URLs. */
const LegacyGuestQuizRedirect = () => {
  const { quizId } = useParams();
  return <Navigate to={`/quiz/${quizId}`} replace />;
};

// ─── App ───────────────────────────────────────────────────────────────────────

function App() {
  return (
    <div>
      <Routes>
        {/* ── Public ── */}
        <Route path="/"              element={<Landing />} />
        <Route path="/login"         element={<Login />} />
        <Route path="/quiz/:quizId"  element={<GuestTakeQuiz />} />

        {/* ── Teacher (must be logged in as teacher) ── */}
        <Route path="/teacher/home"              element={<ProtectedRoute role="teacher"><TeacherHome /></ProtectedRoute>} />
        <Route path="/teacher/create-quiz"       element={<ProtectedRoute role="teacher"><CreateQuiz /></ProtectedRoute>} />
        <Route path="/teacher/your-quizzes"      element={<ProtectedRoute role="teacher"><YourQuizzes /></ProtectedRoute>} />
        <Route path="/teacher/media-test"        element={<ProtectedRoute role="teacher"><MediaTest /></ProtectedRoute>} />
        <Route path="/teacher/grading/:quizId"   element={<ProtectedRoute role="teacher"><Grading /></ProtectedRoute>} />

        {/* ── Student (must be logged in as student) ── */}
        <Route path="/student/dashboard"         element={<ProtectedRoute role="student"><StudentDashboard /></ProtectedRoute>} />
        <Route path="/student/attend-quiz"       element={<ProtectedRoute role="student"><AttendQuiz /></ProtectedRoute>} />
        <Route path="/student/quiz/:quizId"      element={<ProtectedRoute role="student"><TakeQuiz /></ProtectedRoute>} />
        <Route path="/student/results"           element={<ProtectedRoute role="student"><YourResults /></ProtectedRoute>} />

        {/* ── Legacy redirects ── */}
        <Route path="/student/login"          element={<Navigate to="/login?role=student" replace />} />
        <Route path="/teacher/login"          element={<Navigate to="/login?role=teacher" replace />} />
        <Route path="/guest/attend-quiz"      element={<Navigate to="/" replace />} />
        <Route path="/guest/quiz/:quizId"     element={<LegacyGuestQuizRedirect />} />

        {/* ── Fallback ── */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
