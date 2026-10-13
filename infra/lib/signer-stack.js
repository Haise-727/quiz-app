import { Duration, Stack, CfnOutput } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { fileURLToPath } from 'node:url';

/**
 * The upload signer (replaces api/auth.js on Vercel).
 *
 * Lambda with a Function URL, NOT API Gateway: a Function URL has no charge of its own, only the
 * Lambda free allowance (1 million requests a month, always free).
 *
 * Guards:
 *  - small memory and a 5 second timeout, so one call costs almost nothing
 *  - logs kept 7 days
 *  - optional reserved concurrency (props.reservedConcurrency). A brand new account often has a
 *    total limit of 10, and AWS refuses a reservation that leaves fewer than 10 unreserved, so
 *    this is off by default. Check `aws lambda get-account-settings` first.
 *  - the ImageKit settings are read from SSM Parameter Store (free) and are never in this code.
 */
export class SignerStack extends Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);
    const ssmPrefix = props.ssmPrefix || '/quizlike/imagekit';

    const fn = new lambda.Function(this, 'SignerFunction', {
      functionName: `${props.prefix || 'quizlike'}-signer`,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,   // cheaper per millisecond
      handler: 'index.handler',
      code: lambda.Code.fromAsset(fileURLToPath(new URL('../../backend/signer', import.meta.url)), {
        exclude: ['*.test.mjs'],
      }),
      memorySize: 128,
      timeout: Duration.seconds(5),
      logRetention: logs.RetentionDays.ONE_WEEK,
      reservedConcurrentExecutions: props.reservedConcurrency,
      environment: {
        SSM_PREFIX: ssmPrefix,
        ALLOWED_ORIGINS: (props.allowedOrigins || ['*']).join(','),
      },
    });

    // Read only the three ImageKit parameters, nothing else in SSM.
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameters', 'ssm:GetParameter'],
      resources: ['public-key', 'private-key', 'url-endpoint'].map(
        (n) => `arn:aws:ssm:${this.region}:${this.account}:parameter${ssmPrefix}/${n}`),
    }));

    const url = fn.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE });
    new CfnOutput(this, 'SignerUrl', { value: url.url, description: 'Put this in VITE_API_URL' });
  }
}
