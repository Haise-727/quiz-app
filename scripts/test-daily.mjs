#!/usr/bin/env node
/**
 * Tests for src/utils/daily.js: which question is today's, and what gets saved.
 * No dependencies. Run it under several time zones, like the gamification tests:
 *   TZ=Asia/Kolkata node scripts/test-daily.mjs
 */
import assert from 'node:assert/strict';
import {
  localDateString, dailyQuizId, hashString, isDailyEligible, dailyCandidates, pickDaily,
  gradeDaily, buildDailyResult, findDailyResult, dailyWasRight,
} from '../src/utils/daily.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; } };

// ── Question builders ───────────────────────────────────────────────────────────────
const mcq = (id, right = ['b'], extra = {}) => ({ id, type: 'MCQ', questionText: `Q ${id}`, points: 10, mcqData: { options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }], correctOptions: right }, ...extra });
const tf = (id, correctAnswer = true) => ({ id, type: 'TRUE_FALSE', questionText: `Q ${id}`, points: 10, trueFalseData: { correctAnswer } });
const fill = (id, answers = ['Tokyo']) => ({ id, type: 'FILL_IN_THE_BLANK', questionText: `Q ${id}`, points: 10, fillBlankData: { answers: answers.map((text) => ({ text })) } });
const quiz = (id, questions, active = true) => ({ id, title: `Quiz ${id}`, active, questions });

