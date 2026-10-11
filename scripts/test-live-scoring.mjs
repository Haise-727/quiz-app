#!/usr/bin/env node
/**
 * Tests for src/utils/liveScoring.js. No dependencies:
 *   node scripts/test-live-scoring.mjs
 *
 * Live scoring decides who wins a game, so it is tested on its own, away from Firebase.
 * When scoring moves to a server on AWS, run this same file against the ported version.
 */
import assert from 'node:assert/strict';
import {
  scoreAnswer, streakBonusPct, fiftyFiftyHide, rankPlayers, previousRanks, ordinal, toLiveAnswer, hasLiveAnswer,
  getSubAnswers, subAnswerKey, isLivePlayable, getPlayableQuestions, getPlaySequence, shuffledOrder, questionDeadline,
  STREAK_CAP, FIFTY_FIFTY_PENALTY,
  isPaused, remainingMs, resumeShift, normalizeName, claimSeat, TEAM_NAMES, assignTeam, assignAllTeams, rankTeams,
  isOut, alivePlayerIds, suddenDeathOut, suddenDeathOver, rankSuddenDeath, LIVE_SUPPORTED_TYPES,
} from '../src/utils/liveScoring.js';
import { initialAnswer, dragAnswer, changeAnswer } from '../src/utils/quizAttempt.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; } };

// ── fixtures ────────────────────────────────────────────────────────────────────────
const opt = (id) => ({ id, text: `o${id}`, media: null });
const mcq = (correct, ids = [1, 2, 3, 4], extra = {}) => ({ type: 'MCQ', points: 100, timeLimit: 20, mcqData: { options: ids.map(opt), correctOptions: correct }, ...extra });
const tf = (v) => ({ type: 'TRUE_FALSE', points: 100, timeLimit: 20, trueFalseData: { correctAnswer: v } });
const fill = (...answers) => ({ type: 'FILL_IN_THE_BLANK', points: 100, timeLimit: 20, fillBlankData: { answers: answers.map((text) => ({ text })) } });
const match = () => ({ type: 'MATCH_THE_FOLLOWING', points: 90, timeLimit: 20, matchData: { pairs: [
  { id: 'p1', prompt: 'A', answer: 'one' }, { id: 'p2', prompt: 'B', answer: 'two' }, { id: 'p3', prompt: 'C', answer: 'three' }] } });
const reorder = () => ({ type: 'REORDER', points: 100, timeLimit: 20, reorderData: { items: [{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }, { id: 'c', text: 'c' }, { id: 'd', text: 'd' }] } });
const categorize = () => ({ type: 'CATEGORIZE', points: 100, timeLimit: 20, categorizeData: {
  categories: [{ id: 'c1', name: 'One' }, { id: 'c2', name: 'Two' }],
  items: [{ id: 'i1', text: 'x', categoryId: 'c1' }, { id: 'i2', text: 'y', categoryId: 'c1' }, { id: 'i3', text: 'z', categoryId: 'c2' }, { id: 'i4', text: 'w', categoryId: 'c2' }] } });
const sub = (correct, points = 10) => ({ type: 'MCQ', points, mcqData: { options: [opt(1), opt(2)], correctOptions: correct } });
const comp = (subs, points = 100) => ({ type: 'LISTENING_COMPREHENSION', points, timeLimit: 40, listeningData: { subQuestions: subs } });

