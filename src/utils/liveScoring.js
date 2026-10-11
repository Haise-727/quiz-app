/**
 * The rules of a live game, as plain functions: which questions are playable, how an
 * answer is scored, what a streak or a power-up does, and how players are ranked.
 *
 * Nothing here touches Firebase or React, so scripts/test-live-scoring.mjs can run it
 * under plain Node. utils/liveSession.js re-exports everything, so pages keep importing
 * from there. Like the quiz grading, this is what should move to a server on AWS so a
 * player's browser cannot award itself points (docs/security.md, finding 3).
 *
 * Answer shapes a player writes to answers/{questionIndex}/{playerId}/answer. All are
 * plain JSON with string keys, because the Realtime Database rejects undefined and drops
 * empty objects and arrays:
 *   MCQ                 [optionId, ...]
 *   TRUE_FALSE          boolean
 *   FILL_IN_THE_BLANK   string
 *   MATCH_THE_FOLLOWING { [promptPairId]: pairIdOfTheAnswerDroppedThere }
 *   REORDER             [itemId, ...] in the order the player left them
 *   CATEGORIZE          { [itemId]: categoryId }
 *   *_COMPREHENSION     { ['s' + subQuestionIndex]: [optionId, ...] }
 *   NUMERIC             string, as typed
 *   HOTSPOT             { x, y } percentages of the picture
 *
 * The 's' prefix on the comprehension keys is load bearing. The Realtime Database turns an
 * object whose keys are 0, 1, 2 back into an ARRAY, so a player who answered sub question 2
 * but skipped 0 and 1 would read back as a sparse array padded with nulls. String keys stay
 * an object. getSubAnswers still accepts the array form, so older answers keep grading.
 */
import { getSubQuestions, isComprehension } from './media.js';
import { gradeNumeric, hotspotHit } from './quizAttempt.js';

// ── Which questions are playable ────────────────────────────────────────────────────

export const LIVE_SUPPORTED_TYPES = [
  'MCQ', 'TRUE_FALSE', 'FILL_IN_THE_BLANK',
  'MATCH_THE_FOLLOWING', 'REORDER', 'CATEGORIZE',
  'VISUAL_COMPREHENSION', 'LISTENING_COMPREHENSION',
  'NUMERIC', 'HOTSPOT',
];

/** Realtime Database has no undefined, so answers are normalised to plain maps. */
const asMap = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

/** Key for sub question `index` inside a comprehension answer. Never a bare integer. */
export const subAnswerKey = (index) => `s${index}`;

/**
 * Live mode can only grade a sub question that is an MCQ with a marked answer. Anything else
 * is left out of the board and out of the score, so a player is never shown something their
 * answer cannot earn points for.
 */
export const isGradableSubQuestion = (sub) =>
  sub?.type === 'MCQ'
  && (sub.mcqData?.options?.length || 0) > 0
  && (sub.mcqData?.correctOptions?.length || 0) > 0;

/**
 * Normalises whatever came back from the database into { s0: [...], ... }. Tolerates the two
 * shapes an integer keyed object degrades into: a plain array, and a sparse array padded with
 * nulls when a sub question was skipped. Nulls are dropped rather than scored.
 */
export const getSubAnswers = (answer) => {
  const out = {};
  if (Array.isArray(answer)) {
    answer.forEach((value, i) => { if (value != null) out[subAnswerKey(i)] = value; });
    return out;
  }
  Object.entries(asMap(answer)).forEach(([key, value]) => {
    if (value == null) return;
    out[/^\d+$/.test(key) ? subAnswerKey(key) : key] = value;
  });
  return out;
};

/** A comprehension question with nothing gradable in it is only media on a screen, so it is skipped. */
export function isLivePlayable(question) {
  if (!question || !LIVE_SUPPORTED_TYPES.includes(question.type)) return false;
  if (isComprehension(question.type)) return getSubQuestions(question).some(isGradableSubQuestion);
  return true;
}

/** The questions a live run can play, in the quiz's own order. */
export const getPlayableQuestions = (quiz) => (quiz?.questions || []).filter(isLivePlayable);

/**
 * The questions in the order THIS game plays them. When the host turned on "shuffle", the
 * session stores `order`, a list of positions into the playable questions. Host and players
 * both read it, so everyone sees the same sequence.
 */
export function getPlaySequence(quiz, order) {
  const base = getPlayableQuestions(quiz);
  if (!Array.isArray(order) || order.length !== base.length) return base;
  const seq = order.map((i) => base[i]).filter(Boolean);
  return seq.length === base.length ? seq : base;
}

