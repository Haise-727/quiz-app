import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProgress } from '@/contexts/ProgressContext';
import QuizRunner from '@/components/quiz/QuizRunner';
import { createNotification } from '@/api/notifications';
import { listMyResultsUnordered, submitResult } from '@/api/results';
import { getUserProfile } from '@/api/users';
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
    const mine = await listMyResultsUnordered(currentUser.uid);
    return mine.map((r) => normalizeResult(r)).filter(Boolean);
  };

  const saveResult = async (result) => {
    if (!currentUser) throw new Error('You need to be signed in to submit a quiz.');
    return submitResult({ ...result, userId: currentUser.uid });
  };

  // A paragraph answer needs a teacher. Tell them there is something to mark.
  const afterSave = async ({ id, quiz, needsManual }) => {
    refreshProgress();                       // the sidebar and dashboard pick up the new XP
    if (!needsManual || !quiz.createdBy) return;
    const profile = await getUserProfile(currentUser.uid);
    const studentName = profile?.displayName || currentUser.displayName || 'A student';
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
