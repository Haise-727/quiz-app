// Run with: node --test backend/ops/weekly.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, textFor, listTeachers, summarizeTeacher } from './weekly.mjs';
import { sendMail } from './mail.mjs';
import { handler as stream } from './stream-trigger.mjs';
import { createMemoryStore } from '../api/single-table.mjs';

const NOW = Date.parse('2026-10-19T03:30:00Z');
const day = (n) => new Date(NOW - n * 86400_000).toISOString();
const quizzes = [{ quizId: 'q1', title: 'Maths', active: true }, { quizId: 'q2', title: 'Art', active: false }];
const results = [
  { quizId: 'q1', completedAt: day(1), status: 'completed', finalScore: 8, maxScore: 10 },
  { quizId: 'q1', completedAt: day(2), status: 'completed', finalScore: 6, maxScore: 10 },
  { quizId: 'q2', completedAt: day(3), status: 'pending', finalScore: 0, maxScore: 10 },
  { quizId: 'q1', completedAt: day(20), status: 'completed', finalScore: 10, maxScore: 10 },         // too old
  { quizId: 'daily-x', completedAt: day(1), kind: 'daily', status: 'completed', finalScore: 1, maxScore: 1 },   // not a quiz attempt
];

test('a teacher\'s week is worked out from the last seven days only', () => {
  const s = summarize(quizzes, results, NOW);
  assert.equal(s.attempts, 3);
  assert.equal(s.averagePct, 70, 'only marked results count towards the average');
  assert.equal(s.pendingToMark, 1);
  assert.equal(s.openQuizzes, 1);
  assert.deepEqual(s.topQuiz, { title: 'Maths', attempts: 2 });
  assert.equal(summarize(quizzes, [], NOW).averagePct, null);
  assert.match(textFor('Tess', s), /3 attempts[\s\S]*average score 70 percent[\s\S]*busiest quiz: "Maths"[\s\S]*1 answer waiting/);
});

test('teachers are found, and one with no quizzes is skipped', async () => {
  const db = { scanTeachers: async () => [{ uid: 't1', email: 'a@b.com', displayName: 'Tess' }, { displayName: 'no id' }], queryIndex: async () => [], put: async () => { throw new Error('should not write'); } };
  assert.deepEqual((await listTeachers({}, {}, { db })).teachers, [{ uid: 't1', email: 'a@b.com', name: 'Tess' }]);
  assert.deepEqual(await summarizeTeacher({ uid: 't1' }, {}, { db }), { uid: 't1', skipped: 'no quizzes' });
});

test('a summary is posted in the inbox once per week and emailed when SES allows', async () => {
  const store = createMemoryStore();
  const db = {
    put: (item) => store.put(item),
    queryIndex: async (index, keyName, keyValue) => (keyValue === 'quizzes#byOwner#t1' ? quizzes : keyValue === 'results#byTeacher#t1' ? results : []),
  };
  const mails = [];
  const mail = { from: 'me@x.com', send: async (m) => mails.push(m) };
  const out = await summarizeTeacher({ uid: 't1', email: 'tess@x.com', name: 'Tess' }, {}, { db, nowMs: NOW, mail });
  assert.equal(out.emailed, true);
  assert.equal(mails[0].to, 'tess@x.com');
  await summarizeTeacher({ uid: 't1', email: 'tess@x.com', name: 'Tess' }, {}, { db, nowMs: NOW, mail });
  const inbox = await store.query({ index: null, keyName: 'pk', keyValue: 'notifications#t1', forward: true, limit: 10 });
  assert.equal(inbox.length, 1, 'the same week twice gives one inbox item');
  assert.equal(inbox[0].type, 'weekly_summary');
  assert.ok(inbox[0].ttl > NOW / 1000);
});

test('an email SES refuses is skipped quietly, and nothing is sent when it is not set up', async () => {
  const refused = { from: 'me@x.com', send: async () => { const e = new Error('not verified'); e.name = 'MessageRejected'; throw e; } };
  assert.deepEqual(await sendMail({ to: 'x@y.com', subject: 's', text: 't' }, refused), { sent: false, reason: 'MessageRejected' });
  assert.deepEqual(await sendMail({ to: 'x@y.com', subject: 's', text: 't' }, { from: '' }), { sent: false, reason: 'not configured' });
  assert.deepEqual(await sendMail({ to: null, subject: 's', text: 't' }, { from: 'me@x.com', send: async () => {} }), { sent: false, reason: 'not configured' });
});

test('the stream trigger also emails, and a refused email never fails the record', async () => {
  const unmarshall = (img) => JSON.parse(JSON.stringify(img, (k, v) => (v && typeof v === 'object' && ('S' in v || 'N' in v) ? ('S' in v ? v.S : Number(v.N)) : v)));
  const marshall = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? { N: String(v) } : { S: String(v) }]));
  const store = createMemoryStore();
  await store.put({ pk: 'users#t1', sk: '#', _t: 'users', uid: 't1', email: 'tess@x.com' });
  await store.put({ pk: 'users#s1', sk: '#', _t: 'users', uid: 's1', displayName: 'Sam', email: 'sam@x.com' });
  const db = { get: (pk, sk) => store.get(pk, sk), put: (i) => store.put(i) };
  const rec = { eventName: 'INSERT', dynamodb: { SequenceNumber: '1', ApproximateCreationDateTime: 1791990000, NewImage: marshall({ _t: 'results', resultId: 'r1', quizId: 'q1', quizTitle: 'Essay', userId: 's1', teacherId: 't1', status: 'pending', finalScore: 0, maxScore: 10 }) } };
  const mails = [];
  const ok = await stream({ Records: [rec] }, {}, { unmarshall, db, mail: { from: 'me@x.com', send: async (m) => mails.push(m) } });
  assert.equal(ok.sent, 1);
  assert.equal(mails[0].to, 'tess@x.com');
  assert.match(mails[0].subject, /needs marking/);
  const refused = await stream({ Records: [rec] }, {}, { unmarshall, db, mail: { from: 'me@x.com', send: async () => { throw new Error('rejected'); } } });
  assert.deepEqual(refused.batchItemFailures, [], 'the record is not retried because of the email');
});
