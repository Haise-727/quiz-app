// Run with: node --test backend/api/api.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { createMemoryRepo } from './memory-repo.mjs';
import { createService, HttpError } from './service.mjs';
import { resetKeyCache, verifyToken } from './authn.mjs';
import { handler } from './index.mjs';

const T = { uid: 'teacher1', email: 't@x.com' };
const S = { uid: 'student1', email: 's@x.com' };
const S2 = { uid: 'student2', email: 's2@x.com' };

function setup() {
  let tick = 0;
  const repo = createMemoryRepo();
  const svc = createService(repo, { now: () => `2026-10-14T00:00:${String(tick++).padStart(2, '0')}.000Z`, newId: (() => { let n = 0; return () => `id${++n}`; })() });
  return { repo, svc };
}
const fails = async (promise, status) => {
  await assert.rejects(promise, (e) => e instanceof HttpError && e.status === status, `expected ${status}`);
};
const quizData = (extra = {}) => ({ title: 'Maths', code: 'ABC123', createdBy: T.uid, active: true, totalPoints: 10, questions: [{ id: 'q1' }], ...extra });

// ── Profiles ────────────────────────────────────────────────────────────────────────────

test('a person creates and reads their own profile; others see only the name', async () => {
  const { svc } = setup();
  await svc.create({ col: 'users', data: { email: 's@x.com', role: 'student', displayName: 'Sam' } }, S);
  assert.equal((await svc.get({ col: 'users', id: S.uid }, S)).email, 's@x.com');
  assert.deepEqual(await svc.get({ col: 'users', id: S.uid }, T), { id: S.uid, displayName: 'Sam' });
  await fails(svc.get({ col: 'users', id: S.uid }, null), 403);
});

test('a profile needs a real role, and nobody can create or change someone else\'s', async () => {
  const { svc } = setup();
  await fails(svc.create({ col: 'users', data: { email: 'a', role: 'admin' } }, S), 400);
  await fails(svc.create({ col: 'users', data: { email: 'a', role: 'student' } }, null), 401);
  await svc.create({ col: 'users', data: { email: 'a', role: 'student' } }, S);
  await fails(svc.update({ col: 'users', id: S.uid, set: { role: 'teacher' } }, T), 403);
  await fails(svc.update({ col: 'users', id: S.uid, set: { role: 'root' } }, S), 400);
  assert.equal((await svc.update({ col: 'users', id: S.uid, set: { role: 'teacher' } }, S)).role, 'teacher');
});

test('names are looked up by id, and guests and missing profiles are left out', async () => {
  const { svc } = setup();
  await svc.create({ col: 'users', data: { email: 's@x.com', role: 'student', displayName: 'Sam' } }, S);
  assert.deepEqual(await svc.names({ ids: [S.uid, 'guest_1', 'nobody'] }, T), { [S.uid]: 'Sam' });
  await fails(svc.names({ ids: [S.uid] }, null), 401);
});

// ── Quizzes ─────────────────────────────────────────────────────────────────────────────

test('an author creates a quiz; the server stamps it and open quizzes are public', async () => {
  const { svc } = setup();
  const q = await svc.create({ col: 'quizzes', data: quizData() }, T);
  assert.ok(q.id && q.createdAt && !('activeKey' in q) && !('quizId' in q));
  assert.equal((await svc.get({ col: 'quizzes', id: q.id }, null)).title, 'Maths');
  const open = await svc.query({ col: 'quizzes', index: 'byActive', value: 'Y' }, null);
  assert.equal(open.length, 1);
  const byCode = await svc.query({ col: 'quizzes', index: 'byCode', value: 'ABC123', filters: { active: true } }, null);
  assert.equal(byCode[0].id, q.id);
});

test('nobody can publish a quiz in another author\'s name, or change or delete one that is not theirs', async () => {
  const { svc } = setup();
  await fails(svc.create({ col: 'quizzes', data: quizData({ createdBy: 'someone-else' }) }, T), 403);
  await fails(svc.create({ col: 'quizzes', data: quizData() }, null), 401);
  const q = await svc.create({ col: 'quizzes', data: quizData() }, T);
  await fails(svc.update({ col: 'quizzes', id: q.id, set: { title: 'x' } }, S), 403);
  await fails(svc.remove({ col: 'quizzes', id: q.id }, S), 403);
  await fails(svc.update({ col: 'quizzes', id: q.id, set: { createdBy: S.uid } }, T), 403);
});

