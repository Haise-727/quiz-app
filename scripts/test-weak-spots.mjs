#!/usr/bin/env node
/**
 * Tests for src/utils/weakSpots.js. No dependencies, run with:
 *   node scripts/test-weak-spots.mjs
 */
import assert from 'node:assert/strict';
import { weakSpots, MAX_REVISIT, MIN_GRADED } from '../src/utils/weakSpots.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; } };

// A saved answer: right, wrong, partial (points but not correct) or pending.
const ans = (text, kind = 'right', pts = 10) => ({
  questionText: text,
  isCorrect: kind === 'right',
  pointsAwarded: kind === 'right' ? pts : kind === 'partial' ? Math.round(pts / 2) : 0,
  status: kind === 'pending' ? 'pending_review' : 'auto_graded',
});
const result = (quizId, answers, when, extra = {}) => ({ quizId, quizTitle: `Title ${quizId}`, answers, completedAt: new Date(when), status: 'completed', ...extra });
const quiz = (id, texts, extra = {}) => ({ id, title: `Title ${id}`, questions: texts.map((t) => ({ questionText: t, points: 10 })), ...extra });
const quizzes = (...list) => Object.fromEntries(list.map((q) => [q.id, q]));

console.log('subjects');
test('ranked by accuracy, lowest first', () => {
  const rs = [
    result('m', [ans('a'), ans('b'), ans('c', 'wrong'), ans('d', 'wrong')], '2026-10-01'),
    result('h', [ans('a'), ans('b'), ans('c'), ans('d', 'wrong')], '2026-10-02'),
    result('s', [ans('a', 'wrong'), ans('b', 'wrong')], '2026-10-03'),
  ];
  const { subjects } = weakSpots(rs, quizzes(quiz('m', [], { subject: 'Maths' }), quiz('h', [], { subject: 'History' }), quiz('s', [], { subject: 'Science' })));
  assert.deepEqual(subjects.map((s) => [s.name, s.pct]), [['Science', 0], ['Maths', 50], ['History', 75]]);
});
test('the subject comes from the result first, then the quiz, then the quiz title', () => {
  const rs = [result('a', [ans('x'), ans('y')], '2026-10-01', { subject: 'From result' }), result('b', [ans('x'), ans('y')], '2026-10-01'), result('c', [ans('x'), ans('y')], '2026-10-01')];
  const q = quizzes(quiz('a', [], { subject: 'From quiz' }), quiz('b', [], { subject: 'From quiz' }), quiz('c', []));
  assert.deepEqual(weakSpots(rs, q).subjects.map((s) => s.name).sort(), ['From quiz', 'From result', 'Title c']);
});
test('with no quiz document the result title is the fallback', () => {
  assert.equal(weakSpots([result('gone', [ans('x'), ans('y')], '2026-10-01')], {}).subjects[0].name, 'Title gone');
});
test('two quizzes in one subject are merged, ignoring case and spaces, and attempts are counted', () => {
  const rs = [result('a', [ans('x'), ans('y', 'wrong')], '2026-10-01'), result('b', [ans('x'), ans('y', 'wrong')], '2026-10-02'), result('b', [ans('x'), ans('y', 'wrong')], '2026-10-03')];
  const { subjects } = weakSpots(rs, quizzes(quiz('a', [], { subject: 'Maths' }), quiz('b', [], { subject: ' maths ' })));
  assert.equal(subjects.length, 1); assert.equal(subjects[0].attempts, 3); assert.equal(subjects[0].graded, 4);
});
test('a subject needs at least the minimum of graded answers', () => {
  assert.equal(MIN_GRADED, 2);
  assert.deepEqual(weakSpots([result('a', [ans('x', 'wrong')], '2026-10-01')], {}).subjects, []);
  assert.equal(weakSpots([result('a', [ans('x', 'wrong'), ans('y', 'wrong')], '2026-10-01')], {}).subjects.length, 1);
});
test('pending answers are not graded: they do not count toward the minimum or the accuracy', () => {
  assert.deepEqual(weakSpots([result('a', [ans('x'), ans('p1', 'pending'), ans('p2', 'pending')], '2026-10-01')], {}).subjects, []);
  const s = weakSpots([result('a', [ans('x'), ans('y'), ans('p', 'pending')], '2026-10-01')], {}).subjects[0];
  assert.equal(s.graded, 2); assert.equal(s.pct, 100);
});
test('partial credit counts in proportion when the quiz question points are known', () => {
  const s = weakSpots([result('a', [ans('x', 'partial'), ans('y', 'wrong')], '2026-10-01')], quizzes(quiz('a', ['x', 'y']))).subjects[0];
  assert.equal(s.pct, 25);            // half of the first question, none of the second
});
test('only the latest attempt of a quiz counts, so improving moves a subject up', () => {
  const rs = [result('a', [ans('x', 'wrong'), ans('y', 'wrong')], '2026-10-01'), result('a', [ans('x'), ans('y')], '2026-10-05')];
  const s = weakSpots(rs, {}).subjects[0];
  assert.equal(s.pct, 100); assert.equal(s.attempts, 2);
});
test('daily results and results with no answers are ignored', () => {
  const rs = [{ kind: 'daily', quizId: 'daily-2026-10-01', answers: [ans('x', 'wrong'), ans('y', 'wrong')], completedAt: new Date('2026-10-01') }, { quizId: 'a', completedAt: new Date() }];
  assert.deepEqual(weakSpots(rs, {}), { subjects: [], revisit: [] });
});
test('a changed quiz (the question text no longer matches) falls back to all or nothing credit', () => {
  const s = weakSpots([result('a', [ans('old text', 'partial'), ans('y', 'wrong')], '2026-10-01')], quizzes(quiz('a', ['new text', 'y']))).subjects[0];
  assert.equal(s.pct, 0);
});

