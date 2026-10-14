// Run with: node --test backend/api/migration.test.mjs
// The temporary migration door, and the whole move: Firebase shaped documents in, readable through the real API rules out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepo } from './memory-repo.mjs';
import { resetIdentityCache } from './identity.mjs';
import { handler } from './index.mjs';
import { transformDoc } from '../../scripts/migrate/transform.mjs';

const call = (repo, body, deps = {}) => handler({ requestContext: { http: { method: 'POST' } }, headers: {}, body: JSON.stringify(body) }, {}, { repo, caller: null, ...deps });
const parse = (res) => JSON.parse(res.body);
const OPEN = { migrationEnabled: true, migrationToken: 'right-token' };

test('the door is invisible when closed, and when the token is wrong or missing', async () => {
  const repo = createMemoryRepo();
  const item = { table: 'users', item: { uid: 'u1', email: 'a@b.com', role: 'student' } };
  for (const [name, deps, token] of [['closed', { migrationEnabled: false, migrationToken: 'right-token' }, 'right-token'], ['wrong token', OPEN, 'nope'], ['no token', OPEN, undefined]]) {
    const res = await call(repo, { op: 'import', token, items: [item] }, deps);
    assert.equal(res.statusCode, 400, name);
    assert.equal(parse(res).error, 'Unknown op.', `${name} answers like an unknown op`);
  }
  assert.equal(repo._dump('users').length, 0, 'nothing was written');
});

