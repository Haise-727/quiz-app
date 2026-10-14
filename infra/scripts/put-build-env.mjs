// Stores the PUBLIC build settings in SSM so the CodeBuild pipeline can build the app the same way you do locally.
//
//   node scripts/put-build-env.mjs
//
// Reads .env.production and the VITE_ lines of .env.local, and writes them to /quizlike/build/env (a plain String parameter).
// Only VITE_ values go in. Those are already shipped inside the built app and visible to every visitor (addresses, the public
// Firebase and ImageKit keys), so they are not secrets. Nothing else is read: no private keys, no tokens.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = (f) => { try { return readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'); } catch { return ''; } };
const lines = new Map();
for (const file of ['.env.local', '.env.production']) {          // .env.production wins
  for (const raw of read(file).split('\n')) {
    const m = raw.trim().match(/^(VITE_[A-Z0-9_]+)=(.*)$/);
    if (m) lines.set(m[1], m[2].trim());
  }
}
lines.set('VITE_BACKEND', 'aws');
lines.delete('VITE_USE_EMULATORS');
const text = [...lines].map(([k, v]) => `${k}=${v}`).join('\n');
if (text.length > 4000) { console.error('Too long for a standard parameter (4096 characters).'); process.exit(1); }

const r = spawnSync('aws', ['ssm', 'put-parameter', '--name', '/quizlike/build/env', '--type', 'String', '--overwrite', '--value', text, '--query', 'Version', '--output', 'text'],
  { encoding: 'utf8', env: { ...process.env, AWS_PROFILE: process.env.AWS_PROFILE || 'quizlike', AWS_REGION: 'ap-south-1', MSYS_NO_PATHCONV: '1' } });
console.log(r.status === 0 ? `Stored ${lines.size} settings at /quizlike/build/env (version ${r.stdout.trim()}).` : `Failed: ${r.stderr.trim()}`);
console.log([...lines.keys()].join(', '));
process.exit(r.status ?? 1);
