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

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
