/**
 * The daily question, as plain functions.
 *
 * Every student sees the SAME question on the same day. Nothing is stored to make that
 * true. The question is worked out from the list of active quizzes and today's date:
 *   1. collect the questions that are simple enough to answer in a card (below),
 *   2. sort them in one fixed order (quiz id, then question id),
 *   3. pick the one at position hash(date) mod count.
 * Two students with the same pool and the same date always land on the same position.
 *
 * Answering is saved as an ordinary document in quiz_results (kind 'daily', quizId
 * 'daily-YYYY-MM-DD', teacherId ''), so there is no new collection and no new rule.
 * gamification.js decides what a daily result is worth. This file has no React and no
 * Firebase in it, so it is tested by scripts/test-daily.mjs.
 */
import { gradeQuestion } from './quizAttempt.js';
import { getMainMedia } from './media.js';

// ── Dates and ids ───────────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0');

/** The student's own calendar date as YYYY-MM-DD, so "today" means their today. */
export const localDateString = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The quizId a day's answer is saved under. One per day is what makes it once per day. */
export const dailyQuizId = (dateString) => `daily-${dateString}`;

/**
 * A small stable string hash (FNV-1a, 32 bit). It must give the same number in every
 * browser and every year, which is why this is not Math.random or a library default.
 * `>>> 0` keeps the result an unsigned integer so the modulo below is never negative.
 */
export function hashString(text) {
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ── Choosing the question ───────────────────────────────────────────────────────────

/** Plain string order, not localeCompare, so two machines never disagree. */
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Can this question be answered on a small card and graded on the spot?
 * Yes for: multiple choice with exactly ONE correct option, true or false, and fill in
 * the blank. No for anything with a picture, clip or recording (even on an option), and
 * for the types that need dragging, several parts, or a teacher to mark.
 */
export function isDailyEligible(q) {
  if (!q || typeof q !== 'object' || !String(q.questionText || '').trim()) return false;
  if (getMainMedia(q)) return false;
  switch (q.type) {
    case 'MCQ': {
      const options = q.mcqData?.options || [];
      const right = q.mcqData?.correctOptions || [];
      return options.length >= 2 && right.length === 1 && options.some((o) => o.id === right[0]) && !options.some((o) => o?.media);
    }
    case 'TRUE_FALSE':
      return typeof q.trueFalseData?.correctAnswer === 'boolean';
    case 'FILL_IN_THE_BLANK':
      return (q.fillBlankData?.answers || []).some((a) => String(a?.text ?? '').trim());
    default:
      return false;
  }
}

/**
 * Every eligible question across the given quizzes, in the one fixed order.
 * A question without an id (very old quizzes) is named by its position instead.
 * @param quizzes  [{ id, title, active, questions: [...] }]
 * @returns        [{ quizId, quizTitle, questionId, question }]
 */
export function dailyCandidates(quizzes) {
  const out = [];
  for (const quiz of quizzes || []) {
    if (!quiz?.id || quiz.active !== true) continue;           // only quizzes anyone may read
    (quiz.questions || []).forEach((q, i) => {
      if (!isDailyEligible(q)) return;
      out.push({ quizId: String(quiz.id), quizTitle: quiz.title || 'Quiz', questionId: String(q.id ?? `index-${i}`), question: q });
    });
  }
  return out.sort((a, b) => byText(a.quizId, b.quizId) || byText(a.questionId, b.questionId));
}

/** Today's question, or null when there is nothing to ask. */
export function pickDaily(candidates, dateString) {
  if (!candidates?.length) return null;
  return candidates[hashString(dateString) % candidates.length];
}

// ── Grading and saving ──────────────────────────────────────────────────────────────

/** Right or wrong, by the same grader the quizzes use. */
export const gradeDaily = (question, answer) => gradeQuestion(question, answer).correct;

/**
 * The document saved to quiz_results for one daily answer. `teacherId` is an empty
 * string on purpose: the rules let a teacher read results whose teacherId is theirs, so
 * no teacher ever sees these. `completedAt` is passed in so the page can use the
 * server's clock (serverTimestamp) like every other save.
 */
export function buildDailyResult({ userId, dateString, candidate, correct, completedAt }) {
  const score = correct ? 1 : 0;
  return {
    userId,
    quizId: dailyQuizId(dateString),
    quizTitle: 'Daily question',
    teacherId: '',
    kind: 'daily',
    sourceQuizId: candidate.quizId,
    sourceQuestionId: candidate.questionId,
    score,
    finalScore: score,
    maxScore: 1,
    questionCount: 1,
    status: 'completed',
    completedAt,
  };
}

/** Today's daily result among the student's loaded results (raw documents or normalised), or null. */
export const findDailyResult = (results, dateString) =>
  (results || []).find((r) => r?.kind === 'daily' && r.quizId === dailyQuizId(dateString)) || null;

/** Was a saved daily result answered right? */
export const dailyWasRight = (result) => !!result && Number(result.maxScore) > 0 && Number(result.finalScore ?? result.score) >= Number(result.maxScore);
