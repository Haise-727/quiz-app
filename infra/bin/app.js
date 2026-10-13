import { App, Tags } from 'aws-cdk-lib';
import { DataStack } from '../lib/data-stack.js';
import { SignerStack } from '../lib/signer-stack.js';
import { WebStack } from '../lib/web-stack.js';

/**
 * Three small stacks, deployed separately so each can be tried, kept or removed on its own:
 *   quizlike-signer   the ImageKit upload signer (Lambda Function URL)
 *   quizlike-data     DynamoDB tables (not used by the app until the data phase)
 *   quizlike-web      S3 plus CloudFront static hosting (optional)
 *
 * `npx cdk synth` checks them offline. Nothing here deploys by itself.
 * Region: pass `-c region=...`, or set AWS_REGION. It defaults to us-east-1 (lowest prices).
 */
const app = new App();
const prefix = app.node.tryGetContext('prefix') || 'quizlike';
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: app.node.tryGetContext('region') || process.env.CDK_DEFAULT_REGION || 'us-east-1',
};
const reserved = app.node.tryGetContext('reservedConcurrency');

new SignerStack(app, `${prefix}-signer`, {
  env, prefix,
  allowedOrigins: String(app.node.tryGetContext('origins') || '*').split(','),
  reservedConcurrency: reserved ? Number(reserved) : undefined,
});
new DataStack(app, `${prefix}-data`, { env, prefix });
new WebStack(app, `${prefix}-web`, { env });

Tags.of(app).add('app', 'quizlike');
