// Run with: node --test backend/api/single-table.test.mjs
// The single table must behave exactly like the seven tables it replaces. The same service and tests run on both.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore, createSingleTableRepo, toStored, fromStored, storedKey, SLOTS } from './single-table.mjs';
import { COLLECTIONS } from './config.mjs';
import { createService } from './service.mjs';

test('every logical index has a shared slot, and no table uses one slot twice', () => {
  for (const d of Object.values(COLLECTIONS)) {
    const slots = SLOTS[d.table] || {};
    assert.deepEqual(Object.keys(slots).sort(), Object.keys(d.indexes).sort(), `${d.table}: indexes and slots match`);
    const used = Object.values(slots);
    assert.equal(new Set(used).size, used.length, `${d.table}: a slot is used once`);
  }
});

test('an item goes in and comes out unchanged, with no storage fields leaking', () => {
  const quiz = { quizId: 'q1', createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z', code: 'ABC123', title: 'T', active: true, activeKey: 'Y', questions: [{ id: 1 }] };
  const stored = toStored('quizzes', quiz);
  assert.equal(stored.pk, 'quizzes#q1');
  assert.equal(stored.gsi1pk, 'quizzes#byOwner#u1');
  assert.equal(stored.gsi2pk, 'quizzes#byActive#Y');
  assert.equal(stored.gsi3pk, 'quizzes#byCode#ABC123');
  assert.deepEqual(fromStored(stored), quiz);
  assert.deepEqual(storedKey('notifications', { userId: 'u1', createdAtId: '2026#x' }), { pk: 'notifications#u1', sk: '2026#x' });
});

test('a document missing an index key is left out of that index, as in the real tables', () => {
  const noCode = toStored('quizzes', { quizId: 'q2', createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z', title: 'x' });
  assert.equal(noCode.gsi3pk, undefined);
  assert.equal(noCode.gsi2pk, undefined, 'not active, so not in the open list');
  assert.ok(noCode.gsi1pk);
  const noDate = toStored('quizzes', { quizId: 'q3', createdBy: 'u1', code: 'X' });
  assert.equal(noDate.gsi1pk, undefined, 'a sorted index needs its sort value');
  assert.ok(noDate.gsi3pk);
});

test('the whole service works on the single table: the same story as on seven tables', async () => {
  const store = createMemoryStore();
  const repo = createSingleTableRepo(store);
  let n = 0;
  const svc = createService(repo, { now: () => `2026-10-14T00:00:${String(n++).padStart(2, '0')}.000Z`, newId: (() => { let i = 0; return () => `id${++i}`; })() });
  const T = { uid: 't1' }; const S = { uid: 's1' };

  const q = await svc.create({ col: 'quizzes', data: { title: 'Maths', code: 'MATH11', createdBy: 't1', active: true, totalPoints: 10, questions: [] } }, T);
  const q2 = await svc.create({ col: 'quizzes', data: { title: 'Art', code: 'ART111', createdBy: 't1', active: false, totalPoints: 5, questions: [] } }, T);
  assert.deepEqual((await svc.query({ col: 'quizzes', index: 'byOwner', value: 't1', order: 'desc' }, T)).map((x) => x.title), ['Art', 'Maths']);
  assert.deepEqual((await svc.query({ col: 'quizzes', index: 'byActive', value: 'Y' }, null)).map((x) => x.title), ['Maths']);
  assert.equal((await svc.query({ col: 'quizzes', index: 'byCode', value: 'MATH11', filters: { active: true } }, null))[0].id, q.id);
  await svc.update({ col: 'quizzes', id: q2.id, set: { active: true } }, T);
  assert.equal((await svc.query({ col: 'quizzes', index: 'byActive', value: 'Y' }, null)).length, 2);
  await svc.update({ col: 'quizzes', id: q2.id, set: { active: false } }, T);
  assert.equal((await svc.query({ col: 'quizzes', index: 'byActive', value: 'Y' }, null)).length, 1, 'leaves the open index when switched off');

  const r = await svc.create({ col: 'quiz_results', data: { quizId: q.id, userId: 's1', score: 99, finalScore: 99, maxScore: 1, status: 'completed' } }, S);
  assert.equal(r.finalScore, 10);
  assert.equal((await svc.query({ col: 'quiz_results', index: 'byUser', value: 's1', order: 'desc' }, S)).length, 1);
  assert.equal((await svc.query({ col: 'quiz_results', index: 'byTeacher', value: 't1' }, T)).length, 1);
  assert.equal((await svc.completionCount({ quizId: q.id, studentIds: ['s1'] }, T)).count, 1);

  await svc.create({ col: 'notifications', data: { userId: 's1', message: 'one', read: false } }, T);
  await svc.create({ col: 'notifications', data: { userId: 's1', message: 'two', read: false } }, T);
  assert.deepEqual((await svc.query({ col: 'notifications', value: 's1', order: 'desc' }, S)).map((x) => x.message), ['two', 'one']);
  const [first] = await svc.query({ col: 'notifications', value: 's1', order: 'desc' }, S);
  assert.equal((await svc.update({ col: 'notifications', id: first.id, set: { read: true } }, S)).read, true);

  const cls = await svc.create({ col: 'classes', data: { name: '9A', teacherId: 't1', code: 'CLS1', quizIds: [] } }, T);
  await svc.create({ col: 'class_enrollments', data: { classId: cls.id, studentId: 's1' } }, S);
  assert.equal((await svc.query({ col: 'class_enrollments', index: 'byClass', value: cls.id }, T)).length, 1);
  assert.equal((await svc.query({ col: 'class_enrollments', index: 'byStudent', value: 's1' }, S)).length, 1);

  assert.deepEqual(await svc.remove({ col: 'quizzes', id: q.id }, T), { removed: 1 });
  assert.equal(await svc.get({ col: 'quizzes', id: q.id }, T), null);
  assert.ok(![...store.rows.values()].some((x) => x.pk === `quizzes#${q.id}`), 'really gone');
});

test('no document from one logical table can be read as another', async () => {
  const store = createMemoryStore();
  const repo = createSingleTableRepo(store);
  await repo.put('users', { uid: 'x1', email: 'a@b.com', role: 'student' });
  await repo.put('quizzes', { quizId: 'x1', createdBy: 'u', createdAt: '2026-01-01T00:00:00.000Z', title: 'same id, different table' });
  assert.equal((await repo.get('users', { uid: 'x1' })).role, 'student');
  assert.equal((await repo.get('quizzes', { quizId: 'x1' })).title, 'same id, different table');
  assert.equal(await repo.get('classes', { classId: 'x1' }), null);
});