console.log('base scoring and speed');
test('an instant correct answer earns the full points', () => assert.equal(scoreAnswer(mcq([2]), [2], 0).points, 100));
test('a correct answer at the buzzer earns half', () => assert.equal(scoreAnswer(mcq([2]), [2], 20000).points, 50));
test('speed is linear between the two', () => assert.equal(scoreAnswer(mcq([2]), [2], 10000).points, 75));
test('past the time limit still earns the floor, never negative', () => assert.equal(scoreAnswer(mcq([2]), [2], 99999).points, 50));
test('wrong, empty and missing answers earn nothing and never throw', () => {
  assert.equal(scoreAnswer(mcq([2]), [1], 0).points, 0);
  assert.equal(scoreAnswer(mcq([2]), [], 0).points, 0);
  assert.equal(scoreAnswer(mcq([2]), undefined, 0).points, 0);
  assert.equal(scoreAnswer(null, [1], 0).points, 0);
});
test('multiple correct options need exactly the right set', () => {
  assert.equal(scoreAnswer(mcq([1, 2]), [2, 1], 0).correct, true);
  assert.equal(scoreAnswer(mcq([1, 2]), [1], 0).correct, false);
  assert.equal(scoreAnswer(mcq([1, 2]), [1, 2, 3], 0).correct, false);
});
test('ids compare as text', () => assert.equal(scoreAnswer(mcq(['2']), [2], 0).correct, true));
test('true or false, including false as a real answer', () => {
  assert.equal(scoreAnswer(tf(false), false, 0).correct, true);
  assert.equal(scoreAnswer(tf(true), false, 0).correct, false);
  assert.equal(scoreAnswer(tf(false), null, 0).correct, false);
});
test('fill in ignores case and outer spaces, and an empty answer is never right', () => {
  assert.equal(scoreAnswer(fill('Tone'), ' tone ', 0).correct, true);
  assert.equal(scoreAnswer(fill('tone '), 'TONE', 0).correct, true);
  assert.equal(scoreAnswer(fill(''), '', 0).correct, false);
});
test('match gives partial credit and compares on answer text', () => {
  const full = scoreAnswer(match(), { p1: 'p1', p2: 'p2', p3: 'p3' }, 0);
  assert.equal(full.correct, true); assert.equal(full.points, 90);
  const two = scoreAnswer(match(), { p1: 'p1', p2: 'p2', p3: 'p1' }, 0);
  assert.equal(two.correct, false); assert.equal(two.points, 60);
});
test('reorder gives the share of items in the right place', () => {
  assert.equal(scoreAnswer(reorder(), ['a', 'b', 'c', 'd'], 0).points, 100);
  assert.equal(scoreAnswer(reorder(), ['a', 'b', 'd', 'c'], 0).points, 50);
});
test('categorize gives the share in the right category, and ignores items with no category', () => {
  assert.equal(scoreAnswer(categorize(), { i1: 'c1', i2: 'c1', i3: 'c2', i4: 'c2' }, 0).points, 100);
  assert.equal(scoreAnswer(categorize(), { i1: 'c1', i2: 'c2', i3: 'c2', i4: 'c1' }, 0).points, 50);
});
test('comprehension scores the share of follow up points', () => {
  assert.equal(scoreAnswer(comp([sub([1]), sub([2])]), { s0: [1], s1: [2] }, 0).points, 100);
  assert.equal(scoreAnswer(comp([sub([1]), sub([2])]), { s0: [1], s1: [1] }, 0).points, 50);
});
test('comprehension: a skipped follow up never corrupts the answer, in either stored shape', () => {
  const q = comp([sub([1]), sub([2]), sub([1])]);
  assert.equal(scoreAnswer(q, { s2: [1] }, 0).points, Math.round(100 * (1 / 3)));
  assert.equal(scoreAnswer(q, [null, null, [1]], 0).points, Math.round(100 * (1 / 3)));   // what an int keyed object reads back as
  assert.deepEqual(getSubAnswers([null, ['x']]), { s1: ['x'] });
  assert.deepEqual(getSubAnswers({ 0: ['x'], s2: ['y'] }), { s0: ['x'], s2: ['y'] });
});

console.log('streak bonus');
test('the bonus steps up by 10 percent and stops at the cap', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 20].map(streakBonusPct), [0, 10, 20, 30, 40, 50, 50, 50]);
  assert.equal(STREAK_CAP, 50);
});
test('junk streaks give no bonus and never NaN', () => {
  assert.equal(streakBonusPct(-3), 0); assert.equal(streakBonusPct(undefined), 0); assert.equal(streakBonusPct('x'), 0);
});
test('it multiplies a correct answer when the host has it on', () => {
  const r = scoreAnswer(mcq([2]), [2], 0, { streak: 3, streakBonus: true });
  assert.equal(r.points, 130); assert.equal(r.parts.streakPct, 30);
});
test('it does nothing when the host has it off', () => assert.equal(scoreAnswer(mcq([2]), [2], 0, { streak: 5, streakBonus: false }).points, 100));
test('it never rewards a wrong or part right answer', () => {
  assert.equal(scoreAnswer(mcq([2]), [1], 0, { streak: 5, streakBonus: true }).points, 0);
  const partial = scoreAnswer(reorder(), ['a', 'b', 'd', 'c'], 0, { streak: 5, streakBonus: true });
  assert.equal(partial.points, 50); assert.equal(partial.parts.streakPct, 0);
});

