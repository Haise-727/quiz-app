import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { packOps } from './ops-stack.js';

/**
 * A weekly workflow, run by AWS Step Functions every Monday at 03:30 UTC (09:00 in India):
 *
 *   find the teachers  ->  for each teacher, one at a time: work out their week, post it in their inbox, email it
 *                      ->  tell the owner (through the alerts topic) how many were done
 *
 * Why a state machine and not one big Lambda: each step is retried by itself, a failure for one teacher is skipped and the rest
 * still get theirs, and the console draws every run as a picture, which is the point of showing it.
 *
 * COST: Step Functions Standard gives 4,000 state transitions a month free. A run is about 3 steps plus 1 per teacher.
 */
export class WorkflowsStack extends Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);
    const prefix = props.prefix || 'quizlike';
    const code = lambda.Code.fromAsset(packOps());
    const base = {
      runtime: lambda.Runtime.NODEJS_22_X, architecture: lambda.Architecture.ARM_64, code, memorySize: 128,
      logRetention: logs.RetentionDays.ONE_WEEK, tracing: lambda.Tracing.ACTIVE,
      environment: { TABLE_NAME: props.mainTable.tableName, ...(props.sesFrom ? { SES_FROM: props.sesFrom } : {}) },
    };

    const listFn = new lambda.Function(this, 'ListTeachers', { ...base, functionName: `${prefix}-weekly-teachers`, handler: 'ops/weekly.listTeachers', timeout: Duration.seconds(60) });
    listFn.addToRolePolicy(new iam.PolicyStatement({ actions: ['dynamodb:Scan'], resources: [props.mainTable.tableArn] }));

    const summaryFn = new lambda.Function(this, 'Summarize', { ...base, functionName: `${prefix}-weekly-summary`, handler: 'ops/weekly.summarizeTeacher', timeout: Duration.seconds(60) });
    summaryFn.addToRolePolicy(new iam.PolicyStatement({ actions: ['dynamodb:Query', 'dynamodb:PutItem'], resources: [props.mainTable.tableArn, `${props.mainTable.tableArn}/index/*`] }));
    if (props.senderArn) summaryFn.addToRolePolicy(new iam.PolicyStatement({ actions: ['ses:SendEmail'], resources: [props.senderArn] }));

    const find = new tasks.LambdaInvoke(this, 'FindTeachers', { lambdaFunction: listFn, payloadResponseOnly: true, resultPath: '$.found' });
    const one = new tasks.LambdaInvoke(this, 'SummarizeOneTeacher', { lambdaFunction: summaryFn, payloadResponseOnly: true });
    one.addRetry({ errors: ['States.ALL'], interval: Duration.seconds(10), maxAttempts: 2, backoffRate: 2 });
    one.addCatch(new sfn.Pass(this, 'SkipThisTeacher'), { resultPath: '$.error' });            // one failure must not stop the others
    const each = new sfn.Map(this, 'EachTeacher', { itemsPath: '$.found.teachers', maxConcurrency: 1, resultPath: '$.summaries' }).itemProcessor(one);
    const tell = new tasks.SnsPublish(this, 'TellTheOwner', {
      topic: props.topic, subject: 'Quizlike weekly summaries done',
      message: sfn.TaskInput.fromText(sfn.JsonPath.format('The weekly teacher summaries finished. Teachers looked at: {}.', sfn.JsonPath.arrayLength(sfn.JsonPath.stringAt('$.summaries')))),
    });

    const logGroup = new logs.LogGroup(this, 'WorkflowLogs', { logGroupName: `/aws/vendedlogs/states/${prefix}-weekly`, retention: logs.RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.DESTROY });
    const machine = new sfn.StateMachine(this, 'WeeklySummary', {
      stateMachineName: `${prefix}-weekly-summary`,
      stateMachineType: sfn.StateMachineType.STANDARD,           // never Express: that bills by duration
      definitionBody: sfn.DefinitionBody.fromChainable(find.next(each).next(tell)),
      timeout: Duration.minutes(15),
      tracingEnabled: true,
      logs: { destination: logGroup, level: sfn.LogLevel.ERROR },
    });
    new events.Rule(this, 'MondayMorning', {
      ruleName: `${prefix}-weekly-summary-monday`,
      schedule: events.Schedule.cron({ minute: '30', hour: '3', weekDay: 'MON' }),
      targets: [new targets.SfnStateMachine(machine)],
    });

    new CfnOutput(this, 'StateMachineArn', { value: machine.stateMachineArn });
  }
}
