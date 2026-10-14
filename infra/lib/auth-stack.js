import { CfnOutput, CfnParameter, CfnResource, Duration, RemovalPolicy, SecretValue, Stack } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { fileURLToPath } from 'node:url';

/**
 * Sign in on AWS: a Cognito user pool with email and password plus "Sign in with Google".
 *
 * COST RULES
 *  - Tier ESSENTIALS. The first 10,000 monthly active users are free. Never PLUS (no free allowance;
 *    infra/scripts/check-free.mjs fails on it).
 *  - Cognito's own email sender (free, about 50 emails a day) sends the verification codes. SES is not used.
 *  - The users are kept (RETAIN) if the stack is ever deleted.
 *
 * Google: needs a Google OAuth client. Its id and secret live in SSM (/quizlike/google/*) and are passed
 * in at deploy time by infra/scripts/deploy-auth.mjs. The secret is a NoEcho parameter, so it never
 * appears in the template, the console or the logs. Without them the stack still deploys and email
 * sign in works, and Google is simply not offered.
 *
 * Roles (teacher or student) are NOT stored here. They stay in the profile record, as today.
 */
export class AuthStack extends Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);
    const prefix = props.prefix || 'quizlike';
    const withGoogle = !!props.withGoogle;

    const pool = new cognito.UserPool(this, 'Pool', {
      userPoolName: `${prefix}-users`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
      },
      // Same rule as the sign up form today (at least 6 characters). Cognito's own minimum is 6.
      passwordPolicy: { minLength: 6, requireLowercase: false, requireDigits: false, requireUppercase: false, requireSymbols: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      email: cognito.UserPoolEmail.withCognito(),
      mfa: cognito.Mfa.OFF,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    // Accept a new sign up straight away and mark its email as verified, so the sign up form needs no code step.
    // This is how Firebase behaved too (it never checked the email). Tighten it later by deleting this trigger and
    // adding a "type the code we emailed you" step to the sign up screen.
    const triggerCode = lambda.Code.fromAsset(fileURLToPath(new URL('../../backend/auth-triggers', import.meta.url)));
    const preSignUp = new lambda.Function(this, 'PreSignUp', {
      functionName: `${prefix}-pre-signup`,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'pre-signup.handler',
      code: triggerCode,
      memorySize: 128,
      timeout: Duration.seconds(5),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: { TABLE_NAME: props.mainTable ? props.mainTable.tableName : `${prefix}-main` },
    });
    // It may only look an email up in the shared index that holds users by legacy email (gsi3), nothing else.
    if (props.mainTable) {
      preSignUp.addToRolePolicy(new iam.PolicyStatement({ actions: ['dynamodb:Query'], resources: [`${props.mainTable.tableArn}/index/gsi3`] }));
    }
    pool.addTrigger(cognito.UserPoolOperation.PRE_SIGN_UP, preSignUp);

    // Moves a Firebase account over the first time its owner signs in (backend/auth-triggers/migrate-user.mjs).
    // Off until the old data has been copied across, so nobody is moved before their quizzes are there.
    if (props.migrateUsers) {
      const migrate = new lambda.Function(this, 'MigrateUser', {
        functionName: `${prefix}-migrate-user`,
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        handler: 'migrate-user.handler',
        code: triggerCode,
        memorySize: 128,
        timeout: Duration.seconds(10),
        logRetention: logs.RetentionDays.ONE_WEEK,
        environment: { FIREBASE_API_KEY: props.firebaseApiKey || '', FIREBASE_REFERER: props.firebaseReferer || 'https://quizlike.vercel.app/' },
      });
      pool.addTrigger(cognito.UserPoolOperation.USER_MIGRATION, migrate);
    }

    // The pool tier. Set with an override so it works on this CDK version; ESSENTIALS keeps the free 10,000 users.
    pool.node.defaultChild.addPropertyOverride('UserPoolTier', 'ESSENTIALS');

    const domain = pool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: props.domainPrefix || `${prefix}-${this.account}` },
    });

    // Managed login (version 2) instead of the classic hosted page. The classic page throws away the `prompt` hint, so Google
    // never showed its account picker and silently reused whichever account was already signed in. Managed login passes
    // `prompt=select_account` on to Google. Nobody sees Cognito's own page: the app sends people straight to Google.
    domain.node.defaultChild.addPropertyOverride('ManagedLoginVersion', 2);

    const supported = [cognito.UserPoolClientIdentityProvider.COGNITO];
    let google;
    if (withGoogle) {
      const clientId = new CfnParameter(this, 'GoogleClientId', { type: 'String' });
      const clientSecret = new CfnParameter(this, 'GoogleClientSecret', { type: 'String', noEcho: true });
      google = new cognito.UserPoolIdentityProviderGoogle(this, 'Google', {
        userPool: pool,
        clientId: clientId.valueAsString,
        clientSecretValue: SecretValue.cfnParameter(clientSecret),
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          fullname: cognito.ProviderAttribute.GOOGLE_NAME,
        },
      });
      supported.push(cognito.UserPoolClientIdentityProvider.GOOGLE);
    }

    const callbacks = (props.appUrls || []).map((u) => `${u.replace(/\/$/, '')}/auth/callback`);
    const client = pool.addClient('WebClient', {
      userPoolClientName: `${prefix}-web`,
      generateSecret: false,                     // a browser app cannot keep a secret; it uses PKCE instead
      authFlows: { userPassword: true, userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: callbacks,
        logoutUrls: (props.appUrls || []).map((u) => u.replace(/\/$/, '') + '/'),
      },
      supportedIdentityProviders: supported,
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    });
    if (google) client.node.addDependency(google);
    // Managed login needs a branding record per app client. The Cognito provided look is fine, it is never shown.
    const branding = new CfnResource(this, 'ManagedLoginBranding', {
      type: 'AWS::Cognito::ManagedLoginBranding',
      properties: { UserPoolId: pool.userPoolId, ClientId: client.userPoolClientId, UseCognitoProvidedValues: true },
    });
    branding.node.addDependency(domain);
    this.pool = pool;
    this.client = client;

    const hosted = `https://${domain.domainName}.auth.${this.region}.amazoncognito.com`;
    new CfnOutput(this, 'UserPoolId', { value: pool.userPoolId });
    new CfnOutput(this, 'ClientId', { value: client.userPoolClientId });
    new CfnOutput(this, 'HostedDomain', { value: hosted, description: 'VITE_COGNITO_DOMAIN' });
    new CfnOutput(this, 'GoogleRedirectUri', { value: `${hosted}/oauth2/idpresponse`, description: 'Add this to the Google OAuth client' });
  }
}
