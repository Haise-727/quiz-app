/**
 * Quizlike progress: XP, levels, streaks and badges.
 *
 * Everything here is DERIVED from quiz results that already exist. Nothing extra is
 * stored, so there is no new field in the database for anyone to edit. If a result is
 * graded later (a teacher marks a paragraph answer), XP, level and badges simply
 * update the next time they are computed.
 *
 * These are plain functions with no React and no Firebase in them. If the app ever gets a
 * server of its own they can be copied onto it unchanged, which is the point: that is where
 * progress should eventually be computed so the browser cannot invent it. See
 * docs/security.md.
 *
 * A "result" in this file is the normalised shape from normalizeResult():
 *   { quizId, finalScore, maxScore, questionCount, completedAt: Date, status, kind }
 *
 * `kind` is 'quiz' for a normal graded attempt and 'daily' for the one question a day
 * (src/utils/daily.js). A daily result is stored in the same collection, but it only
 * feeds the STREAK, the XP total and the "Daily habit" badge. It never counts as a quiz
 * attempt, so it cannot change attempts, distinct quizzes, perfects, comebacks or the
 * badges built on them.
 */

// ── XP ──────────────────────────────────────────────────────────────────────────────

export const XP_RULES = {
  perQuestion: 10,      // for a question answered fully right, scaled by accuracy
  participation: 2,     // just for finishing each question, right or wrong
  perfectBonus: 25,     // a flawless attempt
  maxPerAttempt: 250,   // so a giant junk quiz cannot be farmed for levels
  dailyRight: 15,       // the daily question answered correctly, flat
  dailyWrong: 5,        // the daily question answered wrong, flat (showing up still counts)
};

/** Is this the one-a-day question rather than a normal quiz attempt? */
export const isDailyResult = (r) => r?.kind === 'daily';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** XP for one attempt. Accuracy is the share of points earned, so partial credit counts. */
export function xpForAttempt({ finalScore, maxScore, questionCount, kind }) {
  // The daily question is flat: it has one question, so the per-quiz formula (which gives a
  // perfect bonus on top) does not apply. Each day is its own quizId, so the best-attempt
  // rule in totalXp already limits it to once per day.
  if (kind === 'daily') {
    return Number(maxScore) > 0 && Number(finalScore) >= Number(maxScore) ? XP_RULES.dailyRight : XP_RULES.dailyWrong;
  }
  const questions = Math.max(0, Number(questionCount) || 0);
  const accuracy = Number(maxScore) > 0 ? clamp(Number(finalScore) / Number(maxScore), 0, 1) : 0;
  const raw =
    Math.round(questions * XP_RULES.perQuestion * accuracy) +
    questions * XP_RULES.participation +
    (accuracy === 1 && questions > 0 ? XP_RULES.perfectBonus : 0);
  return Math.min(raw, XP_RULES.maxPerAttempt);
}

/**
 * Total XP. Only the BEST attempt on each quiz counts, so retaking one quiz over and over
 * cannot farm levels, but improving your score on it still pays.
 */
export function totalXp(results) {
  const best = new Map();
  for (const r of results) {
    const xp = xpForAttempt(r);
    if (xp > (best.get(r.quizId) ?? -1)) best.set(r.quizId, xp);
  }
  let sum = 0;
  best.forEach((xp) => { sum += xp; });
  return sum;
}

// ── Levels ──────────────────────────────────────────────────────────────────────────

/** XP needed to reach a level. Level 2 is 100 XP (one decent quiz), then it steepens. */
export const xpToReach = (level) => 50 * level * (level - 1);

const TITLES = [
  [1, 'Newcomer'], [2, 'Learner'], [3, 'Regular'], [5, 'Sharp'],
  [8, 'Scholar'], [12, 'Expert'], [18, 'Master'], [25, 'Legend'],
];

export function levelInfo(xp) {
  const safe = Math.max(0, Math.floor(xp) || 0);
  const level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * safe) / 50)) / 2));
  const start = xpToReach(level);
  const next = xpToReach(level + 1);
  const title = [...TITLES].reverse().find(([from]) => level >= from)[1];
  return {
    level, title, xp: safe,
    levelStartXp: start, nextLevelXp: next,
    intoLevel: safe - start, span: next - start,
    progress: (safe - start) / (next - start),     // 0 to 1 within the current level
  };
}

