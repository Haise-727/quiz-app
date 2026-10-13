import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import PublicNav from '@/components/layout/PublicNav';
import PublicFooter from '@/components/layout/PublicFooter';
import PageHeader from '@/components/layout/PageHeader';
import QuizBrowser from '@/components/quiz/QuizBrowser';
import { copyQuiz } from '@/utils/quizCopy';
import { listActiveQuizzes } from '@/api/quizzes';

export default function Browse() {
  const navigate = useNavigate();
  const { currentUser, userRole, displayName } = useAuth();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [cloningId, setCloningId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setQuizzes(await listActiveQuizzes());
      } catch {
        setFailed(true);   // a visitor can still join with a code, so this is not fatal
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const play = (id) => navigate(currentUser && userRole === 'student' ? `/student/quiz/${id}` : `/quiz/${id}`);

  // Only a signed in teacher is given a clone handler, so students, guests and signed out
  // visitors never see the button. The copy is a draft owned by the teacher.
  const isTeacher = !!currentUser && userRole === 'teacher';
  const clone = async (quiz) => {
    if (cloningId) return;
    setCloningId(quiz.id);
    try {
      const copy = await copyQuiz({ source: quiz, user: { uid: currentUser.uid, name: displayName || currentUser.displayName }, clone: true });
      toast.success('Cloned into your quizzes as a draft.', {
        action: { label: 'Open in editor', onClick: () => navigate(`/teacher/edit-quiz/${copy.id}`) },
      });
    } catch (e) {
      toast.error(e.message || 'We could not clone that quiz.');
    } finally {
      setCloningId(null);
    }
  };

  return (
    <div className="min-h-dvh bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <PublicNav />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-4xl px-5 pb-24 pt-14 outline-none sm:px-8 sm:pt-20">
        <PageHeader serif eyebrow="Open to everyone" title="Pick a quiz." description="Every quiz here is open right now. No account needed to play." />
        <div className="mt-12">
          <QuizBrowser
            quizzes={quizzes} loading={loading} failed={failed} onPlay={play}
            onClone={isTeacher ? clone : undefined} cloneUserId={currentUser?.uid} cloningId={cloningId}
          />
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