/** A random order for `count` questions, as positions. */
export function shuffledOrder(count) {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// ── The clock ───────────────────────────────────────────────────────────────────────

/** Every question starts with a short "3, 2, 1", so nobody is still reading the last result. */
export const LEAD_IN_MS = 3000;

/**
 * When the current question's clock runs out, in epoch milliseconds.
 *
 * Normally that is the time limit after the question started. The host overwrites
 * `questionEndsAt` once it knows how long the question's media takes to load and, for audio
 * or video, how long the clip runs, since a 30 second question cannot hold a 90 second
 * recording. Everyone reads the same field, so every screen counts down to the same instant.
 */
export function questionDeadline(session, question) {
  if (!session?.questionStartedAt) return null;
  const limitMs = (parseInt(question?.timeLimit, 10) || 30) * 1000;
  return session.questionEndsAt || session.questionStartedAt + limitMs;
}

// ── Scoring ─────────────────────────────────────────────────────────────────────────

export const STREAK_STEP = 10;      // each answer in a row adds this many percent
export const STREAK_CAP = 50;       // up to this many
export const FIFTY_FIFTY_PENALTY = 0.5;

/**
 * The bonus for a run of correct answers, in percent. `streakBefore` is how many in a row the
 * player had BEFORE this answer, so the first right answer earns nothing, the second +10%,
 * and it tops out at +50% from the sixth.
 */
export const streakBonusPct = (streakBefore) => Math.min(STREAK_CAP, STREAK_STEP * Math.max(0, Number(streakBefore) || 0));

/**
 * Grades one answer.
 *
 * `ratio` is how much of the question the player got right: 0 or 1 for the simple types,
 * and a share for Match, Reorder, Categorize and the comprehension types, which give partial
 * credit. Base points are the question's points times that ratio times a speed factor
 * (50% to 100%, faster is more).
 *
 * Then the modifiers, which only ever reward a FULLY correct answer, so part marks stay modest:
 *   streak bonus  +10% per answer already in a row, to +50%     (host setting)
 *   double points x2 if the player armed it for this question and got it right
 * and one that costs:
 *   50/50         the points are halved if the player used it on this question
 *
 * @param opts { streak, streakBonus, doubled, usedFifty }
 * @returns { correct, ratio, points, parts } where parts explains the sum for the result screen
 */
export function scoreAnswer(question, answer, timeTakenMs, opts = {}) {
  const { streak = 0, streakBonus = false, doubled = false, usedFifty = false } = opts;
  if (!question) return { correct: false, ratio: 0, points: 0, parts: { base: 0, streakPct: 0, doubled: false, usedFifty: false } };

  let ratio = 0;
  switch (question.type) {
    case 'MCQ': {
      const correctIds = question.mcqData.correctOptions.map(String);
      const given = (Array.isArray(answer) ? answer : [answer]).map(String);
      ratio = correctIds.length > 0 && correctIds.length === given.length && correctIds.every((id) => given.includes(id)) ? 1 : 0;
      break;
    }
    case 'TRUE_FALSE':
      ratio = answer === question.trueFalseData.correctAnswer ? 1 : 0;
      break;
    case 'FILL_IN_THE_BLANK':
      ratio = question.fillBlankData.answers
        .map((a) => String(a.text ?? '').trim().toLowerCase())
        .includes(String(answer ?? '').trim().toLowerCase()) && String(answer ?? '').trim() ? 1 : 0;
      break;
    case 'NUMERIC':
      ratio = gradeNumeric(question.numericData, answer) ? 1 : 0;
      break;
    case 'HOTSPOT':
      ratio = hotspotHit(question.hotspotData?.regions, answer) ? 1 : 0;
      break;
    case 'MATCH_THE_FOLLOWING': {
      // Compared on answer text, not id, so two pairs sharing an answer are both accepted,
      // the same rule the quiz page uses.
      const pairs = question.matchData?.pairs || [];
      const dropped = asMap(answer);
      const answerTextById = new Map(pairs.map((p) => [String(p.id), String(p.answer ?? '')]));
      const matched = pairs.filter((p) => {
        const droppedId = dropped[String(p.id)];
        return droppedId != null && answerTextById.get(String(droppedId)) === String(p.answer ?? '');
      }).length;
      ratio = pairs.length ? matched / pairs.length : 0;
      break;
    }
    case 'REORDER': {
      const items = question.reorderData?.items || [];
      const given = Array.isArray(answer) ? answer.map(String) : [];
      const inPlace = items.filter((item, i) => given[i] === String(item.id)).length;
      ratio = items.length ? inPlace / items.length : 0;
      break;
    }
    case 'CATEGORIZE': {
      const items = question.categorizeData?.items || [];
      const placed = asMap(answer);
      const right = items.filter((item) => {
        const categoryId = placed[String(item.id)];
        return categoryId != null && item.categoryId != null && String(categoryId) === String(item.categoryId);
      }).length;
      ratio = items.length ? right / items.length : 0;
      break;
    }
    case 'VISUAL_COMPREHENSION':
    case 'LISTENING_COMPREHENSION': {
      const subs = getSubQuestions(question);
      const given = getSubAnswers(answer);
      let earned = 0; let total = 0;
      subs.forEach((sub, i) => {
        if (!isGradableSubQuestion(sub)) return;
        const worth = Number(sub.points) || 5;
        total += worth;
        const correctIds = sub.mcqData.correctOptions.map(String);
        const picked = given[subAnswerKey(i)];
        const pickedIds = (Array.isArray(picked) ? picked : picked == null ? [] : [picked]).map(String);
        if (correctIds.length === pickedIds.length && correctIds.every((id) => pickedIds.includes(id))) earned += worth;
      });
      ratio = total ? earned / total : 0;
      break;
    }
    default:
      ratio = 0;
  }

  const correct = ratio >= 1;
  const basePoints = Number(question.points) || 10;
  const timeLimitMs = (parseInt(question.timeLimit, 10) || 30) * 1000;
  let base = 0;
  if (ratio > 0) {
    const speedRatio = Math.max(0, Math.min(1, 1 - timeTakenMs / timeLimitMs));
    base = Math.round(basePoints * ratio * (0.5 + 0.5 * speedRatio));
  }

  const streakPct = correct && streakBonus ? streakBonusPct(streak) : 0;
  const isDoubled = !!doubled && correct;
  const points = Math.round(base * (1 + streakPct / 100) * (usedFifty ? FIFTY_FIFTY_PENALTY : 1) * (isDoubled ? 2 : 1));
  return { correct, ratio, points, parts: { base, streakPct, doubled: isDoubled, usedFifty: !!usedFifty } };
}

// ── Power-ups ───────────────────────────────────────────────────────────────────────

/** What every player starts with when the host leaves power-ups on. */
export const STARTING_POWERUPS = { fifty: 1, double: 1 };

/** A small stable number from text, so the same player always hides the same options. */
const hash = (text) => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/**
 * Which options a 50/50 hides on a multiple choice question: enough wrong ones that as many
 * wrong options remain as there are right ones, so half the choices are left. Returns [] when
 * there is nothing to remove (two options, or as many right answers as wrong ones).
 * `seed` makes the choice stable for one player on one question.
 */
export function fiftyFiftyHide(question, seed = '') {
  if (question?.type !== 'MCQ') return [];
  const options = question.mcqData?.options || [];
  const right = new Set((question.mcqData?.correctOptions || []).map(String));
  const wrong = options.filter((o) => !right.has(String(o.id)));
  const hide = wrong.length - right.size;
  if (hide <= 0) return [];
  const ranked = [...wrong].sort((a, b) => hash(`${seed}:${a.id}`) - hash(`${seed}:${b.id}`));
  return ranked.slice(0, hide).map((o) => o.id);
}

// ── Ranking ─────────────────────────────────────────────────────────────────────────

/**
 * Players best first, each with a `rank`. Ties share a rank (1, 2, 2, 4), and a tie is broken
 * for ORDER only by who joined first, so the list does not shuffle between refreshes.
 */
export function rankPlayers(players) {
  const list = Object.entries(asMap(players)).map(([id, p]) => ({ id, ...p, score: Number(p.score) || 0 }));
  list.sort((a, b) => b.score - a.score || (a.joinedAt || 0) - (b.joinedAt || 0));
  let rank = 0; let lastScore = null;
  return list.map((p, i) => {
    if (p.score !== lastScore) { rank = i + 1; lastScore = p.score; }
    return { ...p, rank };
  });
}

/**
 * Where each player stood BEFORE the question just played: their score minus the points that
 * question gave them. Used to show who moved up or down on the leaderboard.
 * @param questionAnswers answers/{questionIndex} for the question just played
 * @returns { [playerId]: rank }
 */
export function previousRanks(players, questionAnswers) {
  const answers = asMap(questionAnswers);
  const before = {};
  Object.entries(asMap(players)).forEach(([id, p]) => {
    before[id] = { ...p, score: (Number(p.score) || 0) - (Number(answers[id]?.points) || 0) };
  });
  const ranks = {};
  rankPlayers(before).forEach((p) => { ranks[p.id] = p.rank; });
  return ranks;
}

/** "1st", "2nd", "3rd", "4th", "11th", "22nd". */
export function ordinal(n) {
  const v = n % 100;
  const suffix = ['th', 'st', 'nd', 'rd'];
  return `${n}${suffix[(v - 20) % 10] || suffix[v] || suffix[0]}`;
}

// ── From the quiz page's answer shape to the live one ───────────────────────────────

/**
 * The live game reuses the quiz page's answer boards, which keep a richer answer (whole items
 * and cards). This flattens one to the plain id shapes documented at the top of this file.
 * @param answer an answer in the shape utils/quizAttempt.js builds
 */
export function toLiveAnswer(question, answer) {
  switch (question.type) {
    case 'MCQ': return Array.isArray(answer) ? answer : [];
    case 'TRUE_FALSE': return answer === true || answer === false ? answer : null;
    case 'FILL_IN_THE_BLANK': return String(answer ?? '');
    case 'NUMERIC': return String(answer ?? '');
    case 'HOTSPOT': return answer && Number.isFinite(answer.x) && Number.isFinite(answer.y) ? { x: answer.x, y: answer.y } : null;
    case 'MATCH_THE_FOLLOWING':
      return Object.fromEntries(Object.entries(asMap(answer?.pairs)).map(([promptId, card]) => [String(promptId), String(card.id)]));
    case 'REORDER':
      return Array.isArray(answer) ? answer.map((item) => String(item.id)) : [];
    case 'CATEGORIZE': {
      const placed = {};
      Object.entries(asMap(answer)).forEach(([columnId, items]) => {
        if (columnId === 'bank' || !Array.isArray(items)) return;
        items.forEach((item) => { placed[String(item.id)] = String(columnId); });
      });
      return placed;
    }
    case 'VISUAL_COMPREHENSION':
    case 'LISTENING_COMPREHENSION': {
      const out = {};
      Object.entries(asMap(answer)).forEach(([index, picked]) => {
        if (Array.isArray(picked) && picked.length) out[subAnswerKey(index)] = picked.map(String);
      });
      return out;
    }
    default: return null;
  }
}

/** Has the player done anything worth sending when the clock runs out? */
export function hasLiveAnswer(question, answer) {
  switch (question.type) {
    case 'MCQ': return Array.isArray(answer) && answer.length > 0;
    case 'TRUE_FALSE': return answer === true || answer === false;
    case 'FILL_IN_THE_BLANK':
    case 'NUMERIC': return String(answer ?? '').trim().length > 0;
    case 'HOTSPOT': return !!answer && Number.isFinite(answer.x) && Number.isFinite(answer.y);
    case 'MATCH_THE_FOLLOWING': return Object.keys(asMap(answer?.pairs)).length > 0;
    case 'REORDER': return false;    // an untouched shuffle is not an answer: nothing is sent, as before
    case 'CATEGORIZE': return Object.entries(asMap(answer)).some(([k, v]) => k !== 'bank' && Array.isArray(v) && v.length > 0);
    case 'VISUAL_COMPREHENSION':
    case 'LISTENING_COMPREHENSION': return Object.values(asMap(answer)).some((v) => Array.isArray(v) && v.length > 0);
    default: return false;
  }
}

// ── Pausing ─────────────────────────────────────────────────────────────────────────

/** Has the host paused the game? `pausedAt` is the server time the pause began. */
export const isPaused = (session) => !!session?.pausedAt;

/**
 * Milliseconds left on the clock. While the game is paused the clock stands still at the
 * moment of the pause, so this keeps returning the same number until the host resumes.
 */
export function remainingMs(session, question, now) {
  const deadline = questionDeadline(session, question);
  if (deadline == null) return null;
  return Math.max(0, deadline - (session.pausedAt || now));
}

/**
 * What to write when the host resumes: the start (and a moved deadline, if there is one) slide
 * later by exactly as long as the pause lasted, so every player gets back the time they had.
 * The 3, 2, 1 works the same way, because a pause during it moves the start that is still ahead.
 */
export function resumeShift(session, now) {
  const paused = Number(session?.pausedAt);
  if (!paused) return { pausedAt: null };
  const gap = Math.max(0, now - paused);
  const out = { pausedAt: null };
  if (session.questionStartedAt) out.questionStartedAt = session.questionStartedAt + gap;
  if (session.questionEndsAt) out.questionEndsAt = session.questionEndsAt + gap;
  return out;
}

// ── Coming back to a game ───────────────────────────────────────────────────────────

/** Names are compared without caring about case or extra spaces: "  Ada  Li" is "ada li". */
export const normalizeName = (name) => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Can someone take this name? A free name is fine. A name held by a player who has dropped
 * (`connected === false`) is theirs to take back, which is how someone rejoins from a new
 * phone with their score kept. A name held by a player who is still connected is taken.
 * @returns {{ status: 'free' } | { status: 'rejoin', id: string } | { status: 'taken' }}
 */
export function claimSeat(players, name) {
  const key = normalizeName(name);
  const holders = Object.entries(asMap(players)).filter(([, p]) => normalizeName(p.name) === key);
  if (holders.length === 0) return { status: 'free' };
  const away = holders.filter(([, p]) => p.connected === false).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
  return away.length ? { status: 'rejoin', id: away[0][0] } : { status: 'taken' };
}

// ── Team mode ───────────────────────────────────────────────────────────────────────

/** Team names. They follow the answer tile order (red, blue, yellow, green) so a team has a colour and a shape. */
export const TEAM_NAMES = ['Red', 'Blue', 'Yellow', 'Green'];
export const TEAM_COUNTS = [2, 3, 4];

/** The team a new player joins: the smallest, and the lowest numbered when sizes tie. */
export function assignTeam(players, teamCount) {
  const sizes = Array.from({ length: teamCount }, () => 0);
  Object.values(asMap(players)).forEach((p) => { if (Number.isInteger(p.team) && p.team >= 0 && p.team < teamCount) sizes[p.team] += 1; });
  return sizes.indexOf(Math.min(...sizes));
}

/** Spread everyone over `teamCount` teams in the order they joined: used when a host turns teams on after people arrived. */
export function assignAllTeams(players, teamCount) {
  const ids = Object.entries(asMap(players)).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0)).map(([id]) => id);
  return Object.fromEntries(ids.map((id, i) => [id, i % teamCount]));
}

