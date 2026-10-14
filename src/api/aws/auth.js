import { rpc } from './http';
import {
  COGNITO_CLIENT_ID, clearSession, cognito, currentSession, getIdToken, onSessionChange, saveSession,
  finishGoogleSignIn as finishHostedSignIn, passwordSignIn, startGoogleSignIn, userFromSession,
} from './session';

/**
 * Signing in and out on AWS (Cognito). Same functions as api/firebase/auth.js, so nothing else changes.
 * Email and password talk to Cognito's public API. Google sends the browser to Cognito's page and back
 * (see session.js and pages/AuthCallback.jsx).
 */

/** Call `callback(user | null)` now and every time the signed in person changes. Returns an unsubscribe function. */
export function watchAuth(callback) {
  let stopped = false;
  const emit = async () => {
    await getIdToken();                       // refreshes an expired token, or clears a dead session
    let session = currentSession();
    if (session && !session.uid) {
      // Ask the API which id the data uses for this person. A person moved over from Firebase gets their old id back.
      try {
        const me = await rpc('me');
        saveSession({ ...currentSession(), uid: me.uid });   // tells the listeners, which run this again with the id set
        return;
      } catch { session = currentSession(); /* offline: carry on with the Cognito id this time */ }
    }
    if (!stopped) callback(userFromSession(session));
  };
  emit();
  const off = onSessionChange(emit);
  return () => { stopped = true; off(); };
}

export function getCurrentUser() {
  return userFromSession(currentSession());
}

/** Starts the Google flow. The page leaves for Google and Cognito, so this does not finish; the person comes back to /auth/callback. */
export async function signInWithGoogle() {
  return startGoogleSignIn();
}

export async function signInWithEmail(email, password) {
  await passwordSignIn(email, password);
  return { user: getCurrentUser() };
}

/** Make an account with an email and password, then sign it in. */
export async function createEmailAccount(email, password, name) {
  const clean = String(email).trim().toLowerCase();
  await cognito('SignUp', {
    ClientId: COGNITO_CLIENT_ID, Username: clean, Password: password,
    UserAttributes: [{ Name: 'email', Value: clean }, { Name: 'name', Value: name || clean.split('@')[0] }],
  });
  await passwordSignIn(clean, password);       // a trigger on the pool confirms new sign ups straight away
  return { user: getCurrentUser() };
}

/** Cognito keeps a name too. The name the app shows comes from the profile record, so a failure here is not fatal. */
export async function setAuthDisplayName(_user, name) {
  const session = currentSession();
  if (!session) return;
  try {
    await cognito('UpdateUserAttributes', { AccessToken: session.accessToken, UserAttributes: [{ Name: 'name', Value: name }] });
  } catch { /* the profile record is the source of truth */ }
}

export async function signOutUser() {
  const session = currentSession();
  if (session?.accessToken) {
    try { await cognito('GlobalSignOut', { AccessToken: session.accessToken }); } catch { /* signing out locally is what matters */ }
  }
  clearSession();
}

/** Called on /auth/callback. Trades Google's one time code for a session. */
export async function finishGoogleSignIn(search) {
  await finishHostedSignIn(search);
  return getCurrentUser();
}