test('a switched off quiz is hidden from everyone but its author, and leaves the open list', async () => {
  const { svc } = setup();
  const q = await svc.create({ col: 'quizzes', data: quizData() }, T);
  await svc.update({ col: 'quizzes', id: q.id, set: { active: false } }, T);
  await fails(svc.get({ col: 'quizzes', id: q.id }, S), 403);
  assert.equal((await svc.get({ col: 'quizzes', id: q.id }, T)).active, false);
  assert.equal((await svc.query({ col: 'quizzes', index: 'byActive', value: 'Y' }, null)).length, 0);
  assert.equal((await svc.query({ col: 'quizzes', index: 'byOwner', value: T.uid, order: 'desc' }, T)).length, 1);
  assert.equal((await svc.query({ col: 'quizzes', index: 'byOwner', value: T.uid }, S)).length, 0, 'someone else sees none of a switched off quiz');
});

test('a quiz\'s own list is newest first, and folder can be removed', async () => {
  const { svc } = setup();
  const a = await svc.create({ col: 'quizzes', data: quizData({ title: 'A', code: 'AAAAAA', folder: 'Maths' }) }, T);
  const b = await svc.create({ col: 'quizzes', data: quizData({ title: 'B', code: 'BBBBBB' }) }, T);
  const list = await svc.query({ col: 'quizzes', index: 'byOwner', value: T.uid, order: 'desc' }, T);
  assert.deepEqual(list.map((x) => x.id), [b.id, a.id]);
  const changed = await svc.update({ col: 'quizzes', id: a.id, unset: ['folder'], stamp: ['updatedAt'] }, T);
  assert.ok(!('folder' in changed) && changed.updatedAt);
});

test('getMany skips quizzes the caller cannot read', async () => {
  const { svc } = setup();
  const open = await svc.create({ col: 'quizzes', data: quizData({ code: 'OPEN11' }) }, T);
  const shut = await svc.create({ col: 'quizzes', data: quizData({ code: 'SHUT11', active: false }) }, T);
  const found = await svc.getMany({ ids: [open.id, shut.id, 'missing'] }, S);
  assert.deepEqual(Object.keys(found), [open.id]);
});

// ── Results ─────────────────────────────────────────────────────────────────────────────

const resultFor = (quiz, extra = {}) => ({ quizId: quiz.id, userId: S.uid, score: 8, finalScore: 8, maxScore: 10, status: 'completed', answers: [], ...extra });

test('a guest can hand in a result, but not under a real person\'s id', async () => {
  const { svc } = setup();
  const quiz = await svc.create({ col: 'quizzes', data: quizData() }, T);
  const r = await svc.create({ col: 'quiz_results', data: resultFor(quiz, { userId: 'guest_abc', username: 'Pat' }) }, null);
  assert.ok(r.id && r.completedAt);
  await fails(svc.create({ col: 'quiz_results', data: resultFor(quiz) }, null), 401);
  await fails(svc.create({ col: 'quiz_results', data: resultFor(quiz, { userId: S2.uid }) }, S), 403);
});

test('the server decides whose class a result belongs to, and caps the score at the quiz total', async () => {
  const { svc } = setup();
  const quiz = await svc.create({ col: 'quizzes', data: quizData() }, T);
  const r = await svc.create({ col: 'quiz_results', data: resultFor(quiz, { teacherId: 'evil', score: 999, finalScore: 999, maxScore: 5000, quizTitle: 'Fake' }) }, S);
  assert.equal(r.teacherId, T.uid);
  assert.equal(r.quizTitle, 'Maths');
  assert.equal(r.maxScore, 10);
  assert.equal(r.finalScore, 10);
});

test('nobody can hand in a result for a quiz that is off or does not exist', async () => {
  const { svc } = setup();
  const shut = await svc.create({ col: 'quizzes', data: quizData({ active: false }) }, T);
  await fails(svc.create({ col: 'quiz_results', data: resultFor(shut) }, S), 403);
  await fails(svc.create({ col: 'quiz_results', data: resultFor({ id: 'nope' }) }, S), 400);
});

