// Emergency brake. Stops the quizlike AWS pieces from running or costing anything more.
//
//   node scripts/panic.mjs            shows what it WOULD do (a dry run)
//   node scripts/panic.mjs --yes      does it
//
// What it does, in order:
//   1. Sets every quizlike Lambda's reserved concurrency to 0, so none can run. This is instant
//      and reversible. (Needs lambda:PutFunctionConcurrency, see the note below.)
//   2. Deletes the quizlike-site, quizlike-web and quizlike-signer stacks through the CDK deploy role.
//   3. Leaves quizlike-data alone (its tables are RETAIN, your data) and tells you so.
//
// It cannot touch anything outside the quizlike stacks, and it never reads or prints a secret.
// Needs the `quizlike` profile. Run it from the infra folder.
import { spawnSync } from 'node:child_process';

const profile = process.env.AWS_PROFILE || 'quizlike';
const region = process.env.AWS_REGION || 'ap-south-1';
const yes = process.argv.includes('--yes');
const env = { ...process.env, AWS_PROFILE: profile, AWS_REGION: region };

const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', env, shell: process.platform === 'win32' });
const say = (m) => console.log(m);

say(`${yes ? 'DOING IT' : 'DRY RUN'} in ${region} with profile ${profile}\n`);

// 1. Lambda concurrency to zero
const fns = run('aws', ['lambda', 'list-functions', '--query', "Functions[?starts_with(FunctionName,'quizlike-')].FunctionName", '--output', 'text']);
const names = (fns.stdout || '').split(/\s+/).filter(Boolean);
if (!names.length) say('No quizlike Lambdas found.');
for (const name of names) {
  say(`- Lambda ${name}: reserved concurrency -> 0`);
  if (yes) {
    const r = run('aws', ['lambda', 'put-function-concurrency', '--function-name', name, '--reserved-concurrent-executions', '0']);
    if (r.status !== 0) say(`  could not set it (${(r.stderr || '').trim().split('\n')[0]}). Step 2 deletes the function anyway.`);
  }
}

// 2. Delete stacks
for (const stack of ['quizlike-site', 'quizlike-web', 'quizlike-signer']) {
  say(`- Stack ${stack}: delete`);
  if (yes) {
    const r = run('npx', ['cdk', 'destroy', stack, '--force']);
    say(r.status === 0 ? '  deleted' : `  failed, see: ${(r.stderr || '').trim().split('\n').slice(-3).join(' ')}`);
  }
}

say('\nNot touched: quizlike-data (your tables are kept on purpose) and the SSM settings under /quizlike.');
if (!yes) say('Run again with --yes to do it.');
