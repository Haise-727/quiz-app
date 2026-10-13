import { useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { submitResult } from '@/api/results';
import QuizRunner from '@/components/quiz/QuizRunner';
import { loadGuestResults, saveGuestResult } from '@/utils/guestProgress';

const generateGuestId = () => `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * Taking a graded quiz with no account. The quiz itself is QuizRunner, the same one signed
 * in students use, so it looks and scores identically. The result is stored under a
 * throwaway guest id with the name they typed, and their XP and streak are kept on this
 * device only (utils/guestProgress.js).
 */
export default function GuestTakeQuiz() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const guestId = useRef(generateGuestId());

  const saveResult = async (result, { name }) => {
    return submitResult({
      ...result,
      userId: guestId.current,
      username: (name || '').trim() || 'Guest',
      isGuest: true,
    });
  };

  // After a result is stored, remember a summary of it on this device for XP and streaks.
  const remember = (attempt) => saveGuestResult({
    quizId,
    finalScore: attempt.finalScore,
    maxScore: attempt.maxScore,
    questionCount: attempt.questionCount,
    status: attempt.status,
  });

  return (
    <QuizRunner
      quizId={quizId}
      mode="guest"
      loadHistory={async () => loadGuestResults()}
      saveResult={saveResult}
      remember={remember}
      onExit={() => navigate('/')}
      exitLabel="Back to home"
      onAgain={() => navigate(0)}
    />
  );
}