test('students see only their own results; the teacher sees the quiz\'s and can mark them; students cannot', async () => {
  const { svc } = setup();
  const quiz = await svc.create({ col: 'quizzes', data: quizData() }, T);
  const mine = await svc.create({ col: 'quiz_results', data: resultFor(quiz) }, S);
  await svc.create({ col: 'quiz_results', data: resultFor(quiz, { userId: S2.uid }) }, S2);

  assert.equal((await svc.query({ col: 'quiz_results', index: 'byUser', value: S.uid, order: 'desc' }, S)).length, 1);
  assert.equal((await svc.query({ col: 'quiz_results', index: 'byUser', value: S2.uid }, S)).length, 0, 'cannot read another student');
  assert.equal((await svc.query({ col: 'quiz_results', index: 'byQuiz', value: quiz.id, filters: { teacherId: T.uid } }, T)).length, 2);
  assert.equal((await svc.query({ col: 'quiz_results', index: 'byTeacher', value: T.uid }, T)).length, 2);
  assert.equal((await svc.query({ col: 'quiz_results', index: 'byQuiz', value: quiz.id }, S)).length, 1, 'a student sees only their own among the quiz\'s');

  await fails(svc.update({ col: 'quiz_results', id: mine.id, set: { finalScore: 10 } }, S), 403);
  const graded = await svc.update({ col: 'quiz_results', id: mine.id, set: { finalScore: 9, status: 'completed' } }, T);
  assert.equal(graded.finalScore, 9);
  await fails(svc.update({ col: 'quiz_results', id: mine.id, set: { userId: T.uid } }, T), 403);
});

test('the daily question result is the student\'s own and belongs to no teacher', async () => {
  const { svc } = setup();
  const r = await svc.create({ col: 'quiz_results', data: { userId: S.uid, quizId: 'daily-2026-10-14', teacherId: 'x', kind: 'daily', score: 1, finalScore: 1, maxScore: 1 } }, S);
  assert.ok(!('teacherId' in r) || r.teacherId === undefined, 'an empty teacherId is not stored');
  await fails(svc.create({ col: 'quiz_results', data: { userId: S.uid, quizId: 'd', kind: 'daily' } }, null), 401);
});

test('completion counts only count this teacher\'s quiz and the students asked about', async () => {
  const { svc } = setup();
  const quiz = await svc.create({ col: 'quizzes', data: quizData() }, T);
  await svc.create({ col: 'quiz_results', data: resultFor(quiz) }, S);
  await svc.create({ col: 'quiz_results', data: resultFor(quiz) }, S);
  await svc.create({ col: 'quiz_results', data: resultFor(quiz, { userId: S2.uid }) }, S2);
  assert.deepEqual(await svc.completionCount({ quizId: quiz.id, studentIds: [S.uid] }, T), { count: 1 });
  assert.deepEqual(await svc.completionCount({ quizId: quiz.id, studentIds: [S.uid, S2.uid] }, T), { count: 2 });
  assert.deepEqual(await svc.completionCount({ quizId: quiz.id, studentIds: [S.uid, S2.uid] }, S), { count: 0 });
});

// ── Classes ─────────────────────────────────────────────────────────────────────────────

test('classes: a teacher runs them, a student joins by code and the teacher sees who joined', async () => {
  const { svc } = setup();
  const cls = await svc.create({ col: 'classes', data: { name: '9A', teacherId: T.uid, code: 'CLS123', quizIds: [] } }, T);
  await fails(svc.create({ col: 'classes', data: { name: 'x', teacherId: T.uid } }, S), 403);
  const found = await svc.query({ col: 'classes', index: 'byCode', value: 'CLS123' }, S);
  assert.equal(found[0].id, cls.id);
  await svc.create({ col: 'class_enrollments', data: { classId: cls.id, studentId: S.uid, studentName: 'Sam' } }, S);
  await fails(svc.create({ col: 'class_enrollments', data: { classId: cls.id, studentId: S2.uid } }, S), 403);
  assert.equal((await svc.query({ col: 'class_enrollments', index: 'byClass', value: cls.id }, T)).length, 1);
  assert.equal((await svc.query({ col: 'class_enrollments', index: 'byClass', value: cls.id }, S2)).length, 0);
  assert.equal((await svc.query({ col: 'class_enrollments', index: 'byStudent', value: S.uid }, S)).length, 1);
});

