import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';

// Pages. The landing and sign in pages are in the first download because most visits
// start there. Every other page is fetched when it is first opened, so a student never
// downloads the teacher tools, the chart library or the image editor.
import Landing from './pages/Landing';
import Login from './pages/Login';
import NotFound from './pages/NotFound';

const GuestTakeQuiz    = lazy(() => import('./pages/Guest/GuestTakeQuiz'));
const Browse           = lazy(() => import('./pages/Browse'));
const PlaySession      = lazy(() => import('./pages/PlaySession'));
const Profile          = lazy(() => import('./pages/Profile'));

const TeacherHome      = lazy(() => import('./pages/Teacher/TeacherHome'));
const CreateQuiz       = lazy(() => import('./pages/Teacher/CreateQuiz'));
const YourQuizzes      = lazy(() => import('./pages/Teacher/YourQuizzes'));
const Grading          = lazy(() => import('./pages/Teacher/Grading'));
const Analytics        = lazy(() => import('./pages/Teacher/Analytics'));
const Insights         = lazy(() => import('./pages/Teacher/Insights'));
const Classes          = lazy(() => import('./pages/Teacher/Classes'));
const QuestionBank     = lazy(() => import('./pages/Teacher/QuestionBank'));
const HostSession      = lazy(() => import('./pages/Teacher/HostSession'));

const StudentDashboard = lazy(() => import('./pages/Student/StudentDashboard'));
const AttendQuiz       = lazy(() => import('./pages/Student/AttendQuiz'));
const TakeQuiz         = lazy(() => import('./pages/Student/TakeQuiz'));
const YourResults      = lazy(() => import('./pages/Student/YourResults'));

import DashboardLayout from './components/layout/DashboardLayout';
import './App.css';

// ─── Route guards ──────────────────────────────────────────────────────────────

const Spinner = () => (
  <div className="flex min-h-dvh items-center justify-center bg-[hsl(var(--background))]" role="status" aria-label="Loading">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--border))] border-t-[hsl(var(--ink))]" />
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

/** Preserves old /guest/quiz/:quizId URLs, and the practice and flashcard links that were shared. */
const LegacyGuestQuizRedirect = () => {
  const { quizId } = useParams();
  return <Navigate to={`/quiz/${quizId}`} replace />;
};

// ─── App ───────────────────────────────────────────────────────────────────────

function App() {
  return (
    <div>
      <Suspense fallback={<Spinner />}>
      <Routes>
        {/* ── Public ── */}
        <Route path="/"                    element={<Landing />} />
        <Route path="/browse"              element={<Browse />} />
        <Route path="/login"               element={<Login />} />
        <Route path="/quiz/:quizId"        element={<GuestTakeQuiz />} />
        <Route path="/play"                element={<PlaySession />} />
        <Route path="/play/:pin"           element={<PlaySession />} />

        {/* ── Teacher (must be logged in as teacher) ── */}
        <Route path="/teacher/home"              element={<ProtectedRoute role="teacher"><DashboardLayout><TeacherHome /></DashboardLayout></ProtectedRoute>} />
        <Route path="/teacher/create-quiz"       element={<ProtectedRoute role="teacher"><DashboardLayout><CreateQuiz /></DashboardLayout></ProtectedRoute>} />
        <Route path="/teacher/edit-quiz/:quizId"  element={<ProtectedRoute role="teacher"><DashboardLayout><CreateQuiz /></DashboardLayout></ProtectedRoute>} />
        <Route path="/teacher/your-quizzes"      element={<ProtectedRoute role="teacher"><DashboardLayout><YourQuizzes /></DashboardLayout></ProtectedRoute>} />
        <Route path="/teacher/classes"           element={<ProtectedRoute role="teacher"><DashboardLayout><Classes /></DashboardLayout></ProtectedRoute>} />
        <Route path="/teacher/question-bank"     element={<ProtectedRoute role="teacher"><DashboardLayout><QuestionBank /></DashboardLayout></ProtectedRoute>} />
        <Route path="/teacher/grading/:quizId"    element={<ProtectedRoute role="teacher"><DashboardLayout><Grading /></DashboardLayout></ProtectedRoute>} />
        <Route path="/teacher/analytics/:quizId" element={<ProtectedRoute role="teacher"><DashboardLayout><Analytics /></DashboardLayout></ProtectedRoute>} />
        <Route path="/teacher/insights"          element={<ProtectedRoute role="teacher"><DashboardLayout><Insights /></DashboardLayout></ProtectedRoute>} />
        <Route path="/teacher/host/:pin"         element={<ProtectedRoute role="teacher"><HostSession /></ProtectedRoute>} />

        {/* ── Shared (any authenticated user) ── */}
        <Route path="/profile" element={<ProtectedRoute><DashboardLayout><Profile /></DashboardLayout></ProtectedRoute>} />

        {/* ── Student (must be logged in as student) ── */}
        <Route path="/student/dashboard"         element={<ProtectedRoute role="student"><DashboardLayout><StudentDashboard /></DashboardLayout></ProtectedRoute>} />
        <Route path="/student/attend-quiz"       element={<ProtectedRoute role="student"><DashboardLayout><AttendQuiz /></DashboardLayout></ProtectedRoute>} />
        <Route path="/student/quiz/:quizId"      element={<ProtectedRoute role="student"><TakeQuiz /></ProtectedRoute>} />
        <Route path="/student/results"           element={<ProtectedRoute role="student"><DashboardLayout><YourResults /></DashboardLayout></ProtectedRoute>} />

        {/* ── Legacy redirects ── */}
        <Route path="/student/login"          element={<Navigate to="/login?role=student" replace />} />
        <Route path="/teacher/login"          element={<Navigate to="/login?role=teacher" replace />} />
        <Route path="/guest/attend-quiz"      element={<Navigate to="/" replace />} />
        <Route path="/guest/quiz/:quizId"     element={<LegacyGuestQuizRedirect />} />
        <Route path="/practice/:quizId"       element={<LegacyGuestQuizRedirect />} />
        <Route path="/flashcards/:quizId"     element={<LegacyGuestQuizRedirect />} />

        {/* ── 404 ── */}
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </div>
  );
}

export default App;
