/**
 * Teacher insights: the sums behind the Insights page, as plain functions.
 *
 * Everything here is DERIVED from the quiz results and quizzes that already exist, the same
 * way gamification.js works. Nothing extra is stored. There is no React and no Firebase in
 * this file, so scripts/test-insights.mjs can check every rule without a browser, and the
 * file can move to a server later unchanged.
 *
 * A "result" is a saved quiz_results document (see QuizRunner.jsx):
 *   { quizId, userId, username?, isGuest?, status, score, finalScore, maxScore,
 *     answers: [{ isCorrect, pointsAwarded, status, questionText, ... }], completedAt }
 * A "quiz" is { id, title, questions: [{ questionText, points, ... }] }.
 */

// ── Small helpers ───────────────────────────────────────────────────────────────────

/** Where "needs help" starts, as an average percent. Below this a student is flagged. */
export const NEEDS_HELP_BELOW = 60;

/** A trend inside this many percentage points counts as steady, so one lucky answer is not an arrow. */
export const TREND_TOLERANCE = 5;

/** The fewest results a student needs before they get a trend arrow. */
export const MIN_RESULTS_FOR_TREND = 3;

/** A question needs at least this many different students before it can be called hard. */
export const MIN_STUDENTS_PER_QUESTION = 3;

/** How many weeks the activity chart covers. */
export const ACTIVITY_WEEKS = 8;

/** How many questions the most missed list shows. */
export const MOST_MISSED_LIMIT = 8;

/**
 * Turn whatever a result stores as a time into a Date, or null.
 * Handles a Firestore Timestamp (toDate), a plain { seconds }, a Date, and milliseconds.
 */
export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') return toDate(value.toDate());
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value === 'number') return toDate(new Date(value));
  return null;
}

/**
 * The percent a result scored, 0 to 100, or null when it cannot be worked out.
 * A result waiting for a teacher ("pending") has only its automatic points so far, so
 * callers that average scores skip it with isScored().
 */
export function resultPercent(r) {
  const max = Number(r?.maxScore);
  if (!(max > 0)) return null;
  const got = Number(r.status === 'completed' ? r.finalScore : r.score);
  if (!Number.isFinite(got)) return null;
  return Math.min(100, Math.max(0, (got / max) * 100));
}

/** Is this result finished and marked, so its percent is a real score? */
export const isScored = (r) => r?.status === 'completed' && resultPercent(r) !== null;

const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

// ── 1. Activity ─────────────────────────────────────────────────────────────────────

/** Midnight at the start of the Monday of the week containing `date`, in local time. */
export function weekStart(date) {
  const d = new Date(date);
  const sinceMonday = (d.getDay() + 6) % 7;            // Monday is 0, Sunday is 6
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - sinceMonday);
}

/**
 * Submissions per week for the last `weeks` weeks, oldest first, ending with the week that
 * contains `now`. Weeks with no submissions are kept as zero so the bars have no gaps.
 * Results with no usable time, or older than the window, are left out.
 * @returns {{ start: Date, count: number }[]}
 */
export function weeklyActivity(results, now = new Date(), weeks = ACTIVITY_WEEKS) {
  const thisWeek = weekStart(now);
  const buckets = [];
  const index = new Map();
  for (let i = weeks - 1; i >= 0; i--) {
    // Built from calendar parts, not by subtracting milliseconds, so a clock change
    // (daylight saving) cannot push a week start to 23:00 or 01:00.
    const start = new Date(thisWeek.getFullYear(), thisWeek.getMonth(), thisWeek.getDate() - 7 * i);
    index.set(start.getTime(), buckets.length);
    buckets.push({ start, count: 0 });
  }
  for (const r of results || []) {
    const when = toDate(r?.completedAt);
    if (!when) continue;
    const slot = index.get(weekStart(when).getTime());
    if (slot !== undefined) buckets[slot].count += 1;
  }
  return buckets;
}

/**
 * The numbers above the chart. `uniqueStudents` counts different people: a signed in
 * student once however often they play, and each guest session once (a guest has no
 * account to join their sessions together). `averageScore` uses finished results only.
 */
export function summarize(results) {
  const list = results || [];
  const people = new Set(list.map((r) => r?.userId).filter(Boolean));
  const avg = mean(list.filter(isScored).map(resultPercent));
  return {
    total: list.length,
    uniqueStudents: people.size,
    averageScore: avg === null ? null : Math.round(avg),
  };
}

// ── 2. Most missed questions ────────────────────────────────────────────────────────

/**
 * Was this one answer fully right? Either the grader said so (`isCorrect`), or it earned
 * all of the question's points. Partial credit on Match or Categorize is NOT fully right.
 */
export function isFullyRight(answer, question) {
  if (answer?.isCorrect === true) return true;
  const worth = Number(question?.points);
  return worth > 0 && Number(answer?.pointsAwarded) >= worth;
}

/**
 * Find the question a saved answer belongs to. Answers are stored by position, but a
 * teacher can edit a quiz after students played it. So the position is trusted only when
 * the question text still matches the text saved with the answer. Otherwise we look for
 * the same text elsewhere in the quiz, and give up (null) when it is gone, so an edited
 * quiz never blames the wrong question.
 */
export function questionForAnswer(quiz, answer, index) {
  const questions = quiz?.questions || [];
  const at = questions[index];
  if (!at) return null;
  if (answer?.questionText === undefined || answer.questionText === at.questionText) return at;
  return questions.find((q) => q.questionText === answer.questionText) || null;
}

