#!/usr/bin/env node
/** Tests for src/utils/accountPlan.js:   node scripts/test-account-plan.mjs */
import assert from 'node:assert/strict';
import { deletionPlan, exportPlan, toPlain, describePlan } from '../src/utils/accountPlan.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; } };
const pairs = (plan) => plan.map((s) => `${s.collection}:${s.field}`);

console.log('deleting an account');
test('a student loses their results, class memberships and notifications, and nothing else', () => {
  assert.deepEqual(pairs(deletionPlan('student')), ['quiz_results:userId', 'class_enrollments:studentId', 'notifications:userId']);
});
test('a teacher also loses their quizzes, classes, question bank and the results sent to their quizzes', () => {
  const p = pairs(deletionPlan('teacher'));
  for (const want of ['quizzes:createdBy', 'classes:teacherId', 'question_bank:teacherId', 'quiz_results:teacherId', 'quiz_results:userId', 'notifications:userId']) assert.ok(p.includes(want), want);
});
test('a teacher\'s own quizzes go after the results made for them are cleared', () => {
  const p = pairs(deletionPlan('teacher'));
  assert.ok(p.indexOf('quiz_results:teacherId') < p.indexOf('quizzes:createdBy'));
});
test('an unknown role gets the student plan, the smaller one', () => {
  assert.deepEqual(deletionPlan('admin'), deletionPlan('student')); assert.deepEqual(deletionPlan(undefined), deletionPlan('student'));
});
test('no step is listed twice', () => { for (const role of ['student', 'teacher']) assert.equal(new Set(pairs(deletionPlan(role))).size, deletionPlan(role).length); });
test('the profile document is not in the plan, because it is removed last by the caller', () => {
  for (const role of ['student', 'teacher']) assert.ok(!deletionPlan(role).some((s) => s.collection === 'users'));
});
test('every step says what it is, for the confirmation box', () => { for (const s of deletionPlan('teacher')) assert.ok(s.label.length > 3); });

console.log('exporting');
test('everyone exports their results, memberships and notifications', () => {
  assert.deepEqual(exportPlan('student').map((s) => s.key), ['results', 'classMemberships', 'notifications']);
});
test('a teacher also exports their quizzes, classes and question bank, but not other people\'s results', () => {
  const keys = exportPlan('teacher').map((s) => s.key);
  assert.deepEqual(keys, ['results', 'classMemberships', 'notifications', 'quizzes', 'classes', 'questionBank']);
  assert.ok(!exportPlan('teacher').some((s) => s.collection === 'quiz_results' && s.field === 'teacherId'));
});

console.log('making data safe to save');
test('timestamps become ISO text, at any depth', () => {
  const ts = { toDate: () => new Date('2026-10-11T08:30:00Z') };
  assert.deepEqual(toPlain({ a: ts, b: { c: [ts] } }), { a: '2026-10-11T08:30:00.000Z', b: { c: ['2026-10-11T08:30:00.000Z'] } });
});
test('plain values pass through and missing ones become null', () => {
  assert.deepEqual(toPlain({ n: 1, s: 'x', t: true, z: null, u: undefined, arr: [1, 'a'] }), { n: 1, s: 'x', t: true, z: null, u: null, arr: [1, 'a'] });
});
test('a broken timestamp does not stop the export', () => assert.equal(toPlain({ toDate: () => { throw new Error('x'); } }), null));
test('the result survives JSON', () => assert.doesNotThrow(() => JSON.stringify(toPlain({ when: { toDate: () => new Date(0) }, list: [{ a: 1 }] }))));

console.log('describing it');
test('lists read like a sentence', () => {
  assert.equal(describePlan([{ label: 'one' }]), 'one'); assert.equal(describePlan([{ label: 'one' }, { label: 'two' }]), 'one and two');
  assert.equal(describePlan([{ label: 'a' }, { label: 'b' }, { label: 'c' }]), 'a, b and c'); assert.equal(describePlan([]), '');
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
