/**
 * liveSession.js
 * Real-time game session logic, backed by Firebase Realtime Database
 * (not Firestore — sessions are ephemeral, high-frequency-write state).
 *
 * Schema: sessions/{pin}
 *   quizId, quizTitle, hostId, totalQuestions
 *   state: 'lobby' | 'question' | 'reveal' | 'leaderboard' | 'ended'
 *   currentQuestionIndex, questionStartedAt, createdAt
 *   players: { [playerId]: { name, score, streak, joinedAt } }
 *   answers: { [questionIndex]: { [playerId]: { answer, correct, points, answeredAt } } }
 *
 * Live mode supports the three objectively/instantly-gradable question
 * types: MCQ, TRUE_FALSE, FILL_IN_THE_BLANK. Other types (drag-and-drop,
 * paragraph) are skipped during a live session — they don't fit a
 * fast-paced synchronized format and are better suited to the existing
 * async TakeQuiz flow.
 */

import { realtimeDb } from '../firebase';
import {
  ref, set, get, update, remove, onValue, runTransaction, onDisconnect,
} from 'firebase/database';

export const LIVE_SUPPORTED_TYPES = ['MCQ', 'TRUE_FALSE', 'FILL_IN_THE_BLANK'];

const generatePin = () => Math.floor(100000 + Math.random() * 900000).toString();

export const generateGuestId = () => `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/** Teacher creates a new live session for a quiz. Returns the 6-digit PIN. */
export async function createLiveSession(quiz, hostId) {
  const playableQuestions = quiz.questions.filter(q => LIVE_SUPPORTED_TYPES.includes(q.type));
  if (!playableQuestions.length) {
    throw new Error('This quiz has no question types supported in live mode (MCQ, True/False, Fill in the Blank).');
  }

  let pin = null;
  for (let i = 0; i < 6; i++) {
    const candidate = generatePin();
    const snap = await get(ref(realtimeDb, `sessions/${candidate}`));
    if (!snap.exists()) { pin = candidate; break; }
  }
  if (!pin) throw new Error('Could not generate a unique session code. Please try again.');

  await set(ref(realtimeDb, `sessions/${pin}`), {
    quizId: quiz.id,
    quizTitle: quiz.title,
    hostId,
    totalQuestions: playableQuestions.length,
    skippedCount: quiz.questions.length - playableQuestions.length,
    state: 'lobby',
    currentQuestionIndex: 0,
    questionStartedAt: null,
    createdAt: Date.now(),
    players: {},
    answers: {},
  });
  return pin;
}

/** Subscribe to live session updates. Returns an unsubscribe function. */
export function listenToSession(pin, callback) {
  const sessionRef = ref(realtimeDb, `sessions/${pin}`);
  return onValue(sessionRef, (snap) => callback(snap.exists() ? snap.val() : null));
}

/** Player (student or guest) joins a session by PIN. */
export async function joinSession(pin, playerId, name) {
  const snap = await get(ref(realtimeDb, `sessions/${pin}`));
  if (!snap.exists()) throw new Error('Game not found. Check the code and try again.');
  const session = snap.val();
  if (session.state === 'ended') throw new Error('This game has already ended.');

  const playerRef = ref(realtimeDb, `sessions/${pin}/players/${playerId}`);
  await set(playerRef, { name: name || 'Player', score: 0, streak: 0, joinedAt: Date.now() });
  onDisconnect(playerRef).remove();
  return session;
}

export async function leaveSession(pin, playerId) {
  await remove(ref(realtimeDb, `sessions/${pin}/players/${playerId}`));
}

export async function startGame(pin) {
  await update(ref(realtimeDb, `sessions/${pin}`), {
    state: 'question', currentQuestionIndex: 0, questionStartedAt: Date.now(),
  });
}

export async function revealQuestion(pin) {
  await update(ref(realtimeDb, `sessions/${pin}`), { state: 'reveal' });
}

export async function showLeaderboard(pin) {
  await update(ref(realtimeDb, `sessions/${pin}`), { state: 'leaderboard' });
}

export async function nextQuestion(pin, nextIndex) {
  await update(ref(realtimeDb, `sessions/${pin}`), {
    state: 'question', currentQuestionIndex: nextIndex, questionStartedAt: Date.now(),
  });
}

export async function endGame(pin) {
  await update(ref(realtimeDb, `sessions/${pin}`), { state: 'ended' });
}

export async function deleteSession(pin) {
  await remove(ref(realtimeDb, `sessions/${pin}`));
}

/** Grades a single answer for the three live-supported question types. */
export function scoreAnswer(question, answer, timeTakenMs) {
  let correct = false;
  switch (question.type) {
    case 'MCQ': {
      const correctIds = question.mcqData.correctOptions.map(String);
      const given = (Array.isArray(answer) ? answer : [answer]).map(String);
      correct = correctIds.length > 0 && correctIds.length === given.length && correctIds.every(id => given.includes(id));
      break;
    }
    case 'TRUE_FALSE':
      correct = answer === question.trueFalseData.correctAnswer;
      break;
    case 'FILL_IN_THE_BLANK':
      correct = question.fillBlankData.answers
        .map(a => a.text.toLowerCase().trim())
        .includes(String(answer ?? '').toLowerCase().trim());
      break;
    default:
      correct = false;
  }
  const basePoints = question.points || 10;
  const timeLimitMs = (parseInt(question.timeLimit, 10) || 30) * 1000;
  let points = 0;
  if (correct) {
    const speedRatio = Math.max(0, Math.min(1, 1 - timeTakenMs / timeLimitMs));
    points = Math.round(basePoints * (0.5 + 0.5 * speedRatio)); // 50%-100% of base, faster = more
  }
  return { correct, points };
}

/** Player submits an answer for the current question; updates their score/streak. */
export async function submitAnswer(pin, questionIndex, playerId, answer, question, timeTakenMs) {
  const { correct, points } = scoreAnswer(question, answer, timeTakenMs);
  await set(ref(realtimeDb, `sessions/${pin}/answers/${questionIndex}/${playerId}`), {
    answer, correct, points, answeredAt: Date.now(),
  });
  await runTransaction(ref(realtimeDb, `sessions/${pin}/players/${playerId}`), (player) => {
    if (!player) return player;
    player.score = (player.score || 0) + points;
    player.streak = correct ? (player.streak || 0) + 1 : 0;
    return player;
  });
  return { correct, points };
}
