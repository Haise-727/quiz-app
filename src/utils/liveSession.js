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
 * Live mode supports the six objectively/instantly-gradable question types:
 * MCQ, TRUE_FALSE, FILL_IN_THE_BLANK and the three drag-and-drop types
 * MATCH_THE_FOLLOWING, REORDER, CATEGORIZE. The remaining types (paragraph,
 * the two comprehension types) are skipped during a live session — they need
 * manual grading or too much reading for a fast-paced synchronized format,
 * and are better suited to the existing async TakeQuiz flow.
 *
 * Answer shapes written to `answers/{questionIndex}/{playerId}/answer`.
 * All of them are plain JSON with string keys and string values, because
 * Realtime Database rejects undefined and drops empty objects/arrays:
 *   MCQ                 [optionId, …]
 *   TRUE_FALSE          boolean
 *   FILL_IN_THE_BLANK   string
 *   MATCH_THE_FOLLOWING { [promptPairId]: pairIdOfTheAnswerDroppedThere }
 *   REORDER             [itemId, …] in the order the player left them
 *   CATEGORIZE          { [itemId]: categoryId }
 */

import { realtimeDb } from '../firebase';
import {
  ref, set, get, update, remove, onValue, runTransaction, onDisconnect,
} from 'firebase/database';

export const LIVE_SUPPORTED_TYPES = [
  'MCQ', 'TRUE_FALSE', 'FILL_IN_THE_BLANK',
  'MATCH_THE_FOLLOWING', 'REORDER', 'CATEGORIZE',
];

/** Realtime Database has no undefined, so answers are normalised to plain maps. */
const asMap = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

const generatePin = () => Math.floor(100000 + Math.random() * 900000).toString();

export const generateGuestId = () => `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/** Teacher creates a new live session for a quiz. Returns the 6-digit PIN. */
export async function createLiveSession(quiz, hostId) {
  const playableQuestions = quiz.questions.filter(q => LIVE_SUPPORTED_TYPES.includes(q.type));
  if (!playableQuestions.length) {
    throw new Error('This quiz has no question types supported in live mode (MCQ, True/False, Fill in the Blank, Match, Reorder, Categorize).');
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

/**
 * Grades a single answer.
 *
 * `ratio` is the proportion of the question the player got right. The three
 * simple types are all-or-nothing (0 or 1). The three drag-and-drop types
 * award partial credit — the proportion of pairs matched, items left in the
 * right position, or items dropped in the right category — which is how
 * TakeQuiz grades the same types. Points stay `basePoints * speedBonus`
 * scaled by that ratio, so a fully correct answer scores exactly what it
 * always did, and only a fully correct answer counts towards a streak.
 *
 * A missing or malformed answer (the timer ran out, nothing was dropped)
 * scores 0 rather than throwing.
 */
export function scoreAnswer(question, answer, timeTakenMs) {
  if (!question) return { correct: false, points: 0 };
  let ratio = 0;
  switch (question.type) {
    case 'MCQ': {
      const correctIds = question.mcqData.correctOptions.map(String);
      const given = (Array.isArray(answer) ? answer : [answer]).map(String);
      ratio = correctIds.length > 0 && correctIds.length === given.length && correctIds.every(id => given.includes(id)) ? 1 : 0;
      break;
    }
    case 'TRUE_FALSE':
      ratio = answer === question.trueFalseData.correctAnswer ? 1 : 0;
      break;
    case 'FILL_IN_THE_BLANK':
      ratio = question.fillBlankData.answers
        .map(a => a.text.toLowerCase().trim())
        .includes(String(answer ?? '').toLowerCase().trim()) ? 1 : 0;
      break;
    case 'MATCH_THE_FOLLOWING': {
      // answer: { [promptPairId]: pairId of the answer card dropped there }.
      // Compared on answer text, not id, so two pairs sharing an answer are
      // both accepted — the same rule TakeQuiz uses.
      const pairs = question.matchData?.pairs || [];
      const dropped = asMap(answer);
      const answerTextById = new Map(pairs.map(p => [String(p.id), String(p.answer ?? '')]));
      const matched = pairs.filter(p => {
        const droppedId = dropped[String(p.id)];
        return droppedId != null && answerTextById.get(String(droppedId)) === String(p.answer ?? '');
      }).length;
      ratio = pairs.length ? matched / pairs.length : 0;
      break;
    }
    case 'REORDER': {
      // answer: [itemId, …]. The stored order of reorderData.items is correct.
      const items = question.reorderData?.items || [];
      const given = Array.isArray(answer) ? answer.map(String) : [];
      const inPlace = items.filter((item, i) => given[i] === String(item.id)).length;
      ratio = items.length ? inPlace / items.length : 0;
      break;
    }
    case 'CATEGORIZE': {
      // answer: { [itemId]: categoryId }. Items left in the bank are absent.
      const items = question.categorizeData?.items || [];
      const placed = asMap(answer);
      const right = items.filter(item => {
        const categoryId = placed[String(item.id)];
        return categoryId != null && item.categoryId != null && String(categoryId) === String(item.categoryId);
      }).length;
      ratio = items.length ? right / items.length : 0;
      break;
    }
    default:
      ratio = 0;
  }
  const correct = ratio >= 1;
  const basePoints = question.points || 10;
  const timeLimitMs = (parseInt(question.timeLimit, 10) || 30) * 1000;
  let points = 0;
  if (ratio > 0) {
    const speedRatio = Math.max(0, Math.min(1, 1 - timeTakenMs / timeLimitMs));
    points = Math.round(basePoints * ratio * (0.5 + 0.5 * speedRatio)); // 50%-100% of base, faster = more
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