/**
 * The team standings. A team's score is the AVERAGE of its players, not the total, so a team
 * with one more player does not win by size. Ties share a rank. Empty teams are left out.
 * @returns {{ team: number, name: string, members: number, total: number, average: number, rank: number }[]}
 */
export function rankTeams(players, teamCount) {
  const rows = Array.from({ length: teamCount }, (_, team) => ({ team, name: TEAM_NAMES[team], members: 0, total: 0 }));
  Object.values(asMap(players)).forEach((p) => {
    if (Number.isInteger(p.team) && rows[p.team]) { rows[p.team].members += 1; rows[p.team].total += Number(p.score) || 0; }
  });
  const list = rows.filter((r) => r.members > 0).map((r) => ({ ...r, average: Math.round(r.total / r.members) }));
  list.sort((a, b) => b.average - a.average || a.team - b.team);
  let rank = 0; let last = null;
  return list.map((r, i) => { if (r.average !== last) { rank = i + 1; last = r.average; } return { ...r, rank }; });
}

// ── Sudden death ────────────────────────────────────────────────────────────────────

/** Has this player been knocked out? `eliminatedAt` is the number of the question that did it. */
export const isOut = (player) => Number.isInteger(player?.eliminatedAt);

export const alivePlayerIds = (players) => Object.entries(asMap(players)).filter(([, p]) => !isOut(p)).map(([id]) => id);

