import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/firebase';
import { useAuth } from '@/contexts/AuthContext';
import PublicNav from '@/components/layout/PublicNav';
import PublicFooter from '@/components/layout/PublicFooter';
import PageHeader from '@/components/layout/PageHeader';
import QuizBrowser from '@/components/quiz/QuizBrowser';

export default function Browse() {
  const navigate = useNavigate();
  const { currentUser, userRole } = useAuth();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'quizzes'), where('active', '==', true)));
        setQuizzes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch {
        setFailed(true);   // a visitor can still join with a code, so this is not fatal
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const play = (id) => navigate(currentUser && userRole === 'student' ? `/student/quiz/${id}` : `/quiz/${id}`);

  return (
    <div className="min-h-dvh bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <PublicNav />
      <main className="mx-auto max-w-4xl px-5 pb-24 pt-14 sm:px-8 sm:pt-20">
        <PageHeader serif eyebrow="Open to everyone" title="Pick a quiz." description="Every quiz here is open right now. No account needed to play." />
        <div className="mt-12">
          <QuizBrowser quizzes={quizzes} loading={loading} failed={failed} onPlay={play} />
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