/**
 * The questions students miss most, across every quiz.
 *  - Pending review answers (paragraphs a teacher has not marked) are skipped, not wrong.
 *  - A question is only listed once at least `minStudents` different students attempted it,
 *    so one bad day on a quiz with two players does not make a "hard" question.
 *  - A question nobody missed is not listed: this is a list of problems.
 *  - Accuracy is the share of attempts that were fully right. Hardest first, and when two
 *    tie the one with more attempts goes first because it is better evidence.
 * @returns {{ key, quizId, quizTitle, questionText, attempts, students, correct, accuracy }[]}
 */
export function mostMissed(results, quizzes, { limit = MOST_MISSED_LIMIT, minStudents = MIN_STUDENTS_PER_QUESTION } = {}) {
  const byQuiz = new Map((quizzes || []).map((q) => [q.id, q]));
  const stats = new Map();

  for (const r of results || []) {
    const quiz = byQuiz.get(r?.quizId);
    if (!quiz || !Array.isArray(r.answers)) continue;          // a deleted quiz has no question text to show
    r.answers.forEach((answer, i) => {
      if (!answer || answer.status === 'pending_review') return;
      const question = questionForAnswer(quiz, answer, i);
      if (!question) return;
      const key = `${quiz.id}::${question.id ?? question.questionText}`;
      let s = stats.get(key);
      if (!s) {
        s = { key, quizId: quiz.id, quizTitle: quiz.title || 'Untitled quiz', questionText: question.questionText || 'Untitled question', attempts: 0, correct: 0, people: new Set() };
        stats.set(key, s);
      }
      s.attempts += 1;
      if (isFullyRight(answer, question)) s.correct += 1;
      s.people.add(r.userId);
    });
  }

  return [...stats.values()]
    .filter((s) => s.people.size >= minStudents && s.correct < s.attempts)
    .map(({ people, ...s }) => ({ ...s, students: people.size, accuracy: Math.round((s.correct / s.attempts) * 100) }))
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts || a.questionText.localeCompare(b.questionText))
    .slice(0, limit);
}

// ── 3. Students ─────────────────────────────────────────────────────────────────────

/**
 * Up, down or steady, from a student's finished results in time order (oldest first).
 *  - Fewer than MIN_RESULTS_FOR_TREND results: null, there is no trend to speak of.
 *  - Recent is the latest 3 results (the latest 2 when they only have 3, so something is
 *    left to compare with). Earlier is everything before that.
 *  - A move smaller than TREND_TOLERANCE points either way is "steady".
 * @param {number[]} percents  scores in time order, oldest first
 */
export function trendOf(percents, tolerance = TREND_TOLERANCE) {
  const n = percents?.length || 0;
  if (n < MIN_RESULTS_FOR_TREND) return null;
  const recentCount = Math.min(3, n - 1);
  const recent = mean(percents.slice(n - recentCount));
  const earlier = mean(percents.slice(0, n - recentCount));
  const change = recent - earlier;
  if (change > tolerance) return 'up';
  if (change < -tolerance) return 'down';
  return 'steady';
}

/** The name to show for a result. Signed in students may not have one on the result. */
export function nameOf(r) {
  const typed = [r?.username, r?.userName, r?.studentName, r?.displayName].find((v) => typeof v === 'string' && v.trim());
  if (typed) return typed.trim();
  if (r?.isGuest || String(r?.userId || '').startsWith('guest_')) return 'Guest';
  return `Student ${String(r?.userId || '').slice(-4) || 'unknown'}`;
}

/**
 * One row per person for the Students table.
 *  - attempts counts every result, including ones waiting for marking.
 *  - average is over finished results only, null when there are none yet.
 *  - trend is null for guests (a guest session cannot be joined to another) and for anyone
 *    with too few finished results.
 *  - needsHelp is an average below NEEDS_HELP_BELOW.
 * Sorted with the lowest average first, so the people to look at are at the top.
 * @returns {{ id, name, isGuest, attempts, average, trend, needsHelp }[]}
 */
export function studentRows(results) {
  const people = new Map();
  for (const r of results || []) {
    if (!r?.userId) continue;
    if (!people.has(r.userId)) people.set(r.userId, []);
    people.get(r.userId).push(r);
  }

  const rows = [];
  for (const [id, list] of people) {
    // Oldest first. A result with no time sorts first, so it never becomes "latest" by accident.
    const ordered = [...list].sort((a, b) => (toDate(a.completedAt)?.getTime() ?? 0) - (toDate(b.completedAt)?.getTime() ?? 0));
    const isGuest = ordered.some((r) => r.isGuest) || id.startsWith('guest_');
    const percents = ordered.filter(isScored).map(resultPercent);
    const avg = mean(percents);
    // The newest result that carries a name decides the name, in case a guest changed it.
    const named = [...ordered].reverse().find((r) => nameOf(r) !== 'Guest' && !nameOf(r).startsWith('Student ')) || ordered[ordered.length - 1];
    rows.push({
      id,
      name: nameOf(named),
      isGuest,
      attempts: ordered.length,
      average: avg === null ? null : Math.round(avg),
      trend: isGuest ? null : trendOf(percents),
      // Judged on the rounded number the table shows, so "60%" is never flagged.
      needsHelp: avg !== null && Math.round(avg) < NEEDS_HELP_BELOW,
    });
  }

  return rows.sort((a, b) => (a.average ?? Infinity) - (b.average ?? Infinity) || a.name.localeCompare(b.name));
}