console.log('power-ups');
test('double points doubles a correct answer', () => {
  const r = scoreAnswer(mcq([2]), [2], 0, { doubled: true });
  assert.equal(r.points, 200); assert.equal(r.parts.doubled, true);
});
test('double points is wasted on a wrong answer', () => {
  const r = scoreAnswer(mcq([2]), [1], 0, { doubled: true });
  assert.equal(r.points, 0); assert.equal(r.parts.doubled, false);
});
test('using 50/50 halves the points', () => {
  assert.equal(FIFTY_FIFTY_PENALTY, 0.5);
  assert.equal(scoreAnswer(mcq([2]), [2], 0, { usedFifty: true }).points, 50);
});
test('everything together multiplies, with one rounding at the end', () => {
  // base 100, streak +20%, 50/50 halves, double doubles: 100 * 1.2 * 0.5 * 2 = 120
  assert.equal(scoreAnswer(mcq([2]), [2], 0, { streak: 2, streakBonus: true, usedFifty: true, doubled: true }).points, 120);
  // a speed factor that gives an awkward base: 100 * 0.5 + 100 * 0.5 * (1 - 7/20) ... rounds once
  const r = scoreAnswer(mcq([2]), [2], 7000, { streak: 1, streakBonus: true });
  assert.equal(r.points, Math.round(Math.round(100 * (0.5 + 0.5 * (1 - 7 / 20))) * 1.1));
});
test('50/50 hides enough wrong options to leave half, and never the right one', () => {
  const q = mcq([3]);
  const hidden = fiftyFiftyHide(q, 'p1');
  assert.equal(hidden.length, 2); assert.equal(hidden.includes(3), false);
  assert.equal(new Set(hidden).size, 2);
});
test('50/50 is stable for one player and varies between players', () => {
  const q = mcq([3], [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(fiftyFiftyHide(q, 'same'), fiftyFiftyHide(q, 'same'));
  const outcomes = new Set(Array.from({ length: 30 }, (_, i) => fiftyFiftyHide(q, `player${i}`).join()));
  assert.ok(outcomes.size > 1, 'different players should not all lose the same options');
});
test('50/50 does nothing when there is nothing to remove', () => {
  assert.deepEqual(fiftyFiftyHide(mcq([1], [1, 2]), 's'), []);                  // two options
  assert.deepEqual(fiftyFiftyHide(mcq([1, 2], [1, 2, 3, 4]), 's'), []);         // as many right as wrong
  assert.deepEqual(fiftyFiftyHide(tf(true), 's'), []);                           // not multiple choice
  assert.deepEqual(fiftyFiftyHide(null, 's'), []);
});
test('with 3 options it removes one wrong one', () => assert.equal(fiftyFiftyHide(mcq([1], [1, 2, 3]), 's').length, 1));

console.log('ranking');
test('ranks by score with ties sharing a rank', () => {
  const r = rankPlayers({ a: { score: 100 }, b: { score: 300 }, c: { score: 300 }, d: { score: 50 } });
  assert.deepEqual(r.map((p) => [p.id, p.rank]), [['b', 1], ['c', 1], ['a', 3], ['d', 4]]);
});
test('a tie is ordered by who joined first, so the list does not shuffle', () => {
  const r = rankPlayers({ late: { score: 10, joinedAt: 200 }, early: { score: 10, joinedAt: 100 } });
  assert.deepEqual(r.map((p) => p.id), ['early', 'late']);
});
test('no players, junk players', () => { assert.deepEqual(rankPlayers(null), []); assert.deepEqual(rankPlayers({ x: {} })[0].score, 0); });
test('previous ranks remove the points just earned', () => {
  const players = { a: { score: 150 }, b: { score: 120 } };
  assert.deepEqual(previousRanks(players, { a: { points: 100 }, b: { points: 20 } }), { a: 2, b: 1 });   // b led before, a overtook
  assert.deepEqual(previousRanks(players, null), { a: 1, b: 2 });
});
test('ordinals', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal),
    ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th']);
});