console.log('questions to revisit');
const q2 = quizzes(quiz('a', ['a1', 'a2', 'a3']), quiz('b', ['b1', 'b2']));
test('wrong and partly right answers are listed, right ones are not', () => {
  const { revisit } = weakSpots([result('a', [ans('a1'), ans('a2', 'wrong'), ans('a3', 'partial')], '2026-10-01')], q2);
  assert.deepEqual(revisit.map((r) => [r.questionText, r.partial]), [['a2', false], ['a3', true]]);
});
test('each item carries the quiz id, quiz title and time', () => {
  const [r] = weakSpots([result('a', [ans('a1', 'wrong')], '2026-10-01')], q2).revisit;
  assert.equal(r.quizId, 'a'); assert.equal(r.quizTitle, 'Title a'); assert.ok(r.completedAt instanceof Date);
});
test('pending review answers are not wrong', () => {
  assert.deepEqual(weakSpots([result('a', [ans('a1', 'pending'), ans('a2')], '2026-10-01')], q2).revisit, []);
});
test('a question answered right on a later attempt does not appear', () => {
  const rs = [result('a', [ans('a1', 'wrong'), ans('a2', 'wrong')], '2026-10-01'), result('a', [ans('a1'), ans('a2', 'wrong')], '2026-10-04')];
  assert.deepEqual(weakSpots(rs, q2).revisit.map((r) => r.questionText), ['a2']);
});
test('a question right on an earlier attempt but wrong on the latest does appear', () => {
  const rs = [result('a', [ans('a1'), ans('a2')], '2026-10-01'), result('a', [ans('a1', 'wrong'), ans('a2')], '2026-10-04')];
  assert.deepEqual(weakSpots(rs, q2).revisit.map((r) => r.questionText), ['a1']);
});
test('the order of the saved results does not matter, only their times', () => {
  const older = result('a', [ans('a1', 'wrong')], '2026-10-01'); const newer = result('a', [ans('a1')], '2026-10-04');
  assert.deepEqual(weakSpots([older, newer], q2).revisit, []);
  assert.deepEqual(weakSpots([newer, older], q2).revisit, []);
});
test('newest attempt first across quizzes', () => {
  const rs = [result('a', [ans('a1', 'wrong')], '2026-10-01'), result('b', [ans('b1', 'wrong')], '2026-10-09')];
  assert.deepEqual(weakSpots(rs, q2).revisit.map((r) => r.quizId), ['b', 'a']);
});
test('at most six are listed', () => {
  assert.equal(MAX_REVISIT, 6);
  const many = quizzes(quiz('a', Array.from({ length: 10 }, (_, i) => `q${i}`)));
  const { revisit } = weakSpots([result('a', Array.from({ length: 10 }, (_, i) => ans(`q${i}`, 'wrong')), '2026-10-01')], many);
  assert.equal(revisit.length, 6);
});
test('a quiz that can no longer be read is not offered for a retake', () => {
  const { revisit } = weakSpots([result('gone', [ans('x', 'wrong'), ans('y', 'wrong')], '2026-10-01')], {});
  assert.deepEqual(revisit, []);
});
test('a Firestore style timestamp is understood', () => {
  const rs = [{ ...result('a', [ans('a1', 'wrong')], 0), completedAt: { toDate: () => new Date('2026-10-01') } }, { ...result('b', [ans('b1', 'wrong')], 0), completedAt: { seconds: new Date('2026-10-05').getTime() / 1000 } }];
  assert.deepEqual(weakSpots(rs, q2).revisit.map((r) => r.quizId), ['b', 'a']);
});

console.log('nothing to show');
test('no results gives two empty lists', () => {
  assert.deepEqual(weakSpots([], {}), { subjects: [], revisit: [] });
  assert.deepEqual(weakSpots(null, undefined), { subjects: [], revisit: [] });
});
test('everything right gives a subject but nothing to revisit', () => {
  const r = weakSpots([result('a', [ans('a1'), ans('a2'), ans('a3')], '2026-10-01')], q2);
  assert.deepEqual(r.revisit, []); assert.equal(r.subjects[0].pct, 100);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
