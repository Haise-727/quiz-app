/**
 * Cognito "user migration" trigger: moves a Firebase account over the first time its owner signs in on AWS.
 *
 * Cognito calls this when someone signs in with an email it has never seen. We check the email and password with
 * Firebase (its public sign in endpoint, the same call the old app made). If Firebase accepts them, we hand Cognito
 * the profile and the password it just verified, and Cognito creates the account. The person types the same
 * password as before and notices nothing. Nobody is asked to reset a password.
 *
 * The email comes back marked VERIFIED because Firebase proved they know the password. That is what lets the API
 * attach their old quizzes and results to the new account (backend/api/identity.mjs).
 *
 * Settings: FIREBASE_API_KEY (the public web key already in the app), FIREBASE_REFERER (the address the key is
 * allowed for, in case it is restricted by website).
 */
export async function handler(event, _context, injected) {
  const deps = injected && typeof injected === 'object' ? injected : {};
  const fetchFn = deps.fetch || fetch;

  if (event.triggerSource !== 'UserMigration_Authentication') {
    // "Forgot password" for someone who has not signed in here yet is not supported. They sign in once first.
    throw new Error('Sign in once with your existing password first.');
  }

  const email = String(event.userName || '').trim().toLowerCase();
  const password = event.request?.password;
  if (!email || !password) throw new Error('Incorrect email or password.');

  let res;
  try {
    res = await fetchFn(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Referer: process.env.FIREBASE_REFERER || 'https://quizlike.vercel.app/' },
      body: JSON.stringify({ email, password, returnSecureToken: false }),
    });
  } catch {
    throw new Error('We could not reach the old sign in service. Please try again.');
  }
  if (!res.ok) throw new Error('Incorrect email or password.');   // never say which part was wrong
  const profile = await res.json().catch(() => ({}));

  event.response.userAttributes = {
    email,
    email_verified: 'true',
    name: profile.displayName || email.split('@')[0],
  };
  event.response.finalUserStatus = 'CONFIRMED';
  event.response.messageAction = 'SUPPRESS';
  return event;
}
