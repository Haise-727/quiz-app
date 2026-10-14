// Copies Quizlike's data from Firebase to AWS.
//
//   node scripts/migrate/migrate.mjs                 DRY RUN: reads Firebase, counts, checks, writes a report. Changes nothing.
//   node scripts/migrate/migrate.mjs --write         also writes everything to DynamoDB through the API's import door
//
// Needs the Firebase service account key at ai-docs/firebase-admin.json (or --key <file>). It is read only: the
// script never changes or deletes anything in Firebase. Writing is safe to repeat: items are replaced by id.
//
// Writing needs the migration door to be open on the API (deploy with -c migration=true) and its token, which the
// script reads from SSM (/quizlike/migration/token) using the quizlike profile. See docs/aws-migration.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import { transformDoc, writeCost } from './transform.mjs';
import { TABLES } from '../../infra/lib/data-stack.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const root = fileURLToPath(new URL('../../', import.meta.url));
const keyPath = opt('--key', `${root}ai-docs/firebase-admin.json`);
const WRITE = flag('--write');
const API = opt('--api', 'https://naz4s4ttnjvdb6ymnk4mkqmzne0fmvue.lambda-url.ap-south-1.on.aws/');

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

// Users first, so every profile exists before the things that belong to it.
const COLLECTIONS = ['users', 'quizzes', 'class_enrollments', 'classes', 'quiz_results', 'question_bank', 'notifications'];

async function* readAll(name) {
  let last = null;
  for (;;) {
    let q = db.collection(name).orderBy(admin.firestore.FieldPath.documentId()).limit(200);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) return;
    for (const d of snap.docs) yield d;
    last = snap.docs[snap.docs.length - 1];
  }
}

const report = { startedAt: new Date().toISOString(), mode: WRITE ? 'write' : 'dry run', collections: {}, skipped: [], auth: {}, totals: {} };
const items = [];           // { collection, table, item, bytes }

// The people who can still sign in, from Firebase Authentication: uid -> { email, providers }. A profile is matched to a
// new sign in only when it belongs to one of these, and the email used is the account's own (Firebase makes those unique).
// Profiles left behind by deleted accounts are copied as data but never matched, so they cannot make two people look alike.
console.log('Reading Firebase sign in accounts (read only)...');
const authByUid = new Map();
{
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const u of page.users) authByUid.set(u.uid, { email: (u.email || '').toLowerCase(), providers: u.providerData.map((p) => p.providerId), disabled: !!u.disabled });
    pageToken = page.pageToken;
  } while (pageToken);
}

console.log(`${WRITE ? 'WRITE' : 'DRY RUN'}: reading Firestore (read only)...`);
for (const name of COLLECTIONS) {
  const stat = { read: 0, kept: 0, skipped: 0, kb: 0 };
  for await (const d of readAll(name)) {
    stat.read += 1;
    const out = transformDoc(name, d.id, d.data());
    if (out.skip) { stat.skipped += 1; report.skipped.push({ collection: name, id: d.id, reason: out.skip }); continue; }
    if (name === 'users') {
      const account = authByUid.get(d.id);
      if (account && account.email && !account.disabled) { out.item.legacy = true; out.item.legacyEmail = account.email; }
      else { delete out.item.legacy; delete out.item.legacyEmail; stat.orphans = (stat.orphans || 0) + 1; }
    }
    stat.kept += 1; stat.kb += out.bytes / 1024;
    items.push({ collection: name, table: out.table, item: out.item, bytes: out.bytes });
  }
  stat.kb = Math.round(stat.kb);
  report.collections[name] = stat;
  console.log(`  ${name.padEnd(18)} read ${String(stat.read).padStart(5)}  keep ${String(stat.kept).padStart(5)}  skip ${String(stat.skipped).padStart(4)}  ${stat.kb} KB`);
}

// ── Firebase sign in accounts ──────────────────────────────────────────────────────────
const auth = { total: 0, password: 0, google: 0, other: 0, noEmail: 0, withoutProfile: 0, disabled: 0 };
const profileUids = new Set(items.filter((i) => i.collection === 'users').map((i) => i.item.uid));
for (const [uid, a] of authByUid) {
  auth.total += 1;
  if (a.providers.includes('password')) auth.password += 1;
  else if (a.providers.includes('google.com')) auth.google += 1;
  else auth.other += 1;
  if (!a.email) auth.noEmail += 1;
  if (a.disabled) auth.disabled += 1;
  if (!profileUids.has(uid)) auth.withoutProfile += 1;
}
report.auth = auth;
console.log(`  accounts ${auth.total}: ${auth.password} with a password, ${auth.google} Google only, ${auth.other} other, ${auth.noEmail} without an email, ${auth.disabled} disabled, ${auth.withoutProfile} with no profile`);

// Profiles whose email is shared: the API refuses to guess, so those people would not get their data back.
const emailCount = {};
items.filter((i) => i.collection === 'users').forEach((i) => { if (i.item.legacyEmail) emailCount[i.item.legacyEmail] = (emailCount[i.item.legacyEmail] || 0) + 1; });
report.duplicateEmails = Object.values(emailCount).filter((n) => n > 1).length;
report.profilesWithoutEmail = items.filter((i) => i.collection === 'users' && !i.item.legacyEmail).length;