console.log('which questions play, and in what order');
test('only gradable question types are playable', () => {
  assert.equal(isLivePlayable(mcq([1])), true);
  assert.equal(isLivePlayable({ type: 'PARAGRAPH' }), false);
  assert.equal(isLivePlayable(comp([{ type: 'PARAGRAPH' }])), false);   // nothing in it can be graded
  assert.equal(isLivePlayable(comp([sub([1])])), true);
  assert.equal(isLivePlayable(null), false);
});
test('shuffle order is a permutation and is applied to the playable questions', () => {
  const quiz = { questions: [mcq([1]), { type: 'PARAGRAPH' }, tf(true), fill('x')] };
  const base = getPlayableQuestions(quiz);
  assert.equal(base.length, 3);
  const order = shuffledOrder(3);
  assert.deepEqual([...order].sort(), [0, 1, 2]);
  assert.deepEqual(getPlaySequence(quiz, [2, 0, 1]), [base[2], base[0], base[1]]);
});
test('a missing or wrong sized order falls back to the quiz order', () => {
  const quiz = { questions: [mcq([1]), tf(true)] };
  assert.deepEqual(getPlaySequence(quiz, null), getPlayableQuestions(quiz));
  assert.deepEqual(getPlaySequence(quiz, [0]), getPlayableQuestions(quiz));
  assert.deepEqual(getPlaySequence(quiz, [5, 9]), getPlayableQuestions(quiz));
});
test('the deadline is the start plus the limit, unless the host moved it', () => {
  assert.equal(questionDeadline({ questionStartedAt: 1000 }, { timeLimit: 20 }), 21000);
  assert.equal(questionDeadline({ questionStartedAt: 1000, questionEndsAt: 99000 }, { timeLimit: 20 }), 99000);
  assert.equal(questionDeadline({}, { timeLimit: 20 }), null);
});

console.log('quiz page answers to live answers, scored end to end');
test('every drag type, placed the way a person places it, scores full marks', () => {
  // Match
  let q = match(); let a = initialAnswer(q);
  [['p1', 'p1'], ['p2', 'p2'], ['p3', 'p3']].forEach(([slot, cardId]) => {
    const index = a.bank.findIndex((c) => c.id === cardId);
    a = dragAnswer(q, a, { droppableId: 'bank', index }, { droppableId: slot, index: 0 });
  });
  assert.equal(scoreAnswer(q, toLiveAnswer(q, a), 0).correct, true);
  // Categorize
  q = categorize(); a = initialAnswer(q);
  q.categorizeData.items.forEach((item) => {
    const index = a.bank.findIndex((c) => c.id === item.id);
    a = dragAnswer(q, a, { droppableId: 'bank', index }, { droppableId: item.categoryId, index: 0 });
  });
  assert.equal(scoreAnswer(q, toLiveAnswer(q, a), 0).correct, true);
  // Reorder: sort the shuffled list back into order with real moves
  q = reorder(); a = initialAnswer(q);
  'abcd'.split('').forEach((id, target) => {
    const from = a.findIndex((it) => it.id === id);
    a = dragAnswer(q, a, { index: from }, { index: target });
  });
  assert.equal(scoreAnswer(q, toLiveAnswer(q, a), 0).correct, true);
});
test('the live shapes are plain ids with string keys', () => {
  const q = match(); const a = { pairs: { p1: { id: 'p2', answerText: 'two' } }, bank: [] };
  assert.deepEqual(toLiveAnswer(q, a), { p1: 'p2' });
  assert.deepEqual(toLiveAnswer(reorder(), [{ id: 'b' }, { id: 'a' }]), ['b', 'a']);
  assert.deepEqual(toLiveAnswer(categorize(), { c1: [{ id: 'i1' }], c2: [], bank: [{ id: 'i2' }] }), { i1: 'c1' });
});
test('comprehension answers get the s prefix and drop empty follow ups', () => {
  const q = comp([sub([1]), sub([2]), sub([1])]);
  let a = initialAnswer(q); a = changeAnswer(q, a, 1, 2);
  assert.deepEqual(toLiveAnswer(q, a), { s2: ['1'] });
  assert.deepEqual(toLiveAnswer(q, initialAnswer(q)), {});
});
test('nothing touched means nothing to send', () => {
  assert.equal(hasLiveAnswer(mcq([1]), []), false);
  assert.equal(hasLiveAnswer(mcq([1]), [1]), true);
  assert.equal(hasLiveAnswer(tf(true), null), false);
  assert.equal(hasLiveAnswer(tf(true), false), true);
  assert.equal(hasLiveAnswer(fill('x'), '  '), false);
  assert.equal(hasLiveAnswer(match(), { pairs: {}, bank: [1] }), false);
  assert.equal(hasLiveAnswer(match(), { pairs: { p1: {} }, bank: [] }), true);
  assert.equal(hasLiveAnswer(reorder(), [{ id: 'a' }]), false);
  assert.equal(hasLiveAnswer(categorize(), { c1: [], c2: [], bank: [1] }), false);
  assert.equal(hasLiveAnswer(categorize(), { c1: [{}], c2: [], bank: [] }), true);
  assert.equal(hasLiveAnswer(comp([sub([1])]), { 0: [] }), false);
  assert.equal(hasLiveAnswer(comp([sub([1])]), { 0: [1] }), true);
});
test('subAnswerKey is never a bare number', () => assert.equal(subAnswerKey(0), 's0'));

