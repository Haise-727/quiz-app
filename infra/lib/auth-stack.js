import { CfnOutput, CfnParameter, Duration, RemovalPolicy, SecretValue, Stack } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';

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
      passwordPolicy: { minLength: 8, requireLowercase: true, requireDigits: true, requireUppercase: false, requireSymbols: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      email: cognito.UserPoolEmail.withCognito(),
      mfa: cognito.Mfa.OFF,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    // The pool tier. Set with an override so it works on this CDK version; ESSENTIALS keeps the free 10,000 users.
    pool.node.defaultChild.addPropertyOverride('UserPoolTier', 'ESSENTIALS');

    const domain = pool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: props.domainPrefix || `${prefix}-${this.account}` },
    });

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

    const hosted = `https://${domain.domainName}.auth.${this.region}.amazoncognito.com`;
    new CfnOutput(this, 'UserPoolId', { value: pool.userPoolId });
    new CfnOutput(this, 'ClientId', { value: client.userPoolClientId });
    new CfnOutput(this, 'HostedDomain', { value: hosted, description: 'VITE_COGNITO_DOMAIN' });
    new CfnOutput(this, 'GoogleRedirectUri', { value: `${hosted}/oauth2/idpresponse`, description: 'Add this to the Google OAuth client' });
  }
}
