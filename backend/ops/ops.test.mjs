// Run with: node --test backend/ops/ops.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { handler as stream, decide, notificationFor } from './stream-trigger.mjs';
import { handler as health, checkOne } from './health-check.mjs';
import { handler as cost, assess } from './cost-check.mjs';
import { createMemoryStore } from '../api/single-table.mjs';

// A tiny DynamoDB JSON <-> plain converter, just enough for these records (the real one ships inside the Lambda runtime).
const unmarshall = (img) => JSON.parse(JSON.stringify(img, (k, v) => (v && typeof v === 'object' && ('S' in v || 'N' in v || 'BOOL' in v || 'NULL' in v) ? ('S' in v ? v.S : 'N' in v ? Number(v.N) : 'BOOL' in v ? v.BOOL : null) : v)));
const marshall = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? { S: v } : typeof v === 'number' ? { N: String(v) } : typeof v === 'boolean' ? { BOOL: v } : { NULL: true }]));
const rec = (eventName, next, prev, seq = '1') => ({ eventName, dynamodb: { SequenceNumber: seq, ApproximateCreationDateTime: 1791990000, NewImage: marshall(next), ...(prev ? { OldImage: marshall(prev) } : {}) } });
const result = (extra = {}) => ({ _t: 'results', resultId: 'r1', quizId: 'q1', quizTitle: 'Essay', userId: 's1', teacherId: 't1', status: 'pending', finalScore: 0, maxScore: 10, ...extra });

function fakeDb() {
  const store = createMemoryStore();
  return { store, get: (pk, sk) => store.get(pk, sk), put: (item) => store.put(item) };
}

test('a result that needs marking notifies the teacher, naming the student', async () => {
  const db = fakeDb();
  await db.put({ pk: 'users#s1', sk: '#', _t: 'users', uid: 's1', displayName: 'Sam' });
  const out = await stream({ Records: [rec('INSERT', result())] }, {}, { unmarshall, db });
  assert.equal(out.sent, 1);
  assert.deepEqual(out.batchItemFailures, []);
  const [n] = await db.store.query({ index: null, keyName: 'pk', keyValue: 'notifications#t1', forward: true, limit: 5 });
  assert.equal(n.message, 'Sam has submitted "Essay" which requires manual grading.');
  assert.equal(n.type, 'grading');
  assert.deepEqual(n.data, { quizId: 'q1', resultId: 'r1' });
  assert.ok(n.ttl > 1791990000, 'it will delete itself later');
});

test('finishing the marking notifies the student with the score', async () => {
  const db = fakeDb();
  const out = await stream({ Records: [rec('MODIFY', result({ status: 'completed', finalScore: 8 }), result())] }, {}, { unmarshall, db });
  assert.equal(out.sent, 1);
  const [n] = await db.store.query({ index: null, keyName: 'pk', keyValue: 'notifications#s1', forward: true, limit: 5 });
  assert.equal(n.message, 'Your quiz "Essay" has been graded. Final score: 8/10');
  assert.equal(n.type, 'grade_released');
});

test('everything else is ignored: guests, daily answers, finished results, other tables, deletes', () => {
  const d = (r) => decide(r, { unmarshall });
  assert.equal(d(rec('INSERT', result({ status: 'completed' }))), null, 'auto graded');
  assert.equal(d(rec('INSERT', result({ kind: 'daily' }))), null);
  assert.equal(d(rec('INSERT', result({ teacherId: undefined }))), null, 'no teacher to tell');
  assert.equal(d(rec('MODIFY', result({ status: 'completed', userId: 'guest_x' }), result({ userId: 'guest_x' }))), null, 'a guest has no inbox');
  assert.equal(d(rec('MODIFY', result({ status: 'completed' }), result({ status: 'completed' }))), null, 'not a marking event');
  assert.equal(d(rec('INSERT', { _t: 'quizzes', status: 'pending' })), null);
  assert.equal(d({ eventName: 'REMOVE', dynamodb: { OldImage: marshall(result()) } }), null);
});

test('the same event delivered twice gives one notification, not two', async () => {
  const db = fakeDb();
  const event = { Records: [rec('INSERT', result())] };
  await stream(event, {}, { unmarshall, db });
  await stream(event, {}, { unmarshall, db });
  const rows = await db.store.query({ index: null, keyName: 'pk', keyValue: 'notifications#t1', forward: true, limit: 10 });
  assert.equal(rows.length, 1);
});

test('a record that fails is reported for retry and does not stop the others', async () => {
  const db = fakeDb();
  let calls = 0;
  const flaky = { get: db.get, put: async (item) => { calls += 1; if (calls === 1) throw new Error('throttled'); return db.put(item); } };
  const out = await stream({ Records: [rec('INSERT', result(), null, 'seq-1'), rec('INSERT', result({ resultId: 'r2' }), null, 'seq-2')] }, {}, { unmarshall, db: flaky });
  assert.deepEqual(out.batchItemFailures, [{ itemIdentifier: 'seq-1' }]);
  assert.equal(out.sent, 1);
});

