// Saves a full copy of the seven old DynamoDB tables as plain JSON files on this computer, before anything is changed.
//
//   node scripts/migrate/backup-tables.mjs          writes ai-docs/backup-<date>/<table>.json and a manifest with counts
//
// Read only. Uses the `quizlike` profile. The folder is inside ai-docs, which git ignores. It holds personal data
// (emails, names, results): keep it private.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { COLLECTIONS } from '../../backend/api/config.mjs';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-south-1' }));
const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = `${root}ai-docs/backup-${new Date().toISOString().slice(0, 10)}`;
mkdirSync(dir, { recursive: true });

const manifest = { takenAt: new Date().toISOString(), tables: {} };
for (const def of Object.values(COLLECTIONS)) {
  const items = [];
  let start;
  do {
    const out = await doc.send(new ScanCommand({ TableName: `quizlike-${def.table}`, ExclusiveStartKey: start, Limit: 100 }));
    items.push(...(out.Items || []));
    start = out.LastEvaluatedKey;
  } while (start);
  const text = JSON.stringify(items, null, 2);
  writeFileSync(`${dir}/${def.table}.json`, text);
  manifest.tables[def.table] = { items: items.length, sha256: createHash('sha256').update(text).digest('hex').slice(0, 16) };
  console.log(`  ${def.table.padEnd(14)} ${String(items.length).padStart(4)} items saved`);
}
writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`Backup written to ${dir}`);
