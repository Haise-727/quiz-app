import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as accessanalyzer from 'aws-cdk-lib/aws-accessanalyzer';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwactions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Watching and reacting: everything that is not the app itself, all inside the free allowances.
 *
 *   SNS topic "alerts"      emails you (confirm the subscription once)
 *   CloudWatch              one dashboard, ten alarms (the free limit), metric filters that turn log lines into graphs
 *   CloudTrail              who did what in the account, kept 30 days in a private bucket, with tamper checking
 *   EventBridge schedules   a health check every 15 minutes, a cost check every morning
 *   DynamoDB Stream trigger notifies teachers and students when a result needs marking or has been marked
 *   SQS dead letter queue   keeps any stream record that could not be processed, and an alarm watches it
 *   X-Ray                   is switched on for the app Lambdas in their own stacks
 *
 * COST: the alarms are exactly 10 (10 are free). The custom metrics are exactly 10 (10 are free): HealthOk x3, LatencyMs x1,
 * DailyCostUsd, CreditsRemainingUsd, LegacyMatches, SignInChecks, RootUsage, PolicyChanges. A new one costs 0.30 dollars a month,
 * so adding one means removing one. CloudTrail records management events only (never data events, which are billed).
 */
const here = (p) => fileURLToPath(new URL(p, import.meta.url));

/** The ops Lambdas share one package: ops/*.mjs plus the two api files the stream trigger imports. */
function packOps() {
  const out = here('../.ops-build');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(`${out}/ops`, { recursive: true });
  mkdirSync(`${out}/api`, { recursive: true });
  for (const f of readdirSync(here('../../backend/ops'))) if (f.endsWith('.mjs') && !f.endsWith('.test.mjs')) cpSync(here(`../../backend/ops/${f}`), `${out}/ops/${f}`);
  for (const f of ['single-table.mjs', 'config.mjs']) cpSync(here(`../../backend/api/${f}`), `${out}/api/${f}`);
  return out;
}