// ── Capacity and time ──────────────────────────────────────────────────────────────────
const capacity = {};
for (const t of TABLES) { capacity[`quizlike-${t.name}`] = t.units; (t.indexes || []).forEach((ix) => { capacity[`quizlike-${t.name}/${ix[0]}`] = ix[3]; }); }
const need = {};
for (const it of items) for (const [res, units] of Object.entries(writeCost(it.collection, it.item, it.bytes))) { const k = `quizlike-${res}`; need[k] = (need[k] || 0) + units; }
const RATE = 0.7;       // use at most 70 percent of the free capacity, so the live app is not starved while this runs
let seconds = 0;
for (const [res, units] of Object.entries(need)) seconds = Math.max(seconds, units / ((capacity[res] || 1) * RATE));
report.totals = { items: items.length, kb: Math.round(items.reduce((a, i) => a + i.bytes, 0) / 1024), estimatedMinutes: Math.ceil(seconds / 60), writeUnits: need };
console.log(`Total ${items.length} items, ${report.totals.kb} KB. Estimated write time at 70 percent of the free capacity: about ${report.totals.estimatedMinutes} minutes.`);
console.log(`Skipped ${report.skipped.length} documents${report.skipped.length ? ' (see the report)' : ''}. Profiles without an email: ${report.profilesWithoutEmail}. Shared emails: ${report.duplicateEmails}.`);

if (!WRITE) {
  writeFileSync(`${root}ai-docs/migration-report.json`, JSON.stringify(report, null, 2));
  console.log('Dry run done. Nothing was changed. Report: ai-docs/migration-report.json');
  process.exit(0);
}

// ── Writing ────────────────────────────────────────────────────────────────────────────
const tokenRun = spawnSync('aws', ['ssm', 'get-parameter', '--name', '/quizlike/migration/token', '--with-decryption', '--query', 'Parameter.Value', '--output', 'text'],
  { encoding: 'utf8', env: { ...process.env, AWS_PROFILE: process.env.AWS_PROFILE || 'quizlike', AWS_REGION: 'ap-south-1' } });
if (tokenRun.status !== 0) { console.error('Could not read /quizlike/migration/token from SSM.'); process.exit(1); }
const TOKEN = tokenRun.stdout.trim();

const call = async (body) => {
  const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, token: TOKEN }) });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(`${res.status} ${json.error || 'failed'}`);
  return json.data;
};

// A bucket per table and index. Each refills at 70 percent of its capacity per second.
const buckets = {};
const take = async (cost) => {
  for (;;) {
    const now = Date.now();
    let wait = 0;
    for (const [res, units] of Object.entries(cost)) {
      const name = `quizlike-${res}`;
      const rate = (capacity[name] || 1) * RATE;
      const b = (buckets[name] ||= { level: rate * 10, at: now });     // a ten second head start
      b.level = Math.min(rate * 30, b.level + ((now - b.at) / 1000) * rate); b.at = now;
      if (b.level < Math.min(units, rate * 30)) wait = Math.max(wait, ((Math.min(units, rate * 30) - b.level) / rate) * 1000);
    }
    if (wait <= 0) {
      for (const [res, units] of Object.entries(cost)) buckets[`quizlike-${res}`].level -= Math.min(units, (capacity[`quizlike-${res}`] || 1) * RATE * 30);
      return;
    }
    await new Promise((r) => setTimeout(r, Math.min(wait, 5000)));
  }
};

console.log('Writing to DynamoDB through the API (this can take a while; it is safe to stop and run again)...');
const failed = [];
let written = 0;
const startedAt = Date.now();
for (const it of items) {
  await take(writeCost(it.collection, it.item, it.bytes));
  let ok = false;
  for (let attempt = 0; attempt < 4 && !ok; attempt += 1) {
    try { await call({ op: 'import', items: [{ table: it.table, item: it.item }] }); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); if (attempt === 3) failed.push({ collection: it.collection, error: String(e.message).slice(0, 120) }); }
  }
  if (ok) written += 1;
  if (written % 25 === 0 && ok) console.log(`  ${written} / ${items.length}  (${Math.round((Date.now() - startedAt) / 60000)} min)`);
}
report.written = written; report.failed = failed.length; report.failures = failed.slice(0, 50);
console.log(`Written ${written} of ${items.length}. Failed ${failed.length}.`);

// Check what landed: every profile, and a sample of everything else, is read back from DynamoDB.
const sample = items.filter((i) => i.collection === 'users').concat(items.filter((i) => i.collection !== 'users').filter((_, n) => n % 10 === 0));
const keyOf = (it) => {
  const def = TABLES.find((t) => `quizlike-${t.name}` === `quizlike-${it.table}`);
  return def.sortKey ? { [def.partitionKey]: it.item[def.partitionKey], [def.sortKey]: it.item[def.sortKey] } : { [def.partitionKey]: it.item[def.partitionKey] };
};
let missing = 0;
for (let i = 0; i < sample.length; i += 20) {
  const part = sample.slice(i, i + 20);
  const found = await call({ op: 'importVerify', keys: part.map((it) => ({ table: it.table, key: keyOf(it) })) });
  missing += found.missing.length;
}
report.verified = { checked: sample.length, missing };
report.finishedAt = new Date().toISOString();
writeFileSync(`${root}ai-docs/migration-report.json`, JSON.stringify(report, null, 2));
console.log(`Checked ${sample.length} items by reading them back: ${missing} missing. Report: ai-docs/migration-report.json`);
process.exit(failed.length || missing ? 2 : 0);