console.log('number and click on the image, live');
const numeric = (answer, tolerance = 0, unit = '') => ({ type: 'NUMERIC', points: 100, timeLimit: 20, numericData: { answer, tolerance, unit } });
const hotspot = (...regions) => ({ type: 'HOTSPOT', points: 100, timeLimit: 20, hotspotData: { regions } });
const box = { id: 'r', x: 10, y: 10, w: 20, h: 20 };
test('both new types can be played live', () => {
  assert.ok(LIVE_SUPPORTED_TYPES.includes('NUMERIC')); assert.ok(LIVE_SUPPORTED_TYPES.includes('HOTSPOT'));
  assert.equal(isLivePlayable(numeric(1)), true); assert.equal(isLivePlayable(hotspot(box)), true);
});
test('a number is scored with its tolerance and the same speed rule', () => {
  const q = numeric(9.8, 0.1, 'm/s');
  assert.equal(scoreAnswer(q, '9.8', 0).points, 100);
  assert.equal(scoreAnswer(q, '9,85 m/s', 10000).points, 75);
  assert.equal(scoreAnswer(q, '10', 0).points, 0);
  assert.equal(scoreAnswer(q, '', 0).points, 0);
  assert.equal(scoreAnswer(q, 'abc', 0).correct, false);
});
test('a click inside the area scores, a click outside does not', () => {
  const q = hotspot(box);
  assert.equal(scoreAnswer(q, { x: 20, y: 20 }, 0).points, 100);
  assert.equal(scoreAnswer(q, { x: 50, y: 50 }, 0).points, 0);
  assert.equal(scoreAnswer(q, null, 0).points, 0);
});
test('streak and double points apply to the new types too', () => {
  const r = scoreAnswer(numeric(5), '5', 0, { streak: 2, streakBonus: true, doubled: true });
  assert.equal(r.parts.streakPct, 20); assert.equal(r.points, 100 * 1.2 * 2);
});
test('answers travel as plain JSON and a half made click is not sent', () => {
  assert.equal(toLiveAnswer(numeric(1), 12), '12'); assert.equal(toLiveAnswer(numeric(1), null), '');
  assert.deepEqual(toLiveAnswer(hotspot(box), { x: 1, y: 2, extra: 9 }), { x: 1, y: 2 });
  assert.equal(toLiveAnswer(hotspot(box), { x: 1 }), null); assert.equal(toLiveAnswer(hotspot(box), null), null);
  assert.equal(hasLiveAnswer(numeric(1), ' '), false); assert.equal(hasLiveAnswer(numeric(1), '0'), true);
  assert.equal(hasLiveAnswer(hotspot(box), null), false); assert.equal(hasLiveAnswer(hotspot(box), { x: 0, y: 0 }), true);
});