console.log('dates and hash');
test('the local date is YYYY-MM-DD with zero padding', () => {
  assert.equal(localDateString(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(localDateString(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
});
test('the date is the visitor\'s local one, even just after midnight', () => {
  assert.equal(localDateString(new Date(2026, 9, 11, 0, 1)), '2026-10-11');
  assert.equal(localDateString(new Date(2026, 9, 10, 23, 59, 59)), '2026-10-10');
});
test('the daily quiz id is daily-<date>', () => assert.equal(dailyQuizId('2026-10-11'), 'daily-2026-10-11'));
test('the hash is stable: known values never change', () => {
  assert.equal(hashString(''), 0x811c9dc5);
  assert.equal(hashString('a'), 0xe40c292c);
  assert.equal(hashString('2026-10-11'), hashString('2026-10-11'));
});
test('the hash is an unsigned integer and differs between days', () => {
  const seen = new Set();
  for (let d = 1; d <= 28; d++) {
    const h = hashString(`2026-02-${String(d).padStart(2, '0')}`);
    assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff);
    seen.add(h);
  }
  assert.equal(seen.size, 28);
});

console.log('which questions can be asked');
test('MCQ with one correct option, true or false and fill in the blank are eligible', () => {
  assert.ok(isDailyEligible(mcq('1'))); assert.ok(isDailyEligible(tf('2', false))); assert.ok(isDailyEligible(fill('3')));
});
test('MCQ with several correct options is not eligible', () => assert.equal(isDailyEligible(mcq('1', ['a', 'b'])), false));
test('MCQ whose correct option does not exist is not eligible', () => assert.equal(isDailyEligible(mcq('1', ['zzz'])), false));
test('a question with a picture, clip or recording is not eligible', () => {
  assert.equal(isDailyEligible(mcq('1', ['b'], { media: { url: 'x', fileType: 'image' } })), false);
  assert.equal(isDailyEligible({ ...tf('2'), listeningData: { mainMedia: { url: 'x' } } }), false);
});
test('an MCQ with a picture on one option is not eligible', () => {
  const q = mcq('1'); q.mcqData.options[0].media = { url: 'x' };
  assert.equal(isDailyEligible(q), false);
});
test('other types are not eligible', () => {
  for (const type of ['PARAGRAPH', 'REORDER', 'CATEGORIZE', 'MATCH_THE_FOLLOWING', 'VISUAL_COMPREHENSION']) assert.equal(isDailyEligible({ id: 'x', type, questionText: 'Q', points: 5 }), false, type);
});
test('a blank question, a blank only answer or a missing true/false key is not eligible', () => {
  assert.equal(isDailyEligible({ ...mcq('1'), questionText: '  ' }), false);
  assert.equal(isDailyEligible(fill('2', ['   '])), false);
  assert.equal(isDailyEligible({ id: '3', type: 'TRUE_FALSE', questionText: 'Q', trueFalseData: {} }), false);
  assert.equal(isDailyEligible(null), false);
});

console.log('collecting candidates');
test('candidates are sorted by quiz id then question id, whatever order they arrive in', () => {
  const a = dailyCandidates([quiz('zeta', [mcq('2'), mcq('1')]), quiz('alpha', [tf('9'), fill('3')])]);
  assert.deepEqual(a.map((c) => `${c.quizId}/${c.questionId}`), ['alpha/3', 'alpha/9', 'zeta/1', 'zeta/2']);
  const b = dailyCandidates([quiz('alpha', [fill('3'), tf('9')]), quiz('zeta', [mcq('1'), mcq('2')])]);
  assert.deepEqual(b.map((c) => c.questionId), a.map((c) => c.questionId));
});
test('inactive quizzes and ineligible questions are left out', () => {
  const list = dailyCandidates([quiz('on', [mcq('1'), mcq('2', ['a', 'b'])]), quiz('off', [mcq('1')], false)]);
  assert.deepEqual(list.map((c) => `${c.quizId}/${c.questionId}`), ['on/1']);
});
test('a question with no id is named by its position', () => {
  const q = mcq('x'); delete q.id;
  assert.equal(dailyCandidates([quiz('a', [tf('1'), q])])[1].questionId, 'index-1');
});
test('nothing eligible gives no candidates and no pick', () => {
  assert.deepEqual(dailyCandidates([]), []); assert.deepEqual(dailyCandidates(undefined), []);
  assert.equal(pickDaily([], '2026-10-11'), null); assert.equal(pickDaily(undefined, '2026-10-11'), null);
});

console.log('picking today\'s question');
const pool = dailyCandidates(Array.from({ length: 8 }, (_, i) => quiz(`quiz${i}`, [mcq('a'), tf('b'), fill('c')])));
test('the same date and pool always give the same question', () => {
  assert.deepEqual(pickDaily(pool, '2026-10-11'), pickDaily([...pool], '2026-10-11'));
});
test('the position is hash(date) mod count', () => {
  assert.equal(pickDaily(pool, '2026-10-11'), pool[hashString('2026-10-11') % pool.length]);
});
test('shuffled input gives the same pick, because candidates are sorted first', () => {
  const quizzes = Array.from({ length: 8 }, (_, i) => quiz(`quiz${i}`, [mcq('a'), tf('b'), fill('c')]));
  const one = pickDaily(dailyCandidates(quizzes), '2026-10-12');
  const two = pickDaily(dailyCandidates([...quizzes].reverse()), '2026-10-12');
  assert.equal(`${one.quizId}/${one.questionId}`, `${two.quizId}/${two.questionId}`);
});
test('different days spread over the pool', () => {
  const picks = new Set();
  for (let d = 1; d <= 30; d++) { const p = pickDaily(pool, `2026-09-${String(d).padStart(2, '0')}`); picks.add(`${p.quizId}/${p.questionId}`); }
  assert.ok(picks.size >= 8, `only ${picks.size} different questions in 30 days`);
});
test('a one question pool always returns that question', () => {
  const one = dailyCandidates([quiz('only', [tf('1')])]);
  assert.equal(pickDaily(one, '2026-01-01'), one[0]); assert.equal(pickDaily(one, '2030-06-30'), one[0]);
});

console.log('grading and saving');
test('each eligible type is graded by the quiz grader', () => {
  assert.equal(gradeDaily(mcq('1'), ['b']), true); assert.equal(gradeDaily(mcq('1'), ['a']), false);
  assert.equal(gradeDaily(tf('1', false), false), true); assert.equal(gradeDaily(tf('1', false), true), false);
  assert.equal(gradeDaily(fill('1'), '  tokyo '), true); assert.equal(gradeDaily(fill('1'), 'Kyoto'), false);
});
const candidate = { quizId: 'quizA', quizTitle: 'Quiz A', questionId: 'q7', question: tf('q7') };
test('the saved document has every field the rules and the gamification code need', () => {
  const doc = buildDailyResult({ userId: 'u1', dateString: '2026-10-11', candidate, correct: true, completedAt: 'SERVER_TIME' });
  assert.deepEqual(doc, {
    userId: 'u1', quizId: 'daily-2026-10-11', quizTitle: 'Daily question', teacherId: '', kind: 'daily',
    sourceQuizId: 'quizA', sourceQuestionId: 'q7', score: 1, finalScore: 1, maxScore: 1, questionCount: 1,
    status: 'completed', completedAt: 'SERVER_TIME',
  });
});
test('a wrong answer saves a score of 0 out of 1', () => {
  const doc = buildDailyResult({ userId: 'u1', dateString: '2026-10-11', candidate, correct: false, completedAt: null });
  assert.equal(doc.finalScore, 0); assert.equal(doc.score, 0); assert.equal(doc.maxScore, 1);
});
test('teacherId is an empty string so no teacher can ever read a daily result', () => {
  assert.strictEqual(buildDailyResult({ userId: 'u', dateString: '2026-10-11', candidate, correct: true }).teacherId, '');
});

console.log('already answered today');
test('today\'s daily result is found, yesterday\'s and a normal quiz are not', () => {
  const results = [
    { kind: 'daily', quizId: 'daily-2026-10-10', finalScore: 1, maxScore: 1 },
    { kind: 'quiz', quizId: 'daily-2026-10-11', finalScore: 1, maxScore: 1 },
    { quizId: 'quizA', finalScore: 5, maxScore: 5 },
  ];
  assert.equal(findDailyResult(results, '2026-10-11'), null);
  assert.equal(findDailyResult(results, '2026-10-10'), results[0]);
  assert.equal(findDailyResult(null, '2026-10-10'), null);
});
test('right or wrong is read from the saved score', () => {
  assert.equal(dailyWasRight({ finalScore: 1, maxScore: 1 }), true);
  assert.equal(dailyWasRight({ score: 1, maxScore: 1 }), true);
  assert.equal(dailyWasRight({ finalScore: 0, maxScore: 1 }), false);
  assert.equal(dailyWasRight(null), false);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
