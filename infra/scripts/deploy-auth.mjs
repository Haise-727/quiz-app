// Deploys quizlike-auth WITH Google sign in. Reads the Google client id and secret from SSM and
// hands them to CloudFormation as parameters (the secret is NoEcho). Nothing is printed.
//
//   node scripts/deploy-auth.mjs             deploy Cognito with Google
//   node scripts/deploy-auth.mjs --migrate   also move Firebase accounts over at first sign in
//
// Store the two Google values first:
//   aws ssm put-parameter --profile quizlike --region ap-south-1 --name /quizlike/google/client-id --type SecureString --value "..."
//   aws ssm put-parameter --profile quizlike --region ap-south-1 --name /quizlike/google/client-secret --type SecureString --value "..."
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const env = { ...process.env, AWS_PROFILE: process.env.AWS_PROFILE || 'quizlike', AWS_REGION: process.env.AWS_REGION || 'ap-south-1', CDK_DEFAULT_ACCOUNT: process.env.CDK_DEFAULT_ACCOUNT || '635288116042' };
const shell = process.platform === 'win32';

function param(name) {
  const r = spawnSync('aws', ['ssm', 'get-parameter', '--name', name, '--with-decryption', '--query', 'Parameter.Value', '--output', 'text'], { encoding: 'utf8', env, shell: false });
  if (r.status !== 0) { console.error(`Could not read ${name}. Store it in SSM first (see the top of this file).`); process.exit(1); }
  return r.stdout.trim();
}

const id = param('/quizlike/google/client-id');
const secret = param('/quizlike/google/client-secret');

// --migrate turns on moving Firebase accounts over at first sign in. It needs the Firebase web key, which is
// public (it ships inside the app) and sits in .env.local.
let migrateArgs = [];
if (process.argv.includes('--migrate')) {
  const text = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8');
  const match = text.match(/^VITE_FIREBASE_API_KEY=(.+)$/m);
  if (!match) { console.error('VITE_FIREBASE_API_KEY is not in .env.local'); process.exit(1); }
  migrateArgs = ['-c', 'migrateUsers=true', '-c', `firebaseApiKey=${match[1].trim()}`];
}

const args = ['cdk', 'deploy', 'quizlike-auth', '-c', 'google=true', '-c', 'legacyTables=true', ...migrateArgs, '--require-approval', 'never',
  '--parameters', `quizlike-auth:GoogleClientId=${id}`, '--parameters', `quizlike-auth:GoogleClientSecret=${secret}`];
const r = spawnSync('npx', args, { env, shell, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
const clean = (s) => String(s || '').split(secret).join('***').split('\n').filter((l) => /✅|❌|FAILED|rror|GoogleRedirectUri|HostedDomain|ClientId|UserPoolId/.test(l)).join('\n');
console.log(clean(r.stdout) + clean(r.stderr));
process.exit(r.status ?? 1);
