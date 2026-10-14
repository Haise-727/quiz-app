// Runs the browser side of the AWS version (src/api/aws) against the real backend code (backend/api), with
// storage in memory and the network replaced by a function call. It proves the two halves agree: every
// function the pages use works, returns the shapes the pages expect, and obeys the same permission rules.
//
//   node scripts/test-aws-client.mjs
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const out = mkdtempSync(join(tmpdir(), 'aws-client-'));

// Bundle the client modules the way Vite would: `@/` means src, and the settings the build injects are fixed values.
const entry = join(out, 'entry.js');
writeFileSync(entry, ['quizzes', 'results', 'classes', 'notifications', 'questionBank', 'users', 'devTools', 'account', 'auth']
  .map((m) => `export * as ${m} from ${JSON.stringify(join(root, 'src/api/aws', m + '.js').replace(/\\/g, '/'))};`).join('\n')
  + `\nexport * as session from ${JSON.stringify(join(root, 'src/api/aws/session.js').replace(/\\/g, '/'))};\n`);
await build({
  entryPoints: [entry], outfile: join(out, 'client.mjs'), bundle: true, format: 'esm', platform: 'node', logLevel: 'error',
  alias: { '@': join(root, 'src') },
  define: {
    'import.meta.env.VITE_AWS_API_URL': '"http://api.test/"',
    'import.meta.env.VITE_COGNITO_CLIENT_ID': '"client1"',
    'import.meta.env.VITE_COGNITO_DOMAIN': '"https://auth.test"',
    'import.meta.env.VITE_COGNITO_REGION': '"ap-south-1"',
  },
});

// A browser's storage and a network that calls the backend directly.
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = { addEventListener() {}, removeEventListener() {}, location: { origin: 'http://localhost' } };

const { createMemoryRepo } = await import(pathToFileURL(join(root, 'backend/api/memory-repo.mjs')));
const { handler } = await import(pathToFileURL(join(root, 'backend/api/index.mjs')));
const repo = createMemoryRepo();
let clock = 0;
const deps = (caller) => ({ repo, caller, clock: { now: () => new Date(Date.UTC(2026, 9, 14, 0, 0, clock++)).toISOString() } });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeToken = (claims) => `${b64({ alg: 'none' })}.${b64(claims)}.sig`;
const callerOf = (header) => {
  if (!header?.startsWith('Bearer ')) return null;
  const c = JSON.parse(Buffer.from(header.slice(7).split('.')[1], 'base64url').toString());
  return { uid: c.sub, sub: c.sub, email: c.email, emailVerified: c.email_verified === true, name: c.name };
};
globalThis.fetch = async (url, init) => {
  assert.equal(url, 'http://api.test/');
  const res = await handler({ requestContext: { http: { method: 'POST' } }, headers: init.headers.Authorization ? { authorization: init.headers.Authorization } : {}, body: init.body }, {}, deps(callerOf(init.headers.Authorization)));
  return { ok: res.statusCode < 400, status: res.statusCode, json: async () => JSON.parse(res.body) };
};

const c = await import(pathToFileURL(join(out, 'client.mjs')));
const signInAs = (uid, name = uid, extra = {}) => c.session.saveSession({
  idToken: fakeToken({ sub: uid, email: `${uid}@x.com`, name, iat: 1, auth_time: Math.floor(Date.now() / 1000), ...extra }),
  accessToken: 'access', refreshToken: 'refresh', expiresAt: Date.now() + 3600_000, method: 'password',
});
const signOut = () => c.session.clearSession();

let passed = 0;
const ok = (name, fn) => fn().then(() => { passed += 1; console.log(`  ok   ${name}`); }, (e) => { console.error(`  FAIL ${name}\n       ${e.stack}`); process.exitCode = 1; });

// ── the story of one class ──────────────────────────────────────────────────────────────

await ok('sign in gives the app a user in the shape it expects', async () => {
  signInAs('teacher1', 'Tess');
  const user = c.auth.getCurrentUser();
  assert.equal(user.uid, 'teacher1');
  assert.equal(user.displayName, 'Tess');
  assert.deepEqual(user.providerData, [{ providerId: 'password' }]);
  assert.ok(user.metadata.creationTime);
  signInAs('g1', 'Gus', { identities: [{ providerName: 'Google' }] });
  assert.deepEqual(c.auth.getCurrentUser().providerData, [{ providerId: 'google.com' }]);
});