/**
 * Who is out after a question. Anyone still in who did not answer, or did not get it fully
 * right, is out. One rule protects the game: if that would knock out EVERY player still in,
 * nobody goes, so a very hard question can never end the game with no winner.
 * @param answers answers/{questionIndex}
 * @returns {string[]} player ids to eliminate
 */
export function suddenDeathOut(players, answers) {
  const alive = alivePlayerIds(players);
  const failed = alive.filter((id) => !asMap(answers)[id]?.correct);
  return failed.length === alive.length ? [] : failed;
}

/** Is the game over? More than one person started, and one or none is left standing. */
export const suddenDeathOver = (players) => Object.keys(asMap(players)).length > 1 && alivePlayerIds(players).length <= 1;

/**
 * Final order for a sudden death game: everyone still standing first (by score), then those
 * knocked out LATER before those knocked out earlier, then by score. Players in exactly the
 * same position share a rank.
 */
export function rankSuddenDeath(players) {
  const list = Object.entries(asMap(players)).map(([id, p]) => ({ id, ...p, score: Number(p.score) || 0 }));
  const lasted = (p) => (isOut(p) ? p.eliminatedAt : Infinity);
  list.sort((a, b) => lasted(b) - lasted(a) || b.score - a.score || (a.joinedAt || 0) - (b.joinedAt || 0));
  let rank = 0; let lastKey = null;
  return list.map((p, i) => {
    const key = `${lasted(p)}:${p.score}`;
    if (key !== lastKey) { rank = i + 1; lastKey = key; }
    return { ...p, rank };
  });
}
