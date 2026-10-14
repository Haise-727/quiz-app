// Reads the templates that `cdk synth` wrote and fails if anything could cost money by surprise.
// Run it before every deploy:  npx cdk synth --quiet && node scripts/check-free.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../cdk.out/', import.meta.url));

// Resource types the plan forbids (docs/aws-migration.md, "Things that cost money without warning").
const FORBIDDEN = [
  /^AWS::EC2::(NatGateway|Instance|EIP|VPC|Volume)$/,
  /^AWS::ElasticLoadBalancing/,
  /^AWS::RDS::/,
  /^AWS::ElastiCache::/,
  /^AWS::Route53::HostedZone$/,
  /^AWS::SecretsManager::/,
  /^AWS::KMS::Key$/,
  /^AWS::WAFv2::/,
  /^AWS::ApiGateway::/,            // REST APIs are billed per request and cost more; only the cheap HTTP API (ApiGatewayV2) is allowed below
  /^AWS::Bedrock/,
  /^AWS::SageMaker/,
  /^AWS::Organizations::/,
  /^AWS::SSO::/,
];

const problems = [];
let alarms = 0;
let tables = 0, read = 0, write = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.template.json'))) {
  const template = JSON.parse(readFileSync(dir + file, 'utf8'));
  for (const [name, res] of Object.entries(template.Resources || {})) {
    if (FORBIDDEN.some((re) => re.test(res.Type))) problems.push(`${file}: ${name} is a ${res.Type}`);

    if (res.Type === 'AWS::DynamoDB::Table') {
      tables++;
      // The seven old tables wait idle on pay per request until they are deleted (nothing reads them). Any other table must be provisioned.
      const idleLegacy = /^quizlike-(users|quizzes|results|classes|enrollments|questionBank|notifications)$/.test(res.Properties.TableName || '');
      if (res.Properties.BillingMode === 'PAY_PER_REQUEST' && !idleLegacy) problems.push(`${file}: ${name} is on demand`);
      const units = (p) => { read += p?.ReadCapacityUnits || 0; write += p?.WriteCapacityUnits || 0; };
      units(res.Properties.ProvisionedThroughput);
      (res.Properties.GlobalSecondaryIndexes || []).forEach((g) => units(g.ProvisionedThroughput));
    }
    if (res.Type === 'AWS::ApiGatewayV2::Api' && res.Properties.ProtocolType !== 'HTTP') problems.push(`${file}: ${name} is a ${res.Properties.ProtocolType} API (a WebSocket API is billed per message and per minute)`);
    if (res.Type === 'AWS::ApiGatewayV2::Stage' && !res.Properties.DefaultRouteSettings?.ThrottlingRateLimit) problems.push(`${file}: ${name} has no rate limit`);
    if (res.Type === 'AWS::Cognito::UserPool' && res.Properties.UserPoolTier === 'PLUS') problems.push(`${file}: ${name} is the Cognito Plus tier`);
    if (res.Type === 'AWS::Cognito::UserPool' && res.Properties.UserPoolTier !== 'ESSENTIALS' && res.Properties.UserPoolTier !== 'LITE') problems.push(`${file}: ${name} does not set a free tier (ESSENTIALS or LITE)`);
    if (res.Type === 'AWS::CloudWatch::Alarm') alarms += 1;
    if (res.Type === 'AWS::CloudTrail::Trail' && JSON.stringify(res.Properties.EventSelectors || []).includes('DataResources')) problems.push(`${file}: ${name} records data events, which are billed`);
    if (res.Type === 'AWS::Lambda::Function' && res.Properties.MemorySize > 512) {
      problems.push(`${file}: ${name} has ${res.Properties.MemorySize} MB of memory`);
    }
    if (res.Type === 'AWS::Logs::LogGroup' && !res.Properties.RetentionInDays) {
      problems.push(`${file}: ${name} keeps logs for ever`);
    }
  }
}

// During the one time copy from the old tables, both sets exist for a short while (ALLOW_DYNAMO_OVERLAP=1, a few cents an hour).
if ((read > 25 || write > 25) && process.env.ALLOW_DYNAMO_OVERLAP !== '1') problems.push(`DynamoDB asks for ${read} read and ${write} write units, the free limit is 25 each`);

if (alarms > 10) problems.push(`${alarms} CloudWatch alarms; only 10 are free`);

if (problems.length) {
  console.error('NOT SAFE TO DEPLOY:\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log(`ok: no forbidden resources. DynamoDB: ${tables} tables, ${read} read units, ${write} write units (limit 25 each).`);