test('class quiz lists and due dates change without touching other fields', async () => {
  const { svc } = setup();
  const cls = await svc.create({ col: 'classes', data: { name: '9A', teacherId: T.uid, code: 'C1', quizIds: [] } }, T);
  await svc.update({ col: 'classes', id: cls.id, add: { quizIds: 'q1' } }, T);
  await svc.update({ col: 'classes', id: cls.id, add: { quizIds: 'q1' } }, T);
  const two = await svc.update({ col: 'classes', id: cls.id, add: { quizIds: 'q2' }, set: { 'dueDates.q2': '2026-11-01' } }, T);
  assert.deepEqual(two.quizIds, ['q1', 'q2']);
  assert.deepEqual(two.dueDates, { q2: '2026-11-01' });
  const less = await svc.update({ col: 'classes', id: cls.id, remove: { quizIds: 'q1' }, set: { 'dueDates.q2': null } }, T);
  assert.deepEqual(less.quizIds, ['q2']);
  assert.equal(less.dueDates.q2, null);
  await fails(svc.update({ col: 'classes', id: cls.id, add: { quizIds: 'q9' } }, S), 403);
});

test('a student can leave a class, and a teacher can remove the enrolments of a class they delete', async () => {
  const { svc } = setup();
  const cls = await svc.create({ col: 'classes', data: { name: '9A', teacherId: T.uid, code: 'C1' } }, T);
  const e1 = await svc.create({ col: 'class_enrollments', data: { classId: cls.id, studentId: S.uid } }, S);
  const e2 = await svc.create({ col: 'class_enrollments', data: { classId: cls.id, studentId: S2.uid } }, S2);
  assert.deepEqual(await svc.remove({ col: 'class_enrollments', id: e1.id }, S), { removed: 1 });
  await fails(svc.remove({ col: 'class_enrollments', id: e2.id }, S), 403);
  assert.deepEqual(await svc.removeMany({ col: 'class_enrollments', ids: [e2.id] }, T), { removed: 1 });
});

// ── Question bank and notifications ─────────────────────────────────────────────────────

test('the question bank is private to its teacher and has no edits', async () => {
  const { svc } = setup();
  const item = await svc.create({ col: 'question_bank', data: { teacherId: T.uid, questionText: 'q' } }, T);
  assert.equal((await svc.query({ col: 'question_bank', index: 'byTeacher', value: T.uid }, T)).length, 1);
  assert.equal((await svc.query({ col: 'question_bank', index: 'byTeacher', value: T.uid }, S)).length, 0);
  await fails(svc.update({ col: 'question_bank', id: item.id, set: { questionText: 'z' } }, T), 403);
  await fails(svc.remove({ col: 'question_bank', id: item.id }, S), 403);
  assert.deepEqual(await svc.remove({ col: 'question_bank', id: item.id }, T), { removed: 1 });
});

test('notifications: anyone signed in can send one, only the recipient can read and mark it, newest first', async () => {
  const { svc } = setup();
  await svc.create({ col: 'notifications', data: { userId: S.uid, message: 'one', type: 'grading', read: false } }, T);
  const second = await svc.create({ col: 'notifications', data: { userId: S.uid, message: 'two', type: 'grading', read: false } }, T);
  await fails(svc.create({ col: 'notifications', data: { userId: S.uid, message: 'x' } }, null), 401);
  const list = await svc.query({ col: 'notifications', value: S.uid, order: 'desc' }, S);
  assert.deepEqual(list.map((n) => n.message), ['two', 'one']);
  assert.ok(list[0].id.includes('#'));
  await fails(svc.query({ col: 'notifications', value: S.uid }, T), 403);
  const marked = await svc.update({ col: 'notifications', id: second.id, set: { read: true } }, S);
  assert.equal(marked.read, true);
  await fails(svc.update({ col: 'notifications', id: second.id, set: { read: true } }, T), 404);   // not found under another person
});

// ── Safety nets ─────────────────────────────────────────────────────────────────────────

test('callers cannot set the database\'s own fields, and too big a document is refused', async () => {
  const { svc, repo } = setup();
  const q = await svc.create({ col: 'quizzes', data: quizData({ active: false, activeKey: 'Y', quizId: 'forced' }) }, T);
  assert.notEqual(q.id, 'forced');
  assert.equal((await svc.query({ col: 'quizzes', index: 'byActive', value: 'Y' }, null)).length, 0);
  assert.equal(repo._dump('quizzes').length, 1);
  await fails(svc.create({ col: 'quizzes', data: quizData({ blob: 'x'.repeat(400_000) }) }, T), 400);
  await fails(svc.update({ col: 'quizzes', id: q.id, set: { '__proto__.x': 1 } }, T), 400);
  await fails(svc.query({ col: 'nope', value: 'x' }, T), 400);
  await fails(svc.query({ col: 'quizzes', index: 'byAnything', value: 'x' }, T), 400);
});