test('with the right token it writes items, refuses bad ones and verifies what is there', async () => {
  const repo = createMemoryRepo();
  const good = { table: 'quizzes', item: { quizId: 'q1', createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z', title: 'T', active: true, activeKey: 'Y' } };
  const bad = [{ table: 'nope', item: { x: 1 } }, { table: 'quizzes', item: { title: 'no key' } }, { table: 'notifications', item: { userId: 'u1' } }];
  const res = parse(await call(repo, { op: 'import', token: 'right-token', items: [good, ...bad] }, OPEN));
  assert.equal(res.data.written, 1);
  assert.equal(res.data.rejected.length, 3);
  const check = parse(await call(repo, { op: 'importVerify', token: 'right-token', keys: [{ table: 'quizzes', key: { quizId: 'q1' } }, { table: 'quizzes', key: { quizId: 'gone' } }] }, OPEN));
  assert.deepEqual(check.data.missing, [{ table: 'quizzes', key: { quizId: 'gone' } }]);
});

test('Firebase documents move over and the same people can use them through the normal API rules', async () => {
  resetIdentityCache();
  const repo = createMemoryRepo();
  const stamp = (iso) => ({ toDate: () => new Date(iso) });          // what Firestore returns for a time
  const docs = [
    ['users', 'fbTeacher', { email: 'Tess@School.com', role: 'teacher', displayName: 'Tess', createdAt: '2025-09-01T00:00:00.000Z' }],
    ['users', 'fbStudent', { email: 'sam@school.com', role: 'student', displayName: 'Sam' }],
    ['quizzes', 'quiz1', { title: 'Maths', code: 'MATH11', createdBy: 'fbTeacher', active: true, totalPoints: 10, createdAt: stamp('2025-10-01T10:00:00Z'), questions: [{ id: 'q1', mcqData: { options: [{ text: 'a' }] } }] }],
    ['quizzes', 'quiz2', { title: 'Draft', code: 'DRAFT1', createdBy: 'fbTeacher', active: false, totalPoints: 5, createdAt: stamp('2025-10-02T10:00:00Z'), questions: [] }],
    ['quiz_results', 'res1', { quizId: 'quiz1', userId: 'fbStudent', teacherId: 'fbTeacher', score: 8, finalScore: 8, maxScore: 10, status: 'completed', completedAt: stamp('2025-10-05T12:00:00Z'), answers: [] }],
    ['quiz_results', 'daily1', { quizId: 'daily-2025-10-06', userId: 'fbStudent', teacherId: '', kind: 'daily', score: 1, finalScore: 1, maxScore: 1, completedAt: stamp('2025-10-06T08:00:00Z') }],
    ['classes', 'cls1', { name: '9A', teacherId: 'fbTeacher', code: 'CLS123', quizIds: ['quiz1'], dueDates: { quiz1: '2025-11-01' }, createdAt: stamp('2025-10-01T00:00:00Z') }],
    ['class_enrollments', 'en1', { classId: 'cls1', studentId: 'fbStudent', studentName: 'Sam', joinedAt: stamp('2025-10-03T00:00:00Z') }],
    ['question_bank', 'bank1', { id: 'own-id', teacherId: 'fbTeacher', questionText: 'What?', savedAt: stamp('2025-10-04T00:00:00Z') }],
    ['notifications', 'n1', { userId: 'fbStudent', message: 'Graded', type: 'grade_released', read: false, createdAt: stamp('2025-10-05T13:00:00Z') }],
  ];
  const moved = [];
  for (const [col, id, data] of docs) {
    const out = transformDoc(col, id, data);
    assert.ok(!out.skip, `${col}/${id}: ${out.skip}`);
    if (col === 'users') { out.item.legacy = true; out.item.legacyEmail = data.email.toLowerCase(); }   // what migrate.mjs does for people who can sign in
    moved.push(out);
    const res = await call(repo, { op: 'import', token: 'right-token', items: [{ table: out.table, item: out.item }] }, OPEN);
    assert.equal(parse(res).data.written, 1, `${col}/${id}`);
  }
  assert.equal(moved.find((m) => m.item.resultId === 'daily1').item.teacherId, undefined, 'an empty teacherId is not a key');

  // The teacher signs in on AWS with Google: a new Cognito id, a verified email, and finds everything under the old id.
  const teacher = { uid: 'new-sub-t', sub: 'new-sub-t', email: 'tess@school.com', emailVerified: true };
  const asTeacher = (body) => call(repo, body, { caller: teacher });
  assert.deepEqual(parse(await asTeacher({ op: 'me' })).data, { uid: 'fbTeacher', legacy: true });
  const quizzes = parse(await asTeacher({ op: 'query', col: 'quizzes', index: 'byOwner', value: 'fbTeacher', order: 'desc' })).data;
  assert.deepEqual(quizzes.map((q) => q.title), ['Draft', 'Maths'], 'newest first, including the switched off draft');
  assert.equal(typeof quizzes[0].createdAt, 'string');
  assert.equal(parse(await asTeacher({ op: 'query', col: 'quiz_results', index: 'byTeacher', value: 'fbTeacher' })).data.length, 1);
  const cls = parse(await asTeacher({ op: 'query', col: 'classes', index: 'byTeacher', value: 'fbTeacher' })).data[0];
  assert.deepEqual(cls.dueDates, { quiz1: '2025-11-01' });
  assert.equal(parse(await asTeacher({ op: 'query', col: 'class_enrollments', index: 'byClass', value: 'cls1' })).data.length, 1);
  assert.equal(parse(await asTeacher({ op: 'query', col: 'question_bank', index: 'byTeacher', value: 'fbTeacher' })).data.length, 1);

  // The student too, with the password moved over (so a verified email), and strangers see none of it.
  const student = { uid: 'new-sub-s', sub: 'new-sub-s', email: 'sam@school.com', emailVerified: true };
  const asStudent = (body) => call(repo, body, { caller: student });
  assert.equal(parse(await asStudent({ op: 'query', col: 'quiz_results', index: 'byUser', value: 'fbStudent', order: 'desc' })).data.length, 2);
  assert.equal(parse(await asStudent({ op: 'query', col: 'notifications', value: 'fbStudent', order: 'desc' })).data[0].message, 'Graded');
  assert.equal(parse(await asStudent({ op: 'query', col: 'class_enrollments', index: 'byStudent', value: 'fbStudent' })).data.length, 1);
  assert.equal(parse(await call(repo, { op: 'query', col: 'quizzes', index: 'byActive', value: 'Y' }, { caller: null })).data.length, 1, 'only the open quiz is public');
  const stranger = { uid: 'x', sub: 'x', email: 'sam@school.com', emailVerified: false };
  assert.equal(parse(await call(repo, { op: 'query', col: 'quiz_results', index: 'byUser', value: 'fbStudent' }, { caller: stranger })).data.length, 0);
});