await ok('a person moved over from Firebase keeps their old id and their data', async () => {
  await repo.put('users', { uid: 'fb-uid-9', email: 'Old@School.com', role: 'teacher', displayName: 'Olly', legacy: true, legacyEmail: 'old@school.com' });
  await repo.put('quizzes', { quizId: 'old-quiz', createdBy: 'fb-uid-9', createdAt: '2026-01-01T00:00:00.000Z', title: 'From Firebase', active: false, totalPoints: 1, questions: [] });
  signInAs('cognito-sub-77', 'Olly', { email: 'old@school.com', email_verified: true });
  const seen = await new Promise((resolveUser) => { const stop = c.auth.watchAuth((u) => { if (u && u.uid === 'fb-uid-9') { stop(); resolveUser(u); } }); });
  assert.equal(seen.uid, 'fb-uid-9', 'the app is told the old id');
  assert.equal((await c.users.getUserProfile('fb-uid-9')).role, 'teacher');
  assert.deepEqual((await c.quizzes.listMyQuizzes('fb-uid-9')).map((q) => q.title), ['From Firebase']);
  signInAs('plain-sub', 'Pat', { email: 'old@school.com' });          // same email, but never verified
  const other = await new Promise((resolveUser) => { const stop = c.auth.watchAuth((u) => { if (u) { stop(); resolveUser(u); } }); });
  assert.equal(other.uid, 'plain-sub', 'an unverified email gets no old data');
  assert.equal((await c.quizzes.listMyQuizzes('fb-uid-9')).length, 0, 'and cannot see the old quizzes');
  signOut();
});

await ok('profiles: create, read, change, and names for others', async () => {
  signInAs('teacher1', 'Tess');
  const made = await c.users.createUserProfile('teacher1', { email: 't@x.com', role: 'teacher', displayName: 'Tess' });
  assert.equal(made.role, 'teacher');
  assert.equal((await c.users.getUserProfile('teacher1')).displayName, 'Tess');
  await c.users.updateUserProfile('teacher1', { displayName: 'Ms Tess' });
  signInAs('student1', 'Sam');
  await c.users.createUserProfile('student1', { email: 's@x.com', role: 'student', displayName: 'Sam' });
  assert.equal(await c.users.getUserProfile('nobody'), null);
  assert.deepEqual(await c.users.getUserNames(['teacher1', 'student1', 'guest_1']), { teacher1: 'Ms Tess', student1: 'Sam' });
});

let quizId;
await ok('a teacher creates, lists, edits, switches and files quizzes', async () => {
  signInAs('teacher1', 'Tess');
  quizId = await c.quizzes.createQuiz({ title: 'Maths', code: 'MATH11', createdBy: 'teacher1', active: true, totalPoints: 10, questions: [{ id: 'q1' }] });
  const second = await c.quizzes.createQuiz({ title: 'Art', code: 'ART111', createdBy: 'teacher1', active: false, totalPoints: 5, questions: [] });
  const mine = await c.quizzes.listMyQuizzes('teacher1');
  assert.deepEqual(mine.map((q) => q.title), ['Art', 'Maths'], 'newest first');
  assert.equal(typeof mine[0].createdAt.toDate().getTime(), 'number', 'times answer toDate like Firestore timestamps');
  assert.ok(mine[0].createdAt.toMillis() > 0 && mine[0].createdAt.seconds > 0);
  await c.quizzes.updateQuiz(quizId, { title: 'Maths 2', description: 'x' });
  await c.quizzes.setQuizFolder(quizId, 'Term 1');
  assert.equal((await c.quizzes.getQuiz(quizId)).folder, 'Term 1');
  await c.quizzes.setQuizFolder(quizId, '');
  assert.equal('folder' in (await c.quizzes.getQuiz(quizId)), false);
  await c.quizzes.setQuizAllowCloning(quizId, false);
  assert.equal((await c.quizzes.getQuiz(quizId)).allowCloning, false);
  await c.quizzes.setQuizActive(second, true);
  assert.equal((await c.quizzes.listActiveQuizzes()).length, 2);
  assert.equal(await c.quizzes.isJoinCodeFree('MATH11', 'teacher1'), false);
  assert.equal(await c.quizzes.isJoinCodeFree('FREE11', 'teacher1'), true);
});

await ok('anyone, signed in or not, finds an open quiz by code and reads it', async () => {
  signOut();
  assert.equal(await c.quizzes.findActiveQuizByCode(' math11 '), quizId);
  assert.equal(await c.quizzes.findActiveQuizByCode('NOPE00'), null);
  assert.equal((await c.quizzes.getQuiz(quizId)).title, 'Maths 2');
  assert.equal((await c.quizzes.getActiveQuizzes(60)).length, 2);
  const readable = await c.quizzes.getReadableQuizzes([quizId, 'missing']);
  assert.deepEqual(Object.keys(readable), [quizId]);
  assert.equal(Object.keys(await c.quizzes.getQuizzesByIds([quizId, 'missing'])).length, 1);
});

