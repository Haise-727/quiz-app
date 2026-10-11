/**
 * liveSession.js
 * Real-time game sessions, backed by the Firebase Realtime Database (not Firestore:
 * sessions are short lived and written to constantly).
 *
 * This file only talks to the database. The RULES of a game (which questions play, how an
 * answer is scored, streaks, power-ups, ranking) are plain functions in liveScoring.js,
 * which is where they are tested, and they are re-exported from here so pages keep
 * importing from one place.
 *
 * Schema: sessions/{pin}
 *   quizId, quizTitle, hostId, totalQuestions, skippedCount, createdAt
 *   state: 'lobby' | 'question' | 'reveal' | 'leaderboard' | 'ended'
 *   currentQuestionIndex, questionStartedAt, questionEndsAt
 *   settings: { streakBonus, powerUps, shuffle, lockOnStart, teams, suddenDeath }   chosen by the host in the lobby
 *   pausedAt: server time the host paused at, absent while the game runs
 *   order:    [position, ...]                                       only when shuffle is on
 *   players:  { [playerId]: { name, score, streak, bestStreak, correctCount, joinedAt, connected,
 *                             team, eliminatedAt, powerups: { fifty, double }, doubleFor, fiftyFor } }
 *   answers:  { [questionIndex]: { [playerId]: { answer, correct, points, parts, answeredAt } } }
 *
 * Time. Every timestamp is in SERVER time (serverNow below), not the clock of whichever
 * device wrote it. Phones are often a few seconds off, and a question that starts "now"
 * on the host's clock would otherwise have already started, or not yet, for a player.
 * questionStartedAt is set a few seconds in the FUTURE, so everyone sees the same 3, 2, 1.
 *
 * A comprehension question is one live question: the media and every follow up question
 * share one screen, one timer and one score with partial credit.
 */

import { realtimeDb } from '../firebase';
import {
  ref, set, get, update, remove, onValue, runTransaction, onDisconnect,
} from 'firebase/database';
import { isComprehension, getMainMedia, getSubQuestions } from './media';
import {
  getPlayableQuestions, shuffledOrder, scoreAnswer, STARTING_POWERUPS, LEAD_IN_MS,
  claimSeat, assignTeam, assignAllTeams, resumeShift, isOut,
} from './liveScoring';

// Everything pure is re-exported, so `import { scoreAnswer } from '../utils/liveSession'` still works.
export * from './liveScoring';
export { isComprehension, getMainMedia, getSubQuestions };

// ── Server time ─────────────────────────────────────────────────────────────────────

let clockOffset = 0;
let watchingClock = false;

/** Milliseconds since 1970 according to the database server, corrected for this device's clock. */
export function serverNow() {
  if (!watchingClock) {
    watchingClock = true;
    // .info/serverTimeOffset is a virtual path the SDK keeps up to date: server time minus ours.
    onValue(ref(realtimeDb, '.info/serverTimeOffset'), (snap) => { clockOffset = Number(snap.val()) || 0; });
  }
  return Date.now() + clockOffset;
}

// ── Setting up a game ───────────────────────────────────────────────────────────────

/** What the host can switch in the lobby. The first two are on by default: they are the fun part. */
export const DEFAULT_SETTINGS = {
  streakBonus: true,      // answers in a row earn up to +50%
  powerUps: true,         // each player gets one 50/50 and one double points
  shuffle: false,         // play the questions in a random order
  lockOnStart: false,     // nobody can join once the game has started
  teams: 0,               // 0 for everyone on their own, or 2, 3 or 4 teams
  suddenDeath: false,     // a wrong answer knocks you out, the last one standing wins
};

const generatePin = () => Math.floor(100000 + Math.random() * 900000).toString();