console.log('pausing');
const running = { questionStartedAt: 10_000, questionEndsAt: null };
const q20 = { timeLimit: 20 };
test('a running clock counts down and is never negative', () => {
  assert.equal(remainingMs(running, q20, 15_000), 15_000);
  assert.equal(remainingMs(running, q20, 99_000), 0);
  assert.equal(remainingMs({}, q20, 5), null);
});
test('a paused clock stands still, however long you wait', () => {
  const paused = { ...running, pausedAt: 14_000 };
  assert.equal(isPaused(paused), true); assert.equal(isPaused(running), false);
  assert.equal(remainingMs(paused, q20, 14_000), 16_000);
  assert.equal(remainingMs(paused, q20, 500_000), 16_000);
});
test('resuming moves the start and the deadline later by exactly the pause', () => {
  const s = { questionStartedAt: 10_000, questionEndsAt: 70_000, pausedAt: 14_000 };
  assert.deepEqual(resumeShift(s, 24_000), { pausedAt: null, questionStartedAt: 20_000, questionEndsAt: 80_000 });
});
test('the time left after resuming is the time left when it was paused', () => {
  const s = { questionStartedAt: 10_000, questionEndsAt: null, pausedAt: 14_000 };
  const left = remainingMs(s, q20, 14_000);
  const after = { ...s, ...resumeShift(s, 100_000) };
  assert.equal(remainingMs(after, q20, 100_000), left);
});
test('a pause during the 3, 2, 1 keeps the start still ahead by the same amount', () => {
  const s = { questionStartedAt: 13_000, pausedAt: 11_000 };               // 2 seconds of countdown left
  const r = resumeShift(s, 50_000);
  assert.equal(r.questionStartedAt - 50_000, 2_000);
});
test('resuming a game that was not paused changes nothing', () => {
  assert.deepEqual(resumeShift(running, 99_000), { pausedAt: null });
});
test('a deadline that was never moved stays unset', () => {
  assert.equal('questionEndsAt' in resumeShift({ questionStartedAt: 1, pausedAt: 2 }, 5), false);
});

console.log('coming back to a game');
const seats = { a: { name: 'Ada Li', connected: true, joinedAt: 1 }, b: { name: 'Ben', connected: false, joinedAt: 2 }, c: { name: 'ben', connected: false, joinedAt: 3 } };
test('names ignore case and spacing', () => { assert.equal(normalizeName('  Ada   LI '), 'ada li'); assert.equal(normalizeName(null), ''); });
test('a new name is free', () => assert.deepEqual(claimSeat(seats, 'Zed'), { status: 'free' }));
test('a name held by someone still connected is taken, in any case', () => {
  assert.deepEqual(claimSeat(seats, 'ada li'), { status: 'taken' }); assert.deepEqual(claimSeat(seats, ' ADA  LI'), { status: 'taken' });
});
test('a name held by someone who dropped can be taken back, earliest seat first', () => {
  assert.deepEqual(claimSeat(seats, 'BEN'), { status: 'rejoin', id: 'b' });
});
test('the earliest joined seat is the one given back, whatever order they are stored in', () => {
  assert.deepEqual(claimSeat({ x: { name: 'Zoe', connected: false, joinedAt: 9 }, y: { name: 'zoe', connected: false, joinedAt: 3 } }, 'ZOE'), { status: 'rejoin', id: 'y' });
});
test('a seat with no connected flag at all counts as taken', () => {
  assert.deepEqual(claimSeat({ x: { name: 'Old' } }, 'old'), { status: 'taken' });
});
test('an empty game has every name free', () => { assert.deepEqual(claimSeat(undefined, 'a'), { status: 'free' }); assert.deepEqual(claimSeat({}, 'a'), { status: 'free' }); });

