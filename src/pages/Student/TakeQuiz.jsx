import { useNavigate, useParams } from 'react-router-dom';
import { addDoc, collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useProgress } from '@/contexts/ProgressContext';
import QuizRunner from '@/components/quiz/QuizRunner';
import { createNotification } from '@/utils/notifications';
import { normalizeResult } from '@/utils/gamification';

/**
 * A signed in student taking a graded quiz. The quiz itself (screens, timer, grading,
 * rewards) is QuizRunner. This page only says who is playing and where the result goes:
 * into quiz_results under their account, with their earlier results used for XP.
 */
export default function TakeQuiz() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { refresh: refreshProgress } = useProgress();

  // Earlier attempts by this student, which is what XP, level and streak are worked out from.
  const loadHistory = async () => {
    const snap = await getDocs(query(collection(db, 'quiz_results'), where('userId', '==', currentUser.uid)));
    return snap.docs.map((d) => normalizeResult(d.data())).filter(Boolean);
  };

  const saveResult = async (result) => {
    if (!currentUser) throw new Error('You need to be signed in to submit a quiz.');
    const ref = await addDoc(collection(db, 'quiz_results'), { ...result, userId: currentUser.uid });
    return ref.id;
  };

  // A paragraph answer needs a teacher. Tell them there is something to mark.
  const afterSave = async ({ id, quiz, needsManual }) => {
    refreshProgress();                       // the sidebar and dashboard pick up the new XP
    if (!needsManual || !quiz.createdBy) return;
    const profile = await getDoc(doc(db, 'users', currentUser.uid));
    const studentName = (profile.exists() && profile.data().displayName) || currentUser.displayName || 'A student';
    await createNotification(
      quiz.createdBy,
      `${studentName} has submitted "${quiz.title}" which requires manual grading.`,
      'grading',
      { quizId, resultId: id },
    );
  };

  return (
    <QuizRunner
      quizId={quizId}
      mode="student"
      loadHistory={loadHistory}
      saveResult={saveResult}
      afterSave={afterSave}
      onExit={() => navigate('/student/dashboard')}
      exitLabel="Back to dashboard"
      onReview={() => navigate('/student/results')}
      onAgain={() => navigate(0)}
    />
  );
}