export class OpsStack extends Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);
    const prefix = props.prefix || 'quizlike';
    const code = lambda.Code.fromAsset(packOps());
    const fnDefaults = {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      code,
      memorySize: 128,
      logRetention: logs.RetentionDays.ONE_WEEK,
      tracing: lambda.Tracing.ACTIVE,
    };

    // ── Alerts ─────────────────────────────────────────────────────────────────────────
    const topic = new sns.Topic(this, 'Alerts', { topicName: `${prefix}-alerts`, displayName: 'Quizlike alerts' });
    if (props.alertEmail) topic.addSubscription(new subs.EmailSubscription(props.alertEmail));
    const alarmAction = new cwactions.SnsAction(topic);

    const dlq = new sqs.Queue(this, 'StreamDlq', { queueName: `${prefix}-stream-dlq`, retentionPeriod: Duration.days(14) });

    // ── Stream trigger: results that need marking, results that were marked ─────────────
    const streamFn = new lambda.Function(this, 'StreamTrigger', {
      ...fnDefaults, functionName: `${prefix}-stream-trigger`, handler: 'ops/stream-trigger.handler',
      timeout: Duration.seconds(30),
      environment: { TABLE_NAME: props.mainTable.tableName },
    });
    streamFn.addToRolePolicy(new iam.PolicyStatement({ actions: ['dynamodb:GetItem', 'dynamodb:PutItem'], resources: [props.mainTable.tableArn] }));
    streamFn.addEventSource(new sources.DynamoEventSource(props.mainTable, {
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 10,
      retryAttempts: 3,
      bisectBatchOnError: true,
      reportBatchItemFailures: true,
      onFailure: new sources.SqsDlq(dlq),
    }));

    // ── Health check every 15 minutes ──────────────────────────────────────────────────
    const healthFn = new lambda.Function(this, 'HealthCheck', {
      ...fnDefaults, functionName: `${prefix}-health-check`, handler: 'ops/health-check.handler',
      timeout: Duration.seconds(40),
      environment: { TARGETS: JSON.stringify(props.healthTargets || []) },
    });
    healthFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'], resources: ['*'], conditions: { StringEquals: { 'cloudwatch:namespace': 'Quizlike' } },
    }));
    new events.Rule(this, 'HealthSchedule', { ruleName: `${prefix}-health-every-15-min`, schedule: events.Schedule.rate(Duration.minutes(15)), targets: [new targets.LambdaFunction(healthFn)] });

    // ── Cost check every morning ───────────────────────────────────────────────────────
    const costFn = new lambda.Function(this, 'CostCheck', {
      ...fnDefaults, functionName: `${prefix}-cost-check`, handler: 'ops/cost-check.handler',
      timeout: Duration.seconds(30),
      environment: { TOPIC_ARN: topic.topicArn, DAILY_LIMIT_USD: String(props.dailyLimitUsd ?? 0.5) },
    });
    costFn.addToRolePolicy(new iam.PolicyStatement({ actions: ['ce:GetCostAndUsage', 'freetier:GetAccountPlanState'], resources: ['*'] }));
    costFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'], resources: ['*'], conditions: { StringEquals: { 'cloudwatch:namespace': 'Quizlike' } },
    }));
    topic.grantPublish(costFn);
    new events.Rule(this, 'CostSchedule', { ruleName: `${prefix}-cost-check-daily`, schedule: events.Schedule.cron({ minute: '30', hour: '2' }), targets: [new targets.LambdaFunction(costFn)] });

    // ── CloudTrail: who did what ───────────────────────────────────────────────────────
    const trailBucket = new s3.Bucket(this, 'TrailBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [{ expiration: Duration.days(30) }],        // old audit files delete themselves
    });
    const trail = new cloudtrail.Trail(this, 'Trail', {
      trailName: `${prefix}-trail`,
      bucket: trailBucket,
      enableFileValidation: true,
      sendToCloudWatchLogs: true,
      cloudWatchLogsRetention: logs.RetentionDays.ONE_WEEK,
      isMultiRegionTrail: false,
      includeGlobalServiceEvents: true,                           // so IAM and sign in events are in it
      managementEvents: cloudtrail.ReadWriteType.ALL,             // management events only: never data events
    });

    // ── A free security watcher ────────────────────────────────────────────
    // IAM Access Analyzer: reports anything in the account shared outside it (a public bucket, a role others can assume).
    new accessanalyzer.CfnAnalyzer(this, 'Analyzer', { analyzerName: `${prefix}-analyzer`, type: 'ACCOUNT' });
    // (Cost Anomaly Detection is already on: AWS created its default service monitor, and only one is allowed. The daily
    // cost check above is our own second line of defence.)

    // ── Metric filters: log lines and audit events become graphs and alarms ─────────────
    const apiLogs = logs.LogGroup.fromLogGroupName(this, 'ApiLogs', `/aws/lambda/${prefix}-api`);
    const mf = (scope, name, group, metricName, namespace, pattern) => new logs.MetricFilter(this, name, {
      logGroup: group, metricNamespace: namespace, metricName, filterPattern: logs.FilterPattern.literal(pattern), metricValue: '1', defaultValue: 0,
    });
    mf(this, 'SignInChecks', apiLogs, 'SignInChecks', 'Quizlike', '"EVT me"');
    mf(this, 'LegacyMatches', apiLogs, 'LegacyMatches', 'Quizlike', '"EVT me legacy=true"');
    mf(this, 'RootUsage', trail.logGroup, 'RootUsage', 'Quizlike', '{ $.userIdentity.type = "Root" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != "AwsServiceEvent" }');
    mf(this, 'PolicyChanges', trail.logGroup, 'PolicyChanges', 'Quizlike',
      '{ ($.eventName = CreateUser) || ($.eventName = DeleteUser) || ($.eventName = CreateAccessKey) || ($.eventName = PutUserPolicy) || ($.eventName = AttachUserPolicy) || ($.eventName = CreatePolicyVersion) || ($.eventName = SetDefaultPolicyVersion) || ($.eventName = DeactivateMFADevice) || ($.eventName = StopLogging) || ($.eventName = DeleteTrail) || ($.eventName = UpdateTrail) }');

    // ── The ten alarms ─────────────────────────────────────────────────────────────────
    const fn = (name) => `${prefix}-${name}`;
    const lm = (name, metricName, statistic = 'Sum', period = Duration.minutes(5)) => new cloudwatch.Metric({
      namespace: 'AWS/Lambda', metricName, dimensionsMap: { FunctionName: fn(name) }, statistic, period,
    });
    const quiz = (metricName, dims, statistic = 'Average', period = Duration.minutes(15)) => new cloudwatch.Metric({ namespace: 'Quizlike', metricName, dimensionsMap: dims, statistic, period });
    const tbl = (metricName, statistic = 'Sum', period = Duration.minutes(5)) => new cloudwatch.Metric({
      namespace: 'AWS/DynamoDB', metricName, dimensionsMap: { TableName: props.mainTable.tableName }, statistic, period,
    });
    const add = (id, alarm) => { alarm.addAlarmAction(alarmAction); return alarm; };
    const base = { treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING, evaluationPeriods: 1 };

    add('a1', new cloudwatch.Alarm(this, 'ApiErrors', { ...base, alarmName: fn('api-errors'), alarmDescription: 'The API Lambda returned an error.', metric: lm('api', 'Errors'), threshold: 1, comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD }));
    add('a2', new cloudwatch.Alarm(this, 'ApiThrottles', { ...base, alarmName: fn('api-throttles'), alarmDescription: 'The API Lambda was throttled (too many at once).', metric: lm('api', 'Throttles'), threshold: 1, comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD }));
    add('a3', new cloudwatch.Alarm(this, 'DynamoThrottled', {
      ...base, alarmName: fn('dynamodb-throttled'), alarmDescription: 'DynamoDB ran out of free capacity and refused requests. Raise nothing: this is the limit working. See which operation.',
      metric: new cloudwatch.MathExpression({ expression: 'r + w', usingMetrics: { r: tbl('ReadThrottleEvents'), w: tbl('WriteThrottleEvents') }, period: Duration.minutes(5) }),
      threshold: 5, comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    }));
    add('a4', new cloudwatch.Alarm(this, 'ApiSlow', { ...base, evaluationPeriods: 2, alarmName: fn('api-slow'), alarmDescription: 'The API is slow: p95 over 5 seconds.', metric: lm('api', 'Duration', 'p95'), threshold: 5000, comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD }));
    add('a5', new cloudwatch.Alarm(this, 'OtherLambdaErrors', {
      // The sign up and migration triggers are left out on purpose: they raise an error each time they refuse someone (an old
      // account's email, a wrong password), and that is the trigger working, not failing.
      ...base, alarmName: fn('other-lambda-errors'), alarmDescription: 'An error in the site, signer, stream trigger, health check or cost check.',
      metric: new cloudwatch.MathExpression({
        expression: 'a + b + c + d + e', period: Duration.minutes(5),
        usingMetrics: { a: lm('site', 'Errors'), b: lm('signer', 'Errors'), c: lm('stream-trigger', 'Errors'), d: lm('health-check', 'Errors'), e: lm('cost-check', 'Errors') },
      }),
      threshold: 1, comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    }));
    add('a6', new cloudwatch.Alarm(this, 'DlqNotEmpty', {
      ...base, alarmName: fn('stream-dlq-not-empty'), alarmDescription: 'A database change could not be processed and was parked in the dead letter queue.',
      metric: dlq.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5), statistic: 'Maximum' }), threshold: 1, comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    }));
    const healthMetrics = Object.fromEntries((props.healthTargets || []).map((t) => [t.name, quiz('HealthOk', { Target: t.name }, 'Minimum')]));
    add('a7', new cloudwatch.Alarm(this, 'HealthFailing', {
      ...base, evaluationPeriods: 2, datapointsToAlarm: 2, alarmName: fn('health-failing'), alarmDescription: 'The health check could not use the site, signer or API twice in a row.',
      metric: new cloudwatch.MathExpression({ expression: `MIN([${Object.keys(healthMetrics).join(',')}])`, usingMetrics: healthMetrics, period: Duration.minutes(15) }),
      threshold: 1, comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
    }));
    const q = (metricName) => new cloudwatch.Metric({ namespace: 'Quizlike', metricName, statistic: 'Sum', period: Duration.minutes(5) });
    add('a8', new cloudwatch.Alarm(this, 'RootUsed', { ...base, alarmName: fn('root-account-used'), alarmDescription: 'The AWS root account was used. It should never be.', metric: q('RootUsage'), threshold: 1, comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD }));
    add('a9', new cloudwatch.Alarm(this, 'PolicyChanged', { ...base, alarmName: fn('security-settings-changed'), alarmDescription: 'A user, key or policy was created or changed, or logging was stopped. Expected when you update the policy files.', metric: q('PolicyChanges'), threshold: 1, comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD }));
    add('a10', new cloudwatch.Alarm(this, 'DailyCost', {
      ...base, alarmName: fn('daily-cost'), alarmDescription: 'Yesterday cost real money before credits.',
      metric: new cloudwatch.Metric({ namespace: 'Quizlike', metricName: 'DailyCostUsd', statistic: 'Maximum', period: Duration.hours(24) }),
      threshold: props.dailyLimitUsd ?? 0.5, comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    }));

    // ── The dashboard ──────────────────────────────────────────────────────────────────
    const dash = new cloudwatch.Dashboard(this, 'Dashboard', { dashboardName: `${prefix}`, defaultInterval: Duration.hours(12) });
    const w = 8;
    dash.addWidgets(
      new cloudwatch.GraphWidget({ title: 'API calls, errors, throttles', width: w, left: [lm('api', 'Invocations'), lm('api', 'Errors'), lm('api', 'Throttles')] }),
      new cloudwatch.GraphWidget({ title: 'API speed (ms)', width: w, left: [lm('api', 'Duration', 'p50'), lm('api', 'Duration', 'p95'), lm('api', 'Duration', 'p99')] }),
      new cloudwatch.GraphWidget({ title: 'Health checks (1 is good)', width: w, left: Object.values(healthMetrics), leftYAxis: { min: 0, max: 1 } }),
    );
    dash.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Database capacity used and refused', width: w,
        left: [tbl('ConsumedReadCapacityUnits'), tbl('ConsumedWriteCapacityUnits')], right: [tbl('ReadThrottleEvents'), tbl('WriteThrottleEvents')],
      }),
      new cloudwatch.GraphWidget({ title: 'Sign in checks and old accounts matched', width: w, left: [q('SignInChecks'), q('LegacyMatches')] }),
      new cloudwatch.GraphWidget({ title: 'Other Lambdas: calls and errors', width: w, left: [lm('stream-trigger', 'Invocations'), lm('site', 'Invocations'), lm('signer', 'Invocations')], right: [lm('stream-trigger', 'Errors'), lm('site', 'Errors'), lm('signer', 'Errors')] }),
    );
    dash.addWidgets(
      new cloudwatch.GraphWidget({ title: 'Daily cost before credits (USD)', width: w, left: [new cloudwatch.Metric({ namespace: 'Quizlike', metricName: 'DailyCostUsd', statistic: 'Maximum', period: Duration.hours(24) })] }),
      new cloudwatch.SingleValueWidget({ title: 'Free plan credits left (USD)', width: 4, metrics: [new cloudwatch.Metric({ namespace: 'Quizlike', metricName: 'CreditsRemainingUsd', statistic: 'Minimum', period: Duration.hours(24) })] }),
      new cloudwatch.GraphWidget({ title: 'Stream trouble: dead letter queue', width: 4, left: [dlq.metricApproximateNumberOfMessagesVisible()] }),
      new cloudwatch.GraphWidget({ title: 'Root use and security changes', width: 8, left: [q('RootUsage'), q('PolicyChanges')] }),
    );

    new CfnOutput(this, 'AlertsTopicArn', { value: topic.topicArn });
    new CfnOutput(this, 'DashboardName', { value: prefix });
    new CfnOutput(this, 'TrailBucketName', { value: trailBucket.bucketName });
    new CfnOutput(this, 'DlqUrl', { value: dlq.queueUrl });
  }
}