await ok('a guest hands in a result and the server fixes the teacher and the total', async () => {
  signOut();
  const id = await c.results.submitResult({ quizId, userId: 'guest_a', username: 'Pat', isGuest: true, score: 99, finalScore: 99, maxScore: 1, status: 'completed', completedAt: new Date(), answers: [] });
  assert.ok(id);
  signInAs('teacher1');
  const all = await c.results.listResultsForQuiz(quizId, 'teacher1');
  assert.equal(all.length, 1);
  assert.equal(all[0].finalScore, 10);
  assert.equal(all[0].maxScore, 10);
  assert.equal(all[0].teacherId, 'teacher1');
  assert.ok(all[0].completedAt.toDate() instanceof Date);
});

let resultId;
await ok('a student takes the quiz, sees their results, and the teacher grades it', async () => {
  signInAs('student1', 'Sam');
  resultId = await c.results.submitResult({ quizId, quizTitle: 'x', userId: 'student1', score: 7, finalScore: 7, maxScore: 10, status: 'pending', answers: [{ a: 1 }], completedAt: new Date() });
  await c.results.submitResult({ quizId: 'daily-2026-10-14', userId: 'student1', kind: 'daily', teacherId: '', score: 1, finalScore: 1, maxScore: 1, status: 'completed', completedAt: new Date() });
  const mine = await c.results.listMyResults('student1');
  assert.equal(mine.length, 2);
  assert.ok(mine[0].completedAt.toMillis() >= mine[1].completedAt.toMillis(), 'newest first');
  assert.equal((await c.results.listMyResultsUnordered('student1')).length, 2);
  await assert.rejects(c.results.gradeResult(resultId, { finalScore: 10 }), (e) => e.code === 'permission-denied');
  signInAs('teacher1');
  await c.results.gradeResult(resultId, { finalScore: 9, score: 9, status: 'completed' });
  assert.equal((await c.results.listResultsForTeacher('teacher1')).find((r) => r.id === resultId).finalScore, 9);
  assert.equal(await c.results.getCompletionCount(quizId, ['student1', 'guest_a', 'someone']), 2);
  assert.equal(await c.results.getCompletionCount(quizId, ['someone']), 0);
});

await ok('a student cannot read another student or file a result as them', async () => {
  signInAs('student2', 'Sue');
  assert.equal((await c.results.listMyResults('student1')).length, 0);
  await assert.rejects(c.results.submitResult({ quizId, userId: 'student1', score: 1, finalScore: 1, maxScore: 10 }), (e) => e.code === 'permission-denied');
});

let classId;
await ok('classes: create, join by code, due dates, quiz list, leave, delete', async () => {
  signInAs('teacher1', 'Tess');
  classId = await c.classes.createClass({ name: '9A', description: 'Maths', teacherId: 'teacher1', teacherName: 'Tess' });
  const [cls] = await c.classes.getTeacherClasses('teacher1');
  assert.equal(cls.name, '9A');
  assert.equal(cls.code.length, 6);
  await c.classes.addQuizToClass(classId, quizId);
  await c.classes.setQuizDueDate(classId, quizId, '2026-11-01');
  await c.classes.updateClass(classId, { name: '9B', description: 'Maths' });

  signInAs('student1', 'Sam');
  await assert.rejects(c.classes.joinClassByCode({ code: 'ZZZZZZ', studentId: 'student1', studentName: 'Sam' }), /No class found/);
  const joined = await c.classes.joinClassByCode({ code: ` ${cls.code.toLowerCase()} `, studentId: 'student1', studentName: 'Sam' });
  assert.equal(joined.id, classId);
  await assert.rejects(c.classes.joinClassByCode({ code: cls.code, studentId: 'student1', studentName: 'Sam' }), /already enrolled/);
  const mine = await c.classes.getStudentClasses('student1');
  assert.equal(mine.length, 1);
  assert.deepEqual(mine[0].quizIds, [quizId]);
  assert.equal(mine[0].dueDates[quizId], '2026-11-01');
  assert.equal(mine[0].name, '9B');

  signInAs('teacher1');
  assert.equal((await c.classes.getClassEnrollments(classId)).length, 1);
  await c.classes.removeQuizFromClass(classId, quizId);
  signInAs('student1');
  await c.classes.leaveClass({ classId, studentId: 'student1' });
  assert.equal((await c.classes.getStudentClasses('student1')).length, 0);
  await c.classes.joinClassByCode({ code: cls.code, studentId: 'student1', studentName: 'Sam' });
  signInAs('teacher1');
  await c.classes.deleteClass(classId);
  assert.equal((await c.classes.getTeacherClasses('teacher1')).length, 0);
  signInAs('student1');
  assert.equal((await c.classes.getStudentClasses('student1')).length, 0);
});