// ── Streaks ─────────────────────────────────────────────────────────────────────────

/** Whole days since 1970 in the visitor's own time zone, so "today" means their today. */
const localDay = (date) => Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000);

/**
 * Days in a row with at least one finished quiz. The streak stays alive until the end of
 * the day after your last quiz, so it only breaks when you actually miss a whole day.
 */
export function streakInfo(results, now = new Date()) {
  const days = [...new Set(results.map((r) => localDay(r.completedAt)))].sort((a, b) => a - b);
  if (!days.length) return { current: 0, best: 0, doneToday: false };

  let best = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    run = days[i] === days[i - 1] + 1 ? run + 1 : 1;
    if (run > best) best = run;
  }

  const today = localDay(now);
  const last = days[days.length - 1];
  let current = 0;
  if (last === today || last === today - 1) {
    current = 1;
    for (let i = days.length - 1; i > 0 && days[i] === days[i - 1] + 1; i--) current++;
  }
  return { current, best, doneToday: last === today };
}

// ── Stats and badges ────────────────────────────────────────────────────────────────

export function statsFromResults(results, now = new Date()) {
  // XP and the streak use every result, daily ones included. Everything else is about
  // quizzes only, so it reads `quizzes`: a daily answer must not look like a quiz attempt.
  const xp = totalXp(results);
  const quizzes = results.filter((r) => !isDailyResult(r));
  const dailyDays = new Set(results.filter(isDailyResult).map((r) => r.quizId)).size;   // quizId is daily-<date>
  const byQuiz = new Map();
  for (const r of quizzes) {
    if (!byQuiz.has(r.quizId)) byQuiz.set(r.quizId, []);
    byQuiz.get(r.quizId).push(r);
  }
  const accuracy = (r) => (r.maxScore > 0 ? r.finalScore / r.maxScore : 0);

  // A "comeback" is a retake that beat the earlier attempt on the same quiz.
  let comebacks = 0;
  byQuiz.forEach((list) => {
    const ordered = [...list].sort((a, b) => a.completedAt - b.completedAt);
    let bestSoFar = accuracy(ordered[0]);
    let improved = false;
    for (let i = 1; i < ordered.length; i++) {
      if (accuracy(ordered[i]) > bestSoFar) improved = true;
      bestSoFar = Math.max(bestSoFar, accuracy(ordered[i]));
    }
    if (improved) comebacks++;
  });

  return {
    attempts: quizzes.length,
    distinctQuizzes: byQuiz.size,
    dailyDays,
    perfect: quizzes.filter((r) => r.maxScore > 0 && r.finalScore >= r.maxScore).length,
    comebacks,
    xp,
    level: levelInfo(xp).level,
    streak: streakInfo(results, now),
  };
}

/**
 * Badge definitions. `icon` is a key, the UI decides which drawing to use, so this file
 * stays free of React. `tone` picks one of the pastel tints in the theme.
 * Each badge is "value >= target", which also gives the progress bar for locked ones.
 */
