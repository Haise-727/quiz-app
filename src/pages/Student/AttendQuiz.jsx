import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/firebase';
import PageHeader from '@/components/layout/PageHeader';
import JoinField from '@/components/game/JoinField';
import QuizBrowser from '@/components/quiz/QuizBrowser';
import { findActiveQuizByCode } from '@/utils/quizLookup';

/** The student's way into a quiz: type a code, or pick one that is open. */
export default function AttendQuiz() {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'quizzes'), where('active', '==', true)));
        setQuizzes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const join = async (value) => {
    if (!value.trim()) { setError('Enter a quiz code.'); return; }
    setError(''); setJoining(true);
    try {
      const id = await findActiveQuizByCode(value);
      if (!id) { setError('No open quiz has that code. Check it and try again.'); return; }
      navigate(`/student/quiz/${id}`);
    } catch {
      setError('We could not join. Check your connection and try again.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader serif eyebrow="Student" title="Join a quiz." description="Type the code from your teacher, or pick one that is open." />

      <div className="mt-10 max-w-md">
        <JoinField label="Quiz code" placeholder="AB12CD" maxLength={6} button="Join" busy={joining} error={error} onSubmit={join} />
      </div>

      <h2 className="eyebrow mt-16">Open now</h2>
      <div className="mt-6">
        <QuizBrowser
          quizzes={quizzes}
          loading={loading}
          failed={failed}
          onPlay={(id) => navigate(`/student/quiz/${id}`)}
          emptyHint="Ask your teacher for a code."
        />
      </div>
    </div>
  );
}
