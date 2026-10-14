import { CfnOutput, Duration, Stack } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The Quizlike API (backend/api): one Lambda behind a Function URL. It checks the Cognito ID token on every
 * call and reads and writes the DynamoDB tables from quizlike-data.
 *
 * Cost: a Function URL has no charge; the Lambda free allowance is 1 million requests a month. Memory is small
 * and the timeout short. Logs are kept 7 days and never contain request bodies.
 *
 * Safety: the function may touch ONLY the quizlike tables and their indexes, nothing else in the account.
 * Reserved concurrency is not set because a new account's limit of 10 total leaves nothing to reserve.
 */
const here = (p) => fileURLToPath(new URL(p, import.meta.url));

function packApi() {
  const out = here('../.api-build');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  // Every module in backend/api except the tests and the in memory stand in. Listing files by hand once left one out and
  // crashed the whole API, so it is done by rule.
  for (const f of readdirSync(here('../../backend/api'))) {
    if (f.endsWith('.mjs') && !f.endsWith('.test.mjs') && f !== 'memory-repo.mjs') cpSync(here(`../../backend/api/${f}`), `${out}/${f}`);
  }
  return out;
}

export class ApiStack extends Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);
    const prefix = props.prefix || 'quizlike';
    const { userPoolId, clientId, table } = props;

    const fn = new lambda.Function(this, 'ApiFunction', {
      functionName: `${prefix}-api`,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(packApi()),
      memorySize: 256,
      timeout: Duration.seconds(15),
      logRetention: logs.RetentionDays.ONE_WEEK,
      tracing: lambda.Tracing.ACTIVE,          // X-Ray: a map of the browser, this Lambda and DynamoDB (100,000 traces a month are free)
      environment: {
        REGION: this.region,
        POOL_ID: userPoolId,
        CLIENT_ID: clientId,
        TABLE_NAME: table.tableName,
        ALLOWED_ORIGINS: (props.allowedOrigins || ['*']).join(','),
        ...(props.migration ? { MIGRATION_ENABLED: 'true' } : {}),
      },
    });

    // The migration door (backend/api/migration.mjs) reads its secret token from SSM. Only while it is open.
    if (props.migration) {
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/quizlike/migration/token`],
      }));
    }

    // Only the one quizlike table and its indexes, and only the four calls the API makes.
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:DeleteItem', 'dynamodb:Query'],
      resources: [table.tableArn, `${table.tableArn}/index/*`],
    }));
    this.fn = fn;

    const url = fn.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE });
    this.url = url.url;
    // A public Function URL needs two permissions since late 2025 (see signer-stack.js).
    const viaUrl = new lambda.CfnPermission(this, 'InvokeViaFunctionUrl', {
      functionName: fn.functionName, action: 'lambda:InvokeFunction', principal: '*',
    });
    viaUrl.addPropertyOverride('InvokedViaFunctionUrl', true);

    new CfnOutput(this, 'ApiUrl', { value: url.url, description: 'VITE_AWS_API_URL' });
  }
}