await ok('notifications: sent by a teacher, read and marked by the student', async () => {
  signInAs('teacher1');
  await c.notifications.createNotification('student1', 'Graded', 'grade_released', { quizId });
  await c.notifications.createNotification('student1', 'Another', 'grading', null);
  await c.notifications.createNotification(null, 'ignored', 'x');
  signInAs('student1');
  const seen = await new Promise((resolveList) => { const stop = c.notifications.listenToNotifications('student1', (l) => { stop(); resolveList(l); }); });
  assert.deepEqual(seen.map((n) => n.message), ['Another', 'Graded']);
  assert.ok(seen[0].createdAt.toMillis() > 0);
  await c.notifications.markNotificationAsRead(seen[0].id);
  await c.notifications.markAllNotificationsAsRead('student1');
  const after = await new Promise((resolveList) => { const stop = c.notifications.listenToNotifications('student1', (l) => { stop(); resolveList(l); }); });
  assert.ok(after.every((n) => n.read === true));
});

await ok('question bank: save, list (document id wins), delete', async () => {
  signInAs('teacher1');
  const id = await c.questionBank.saveToBank({ id: 'own-id', questionText: 'What?', localMediaFile: { big: true } }, 'teacher1');
  const list = await c.questionBank.getBankQuestions('teacher1');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, id);
  assert.equal('localMediaFile' in list[0], false, 'files are stripped before saving');
  await c.questionBank.deleteBankQuestion(id);
  assert.equal((await c.questionBank.getBankQuestions('teacher1')).length, 0);
});

await ok('dev tools: seed a test quiz and clear results and bad quizzes', async () => {
  signInAs('teacher1');
  const id = await c.devTools.seedTestQuiz('teacher1');
  assert.ok((await c.quizzes.getQuiz(id)).questions.length > 3);
  assert.equal(await c.devTools.clearInvalidQuizzes('teacher1'), 0);
  assert.ok(await c.devTools.clearAllQuizResults('teacher1') >= 1);
  assert.equal((await c.results.listResultsForTeacher('teacher1')).length, 0);
});

await ok('export and delete an account follow the plan, and the profile goes too', async () => {
  signInAs('student1', 'Sam');
  const user = c.auth.getCurrentUser();
  const data = await c.account.exportMyData(user, 'student');
  assert.equal(data.account.uid, 'student1');
  assert.ok(Array.isArray(data.results) && Array.isArray(data.notifications) && Array.isArray(data.classMemberships));
  assert.ok(data.results.length >= 1);
  // Deleting also calls Cognito to close the sign in, which this test has no network for.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => (String(url).includes('cognito-idp') ? { ok: true, status: 200, json: async () => ({}) } : realFetch(url, init));
  const steps = [];
  await assert.rejects(c.account.deleteMyAccount(user, 'student', { onProgress: (s) => steps.push(s) }), /Type your password/);
  const googleUser = { ...user, providerData: [{ providerId: 'google.com' }], authTime: Math.floor(Date.now() / 1000) };
  await c.account.deleteMyAccount(googleUser, 'student', { onProgress: (s) => steps.push(s) });
  globalThis.fetch = realFetch;
  assert.ok(steps.includes('Closing your account'));
  assert.equal(c.auth.getCurrentUser(), null, 'signed out afterwards');
  signInAs('student1');
  assert.equal((await c.results.listMyResults('student1')).length, 0);
  assert.equal(await c.users.getUserProfile('student1'), null);
});

await ok('a busy database is retried and a real error keeps the server\'s sentence', async () => {
  signInAs('teacher1');
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return calls < 3 ? { ok: false, status: 503, json: async () => ({ ok: false, error: 'Busy.' }) } : { ok: true, status: 200, json: async () => ({ ok: true, data: [] }) }; };
  assert.deepEqual(await c.quizzes.listActiveQuizzes(), []);
  assert.equal(calls, 3);
  globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({ ok: false, error: 'You are not allowed to do that.' }) });
  await assert.rejects(c.quizzes.getQuiz('x'), (e) => e.code === 'permission-denied' && /not allowed/.test(e.message));
  globalThis.fetch = realFetch;
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
