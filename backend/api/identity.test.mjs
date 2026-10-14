// Run with: node --test backend/api/identity.test.mjs
// Accounts moved over from Firebase: how they are recognised, and how that cannot be abused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepo } from './memory-repo.mjs';
import { resetIdentityCache } from './identity.mjs';
import { handler } from './index.mjs';
import { handler as preSignUp } from '../auth-triggers/pre-signup.mjs';
import { handler as migrateUser } from '../auth-triggers/migrate-user.mjs';

const legacyProfile = (uid, email) => ({ uid, email, role: 'teacher', displayName: 'Old Tess', legacy: true, legacyEmail: email.toLowerCase() });
const run = (repo, caller, body) => handler({ requestContext: { http: { method: 'POST' } }, headers: {}, body: JSON.stringify(body) }, {}, { repo, caller });
const data = async (promise) => JSON.parse((await promise).body).data;

test('a verified email finds the old Firebase data; an unverified one does not', async () => {
  resetIdentityCache();
  const repo = createMemoryRepo();
  await repo.put('users', legacyProfile('fb-old-uid', 'Tess@School.com'));
  await repo.put('quizzes', { quizId: 'q-old', createdBy: 'fb-old-uid', createdAt: '2026-01-01T00:00:00.000Z', title: 'Old quiz', active: true, activeKey: 'Y' });

  const google = { uid: 'new-sub-1', sub: 'new-sub-1', email: 'tess@school.com', emailVerified: true };
  assert.deepEqual(await data(run(repo, google, { op: 'me' })), { uid: 'fb-old-uid', legacy: true });
  const mine = await data(run(repo, google, { op: 'query', col: 'quizzes', index: 'byOwner', value: 'fb-old-uid' }));
  assert.equal(mine.length, 1);
  const profile = await data(run(repo, google, { op: 'get', col: 'users', id: 'fb-old-uid' }));
  assert.equal(profile.role, 'teacher');
  assert.ok(!('legacy' in profile) && !('legacyEmail' in profile), 'the marker fields stay private');
  const edited = await run(repo, google, { op: 'update', col: 'quizzes', id: 'q-old', set: { title: 'Renamed' } });
  assert.equal(edited.statusCode, 200, 'the moved over person can edit their own old quiz');

  resetIdentityCache();
  const stranger = { uid: 'new-sub-2', sub: 'new-sub-2', email: 'tess@school.com', emailVerified: false };
  assert.deepEqual(await data(run(repo, stranger, { op: 'me' })), { uid: 'new-sub-2', legacy: false });
  assert.equal((await run(repo, stranger, { op: 'update', col: 'quizzes', id: 'q-old', set: { title: 'hacked' } })).statusCode, 403);
  assert.equal((await run(repo, null, { op: 'me' })).statusCode, 401);
});

test('someone with no old account is just themselves, and cannot overwrite or forge the markers', async () => {
  resetIdentityCache();
  const repo = createMemoryRepo();
  await repo.put('users', legacyProfile('fb-old-uid', 'tess@school.com'));
  const fresh = { uid: 's9', sub: 's9', email: 'new@x.com', emailVerified: true };
  assert.deepEqual(await data(run(repo, fresh, { op: 'me' })), { uid: 's9', legacy: false });
  const made = JSON.parse((await run(repo, fresh, { op: 'create', col: 'users', data: { email: 'new@x.com', role: 'student', displayName: 'N', legacyEmail: 'tess@school.com', legacy: true } })).body);
  assert.equal(made.ok, true);
  assert.ok(!('legacyEmail' in made.data));
  assert.equal((await run(repo, fresh, { op: 'create', col: 'users', data: { email: 'new@x.com', role: 'student' } })).statusCode, 409, 'no second profile');
  const owner = { uid: 'fb-old-uid', sub: 'fb-old-uid', email: 'x', emailVerified: false };
  assert.equal((await run(repo, owner, { op: 'create', col: 'users', data: { email: 'tess@school.com', role: 'student' } })).statusCode, 409, 'an old profile is never overwritten');
  assert.equal((await run(repo, owner, { op: 'update', col: 'users', id: 'fb-old-uid', set: { legacyEmail: 'other@x.com' } })).statusCode, 403);

  // two profiles with one email: match nobody rather than guess
  resetIdentityCache();
  await repo.put('users', legacyProfile('fb-dup-uid', 'tess@school.com'));
  const both = { uid: 's10', sub: 's10', email: 'tess@school.com', emailVerified: true };
  assert.deepEqual(await data(run(repo, both, { op: 'me' })), { uid: 's10', legacy: false });
});

test('pre sign up: Google is confirmed and verified; a new email is confirmed but not verified; an old email is refused', async () => {
  const ev = (source, email) => ({ triggerSource: source, request: { userAttributes: { email } }, response: {} });
  const taken = async (email) => email === 'tess@school.com';
  const g = await preSignUp(ev('PreSignUp_ExternalProvider', 'a@b.com'), {}, { legacyEmailTaken: taken });
  assert.equal(g.response.autoConfirmUser, true);
  assert.equal(g.response.autoVerifyEmail, true);
  const n = await preSignUp(ev('PreSignUp_SignUp', 'fresh@b.com'), {}, { legacyEmailTaken: taken });
  assert.equal(n.response.autoConfirmUser, true);
  assert.ok(!n.response.autoVerifyEmail, 'a plain sign up must not be marked verified');
  await assert.rejects(preSignUp(ev('PreSignUp_SignUp', ' Tess@School.com '), {}, { legacyEmailTaken: taken }), /already has a Quizlike account/);
  await assert.rejects(preSignUp(ev('PreSignUp_SignUp', 'x@b.com'), {}, { legacyEmailTaken: async () => { throw new Error('db down'); } }), /try again/);
});

test('user migration: a right Firebase password creates a verified account; a wrong one does not', async () => {
  process.env.FIREBASE_API_KEY = 'public-key';
  const calls = [];
  const fakeFetch = (ok) => async (url, init) => { calls.push({ url, body: JSON.parse(init.body), referer: init.headers.Referer }); return { ok, json: async () => ({ displayName: 'Old Tess' }) }; };
  const ev = (extra = {}) => ({ triggerSource: 'UserMigration_Authentication', userName: ' Tess@School.com ', request: { password: 'secret1' }, response: {}, ...extra });
  const done = await migrateUser(ev(), {}, { fetch: fakeFetch(true) });
  assert.deepEqual(done.response.userAttributes, { email: 'tess@school.com', email_verified: 'true', name: 'Old Tess' });
  assert.equal(done.response.finalUserStatus, 'CONFIRMED');
  assert.equal(done.response.messageAction, 'SUPPRESS');
  assert.equal(calls[0].body.email, 'tess@school.com');
  assert.ok(calls[0].url.includes('signInWithPassword') && calls[0].referer);
  await assert.rejects(migrateUser(ev(), {}, { fetch: fakeFetch(false) }), /Incorrect email or password/);
  await assert.rejects(migrateUser(ev({ triggerSource: 'UserMigration_ForgotPassword' }), {}, { fetch: fakeFetch(true) }), /Sign in once/);
  await assert.rejects(migrateUser(ev({ request: { password: '' } }), {}, { fetch: fakeFetch(true) }), /Incorrect/);
});
