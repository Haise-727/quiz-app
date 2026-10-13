/**
 * The Quizlike API: one Lambda behind a Function URL (no API Gateway, so no per request charge).
 *
 * Every call is  POST /  with a JSON body  { "op": "get" | "create" | "update" | "remove" | "removeMany" |
 * "query" | "getMany" | "names" | "completionCount", ...arguments }  and, when signed in, the header
 *   Authorization: Bearer <Cognito ID token>
 * The answer is  { "ok": true, "data": ... }  or  { "ok": false, "error": "..." }  with a matching status.
 * What each op does is in service.mjs, and who may do it is in config.mjs.
 *
 * Settings come from the environment (set by infra/lib/api-stack.js): REGION, POOL_ID, CLIENT_ID,
 * TABLE_PREFIX, ALLOWED_ORIGINS.
 */
import { verifyToken } from './authn.mjs';
import { HttpError, createService } from './service.mjs';

const MAX_BODY = 1_000_000;
const OPS = new Set(['get', 'create', 'update', 'remove', 'removeMany', 'query', 'getMany', 'names', 'completionCount']);

function cors(event) {
  const allowed = (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  const origin = event?.headers?.origin || '';
  const any = allowed.includes('*');
  return {
    'Access-Control-Allow-Origin': any ? '*' : (allowed.includes(origin) ? origin : allowed[0]),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const reply = (event, status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', ...cors(event) },
  body: JSON.stringify(body),
});

let defaultRepo = null;

/** `deps` lets tests pass their own storage, token checker and clock. */
export async function handler(event, _context, injected) {
  // The Lambda runtime passes a callback function as the third argument. Only a plain object is the test hook.
  const deps = injected && typeof injected === 'object' ? injected : {};
  const method = event?.requestContext?.http?.method || 'POST';
  if (method === 'OPTIONS') return { statusCode: 204, headers: cors(event), body: '' };
  if (method !== 'POST') return reply(event, 405, { ok: false, error: 'Use POST.' });

  try {
    let raw = event.body || '';
    if (event.isBase64Encoded) raw = Buffer.from(raw, 'base64').toString('utf8');
    if (raw.length > MAX_BODY) return reply(event, 413, { ok: false, error: 'Too big.' });
    let body;
    try { body = JSON.parse(raw || '{}'); } catch { return reply(event, 400, { ok: false, error: 'Send JSON.' }); }
    if (!body || typeof body !== 'object' || !OPS.has(body.op)) return reply(event, 400, { ok: false, error: 'Unknown op.' });

    const header = event.headers?.authorization || event.headers?.Authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const caller = deps.caller !== undefined ? deps.caller : await verifyToken(token, {
      region: process.env.REGION, poolId: process.env.POOL_ID, clientId: process.env.CLIENT_ID,
    });

    let repo = deps.repo;
    if (!repo) {
      if (!defaultRepo) {
        const { createDynamoRepo } = await import('./repo.mjs');   // loaded only on AWS, so tests need no SDK
        defaultRepo = createDynamoRepo({ prefix: process.env.TABLE_PREFIX || 'quizlike-' });
      }
      repo = defaultRepo;
    }
    const service = createService(repo, deps.clock || {});
    const { op, ...args } = body;
    const data = await service[op](args, caller);
    return reply(event, 200, { ok: true, data: data === undefined ? null : data });
  } catch (err) {
    if (err instanceof HttpError) return reply(event, err.status, { ok: false, error: err.message });
    if (err?.name === 'ProvisionedThroughputExceededException' || err?.name === 'ThrottlingException') {
      return reply(event, 503, { ok: false, error: 'Busy. Try again in a moment.' });
    }
    console.error('API error:', err?.name, err?.message);        // never the request body: it may hold answers
    return reply(event, 500, { ok: false, error: 'Something went wrong.' });
  }
}
