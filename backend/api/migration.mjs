/**
 * The migration door: a temporary way for scripts/migrate/migrate.mjs to write the old Firebase data into DynamoDB.
 *
 * It exists because the deploy login cannot write to the tables, and the data is the one thing that must be copied
 * in bulk, as other people's documents. It is protected two ways and is meant to be OPEN ONLY WHILE MIGRATING:
 *   1. It does not exist unless the API was deployed with MIGRATION_ENABLED=true (infra: -c migration=true).
 *   2. Every call must carry a secret token, kept in SSM at /quizlike/migration/token. A request without it, or with the
 *      wrong one, is answered as if the operation did not exist.
 * After the copy, redeploy without migration=true and delete the SSM token. See docs/aws-migration.md.
 */
import { timingSafeEqual } from 'node:crypto';
import { COLLECTIONS, MAX_ITEM_BYTES } from './config.mjs';

const BY_TABLE = Object.fromEntries(Object.values(COLLECTIONS).map((d) => [d.table, d]));
export const MIGRATION_OPS = new Set(['import', 'importVerify']);

let cachedToken = null;

async function expectedToken(deps) {
  if (deps.migrationToken) return deps.migrationToken;
  if (cachedToken) return cachedToken;
  const { SSMClient, GetParameterCommand } = await import('@aws-sdk/client-ssm');
  const out = await new SSMClient({}).send(new GetParameterCommand({ Name: '/quizlike/migration/token', WithDecryption: true }));
  cachedToken = out.Parameter?.Value || null;
  return cachedToken;
}

const same = (a, b) => {
  const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};

/** Is this item shaped like something the table can hold: right table, string keys, not too big? */
function checkItem(table, item) {
  const def = BY_TABLE[table];
  if (!def) return 'unknown table';
  if (!item || typeof item !== 'object') return 'not an object';
  if (typeof item[def.pk] !== 'string' || !item[def.pk]) return `missing ${def.pk}`;
  if (def.sk && (typeof item[def.sk] !== 'string' || !item[def.sk])) return `missing ${def.sk}`;
  if (JSON.stringify(item).length > MAX_ITEM_BYTES) return 'too big';
  return null;
}

/** @returns the answer, or null when this is not a migration request or the door is closed or the token is wrong */
export async function handleMigration(repo, body, deps = {}) {
  if (!MIGRATION_OPS.has(body?.op)) return null;
  const enabled = deps.migrationEnabled ?? process.env.MIGRATION_ENABLED === 'true';
  if (!enabled) return null;
  let token;
  try { token = await expectedToken(deps); } catch { return null; }
  if (!same(body.token, token)) return null;

  if (body.op === 'import') {
    const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
    let written = 0;
    const rejected = [];
    for (const { table, item } of items) {
      const problem = checkItem(table, item);
      if (problem) { rejected.push({ table, problem }); continue; }
      await repo.put(table, item);
      written += 1;
    }
    return { written, rejected };
  }

  // importVerify: which of these keys are NOT in the table?
  const keys = Array.isArray(body.keys) ? body.keys.slice(0, 50) : [];
  const missing = [];
  for (const { table, key } of keys) {
    if (!BY_TABLE[table]) { missing.push({ table, key }); continue; }
    if (!(await repo.get(table, key))) missing.push({ table, key });
  }
  return { checked: keys.length, missing };
}
