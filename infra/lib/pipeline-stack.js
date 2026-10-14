import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as cpactions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codestar from 'aws-cdk-lib/aws-codestarconnections';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';

/**
 * Build and deploy the website on every push to GitHub, with AWS CodePipeline and CodeBuild.
 *
 *   GitHub (main branch)  ->  CodeBuild: install, lint, all tests, safety check, build the app, deploy the site stack
 *
 * ONE STEP FOR THE OWNER: GitHub has to be connected once. The connection below is created in the "pending" state. Open
 * Developer Tools, Settings, Connections in the AWS console, open it, press "Update pending connection" and approve it in
 * GitHub. Until then the pipeline waits. After that, every push to main runs it.
 *
 * COST: CodePipeline V1 (one pipeline is free), CodeBuild small Linux (100 build minutes a month free, a run takes about 5),
 * and a tiny artifact bucket that empties itself after 14 days.
 *
 * SAFETY: the build runs with a role that can only (a) read the public build settings, (b) read the Google OAuth values
 * needed to synthesize, and (c) assume the CDK roles, which can only create the cheap services allowed by the
 * quizlike-cfn-exec policy. infra/scripts/check-free.mjs runs before the deploy and stops the build if anything costly appears.
 * The pipeline deploys the website only. Sign in, API and data stacks are still deployed by hand.
 */
export class PipelineStack extends Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);
    const prefix = props.prefix || 'quizlike';
    const owner = props.githubOwner || 'Haise-727';
    const repo = props.githubRepo || 'quiz-app';
    const branch = props.githubBranch || 'main';

    const connection = new codestar.CfnConnection(this, 'GitHub', { connectionName: `${prefix}-github`, providerType: 'GitHub' });

    const artifacts = new s3.Bucket(this, 'Artifacts', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [{ expiration: Duration.days(14) }],
    });

    // The public settings the app is built with (addresses, public keys). Put there by infra/scripts/put-build-env.mjs.
    const buildEnv = ssm.StringParameter.fromStringParameterName(this, 'BuildEnv', `/${prefix}/build/env`);

    const project = new codebuild.PipelineProject(this, 'Build', {
      projectName: `${prefix}-build`,
      timeout: Duration.minutes(20),
      environment: { buildImage: codebuild.LinuxBuildImage.STANDARD_7_0, computeType: codebuild.ComputeType.SMALL },
      environmentVariables: {
        BUILD_ENV: { type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE, value: `/${prefix}/build/env` },
        CDK_DEFAULT_ACCOUNT: { value: this.account },
        CDK_DEFAULT_REGION: { value: this.region },
        AWS_REGION: { value: this.region },
      },
      logging: { cloudWatch: { logGroup: new logs.LogGroup(this, 'BuildLogs', { logGroupName: `/aws/codebuild/${prefix}-build`, retention: logs.RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.DESTROY }) } },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': { nodejs: '22' },
            commands: ['npm ci --legacy-peer-deps', '(cd infra && npm ci)'],
          },
          pre_build: {
            commands: [
              'printf "%s\\n" "$BUILD_ENV" > .env.production',          // the public settings, written fresh for this build
              'npm run lint',
              'npm test',                                                // unit tests, the AWS client against the real backend code, the Lambdas
              '(cd infra && CDK_DEFAULT_ACCOUNT=$CDK_DEFAULT_ACCOUNT npx cdk synth --quiet -c google=true -c legacyTables=true && node scripts/check-free.mjs)',
            ],
          },
          build: { commands: ['npm run build:aws'] },
          post_build: {
            commands: ['(cd infra && npx cdk deploy quizlike-site --exclusively -c google=true -c legacyTables=true --require-approval never)'],
          },
        },
        cache: { paths: ['node_modules/**/*', 'infra/node_modules/**/*'] },
      }),
    });

    // What the build may do: read its settings, and use the CDK roles (which are limited by the cfn-exec policy).
    buildEnv.grantRead(project);
    project.addToRolePolicy(new iam.PolicyStatement({ actions: ['sts:AssumeRole'], resources: [`arn:aws:iam::${this.account}:role/cdk-*`] }));
    project.addToRolePolicy(new iam.PolicyStatement({ actions: ['ssm:GetParameter'], resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/cdk-bootstrap/*`] }));
    project.addToRolePolicy(new iam.PolicyStatement({ actions: ['cloudformation:DescribeStacks'], resources: ['*'] }));

    const source = new codepipeline.Artifact('Source');
    new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: `${prefix}-pipeline`,
      pipelineType: codepipeline.PipelineType.V1,          // V2 bills per minute; one V1 pipeline is free
      artifactBucket: artifacts,
      stages: [
        { stageName: 'Source', actions: [new cpactions.CodeStarConnectionsSourceAction({ actionName: 'GitHub', owner, repo, branch, connectionArn: connection.attrConnectionArn, output: source })] },
        { stageName: 'BuildAndDeploy', actions: [new cpactions.CodeBuildAction({ actionName: 'TestBuildDeploy', project, input: source })] },
      ],
    });

    new CfnOutput(this, 'ConnectionArn', { value: connection.attrConnectionArn, description: 'Authorize this in the console (Developer Tools, Settings, Connections)' });
    new CfnOutput(this, 'PipelineName', { value: `${prefix}-pipeline` });
  }
}
