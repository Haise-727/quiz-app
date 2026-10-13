/**
 * Who is calling. The browser sends the ID token that Cognito gave it after sign in (a signed JWT). This checks the
 * signature against Cognito's public keys and the claims inside, using only Node's crypto: no library, no secret.
 *
 *   keys    https://cognito-idp.<region>.amazonaws.com/<pool id>/.well-known/jwks.json  (public, cached an hour)
 *   claims  iss is our pool, aud is our app client, token_use is "id", and it has not expired
 *
 * A request with no token, or a bad one, is simply anonymous (caller = null). The rules in config.mjs then decide
 * what an anonymous caller may do (read open quizzes, hand in a guest result) and refuse the rest.
 */
import { createPublicKey, verify } from 'node:crypto';

const b64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

let cachedKeys = null;
let cachedAt = 0;

async function loadKeys({ region, poolId, fetchFn = fetch, force = false, nowMs = Date.now() }) {
  if (!force && cachedKeys && nowMs - cachedAt < 3600_000) return cachedKeys;
  const res = await fetchFn(`https://cognito-idp.${region}.amazonaws.com/${poolId}/.well-known/jwks.json`);
  if (!res.ok) throw new Error(`jwks ${res.status}`);
  const { keys } = await res.json();
  cachedKeys = Object.fromEntries(keys.map((k) => [k.kid, k]));
  cachedAt = nowMs;
  return cachedKeys;
}

export function resetKeyCache() { cachedKeys = null; cachedAt = 0; }

/**
 * @returns {{ uid, email, name, authTime } | null}  null for anything that is not a valid ID token for this pool
 */
export async function verifyToken(token, { region, poolId, clientId, fetchFn, nowMs = Date.now() }) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(b64(parts[0]).toString('utf8'));
    const claims = JSON.parse(b64(parts[1]).toString('utf8'));
    if (header.alg !== 'RS256') return null;

    let keys = await loadKeys({ region, poolId, fetchFn, nowMs });
    if (!keys[header.kid]) keys = await loadKeys({ region, poolId, fetchFn, nowMs, force: true });   // keys rotate
    const jwk = keys[header.kid];
    if (!jwk) return null;

    const ok = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: 'jwk' }), b64(parts[2]));
    if (!ok) return null;

    if (claims.iss !== `https://cognito-idp.${region}.amazonaws.com/${poolId}`) return null;
    if (claims.token_use !== 'id' || claims.aud !== clientId) return null;
    if (!claims.exp || claims.exp * 1000 <= nowMs) return null;
    if (!claims.sub) return null;
    return { uid: claims.sub, email: claims.email || null, name: claims.name || null, authTime: claims.auth_time || claims.iat || 0 };
  } catch {
    return null;
  }
}
