/**
 * A cost check that runs once a day (EventBridge Scheduler). It looks at yesterday's real cost, before credits are taken off,
 * and at what is left of the Free plan credits, and records them as CloudWatch metrics:
 *
 *   Quizlike / DailyCostUsd         what yesterday would have cost without credits
 *   Quizlike / CreditsRemainingUsd  Free plan credits left
 *
 * It emails you (through the alerts topic) when yesterday cost more than the limit, or when a service we never use
 * showed up with a cost. That is exactly how the forgotten RDS database would have been caught on its first day.
 *
 * Cost Explorer charges 0.01 dollars per request. This makes two a day.
 */
const EXPECTED = (process.env.EXPECTED_SERVICES || 'AWS Lambda,Amazon DynamoDB,Amazon Cognito,AWS CloudTrail,AmazonCloudWatch,Amazon Simple Notification Service,Amazon Simple Queue Service,Amazon EventBridge,AWS X-Ray,Amazon Simple Storage Service,AWS Key Management Service,Amazon API Gateway,Amazon Simple Email Service,Amazon Athena,AWS Step Functions,AWS CodeBuild,AWS CodePipeline,AWS Cost Explorer,Tax').split(',').map((s) => s.trim());
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT_USD || 0.5);
const NOISE = 0.02;      // a few cents of rounding is not an alert

export function assess(byService, limit = DAILY_LIMIT, expected = EXPECTED) {
  const total = byService.reduce((n, s) => n + s.usd, 0);
  const unexpected = byService.filter((s) => s.usd > NOISE && !expected.includes(s.service));
  const problems = [];
  if (total > limit) problems.push(`Yesterday cost ${total.toFixed(2)} dollars before credits, over the ${limit} dollar limit.`);
  for (const s of unexpected) problems.push(`${s.service} cost ${s.usd.toFixed(2)} dollars and is not a service we use.`);
  return { total, unexpected, problems };
}

async function clients() {
  const { CostExplorerClient, GetCostAndUsageCommand } = await import('@aws-sdk/client-cost-explorer');
  const { CloudWatchClient, PutMetricDataCommand } = await import('@aws-sdk/client-cloudwatch');
  const { SNSClient, PublishCommand } = await import('@aws-sdk/client-sns');
  const ce = new CostExplorerClient({ region: 'us-east-1' });
  const cw = new CloudWatchClient({});
  const sns = new SNSClient({});
  return {
    yesterdayByService: async (day) => {
      const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);
      const out = await ce.send(new GetCostAndUsageCommand({
        TimePeriod: { Start: day, End: next }, Granularity: 'DAILY', Metrics: ['UnblendedCost'],
        Filter: { Not: { Dimensions: { Key: 'RECORD_TYPE', Values: ['Credit', 'Refund'] } } },
        GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
      }));
      return (out.ResultsByTime?.[0]?.Groups || []).map((g) => ({ service: g.Keys[0], usd: Number(g.Metrics.UnblendedCost.Amount) }));
    },
    credits: async () => {
      try {
        const { FreeTierClient, GetAccountPlanStateCommand } = await import('@aws-sdk/client-freetier');
        const out = await new FreeTierClient({ region: 'us-east-1' }).send(new GetAccountPlanStateCommand({}));
        return Number(out.accountPlanRemainingCredits?.amount ?? NaN);
      } catch { return NaN; }
    },
    putMetrics: (metrics) => cw.send(new PutMetricDataCommand({ Namespace: 'Quizlike', MetricData: metrics })),
    alert: (subject, message) => sns.send(new PublishCommand({ TopicArn: process.env.TOPIC_ARN, Subject: subject.slice(0, 99), Message: message })),
  };
}

export async function handler(_event, _context, injected) {
  const deps = injected && typeof injected === 'object' ? injected : {};
  const c = deps.clients || (await clients());
  const day = (deps.today ? new Date(deps.today) : new Date(Date.now() - 86400_000)).toISOString().slice(0, 10);

  const byService = await c.yesterdayByService(day);
  const result = assess(byService);
  const credits = await c.credits();
  const metrics = [{ MetricName: 'DailyCostUsd', Value: result.total, Unit: 'None' }];
  if (Number.isFinite(credits)) metrics.push({ MetricName: 'CreditsRemainingUsd', Value: credits, Unit: 'None' });
  await c.putMetrics(metrics);

  if (result.problems.length) {
    await c.alert('Quizlike: unexpected AWS cost', `${result.problems.join('\n')}\n\nDay checked: ${day}. Credits left: ${Number.isFinite(credits) ? credits.toFixed(2) : 'unknown'}.\nLook at Billing and Cost Management, or run infra/scripts/panic.mjs.`);
  }
  console.log(`EVT cost day=${day} usd=${result.total.toFixed(2)} problems=${result.problems.length}`);
  return { day, total: result.total, credits, problems: result.problems };
}