// ── Sign in tokens ──────────────────────────────────────────────────────────────────────

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const CFG = { region: 'ap-south-1', poolId: 'ap-south-1_pool', clientId: 'client1' };
const jwksFetch = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
const b64u = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function makeToken(claims = {}, { key = privateKey, kid = 'k1' } = {}) {
  const head = b64u({ alg: 'RS256', kid });
  const body = b64u({ sub: 'u1', email: 'u@x.com', name: 'Uma', token_use: 'id', aud: 'client1', iss: 'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_pool', exp: Math.floor(Date.now() / 1000) + 600, ...claims });
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(key).toString('base64url');
  return `${head}.${body}.${sig}`;
}

test('a good ID token gives the person; bad ones give nobody', async () => {
  resetKeyCache();
  const ok = await verifyToken(makeToken(), { ...CFG, fetchFn: jwksFetch });
  assert.equal(ok.uid, 'u1');
  assert.equal(ok.email, 'u@x.com');
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const cases = {
    'signed with another key': makeToken({}, { key: other }),
    'expired': makeToken({ exp: Math.floor(Date.now() / 1000) - 5 }),
    'wrong audience': makeToken({ aud: 'someone-elses-app' }),
    'wrong pool': makeToken({ iss: 'https://cognito-idp.ap-south-1.amazonaws.com/other' }),
    'an access token': makeToken({ token_use: 'access' }),
    'unknown key id': makeToken({}, { kid: 'zzz' }),
    'garbage': 'not.a.jwt',
    'empty': '',
  };
  for (const [name, token] of Object.entries(cases)) {
    assert.equal(await verifyToken(token, { ...CFG, fetchFn: jwksFetch }), null, name);
  }
});

// ── The Lambda handler ──────────────────────────────────────────────────────────────────

const call = (body, extra = {}, deps = {}) => handler({ requestContext: { http: { method: 'POST' } }, headers: { origin: 'https://app.example' }, body: JSON.stringify(body), ...extra }, {}, deps);

test('the handler answers in the agreed shape and maps errors to statuses', async () => {
  const { repo } = setup();
  const deps = { repo, caller: T };
  const made = await call({ op: 'create', col: 'quizzes', data: quizData() }, {}, deps);
  assert.equal(made.statusCode, 200);
  const body = JSON.parse(made.body);
  assert.equal(body.ok, true);
  assert.equal((await call({ op: 'get', col: 'quizzes', id: body.data.id }, {}, { repo, caller: null })).statusCode, 200);
  assert.equal((await call({ op: 'create', col: 'quizzes', data: quizData() }, {}, { repo, caller: null })).statusCode, 401);
  assert.equal((await call({ op: 'update', col: 'quizzes', id: body.data.id, set: { title: 'x' } }, {}, { repo, caller: S })).statusCode, 403);
  assert.equal((await call({ op: 'explode' }, {}, deps)).statusCode, 400);
  assert.equal((await call({}, { body: '{bad json' }, deps)).statusCode, 400);
  assert.equal(made.headers['Access-Control-Allow-Origin'], '*');
});

test('the handler refuses other methods, answers CORS preflight, and does not leak internal errors', async () => {
  const { repo } = setup();
  assert.equal((await handler({ requestContext: { http: { method: 'GET' } }, headers: {} }, {}, { repo })).statusCode, 405);
  assert.equal((await handler({ requestContext: { http: { method: 'OPTIONS' } }, headers: {} }, {}, { repo })).statusCode, 204);
  const broken = { get: async () => { throw new Error('secret table name'); }, put: async () => {}, remove: async () => {}, query: async () => [] };
  const res = await call({ op: 'get', col: 'quizzes', id: 'x' }, {}, { repo: broken, caller: null });
  assert.equal(res.statusCode, 500);
  assert.ok(!res.body.includes('secret'));
  const throttled = { ...broken, get: async () => { const e = new Error('x'); e.name = 'ProvisionedThroughputExceededException'; throw e; } };
  assert.equal((await call({ op: 'get', col: 'quizzes', id: 'x' }, {}, { repo: throttled, caller: null })).statusCode, 503);
});

test('the Lambda runtime passes a callback as the third argument and the handler must not trip on it', async () => {
  const callback = function runtimeCallback() {};
  const res = await handler({ requestContext: { http: { method: 'POST' } }, headers: {}, body: JSON.stringify({ op: 'nope' }) }, {}, callback);
  assert.equal(res.statusCode, 400);   // reached the op check, so nothing threw on the callback
});
