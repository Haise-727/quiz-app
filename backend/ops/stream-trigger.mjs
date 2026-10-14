/**
 * Reacts to changes in the database. DynamoDB writes every change to a stream, and this Lambda reads it.
 *
 *  - A student hands in a quiz that needs marking (a new result with status "pending"): notify the teacher.
 *  - The teacher finishes marking it (status changes from "pending" to "completed"): notify the student.
 *  - Someone creates their profile for the first time (a new user record): welcome them.
 *
 * This used to happen in the browser, one request after another. Now it is done by the server the moment the result is
 * written, so it also works when the page is closed, and a failed notification can be retried instead of being lost.
 *
 * Reading the stream costs none of the table's capacity. A record that cannot be processed is reported back so DynamoDB
 * retries just that record, and after the retries it goes to the dead letter queue (an alarm watches it).
 */
import { toStored } from '../api/single-table.mjs';

const NINETY_DAYS = 90 * 86400;

/** The notification item for a result event. Its id is built from the event, so a repeated delivery overwrites, not duplicates. */
export function notificationFor(kind, result, eventMs, { studentName } = {}) {
  const iso = new Date(eventMs).toISOString();
  const title = result.quizTitle || 'a quiz';
  const base = { createdAt: iso, read: false, data: { quizId: result.quizId, resultId: result.resultId } };
  if (kind === 'welcome') {
    const name = String(result.displayName || '').trim().split(/\s+/)[0];
    return {
      createdAt: iso, read: false, data: null, userId: result.uid, type: 'welcome', createdAtId: `${iso}#${result.uid}:welcome`,
      message: `Welcome to Quizlike${name ? `, ${name}` : ''}. ${result.role === 'teacher' ? 'Create your first quiz and share its code.' : 'Join a quiz with a code from your teacher.'}`,
    };
  }
  if (kind === 'needs_marking') {
    return {
      ...base, userId: result.teacherId, type: 'grading', createdAtId: `${iso}#${result.resultId}:needs_marking`,
      message: `${studentName || 'A student'} has submitted "${title}" which requires manual grading.`,
    };
  }
  return {
    ...base, userId: result.userId, type: 'grade_released', createdAtId: `${iso}#${result.resultId}:graded`,
    message: `Your quiz "${title}" has been graded. Final score: ${result.finalScore ?? result.score ?? 0}/${result.maxScore ?? 0}`,
  };
}

/** What to do with one change: the notification to write, or null. Pure, so it is tested without AWS. */
export function decide(record, { unmarshall }) {
  if (record.eventName !== 'INSERT' && record.eventName !== 'MODIFY') return null;
  const next = record.dynamodb?.NewImage ? unmarshall(record.dynamodb.NewImage) : null;
  if (!next) return null;
  const prev = record.dynamodb?.OldImage ? unmarshall(record.dynamodb.OldImage) : null;
  const eventMs = (record.dynamodb?.ApproximateCreationDateTime || Date.now() / 1000) * 1000;
  if (next._t === 'users') {
    // Only a brand new profile, not a copied over one (those carry `legacy`) and not an edit.
    return record.eventName === 'INSERT' && next.uid && !next.legacy ? { kind: 'welcome', result: next, eventMs } : null;
  }
  if (next._t !== 'results') return null;

  if (record.eventName === 'INSERT' && next.status === 'pending' && next.teacherId && next.kind !== 'daily') {
    return { kind: 'needs_marking', result: next, eventMs };
  }
  if (record.eventName === 'MODIFY' && prev?.status === 'pending' && next.status === 'completed'
      && next.userId && !String(next.userId).startsWith('guest_')) {
    return { kind: 'graded', result: next, eventMs };
  }
  return null;
}

async function realDb() {
  const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, GetCommand, PutCommand } = await import('@aws-sdk/lib-dynamodb');
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
  const TableName = process.env.TABLE_NAME || 'quizlike-main';
  return {
    get: async (pk, sk) => (await doc.send(new GetCommand({ TableName, Key: { pk, sk } }))).Item || null,
    put: async (item) => { await doc.send(new PutCommand({ TableName, Item: item })); },
  };
}

export async function handler(event, _context, injected) {
  const deps = injected && typeof injected === 'object' ? injected : {};
  const unmarshall = deps.unmarshall || (await import('@aws-sdk/util-dynamodb')).unmarshall;
  const db = deps.db || (await realDb());
  const failures = [];
  let sent = 0;

  for (const record of event.Records || []) {
    try {
      const todo = decide(record, { unmarshall });
      if (!todo) continue;
      let studentName;
      if (todo.kind === 'needs_marking') {
        const profile = await db.get(`users#${todo.result.userId}`, '#');
        studentName = profile?.displayName || todo.result.username || (profile?.email ? String(profile.email).split('@')[0] : null);
      }
      const note = notificationFor(todo.kind, todo.result, todo.eventMs, { studentName });
      if (!note.userId) continue;
      const stored = toStored('notifications', note);
      stored.ttl = Math.floor(todo.eventMs / 1000) + NINETY_DAYS;
      await db.put(stored);
      sent += 1;
      console.log(`EVT notification kind=${todo.kind}`);
    } catch (err) {
      console.error('Could not process a record:', err?.name, err?.message);
      failures.push({ itemIdentifier: record.dynamodb?.SequenceNumber });
    }
  }
  return { batchItemFailures: failures, sent };
}
