// Copies everything from the seven old DynamoDB tables into the new single table (quizlike-main).
//
//   node scripts/migrate/copy-tables.mjs            DRY RUN: reads the old tables, counts, estimates. Writes nothing.
//   node scripts/migrate/copy-tables.mjs --write    writes into quizlike-main, then reads every item back and compares it
//
// Uses the `quizlike` profile. Safe to repeat: items are replaced by key. Reads the old tables (they are small) and writes to
// the new one at 70 percent of its free capacity, so the running app is not starved. It never deletes anything.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { COLLECTIONS } from '../../backend/api/config.mjs';
import { fromStored, toStored, MAIN_SLOTS } from '../../backend/api/single-table.mjs';
import { MAIN } from '../../infra/lib/data-stack.js';

const WRITE = process.argv.includes('--write');
const REGION = process.env.AWS_REGION || 'ap-south-1';
const root = fileURLToPath(new URL('../../', import.meta.url));
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), { marshallOptions: { removeUndefinedValues: true } });
const NEW_TABLE = 'quizlike-main';
const NINETY_DAYS = 90 * 86400;

const capacity = { main: MAIN.units, ...Object.fromEntries(MAIN.indexes.map(([name, units]) => [name, units])) };

async function scanAll(tableName) {
  const items = [];
  let start;
  do {
    const out = await doc.send(new ScanCommand({ TableName: tableName, ExclusiveStartKey: start, Limit: 100 }));
    items.push(...(out.Items || []));
    start = out.LastEvaluatedKey;
  } while (start);
  return items;
}

/** Write units one stored item uses: its size in KB for the table, and again for each shared index it appears in. */
function cost(stored) {
  const kb = Math.max(1, Math.ceil(Buffer.byteLength(JSON.stringify(stored)) / 1024));
  const out = { main: kb };
  for (const slot of MAIN_SLOTS) if (stored[`${slot}pk`] !== undefined) out[slot] = kb;
  return out;
}

const report = { mode: WRITE ? 'write' : 'dry run', tables: {}, written: 0, mismatches: [], startedAt: new Date().toISOString() };
const all = [];
console.log(`${WRITE ? 'WRITE' : 'DRY RUN'}: reading the old tables...`);
for (const def of Object.values(COLLECTIONS)) {
  const items = await scanAll(`quizlike-${def.table}`);
  report.tables[def.table] = items.length;
  console.log(`  quizlike-${def.table.padEnd(14)} ${String(items.length).padStart(4)} items`);
  for (const item of items) {
    const stored = toStored(def.table, item);
    if (def.table === 'notifications') stored.ttl = Math.floor(Date.now() / 1000) + NINETY_DAYS;
    all.push({ table: def.table, item, stored });
  }
}
const need = {};
for (const { stored } of all) for (const [res, units] of Object.entries(cost(stored))) need[res] = (need[res] || 0) + units;
const RATE = 0.7;
const seconds = Math.max(...Object.entries(need).map(([res, units]) => units / (capacity[res] * RATE)));
console.log(`Total ${all.length} items. Estimated write time: about ${Math.ceil(seconds / 60)} minute(s).`);
if (!WRITE) {
  report.total = all.length; report.estimatedMinutes = Math.ceil(seconds / 60);
  writeFileSync(`${root}ai-docs/copy-tables-report.json`, JSON.stringify(report, null, 2));
  console.log('Dry run done. Nothing was written.');
  process.exit(0);
}

// A bucket per table or index, refilled at 70 percent of its capacity per second.
const buckets = {};
async function take(units) {
  for (;;) {
    const now = Date.now();
    let wait = 0;
    for (const [res, u] of Object.entries(units)) {
      const rate = capacity[res] * RATE;
      const b = (buckets[res] ||= { level: rate * 10, at: now });
      b.level = Math.min(rate * 30, b.level + ((now - b.at) / 1000) * rate); b.at = now;
      const want = Math.min(u, rate * 30);
      if (b.level < want) wait = Math.max(wait, ((want - b.level) / rate) * 1000);
    }
    if (wait <= 0) { for (const [res, u] of Object.entries(units)) buckets[res].level -= Math.min(u, capacity[res] * RATE * 30); return; }
    await new Promise((r) => setTimeout(r, Math.min(wait, 4000)));
  }
}

console.log('Writing into quizlike-main...');
let n = 0;
for (const { stored } of all) {
  await take(cost(stored));
  for (let attempt = 0; ; attempt += 1) {
    try { await doc.send(new PutCommand({ TableName: NEW_TABLE, Item: stored })); break; }
    catch (e) { if (attempt >= 4) throw e; await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); }
  }
  n += 1;
  if (n % 25 === 0) console.log(`  ${n} / ${all.length}`);
}
report.written = n;

console.log('Reading every item back and comparing it with the original...');
for (const { table, item, stored } of all) {
  const got = (await doc.send(new GetCommand({ TableName: NEW_TABLE, Key: { pk: stored.pk, sk: stored.sk } }))).Item;
  try {
    assert.ok(got, 'missing');
    const back = fromStored(got);
    delete back.ttl;                                   // added on the way in for notifications
    assert.deepEqual(back, item);
  } catch (e) { report.mismatches.push({ table, pk: stored.pk, problem: String(e.message).split('\n')[0].slice(0, 100) }); }
}
report.finishedAt = new Date().toISOString();
writeFileSync(`${root}ai-docs/copy-tables-report.json`, JSON.stringify(report, null, 2));
console.log(`Written ${n}. Mismatches: ${report.mismatches.length}. Report: ai-docs/copy-tables-report.json`);
process.exit(report.mismatches.length ? 2 : 0);