export const generateGuestId = () => `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/** Teacher creates a new live session for a quiz. Returns the 6 digit PIN. */
export async function createLiveSession(quiz, hostId, settings = {}) {
  const playableQuestions = getPlayableQuestions(quiz);
  if (!playableQuestions.length) {
    throw new Error('This quiz has no question types supported in live mode (Multiple Choice, True/False, Fill in the Blank, Match, Reorder, Categorize, Visual and Listening Comprehension).');
  }

  let pin = null;
  for (let i = 0; i < 6; i++) {
    const candidate = generatePin();
    const snap = await get(ref(realtimeDb, `sessions/${candidate}`));
    if (!snap.exists()) { pin = candidate; break; }
  }
  if (!pin) throw new Error('Could not generate a unique session code. Please try again.');

  const merged = { ...DEFAULT_SETTINGS, ...settings };
  await set(ref(realtimeDb, `sessions/${pin}`), {
    quizId: quiz.id,
    quizTitle: quiz.title,
    hostId,
    totalQuestions: playableQuestions.length,
    skippedCount: quiz.questions.length - playableQuestions.length,
    state: 'lobby',
    currentQuestionIndex: 0,
    questionStartedAt: null,
    questionEndsAt: null,
    createdAt: serverNow(),
    settings: merged,
    ...(merged.shuffle ? { order: shuffledOrder(playableQuestions.length) } : {}),
    players: {},
    answers: {},
  });
  return pin;
}

/**
 * Host changes a setting while still in the lobby. Turning shuffle on picks a fresh random
 * order and turning it off removes it, so everyone reads the same sequence either way.
 */
export async function updateSettings(pin, quiz, patch) {
  const updates = {};
  const next = { ...patch };
  // Teams and sudden death do not mix: a knocked out player would leave a team half empty.
  if (next.teams > 0) next.suddenDeath = false;
  if (next.suddenDeath) next.teams = 0;
  Object.entries(next).forEach(([key, value]) => { updates[`settings/${key}`] = value; });
  if ('shuffle' in next) updates.order = next.shuffle ? shuffledOrder(getPlayableQuestions(quiz).length) : null;

  // Turning teams on after people have joined spreads them over the teams, and turning it off clears them.
  if ('teams' in next) {
    const snap = await get(ref(realtimeDb, `sessions/${pin}/players`));
    const players = snap.exists() ? snap.val() : {};
    const placement = next.teams > 0 ? assignAllTeams(players, next.teams) : {};
    Object.keys(players).forEach((id) => { updates[`players/${id}/team`] = next.teams > 0 ? placement[id] : null; });
  }
  await update(ref(realtimeDb, `sessions/${pin}`), updates);
}

/** Subscribe to live session updates. Returns an unsubscribe function. */
export function listenToSession(pin, callback) {
  const sessionRef = ref(realtimeDb, `sessions/${pin}`);
  return onValue(sessionRef, (snap) => callback(snap.exists() ? snap.val() : null));
}

// ── Players ─────────────────────────────────────────────────────────────────────────

/**
 * A player (student or guest) joins a session by PIN. Returns { session, playerId }.
 *
 * Joining is also how you come BACK to a game, after a reload, a dropped signal or a new phone:
 *  - the same player id (a signed in student, or a guest whose browser remembered the seat)
 *    simply reconnects and keeps their score and streak;
 *  - a new id with the name of someone who has dropped takes that seat over, score and all, and
 *    the id of the seat is returned so the caller uses it from then on;
 *  - a name held by someone still connected is refused, so two people never share a name.
 * A seat is never deleted when a connection drops. It is only marked `connected: false`.
 */
export async function joinSession(pin, playerId, name) {
  const snap = await get(ref(realtimeDb, `sessions/${pin}`));
  if (!snap.exists()) throw new Error('Game not found. Check the code and try again.');
  const session = snap.val();
  if (session.state === 'ended') throw new Error('This game has already ended.');
  const players = session.players || {};
  const settings = session.settings || {};

  let seatId = playerId;
  let isNewSeat = !players[playerId];
  if (isNewSeat) {
    const claim = claimSeat(players, name);
    if (claim.status === 'taken') throw new Error('Someone in this game is using that name. Try another one.');
    if (claim.status === 'rejoin') { seatId = claim.id; isNewSeat = false; }
  }

  // Only a brand new seat is turned away from a game that has started. A player coming back is not.
  if (isNewSeat && session.state !== 'lobby') {
    if (settings.lockOnStart) throw new Error('This game has already started and is closed to new players.');
    if (settings.suddenDeath) throw new Error('This sudden death game has already started, so no new players can join.');
  }

  const playerRef = ref(realtimeDb, `sessions/${pin}/players/${seatId}`);
  if (isNewSeat) {
    await set(playerRef, {
      name: name || 'Player',
      score: 0,
      streak: 0,
      joinedAt: serverNow(),
      connected: true,
      ...(settings.teams > 0 ? { team: assignTeam(players, settings.teams) } : {}),
      ...(settings.powerUps === false ? {} : { powerups: { ...STARTING_POWERUPS } }),
    });
  } else {
    await update(playerRef, { connected: true });
  }
  // The seat stays when the connection drops. watchPresence (started by the caller) marks it away.
  return { session, playerId: seatId };
}

/**
 * Keeps a seat's `connected` flag true while this browser is online and false when it is not.
 * Firebase tells us when the connection comes and goes (`.info/connected`). Each time it is
 * back we register the "mark me away if I vanish" instruction again, because the server uses
 * it up the moment a drop happens. Returns a function that stops watching.
 */
export function watchPresence(pin, playerId) {
  const connectedRef = ref(realtimeDb, `sessions/${pin}/players/${playerId}/connected`);
  return onValue(ref(realtimeDb, '.info/connected'), (snap) => {
    if (snap.val() !== true) return;
    onDisconnect(connectedRef).set(false).then(() => set(connectedRef, true)).catch(() => {});
  });
}

/** Mark a seat as away (or back) without deleting it. Used when a player's page closes. */
export async function setPresence(pin, playerId, connected) {
  await update(ref(realtimeDb, `sessions/${pin}/players/${playerId}`), { connected });
}

/** Take a player out of the game for good. */
export async function leaveSession(pin, playerId) {
  await remove(ref(realtimeDb, `sessions/${pin}/players/${playerId}`));
}

/** Host removes a player from the game. */
export async function kickPlayer(pin, playerId) {
  await remove(ref(realtimeDb, `sessions/${pin}/players/${playerId}`));
}

// ── Running the game (host) ─────────────────────────────────────────────────────────

/** Starts a question after the short 3, 2, 1 that everyone sees at the same moment. */
const beginQuestion = (index) => ({
  state: 'question',
  currentQuestionIndex: index,
  questionStartedAt: serverNow() + LEAD_IN_MS,
  questionEndsAt: null,       // cleared, or the previous question's extended clock would leak into this one
  pausedAt: null,
});

export async function startGame(pin) {
  await update(ref(realtimeDb, `sessions/${pin}`), beginQuestion(0));
}

export async function nextQuestion(pin, nextIndex) {
  await update(ref(realtimeDb, `sessions/${pin}`), beginQuestion(nextIndex));
}

/** Close the question and show the answer. */
export async function revealQuestion(pin) {
  await update(ref(realtimeDb, `sessions/${pin}`), { state: 'reveal', pausedAt: null });
}

/**
 * Sudden death: mark the players this question knocked out. The host calls it a moment AFTER the
 * reveal, not in the same write, because a player's answer is stored a beat after their screen says
 * "locked in", and a right answer still on its way must not count as a missing one.
 */
export async function eliminatePlayers(pin, ids, questionIndex) {
  if (!ids.length) return;
  const updates = {};
  ids.forEach((id) => { updates[`players/${id}/eliminatedAt`] = questionIndex; });
  await update(ref(realtimeDb, `sessions/${pin}`), updates);
}

/** Freeze the clock for everyone. */
export async function pauseGame(pin) {
  await update(ref(realtimeDb, `sessions/${pin}`), { pausedAt: serverNow() });
}

/** Unfreeze it. Everyone gets back exactly the time they had (see resumeShift). */
export async function resumeGame(pin, session) {
  await update(ref(realtimeDb, `sessions/${pin}`), resumeShift(session, serverNow()));
}

export async function showLeaderboard(pin) {
  await update(ref(realtimeDb, `sessions/${pin}`), { state: 'leaderboard' });
}

/** Host only: move the deadline of the question in play (see questionDeadline in liveScoring.js). */
export async function setQuestionDeadline(pin, endsAt) {
  await update(ref(realtimeDb, `sessions/${pin}`), { questionEndsAt: endsAt });
}

export async function endGame(pin) {
  await update(ref(realtimeDb, `sessions/${pin}`), { state: 'ended' });
}

export async function deleteSession(pin) {
  await remove(ref(realtimeDb, `sessions/${pin}`));
}

// ── Answering (player) ──────────────────────────────────────────────────────────────

/**
 * Spends a power-up on the question in play. Returns true if the player had one left.
 * `fifty` and `double` are each used once per game, and each is tied to one question so it
 * cannot leak into the next.
 */
export async function spendPowerUp(pin, playerId, kind, questionIndex) {
  let used = false;
  await runTransaction(ref(realtimeDb, `sessions/${pin}/players/${playerId}`), (player) => {
    if (!player) return player;
    const left = Number(player.powerups?.[kind]) || 0;
    used = left > 0;
    if (!used) return player;
    player.powerups = { ...player.powerups, [kind]: left - 1 };
    if (kind === 'double') player.doubleFor = questionIndex;
    if (kind === 'fifty') player.fiftyFor = questionIndex;
    return player;
  });
  return used;
}

/**
 * A player locks in an answer. Their score, streak and the stored answer are all worked out
 * here from the player's own record, so a streak bonus or a double points can never be applied
 * twice, and answering twice returns the first result instead of scoring again.
 *
 * @param settings the session's settings, which the caller already has from the live listener
 */
export async function submitAnswer(pin, questionIndex, playerId, answer, question, timeTakenMs, settings = {}) {
  const answerRef = ref(realtimeDb, `sessions/${pin}/answers/${questionIndex}/${playerId}`);
  const existing = await get(answerRef);
  if (existing.exists()) {
    const { correct, points, parts } = existing.val();
    return { correct, points, parts };
  }

  let outcome = null;
  let knockedOut = false;
  await runTransaction(ref(realtimeDb, `sessions/${pin}/players/${playerId}`), (player) => {
    if (!player) return player;
    if (isOut(player)) { knockedOut = true; return player; }      // a player who is out cannot score
    outcome = scoreAnswer(question, answer, timeTakenMs, {
      streak: player.streak || 0,
      streakBonus: settings.streakBonus !== false,
      doubled: player.doubleFor === questionIndex,
      usedFifty: player.fiftyFor === questionIndex,
    });
    player.score = (player.score || 0) + outcome.points;
    player.streak = outcome.correct ? (player.streak || 0) + 1 : 0;
    player.bestStreak = Math.max(player.bestStreak || 0, player.streak);
    player.correctCount = (player.correctCount || 0) + (outcome.correct ? 1 : 0);
    return player;
  });
  if (knockedOut) throw new Error('You are out of this game, but you can keep watching.');
  if (!outcome) throw new Error('You are no longer in this game.');

  await set(answerRef, {
    answer, correct: outcome.correct, points: outcome.points, parts: outcome.parts, answeredAt: serverNow(),
  });
  return { correct: outcome.correct, points: outcome.points, parts: outcome.parts };
}
