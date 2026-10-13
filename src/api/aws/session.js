/**
 * The sign in session on the AWS backend: the tokens Cognito gave us, kept in the browser, refreshed when they run out.
 *
 *   idToken       who you are. Sent to our API on every call.
 *   accessToken   lets the browser change or delete your own Cognito account.
 *   refreshToken  lasts 30 days and gets a new idToken without asking you to sign in again.
 *
 * Only plain fetch calls to Cognito's public endpoints are used (no SDK), so the bundle stays small.
 * The tokens live in localStorage, the same place Firebase kept its own. See docs/aws-services.md for the trade offs.
 */

export const AWS_REGION = import.meta.env.VITE_COGNITO_REGION || 'ap-south-1';
export const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID;
export const COGNITO_DOMAIN = (import.meta.env.VITE_COGNITO_DOMAIN || '').replace(/\/$/, '');

const KEY = 'quizlike.aws.session';
const listeners = new Set();

// ── Storage ─────────────────────────────────────────────────────────────────────────

export function loadSession() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

export function saveSession(session) {
  try { localStorage.setItem(KEY, JSON.stringify(session)); } catch { /* private mode: the session lasts until the tab closes */ memory = session; }
  notify();
}
let memory = null;

export function clearSession() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  memory = null;
  notify();
}

const current = () => loadSession() || memory;

/** Call `fn` whenever the session changes here or in another tab. Returns a function that stops listening. */
export function onSessionChange(fn) {
  listeners.add(fn);
  const onStorage = (e) => { if (e.key === KEY) fn(); };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(fn); window.removeEventListener('storage', onStorage); };
}
function notify() { listeners.forEach((fn) => { try { fn(); } catch { /* a listener must not break the others */ } }); }

// ── Token details ───────────────────────────────────────────────────────────────────

export function parseJwt(token) {
  try {
    const body = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(atob(body).split('').map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')));
  } catch { return null; }
}

/** The person described by an ID token, in the shape the rest of the app expects. */
export function userFromSession(session) {
  const claims = session && parseJwt(session.idToken);
  if (!claims) return null;
  const google = Array.isArray(claims.identities) && claims.identities.some((i) => /google/i.test(i.providerName || ''));
  const email = claims.email || null;
  return {
    uid: claims.sub,
    email,
    displayName: claims.name || (email ? email.split('@')[0] : null),
    emailVerified: true,
    providerData: [{ providerId: google ? 'google.com' : 'password' }],
    metadata: { creationTime: session.createdAt || new Date((claims.iat || 0) * 1000).toISOString() },
    authTime: claims.auth_time || claims.iat || 0,
  };
}

// ── Talking to Cognito ──────────────────────────────────────────────────────────────

/** Map Cognito's error names onto the codes the app already turns into sentences (api/firebase/auth.js handleAuthError). */
const CODES = {
  NotAuthorizedException: 'auth/invalid-credential',
  UserNotFoundException: 'auth/invalid-credential',
  UsernameExistsException: 'auth/email-already-in-use',
  InvalidPasswordException: 'auth/weak-password',
  InvalidParameterException: 'auth/invalid-email',
  TooManyRequestsException: 'auth/too-many-requests',
  LimitExceededException: 'auth/too-many-requests',
};

export async function cognito(target, body) {
  let res;
  try {
    res = await fetch(`https://cognito-idp.${AWS_REGION}.amazonaws.com/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}` },
      body: JSON.stringify(body),
    });
  } catch {
    const e = new Error('We could not reach the sign in service. Check your connection.'); e.code = 'auth/network-request-failed'; throw e;
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const name = String(json.__type || '').split('#').pop();
    const err = new Error(json.message || 'Sign in failed.');
    err.code = CODES[name] || `cognito/${name || res.status}`;
    throw err;
  }
  return json;
}

