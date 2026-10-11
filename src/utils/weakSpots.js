/**
 * Weak spots: where a student loses points, worked out from results they already saved.
 * Nothing is stored. Two lists come out:
 *
 *   subjects  Subjects ranked by the student's accuracy, lowest first. Needs at least
 *             MIN_GRADED graded answers, so one unlucky question is not a "weak subject".
 *   revisit   Up to MAX_REVISIT questions they got wrong or only partly right the LAST
 *             time they took each quiz, newest first. Looking only at the latest attempt
 *             of each quiz means a question answered right on a retake drops off by itself.
 *
 * Both skip daily results (they are not quiz attempts) and answers still waiting for a
 * teacher (pending review is not wrong). Plain functions, tested by scripts/test-weak-spots.mjs.
 *
 * A saved result keeps one entry per question in `answers`, in the quiz's own order, so
 * answers[i] belongs to quiz.questions[i]. We only trust that link while the question text
 * still matches, because a teacher may have edited the quiz since.
 */
import { normalizeResult } from './gamification.js';

export const MIN_GRADED = 2;
export const MAX_REVISIT = 6;

const isPending = (a) => a?.status === 'pending_review';

/** The quiz question that goes with answers[i], or null if the quiz changed or is unknown. */
function questionFor(quiz, answer, i) {
  const q = quiz?.questions?.[i];
  return q && (!answer.questionText || q.questionText === answer.questionText) ? q : null;
}

/** The share of a question the student earned, 0 to 1. Partial credit counts when we can tell. */
function credit(answer, question) {
  if (answer.isCorrect) return 1;
  const worth = Number(question?.points);
  const got = Number(answer.pointsAwarded);
  return worth > 0 && got > 0 ? Math.min(1, got / worth) : 0;
}

/** Newest attempt of each quiz, with its time. Ignores dailies and results with no answers. */
function latestPerQuiz(results) {
  const latest = new Map();
  const attemptCount = new Map();
  for (const raw of results || []) {
    if (!raw || raw.kind === 'daily' || !Array.isArray(raw.answers) || !raw.quizId) continue;
    const at = normalizeResult(raw).completedAt;
    attemptCount.set(raw.quizId, (attemptCount.get(raw.quizId) || 0) + 1);
    const seen = latest.get(raw.quizId);
    if (!seen || at > seen.at) latest.set(raw.quizId, { raw, at });
  }
  return { latest, attemptCount };
}

/**
 * @param results  the student's saved quiz_results documents (raw, with `answers`)
 * @param quizzes  { [quizId]: quiz document }, used for subject, points and to check the quiz can still be retaken
 * @returns {{ subjects: {name, accuracy, pct, graded, attempts}[], revisit: {quizId, quizTitle, questionText, partial, completedAt}[] }}
 */
export function weakSpots(results, quizzes = {}) {
  const { latest, attemptCount } = latestPerQuiz(results);

  const groups = new Map();      // lower cased subject -> totals
  const revisit = [];

  latest.forEach(({ raw, at }, quizId) => {
    const quiz = quizzes[quizId];
    // The subject comes from the result, then the quiz, then the quiz's title.
    const name = String(raw.subject || quiz?.subject || quiz?.title || raw.quizTitle || '').trim() || 'Other';
    const key = name.toLowerCase();
    const group = groups.get(key) || { name, earned: 0, graded: 0, attempts: 0 };
    group.attempts += attemptCount.get(quizId) || 1;

    raw.answers.forEach((answer, i) => {
      if (!answer || isPending(answer)) return;                 // waiting for a teacher: not wrong
      group.graded += 1;
      group.earned += credit(answer, questionFor(quiz, answer, i));
      const wrong = !answer.isCorrect;
      // A quiz we could not load (deleted, or switched off) cannot be retaken, so do not send them there.
      if (wrong && quiz && answer.questionText) {
        revisit.push({ quizId, quizTitle: quiz.title || raw.quizTitle || 'Quiz', questionText: answer.questionText, partial: Number(answer.pointsAwarded) > 0, completedAt: at, index: i });
      }
    });
    groups.set(key, group);
  });

  const subjects = [...groups.values()]
    .filter((g) => g.graded >= MIN_GRADED)
    .map((g) => ({ name: g.name, accuracy: g.earned / g.graded, pct: Math.round((g.earned / g.graded) * 100), graded: g.graded, attempts: g.attempts }))
    .sort((a, b) => a.accuracy - b.accuracy || b.graded - a.graded || (a.name < b.name ? -1 : 1));

  revisit.sort((a, b) => b.completedAt - a.completedAt || a.index - b.index);
  return { subjects, revisit: revisit.slice(0, MAX_REVISIT).map((item) => ({ quizId: item.quizId, quizTitle: item.quizTitle, questionText: item.questionText, partial: item.partial, completedAt: item.completedAt })) };
}
