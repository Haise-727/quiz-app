/**
 * The weekly teacher summary, in two steps that a Step Functions workflow runs one after the other:
 *
 *   listTeachers()   find the teachers
 *   summarize(t)     work out one teacher's week, post it to their in app inbox, and email it if SES allows
 *
 * The workflow (infra/lib/workflows-stack.js) runs listTeachers once, then summarize for each teacher, one at a time, so the
 * small database is never hit by many at once.
 */
import { toStored } from '../api/single-table.mjs';
import { sendMail } from './mail.mjs';

const WEEK_MS = 7 * 86400_000;
const NINETY_DAYS = 90 * 86400;

/** Pure: one teacher's numbers from their quizzes and results. */
export function summarize(quizzes, results, nowMs = Date.now()) {
  const since = new Date(nowMs - WEEK_MS).toISOString();
  const recent = results.filter((r) => typeof r.completedAt === 'string' && r.completedAt >= since && r.kind !== 'daily');
  const graded = recent.filter((r) => r.status !== 'pending' && Number(r.maxScore) > 0);
  const averagePct = graded.length
    ? Math.round(graded.reduce((n, r) => n + (Number(r.finalScore ?? r.score) / Number(r.maxScore)) * 100, 0) / graded.length)
    : null;
  const byQuiz = {};
  recent.forEach((r) => { byQuiz[r.quizId] = (byQuiz[r.quizId] || 0) + 1; });
  const [topId, topCount] = Object.entries(byQuiz).sort((a, b) => b[1] - a[1])[0] || [];
  const top = quizzes.find((q) => q.quizId === topId);
  return {
    quizzes: quizzes.length,
    openQuizzes: quizzes.filter((q) => q.active === true).length,
    attempts: recent.length,
    pendingToMark: results.filter((r) => r.status === 'pending').length,
    averagePct,
    topQuiz: top ? { title: top.title, attempts: topCount } : null,
  };
}

export function textFor(name, s) {
  const lines = [`Hello ${name || 'there'},`, '', 'Your Quizlike week:'];
  lines.push(`- ${s.attempts} attempt${s.attempts === 1 ? '' : 's'} on your quizzes in the last 7 days`);
  if (s.averagePct !== null) lines.push(`- average score ${s.averagePct} percent`);
  if (s.topQuiz) lines.push(`- busiest quiz: "${s.topQuiz.title}" with ${s.topQuiz.attempts}`);
  lines.push(`- ${s.pendingToMark} answer${s.pendingToMark === 1 ? '' : 's'} waiting for you to mark`);
  lines.push(`- ${s.openQuizzes} of your ${s.quizzes} quiz${s.quizzes === 1 ? ' is' : 'zes are'} open`);
  return lines.join('\n');
}

async function realDb() {
  const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand } = await import('@aws-sdk/lib-dynamodb');
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
  const TableName = process.env.TABLE_NAME || 'quizlike-main';
  return {
    put: async (item) => { await doc.send(new PutCommand({ TableName, Item: item })); },
    queryIndex: async (index, keyName, keyValue) => {
      const out = []; let start;
      do {
        const r = await doc.send(new QueryCommand({ TableName, IndexName: index, KeyConditionExpression: '#k = :v', ExpressionAttributeNames: { '#k': keyName }, ExpressionAttributeValues: { ':v': keyValue }, ExclusiveStartKey: start, Limit: 100 }));
        out.push(...(r.Items || [])); start = r.LastEvaluatedKey;
      } while (start && out.length < 2000);
      return out;
    },
    // One small scan a week, at a quiet hour, to find the teachers. Pages of 50 keep each read tiny.
    scanTeachers: async () => {
      const out = []; let start;
      do {
        const r = await doc.send(new ScanCommand({ TableName, FilterExpression: '#t = :u AND #r = :teacher', ExpressionAttributeNames: { '#t': '_t', '#r': 'role' }, ExpressionAttributeValues: { ':u': 'users', ':teacher': 'teacher' }, ExclusiveStartKey: start, Limit: 50 }));
        out.push(...(r.Items || [])); start = r.LastEvaluatedKey;
      } while (start);
      return out;
    },
  };
}

export async function listTeachers(_event, _context, injected) {
  const deps = injected && typeof injected === 'object' ? injected : {};
  const db = deps.db || (await realDb());
  const rows = await db.scanTeachers();
  const teachers = rows.filter((u) => u.uid).map((u) => ({ uid: u.uid, email: u.email || null, name: u.displayName || null }));
  console.log(`EVT weekly teachers=${teachers.length}`);
  return { teachers };
}

export async function summarizeTeacher(event, _context, injected) {
  const deps = injected && typeof injected === 'object' ? injected : {};
  const db = deps.db || (await realDb());
  const nowMs = deps.nowMs ?? Date.now();
  const { uid, email, name } = event;

  const quizzes = await db.queryIndex('gsi1', 'gsi1pk', `quizzes#byOwner#${uid}`);
  if (!quizzes.length) return { uid, skipped: 'no quizzes' };
  const results = await db.queryIndex('gsi3', 'gsi3pk', `results#byTeacher#${uid}`);
  const s = summarize(quizzes, results, nowMs);

  const week = new Date(nowMs).toISOString().slice(0, 10);
  const stored = toStored('notifications', {
    userId: uid, createdAtId: `${new Date(nowMs).toISOString()}#weekly:${week}`, createdAt: new Date(nowMs).toISOString(), read: false, type: 'weekly_summary', data: null,
    message: `Your week: ${s.attempts} attempt${s.attempts === 1 ? '' : 's'}${s.averagePct !== null ? `, average ${s.averagePct} percent` : ''}, ${s.pendingToMark} waiting to mark.`,
  });
  stored.ttl = Math.floor(nowMs / 1000) + NINETY_DAYS;
  await db.put(stored);

  const mail = await sendMail({ to: email, subject: 'Your Quizlike week', text: textFor(name, s) }, deps.mail);
  console.log(`EVT weekly summary attempts=${s.attempts} emailed=${mail.sent}`);
  return { uid, ...s, emailed: mail.sent };
}