console.log('teams');
const pl = (specs) => Object.fromEntries(specs.map(([id, team, score, joinedAt]) => [id, { name: id, team, score, joinedAt }]));
test('a new player joins the smallest team', () => {
  assert.equal(assignTeam({}, 2), 0);
  assert.equal(assignTeam(pl([['a', 0, 0], ['b', 0, 0]]), 2), 1);
  assert.equal(assignTeam(pl([['a', 0, 0], ['b', 1, 0], ['c', 1, 0]]), 3), 2);
});
test('ties go to the lowest numbered team', () => assert.equal(assignTeam(pl([['a', 0, 0], ['b', 1, 0]]), 2), 0));
test('players with no team, or a team that no longer exists, are not counted', () => {
  assert.equal(assignTeam({ a: { name: 'a' }, b: { name: 'b', team: 7 } }, 2), 0);
});
test('turning teams on spreads everyone in join order', () => {
  const out = assignAllTeams(pl([['c', undefined, 0, 3], ['a', undefined, 0, 1], ['b', undefined, 0, 2], ['d', undefined, 0, 4]]), 2);
  assert.deepEqual(out, { a: 0, b: 1, c: 0, d: 1 });
});
test('a team scores the AVERAGE of its players, so size does not win', () => {
  const t = rankTeams(pl([['a', 0, 100], ['b', 0, 100], ['c', 0, 100], ['d', 1, 150]]), 2);
  assert.equal(t[0].name, 'Blue'); assert.equal(t[0].average, 150);
  assert.equal(t[1].average, 100); assert.equal(t[1].total, 300); assert.equal(t[1].members, 3);
});
test('averages are rounded, and teams with nobody are left out', () => {
  const t = rankTeams(pl([['a', 0, 10], ['b', 0, 11]]), 3);
  assert.equal(t.length, 1); assert.equal(t[0].average, 11);       // 10.5 rounds up
});
test('teams on the same average share a rank, then the next rank skips', () => {
  const t = rankTeams(pl([['a', 0, 50], ['b', 1, 50], ['c', 2, 10]]), 3);
  assert.deepEqual(t.map((x) => x.rank), [1, 1, 3]);
});
test('team names follow the tile order', () => assert.deepEqual(TEAM_NAMES, ['Red', 'Blue', 'Yellow', 'Green']));

console.log('sudden death');
const sd = (specs) => Object.fromEntries(specs.map(([id, out, score = 0, joinedAt = 0]) => [id, { name: id, score, joinedAt, ...(out == null ? {} : { eliminatedAt: out }) }]));
const ans = (...rows) => Object.fromEntries(rows.map(([id, correct]) => [id, { correct }]));
test('everyone starts in, and a number marks who is out', () => {
  assert.equal(isOut({ eliminatedAt: 0 }), true);          // knocked out by the first question counts
  assert.equal(isOut({}), false); assert.equal(isOut(undefined), false);
  assert.deepEqual(alivePlayerIds(sd([['a', null], ['b', 2], ['c', null]])), ['a', 'c']);
});
test('wrong answers and no answer are out, right answers stay', () => {
  const players = sd([['a', null], ['b', null], ['c', null]]);
  assert.deepEqual(suddenDeathOut(players, ans(['a', true], ['b', false])).sort(), ['b', 'c']);
});
test('a part right answer is not fully right, so it is out', () => {
  assert.deepEqual(suddenDeathOut(sd([['a', null], ['b', null]]), { a: { correct: true }, b: { correct: false, points: 40 } }), ['b']);
});
test('if everyone would go out, nobody does', () => {
  assert.deepEqual(suddenDeathOut(sd([['a', null], ['b', null]]), ans(['a', false], ['b', false])), []);
  assert.deepEqual(suddenDeathOut(sd([['a', null]]), {}), []);
});
test('players already out are not knocked out twice', () => {
  const players = sd([['a', null], ['b', 1], ['c', null]]);
  assert.deepEqual(suddenDeathOut(players, ans(['a', true])), ['c']);
});
test('the game is over when one is left, but not for a game of one', () => {
  assert.equal(suddenDeathOver(sd([['a', null], ['b', 0]])), true);
  assert.equal(suddenDeathOver(sd([['a', null], ['b', null]])), false);
  assert.equal(suddenDeathOver(sd([['a', null]])), false);
  assert.equal(suddenDeathOver({}), false);
});
test('final order: standing first, then the later you went out the better, then score', () => {
  const r = rankSuddenDeath(sd([['early', 0, 900], ['late', 3, 100], ['mid', 2, 500], ['winner', null, 50], ['alsoMid', 2, 800]]));
  assert.deepEqual(r.map((p) => p.id), ['winner', 'late', 'alsoMid', 'mid', 'early']);
  assert.deepEqual(r.map((p) => p.rank), [1, 2, 3, 4, 5]);
});
test('two players out on the same question with the same score share a rank', () => {
  const r = rankSuddenDeath(sd([['a', 1, 40], ['b', 1, 40], ['c', null, 0]]));
  assert.deepEqual(r.map((p) => p.rank), [1, 2, 2]);
});
test('two standing players are ranked by score', () => {
  const r = rankSuddenDeath(sd([['a', null, 10], ['b', null, 30]]));
  assert.deepEqual(r.map((p) => p.id), ['b', 'a']);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
