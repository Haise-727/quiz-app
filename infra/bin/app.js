import { App, Tags } from 'aws-cdk-lib';
import { DataStack } from '../lib/data-stack.js';
import { SignerStack } from '../lib/signer-stack.js';
import { WebStack } from '../lib/web-stack.js';
import { SiteStack } from '../lib/site-stack.js';
import { AuthStack } from '../lib/auth-stack.js';
import { ApiStack } from '../lib/api-stack.js';
import { OpsStack } from '../lib/ops-stack.js';

/**
 * Three small stacks, deployed separately so each can be tried, kept or removed on its own:
 *   quizlike-signer   the ImageKit upload signer (Lambda Function URL)
 *   quizlike-data     DynamoDB tables
 *   quizlike-api      the API Lambda (backend/api): checks Cognito sign in, reads and writes the tables
 *   quizlike-auth     Cognito sign in (email and Google). `-c google=true` adds Google (deploy with scripts/deploy-auth.mjs)
 *   quizlike-site     the website served by a Lambda Function URL (works without CloudFront)
 *   quizlike-web      S3 plus CloudFront, only with `-c cloudfront=true` (needs AWS to verify the account)
 *
 * `npx cdk synth` checks them offline. Nothing here deploys by itself.
 * Region: pass `-c region=...`, or set AWS_REGION. It defaults to ap-south-1 (Mumbai, closest to the users).
 */
const app = new App();
const prefix = app.node.tryGetContext('prefix') || 'quizlike';
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: app.node.tryGetContext('region') || process.env.CDK_DEFAULT_REGION || 'ap-south-1',
};
const reserved = app.node.tryGetContext('reservedConcurrency');

const signer = new SignerStack(app, `${prefix}-signer`, {
  env, prefix,
  allowedOrigins: String(app.node.tryGetContext('origins') || '*').split(','),
  reservedConcurrency: reserved ? Number(reserved) : undefined,
});
// The website: a Lambda by default (CloudFront needs the account verified by AWS Support first; -c cloudfront=true switches to it).
if (app.node.tryGetContext('cloudfront') === 'true') new WebStack(app, `${prefix}-web`, { env });
const site = app.node.tryGetContext('cloudfront') === 'true' ? null : new SiteStack(app, `${prefix}-site`, { env, prefix });

// Where the app runs. Cognito only redirects back to these addresses.
const appUrls = String(app.node.tryGetContext('appUrls') || [
  'https://x4k7y52gk3xxakklrcman36uuu0vwdhj.lambda-url.ap-south-1.on.aws',
  'https://quizlike.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
].join(',')).split(',');
const data = new DataStack(app, `${prefix}-data`, {
  env, prefix,
  legacy: app.node.tryGetContext('legacyTables') === 'true',          // the seven old tables, only while copying them into the new one
});
const auth = new AuthStack(app, `${prefix}-auth`, {
  env, prefix, appUrls, withGoogle: app.node.tryGetContext('google') === 'true',
  mainTable: data.main,
  migrateUsers: app.node.tryGetContext('migrateUsers') === 'true',      // see scripts/deploy-auth.mjs
  firebaseApiKey: app.node.tryGetContext('firebaseApiKey'),
});
const api = new ApiStack(app, `${prefix}-api`, {
  env, prefix, userPoolId: auth.pool.userPoolId, clientId: auth.client.userPoolClientId, table: data.main,
  migration: app.node.tryGetContext('migration') === 'true',     // opens the temporary import door, see backend/api/migration.mjs
});

// Monitoring, audit and background triggers (see lib/ops-stack.js). The alerts go to this email.
new OpsStack(app, `${prefix}-ops`, {
  env, prefix, mainTable: data.main,
  alertEmail: app.node.tryGetContext('alertEmail') || 'justaweebwithinternet@gmail.com',
  healthTargets: [
    ...(site ? [{ name: 'site', kind: 'site', url: site.url }] : []),
    { name: 'signer', kind: 'signer', url: signer.url },
    { name: 'api', kind: 'api', url: api.url },
  ],
});

Tags.of(app).add('app', 'quizlike');
