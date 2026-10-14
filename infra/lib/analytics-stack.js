import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as athena from 'aws-cdk-lib/aws-athena';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as s3 from 'aws-cdk-lib/aws-s3';

/**
 * Ask questions of the audit log in plain SQL, with Amazon Athena.
 *
 * CloudTrail (in the ops stack) drops a small JSON file into a private bucket every few minutes. Athena can read those files
 * where they sit, so a question like "who changed a policy this week?" is one query and nothing is loaded anywhere.
 *
 * COST: Athena bills by data scanned, about 5 dollars per terabyte. The audit files are a few megabytes, and the workgroup
 * REFUSES any query that would scan more than 100 MB, so one mistake cannot cost more than a few cents. Query results are kept
 * 14 days. The Glue table is only a description of the files (no crawler, which would be billed).
 *
 * Open the saved queries in the Athena console, workgroup "quizlike", database "quizlike_audit".
 */
export class AnalyticsStack extends Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);
    const prefix = props.prefix || 'quizlike';
    const trailBucket = props.trailBucket;

    const results = new s3.Bucket(this, 'QueryResults', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [{ expiration: Duration.days(14) }],
    });

    const database = new glue.CfnDatabase(this, 'AuditDatabase', {
      catalogId: this.account,
      databaseInput: { name: 'quizlike_audit', description: 'Quizlike audit log files, read in place by Athena' },
    });

    // The standard CloudTrail table (as in the AWS documentation), with the date as a projected partition so Athena only
    // reads the days a query asks for. Dates start the day the trail was created.
    const table = new glue.CfnTable(this, 'CloudTrailTable', {
      catalogId: this.account,
      databaseName: 'quizlike_audit',
      tableInput: {
        name: 'cloudtrail_events',
        tableType: 'EXTERNAL_TABLE',
        partitionKeys: [{ name: 'timestamp', type: 'string' }],
        parameters: {
          classification: 'cloudtrail',
          'projection.enabled': 'true',
          'projection.timestamp.type': 'date',
          'projection.timestamp.format': 'yyyy/MM/dd',
          'projection.timestamp.interval': '1',
          'projection.timestamp.interval.unit': 'DAYS',
          'projection.timestamp.range': `${props.trailStart || '2026/10/14'},NOW`,
          'storage.location.template': `s3://${trailBucket.bucketName}/AWSLogs/${this.account}/CloudTrail/${this.region}/\${timestamp}`,
        },
        storageDescriptor: {
          location: `s3://${trailBucket.bucketName}/AWSLogs/${this.account}/CloudTrail/${this.region}/`,
          inputFormat: 'com.amazon.emr.cloudtrail.CloudTrailInputFormat',
          outputFormat: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
          serdeInfo: { serializationLibrary: 'org.apache.hive.hcatalog.data.JsonSerDe' },
          columns: [
            { name: 'eventversion', type: 'string' },
            { name: 'useridentity', type: 'struct<type:string,principalid:string,arn:string,accountid:string,invokedby:string,accesskeyid:string,username:string,sessioncontext:struct<attributes:struct<mfaauthenticated:string,creationdate:string>,sessionissuer:struct<type:string,principalid:string,arn:string,accountid:string,username:string>>>' },
            { name: 'eventtime', type: 'string' },
            { name: 'eventsource', type: 'string' },
            { name: 'eventname', type: 'string' },
            { name: 'awsregion', type: 'string' },
            { name: 'sourceipaddress', type: 'string' },
            { name: 'useragent', type: 'string' },
            { name: 'errorcode', type: 'string' },
            { name: 'errormessage', type: 'string' },
            { name: 'requestparameters', type: 'string' },
            { name: 'responseelements', type: 'string' },
            { name: 'additionaleventdata', type: 'string' },
            { name: 'requestid', type: 'string' },
            { name: 'eventid', type: 'string' },
            { name: 'resources', type: 'array<struct<arn:string,accountid:string,type:string>>' },
            { name: 'eventtype', type: 'string' },
            { name: 'apiversion', type: 'string' },
            { name: 'readonly', type: 'string' },
            { name: 'recipientaccountid', type: 'string' },
            { name: 'serviceeventdetails', type: 'string' },
            { name: 'sharedeventid', type: 'string' },
            { name: 'vpcendpointid', type: 'string' },
          ],
        },
      },
    });
    table.addDependency(database);

    const workgroup = new athena.CfnWorkGroup(this, 'Workgroup', {
      name: prefix,
      description: 'Quizlike audit questions. Refuses any query that would scan more than 100 MB.',
      state: 'ENABLED',
      recursiveDeleteOption: true,
      workGroupConfiguration: {
        enforceWorkGroupConfiguration: true,
        publishCloudWatchMetricsEnabled: false,
        bytesScannedCutoffPerQuery: 100 * 1024 * 1024,
        resultConfiguration: { outputLocation: `s3://${results.bucketName}/results/` },
        engineVersion: { selectedEngineVersion: 'Athena engine version 3' },
      },
    });

    // The questions worth asking. Each only looks at the last few days, so it scans almost nothing.
    const last = (days) => `"timestamp" >= date_format(date_add('day', -${days}, current_date), '%Y/%m/%d')`;
    const queries = [
      ['Who changed users, keys, policies or logging (7 days)', 'Every create, delete or change to IAM users, access keys, policies, MFA and the trail itself.',
        `SELECT eventtime, eventname, useridentity.arn AS who, sourceipaddress, errorcode FROM cloudtrail_events WHERE ${last(7)} AND (eventname IN ('CreateUser','DeleteUser','CreateAccessKey','DeleteAccessKey','PutUserPolicy','AttachUserPolicy','CreatePolicy','CreatePolicyVersion','SetDefaultPolicyVersion','DeactivateMFADevice','StopLogging','DeleteTrail','UpdateTrail')) ORDER BY eventtime DESC`],
      ['Refused or failed calls (7 days)', 'Calls that AWS turned away: access denied, throttled, or invalid. A burst here is worth a look.',
        `SELECT eventtime, eventsource, eventname, errorcode, errormessage, useridentity.arn AS who FROM cloudtrail_events WHERE ${last(7)} AND errorcode IS NOT NULL ORDER BY eventtime DESC LIMIT 200`],
      ['What the deploy user did (7 days)', 'Everything done as the deployer login, by service and action.',
        `SELECT eventsource, eventname, count(*) AS times, min(eventtime) AS first, max(eventtime) AS last FROM cloudtrail_events WHERE ${last(7)} AND useridentity.username = 'deployer' GROUP BY eventsource, eventname ORDER BY times DESC`],
      ['Console sign ins (14 days)', 'Who signed in to the AWS console, from where, and whether MFA was used.',
        `SELECT eventtime, useridentity.type AS type, useridentity.arn AS who, sourceipaddress, json_extract_scalar(additionaleventdata, '$.MFAUsed') AS mfa, json_extract_scalar(responseelements, '$.ConsoleLogin') AS result FROM cloudtrail_events WHERE ${last(14)} AND eventname = 'ConsoleLogin' ORDER BY eventtime DESC`],
      ['Busiest callers and services (7 days)', 'Which identities and services make the most calls. A sudden leader is a sign something changed.',
        `SELECT useridentity.arn AS who, eventsource, count(*) AS calls FROM cloudtrail_events WHERE ${last(7)} GROUP BY useridentity.arn, eventsource ORDER BY calls DESC LIMIT 30`],
    ];
    queries.forEach(([name, description, queryString], i) => {
      const q = new athena.CfnNamedQuery(this, `Query${i + 1}`, { name: `quizlike: ${name}`, description, database: 'quizlike_audit', workGroup: prefix, queryString });
      q.addDependency(workgroup);
      q.addDependency(table);
    });

    new CfnOutput(this, 'WorkgroupName', { value: prefix });
    new CfnOutput(this, 'AuditDatabaseName', { value: 'quizlike_audit' });
    new CfnOutput(this, 'ResultsBucketName', { value: results.bucketName });
  }
}