test('a brand new profile gets a welcome, a copied over or edited one does not', async () => {
  const db = fakeDb();
  const user = { _t: 'users', uid: 'u9', role: 'teacher', displayName: 'Tess Teacher' };
  const out = await stream({ Records: [rec('INSERT', user)] }, {}, { unmarshall, db });
  assert.equal(out.sent, 1);
  const [n] = await db.store.query({ index: null, keyName: 'pk', keyValue: 'notifications#u9', forward: true, limit: 5 });
  assert.equal(n.message, 'Welcome to Quizlike, Tess. Create your first quiz and share its code.');
  assert.equal(n.type, 'welcome');
  assert.equal(decide(rec('INSERT', { ...user, legacy: true }), { unmarshall }), null, 'moved over from Firebase');
  assert.equal(decide(rec('MODIFY', user, user), { unmarshall }), null, 'an edit');
  assert.match(notificationFor('welcome', { uid: 's', role: 'student', displayName: '' }, 0).message, /^Welcome to Quizlike\. Join a quiz/);
});

test('notification text helper covers a missing student name and title', () => {
  assert.match(notificationFor('needs_marking', { resultId: 'r', teacherId: 't' }, 0).message, /^A student has submitted "a quiz"/);
});

// ── health check ────────────────────────────────────────────────────────────────────────

const respond = (status, body) => ({ status, text: async () => body, json: async () => JSON.parse(body) });

test('health check: right answers are ok, wrong ones and timeouts are not', async () => {
  assert.equal((await checkOne({ name: 'site', kind: 'site', url: 'x' }, async () => respond(200, '<title>Quizlike</title>'))).ok, true);
  assert.equal((await checkOne({ name: 'site', kind: 'site', url: 'x' }, async () => respond(200, '<title>Not it</title>'))).ok, false);
  assert.equal((await checkOne({ name: 'signer', kind: 'signer', url: 'x' }, async () => respond(200, '{"success":true,"signature":"abc"}'))).ok, true);
  assert.equal((await checkOne({ name: 'signer', kind: 'signer', url: 'x' }, async () => respond(500, '{"success":false}'))).ok, false);
  assert.equal((await checkOne({ name: 'api', kind: 'api', url: 'x' }, async () => respond(200, '{"ok":true,"data":[]}'))).ok, true);
  assert.equal((await checkOne({ name: 'api', kind: 'api', url: 'x' }, async () => { throw new Error('timeout'); })).ok, false);
});

test('health check writes one ok and one latency metric per target', async () => {
  const sent = [];
  const out = await health({}, {}, {
    targets: [{ name: 'site', kind: 'site', url: 'a' }, { name: 'api', kind: 'api', url: 'b' }],
    fetch: async (url) => (url === 'a' ? respond(200, '<title>Quizlike</title>') : respond(503, '{}')),
    putMetrics: async (m) => sent.push(...m),
  });
  assert.deepEqual(out.map((r) => [r.name, r.ok]), [['site', true], ['api', false]]);
  assert.equal(sent.length, 3, 'two ok flags and one latency (API only)');
  assert.deepEqual(sent.filter((m) => m.MetricName === 'HealthOk').map((m) => m.Value), [1, 0]);
  assert.deepEqual(sent.filter((m) => m.MetricName === 'LatencyMs').map((m) => m.Dimensions[0].Value), ['api']);
});

// ── cost check ──────────────────────────────────────────────────────────────────────────

test('cost check: quiet when small and expected, loud when over the limit or when an unknown service appears', () => {
  assert.deepEqual(assess([{ service: 'AWS Lambda', usd: 0.01 }, { service: 'Amazon DynamoDB', usd: 0.0 }]).problems, []);
  assert.equal(assess([{ service: 'AWS Lambda', usd: 0.9 }]).problems.length, 1);
  const rds = assess([{ service: 'Amazon Relational Database Service', usd: 0.46 }]);
  assert.equal(rds.unexpected.length, 1);
  assert.match(rds.problems.join(' '), /Relational Database Service.*not a service we use/);
  assert.deepEqual(assess([{ service: 'Amazon Relational Database Service', usd: 0.01 }]).problems, [], 'a cent of noise is ignored');
});

test('cost check records its metrics and emails only when there is a problem', async () => {
  const sent = []; const alerts = [];
  const clients = (rows) => ({ yesterdayByService: async () => rows, credits: async () => 137.5, putMetrics: async (m) => sent.push(...m), alert: async (s, m) => alerts.push([s, m]) });
  await cost({}, {}, { clients: clients([{ service: 'AWS Lambda', usd: 0.0 }]), today: '2026-10-15T00:00:00Z' });
  assert.equal(alerts.length, 0);
  assert.deepEqual(sent.map((m) => m.MetricName), ['DailyCostUsd', 'CreditsRemainingUsd']);
  const out = await cost({}, {}, { clients: clients([{ service: 'Amazon Relational Database Service', usd: 0.46 }]), today: '2026-10-15T00:00:00Z' });
  assert.equal(alerts.length, 1);
  assert.equal(out.problems.length, 1);
  assert.match(alerts[0][1], /Credits left: 137.50/);
});