function sessionFromResult(result, previous = {}, method = previous.method) {
  return {
    idToken: result.IdToken,
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken || previous.refreshToken,
    expiresAt: Date.now() + (Number(result.ExpiresIn) || 3600) * 1000,
    createdAt: previous.createdAt || new Date().toISOString(),
    method,
  };
}

/** Email and password sign in. Saves the session. */
export async function passwordSignIn(email, password) {
  const out = await cognito('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH', ClientId: COGNITO_CLIENT_ID,
    AuthParameters: { USERNAME: String(email).trim().toLowerCase(), PASSWORD: password },
  });
  if (!out.AuthenticationResult) { const e = new Error('Extra sign in steps are not supported.'); e.code = 'auth/operation-not-allowed'; throw e; }
  const session = sessionFromResult(out.AuthenticationResult, {}, 'password');
  saveSession(session);
  return session;
}

let refreshing = null;

/** A valid ID token, refreshing it first if it is about to expire. Null when nobody is signed in. */
export async function getIdToken() {
  const session = current();
  if (!session) return null;
  if (session.expiresAt - Date.now() > 60_000) return session.idToken;
  if (!session.refreshToken) { clearSession(); return null; }
  refreshing ||= (async () => {
    try {
      const out = await cognito('InitiateAuth', {
        AuthFlow: 'REFRESH_TOKEN_AUTH', ClientId: COGNITO_CLIENT_ID, AuthParameters: { REFRESH_TOKEN: session.refreshToken },
      });
      const next = sessionFromResult(out.AuthenticationResult, session);
      saveSession(next);
      return next.idToken;
    } catch (err) {
      if (err.code !== 'auth/network-request-failed') clearSession();   // a refresh token that is refused means signed out
      return null;
    } finally { refreshing = null; }
  })();
  return refreshing;
}

export function currentSession() { return current(); }

// ── Hosted sign in (Google) with PKCE ───────────────────────────────────────────────

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomString = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

export const callbackUrl = () => `${window.location.origin}/auth/callback`;

/** Send the browser to Cognito's page, which sends it to Google. It comes back to /auth/callback. */
export async function startGoogleSignIn() {
  const verifier = randomString(48);
  const state = randomString(16);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  sessionStorage.setItem('quizlike.pkce', JSON.stringify({ verifier, state }));
  const url = `${COGNITO_DOMAIN}/oauth2/authorize?${new URLSearchParams({
    identity_provider: 'Google', response_type: 'code', client_id: COGNITO_CLIENT_ID,
    redirect_uri: callbackUrl(), scope: 'openid email profile', state,
    code_challenge: challenge, code_challenge_method: 'S256',
  })}`;
  window.location.assign(url);
  return new Promise(() => {});          // the page is leaving, so this never finishes
}

/** Called on /auth/callback. Trades the code for tokens and saves the session. */
export async function finishGoogleSignIn(search) {
  const params = new URLSearchParams(search);
  if (params.get('error')) {
    const e = new Error(params.get('error_description') || 'Google sign in was cancelled.'); e.code = 'auth/popup-closed-by-user'; throw e;
  }
  const code = params.get('code');
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem('quizlike.pkce') || 'null'); } catch { /* ignore */ }
  sessionStorage.removeItem('quizlike.pkce');
  if (!code || !saved || saved.state !== params.get('state')) {
    const e = new Error('That sign in link is not valid any more. Please try again.'); e.code = 'auth/invalid-credential'; throw e;
  }
  const res = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', client_id: COGNITO_CLIENT_ID, code, redirect_uri: callbackUrl(), code_verifier: saved.verifier,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.id_token) {
    const e = new Error('Google sign in did not finish. Please try again.'); e.code = 'auth/invalid-credential'; throw e;
  }
  const session = sessionFromResult({ IdToken: json.id_token, AccessToken: json.access_token, RefreshToken: json.refresh_token, ExpiresIn: json.expires_in }, {}, 'google');
  saveSession(session);
  return session;
}
