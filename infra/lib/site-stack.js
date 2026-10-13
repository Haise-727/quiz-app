import { CfnOutput, Duration, Stack } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The website on AWS without CloudFront: the built app is packed into a Lambda that serves it
 * through a Function URL (backend/site/index.mjs). Used because CloudFront refuses new
 * distributions until the account is verified by AWS Support. When it is, `-c cloudfront=true`
 * switches to the S3 and CloudFront stack (web-stack.js).
 *
 * Cost: a Function URL has no charge. The Lambda free allowance is 1 million requests and 400,000
 * GB-seconds a month, which this stays far inside. Past it, requests are about 0.20 dollars per
 * million. Logs are kept 7 days. Memory is small and the timeout short.
 *
 * Build the app first (npm run build:aws). If dist is missing a one line placeholder page is packed,
 * so `cdk synth` still works on a fresh checkout.
 */
const here = (p) => fileURLToPath(new URL(p, import.meta.url));

/** Copy the handler and the built app into one folder, which becomes the Lambda package. */
function packSite() {
  const out = here('../.site-build');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(here('../../backend/site/index.mjs'), `${out}/index.mjs`);
  const dist = here('../../dist');
  if (existsSync(dist)) cpSync(dist, `${out}/dist`, { recursive: true });
  else {
    mkdirSync(`${out}/dist`);
    writeFileSync(`${out}/dist/index.html`, '<!doctype html><title>Quizlike</title><p>Not built yet. Run npm run build:aws and deploy again.');
  }
  return out;
}

export class SiteStack extends Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);

    const fn = new lambda.Function(this, 'SiteFunction', {
      functionName: `${props.prefix || 'quizlike'}-site`,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(packSite()),
      memorySize: 256,                   // gzip of the biggest file needs a little more than 128
      timeout: Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    const url = fn.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE });

    // A public Function URL needs two permissions since late 2025 (see signer-stack.js).
    const viaUrl = new lambda.CfnPermission(this, 'InvokeViaFunctionUrl', {
      functionName: fn.functionName,
      action: 'lambda:InvokeFunction',
      principal: '*',
    });
    viaUrl.addPropertyOverride('InvokedViaFunctionUrl', true);

    new CfnOutput(this, 'SiteUrl', { value: url.url });
  }
}