export const BADGES = [
  { id: 'first-steps',   name: 'First steps',    hint: 'Finish your first quiz',          icon: 'flag',      tone: 'green',  target: 1,  value: (s) => s.attempts },
  { id: 'warming-up',    name: 'Warming up',     hint: 'Finish 5 quizzes',                icon: 'fire',      tone: 'yellow', target: 5,  value: (s) => s.attempts },
  { id: 'regular',       name: 'Regular',        hint: 'Finish 15 quizzes',               icon: 'calendar',  tone: 'blue',   target: 15, value: (s) => s.attempts },
  { id: 'perfect',       name: 'Flawless',       hint: 'Score 100% on a quiz',            icon: 'target',    tone: 'green',  target: 1,  value: (s) => s.perfect },
  { id: 'flawless-trio', name: 'Hat trick',      hint: 'Score 100% three times',          icon: 'crown',     tone: 'yellow', target: 3,  value: (s) => s.perfect },
  { id: 'explorer',      name: 'Explorer',       hint: 'Try 5 different quizzes',         icon: 'compass',   tone: 'blue',   target: 5,  value: (s) => s.distinctQuizzes },
  { id: 'comeback',      name: 'Comeback',       hint: 'Beat your own score on a retake', icon: 'trend',     tone: 'green',  target: 1,  value: (s) => s.comebacks },
  { id: 'streak-3',      name: 'Three days',     hint: 'Quiz three days in a row',        icon: 'flame',     tone: 'yellow', target: 3,  value: (s) => s.streak.best },
  { id: 'streak-7',      name: 'One week',       hint: 'Quiz seven days in a row',        icon: 'flame',     tone: 'red',    target: 7,  value: (s) => s.streak.best },
  { id: 'streak-30',     name: 'Thirty days',    hint: 'Quiz thirty days in a row',       icon: 'flame',     tone: 'red',    target: 30, value: (s) => s.streak.best },
  { id: 'level-5',       name: 'Sharp',          hint: 'Reach level 5',                   icon: 'star',      tone: 'blue',   target: 5,  value: (s) => s.level },
  { id: 'daily-habit',   name: 'Daily habit',    hint: 'Answer the daily question on 7 days', icon: 'sun',   tone: 'blue',   target: 7,  value: (s) => s.dailyDays },
];

/** Every badge with how far along it is. Earned ones have earned: true. */
export function badgeProgress(stats) {
  return BADGES.map((b) => {
    const value = Math.min(b.value(stats), b.target);
    return { id: b.id, name: b.name, hint: b.hint, icon: b.icon, tone: b.tone, value, target: b.target, earned: value >= b.target };
  });
}

// ── What one attempt changed ────────────────────────────────────────────────────────

/**
 * Compare progress before and after a new attempt. This feeds the reward screen:
 * XP gained, a level up, and any badge that just unlocked.
 * @param before results that existed before this attempt
 * @param after  the same list plus the new attempt
 */
export function progressSummary(before, after, now = new Date()) {
  const sBefore = statsFromResults(before, now);
  const sAfter = statsFromResults(after, now);
  const earnedBefore = new Set(badgeProgress(sBefore).filter((b) => b.earned).map((b) => b.id));
  const newBadges = badgeProgress(sAfter).filter((b) => b.earned && !earnedBefore.has(b.id));
  return {
    xpBefore: sBefore.xp,
    xpAfter: sAfter.xp,
    xpGained: sAfter.xp - sBefore.xp,
    levelBefore: levelInfo(sBefore.xp),
    levelAfter: levelInfo(sAfter.xp),
    leveledUp: sAfter.level > sBefore.level,
    streakBefore: sBefore.streak,
    streakAfter: sAfter.streak,
    newBadges,
    stats: sAfter,
  };
}

// ── Reading results ─────────────────────────────────────────────────────────────────

/** Turns a Firestore result (or a locally stored guest result) into the shape above. */
export function normalizeResult(raw) {
  if (!raw) return null;
  const at = raw.completedAt;
  let completedAt;
  if (at instanceof Date) completedAt = new Date(at.getTime());               // already a Date
  else if (at && typeof at.toDate === 'function') completedAt = at.toDate();  // Firestore Timestamp
  else if (at && typeof at.seconds === 'number') completedAt = new Date(at.seconds * 1000);
  else if (typeof at === 'string' || typeof at === 'number') completedAt = new Date(at);
  else completedAt = new Date();   // serverTimestamp() has not resolved yet: it was just written
  if (Number.isNaN(completedAt.getTime())) completedAt = new Date();

  return {
    quizId: String(raw.quizId ?? ''),
    finalScore: Number(raw.finalScore ?? raw.score ?? 0),
    maxScore: Number(raw.maxScore ?? 0),
    questionCount: Number(raw.questionCount ?? (Array.isArray(raw.answers) ? raw.answers.length : 0)),
    completedAt,
    status: raw.status || 'completed',
    kind: raw.kind === 'daily' ? 'daily' : 'quiz',
  };
}
