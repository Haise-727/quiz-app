/**
 * Cognito "pre sign up" trigger. Runs when someone creates an account.
 *
 *  - Google (PreSignUp_ExternalProvider): confirm it and mark the email verified. Google already checked it.
 *  - Email and password (PreSignUp_SignUp): confirm it straight away so the form needs no code step, but do NOT
 *    mark the email verified. Refuse an email that belongs to an account copied over from Firebase: that person
 *    must sign in with their old password (moved over on first sign in) or with Google, not start a second account.
 *
 * Why not verified: nothing checked the address. Matching old data to a person only trusts verified emails
 * (backend/api/identity.mjs), so a stranger typing your email cannot get your quizzes.
 */
let doc = null;   // the AWS SDK ships inside the Lambda runtime, so it is loaded only there (tests inject a fake)

async function legacyEmailTaken(email, deps) {
  if (deps.legacyEmailTaken) return deps.legacyEmailTaken(email);
  const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, QueryCommand } = await import('@aws-sdk/lib-dynamodb');
  doc ||= DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const out = await doc.send(new QueryCommand({
    TableName: process.env.TABLE_NAME || 'quizlike-main',
    IndexName: 'gsi3',                                    // the shared index that holds users by legacy email (single-table.mjs)
    KeyConditionExpression: 'gsi3pk = :e',
    ExpressionAttributeValues: { ':e': `users#byLegacyEmail#${email}` },
    Limit: 1,
  }));
  return (out.Items || []).length > 0;
}

export async function handler(event, _context, injected) {
  const deps = injected && typeof injected === 'object' ? injected : {};
  const email = String(event.request?.userAttributes?.email || '').trim().toLowerCase();
  event.response ||= {};

  if (event.triggerSource === 'PreSignUp_ExternalProvider') {
    event.response.autoConfirmUser = true;
    event.response.autoVerifyEmail = true;
    return event;
  }
  if (event.triggerSource === 'PreSignUp_SignUp') {
    if (email) {
      let taken;
      try { taken = await legacyEmailTaken(email, deps); } catch (err) {
        console.error('Could not check the email:', err?.name);
        throw new Error('We could not check that email just now. Please try again.');
      }
      if (taken) throw new Error('This email already has a Quizlike account. Sign in with your existing password, or with Google.');
    }
    event.response.autoConfirmUser = true;
    return event;
  }
  return event;
}
