/**
 * Upload signer: the AWS version of api/auth.js (the Vercel function).
 *
 * ImageKit lets the browser upload a file only with a one-time signature made by someone who
 * holds the private key. This function makes that signature. It is the same recipe as the
 * `imagekit` package's getAuthenticationParameters: token (random), expire (unix seconds),
 * signature = HMAC-SHA1(token + expire, privateKey), written as hex.
 *
 * It uses only Node's own crypto, so there is nothing to bundle. The three ImageKit settings
 * come from SSM Parameter Store (SecureString, free) and are read once per cold start.
 *   /quizlike/imagekit/public-key
 *   /quizlike/imagekit/private-key
 *   /quizlike/imagekit/url-endpoint
 */
import { createHmac, randomUUID } from 'node:crypto';

const PREFIX = process.env.SSM_PREFIX || '/quizlike/imagekit';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());

/** ImageKit's signature for one upload. Pure, so it is tested without AWS. */
export function sign(token, expire, privateKey) {
  return createHmac('sha1', privateKey).update(token + expire).digest('hex');
}

/** The body the browser needs. `now` is injected so tests are repeatable. */
export function authenticationParameters({ publicKey, privateKey, urlEndpoint }, now = Date.now(), token = randomUUID()) {
  const expire = Math.floor(now / 1000) + 30 * 60;     // valid for 30 minutes, like the SDK default
  return { token, expire, signature: sign(token, expire, privateKey), publicKey, urlEndpoint };
}

function corsHeaders(origin) {
  const ok = ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? (ALLOWED_ORIGINS.includes('*') ? '*' : origin) : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

const json = (status, body, origin) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  body: JSON.stringify(body),
});

let cached = null;

async function loadConfig(ssm) {
  if (cached) return cached;
  const { SSMClient, GetParametersCommand } = ssm || await import('@aws-sdk/client-ssm');
  const client = new SSMClient({});
  const names = ['public-key', 'private-key', 'url-endpoint'].map((n) => `${PREFIX}/${n}`);
  const out = await client.send(new GetParametersCommand({ Names: names, WithDecryption: true }));
  const byName = Object.fromEntries((out.Parameters || []).map((p) => [p.Name, p.Value]));
  const config = {
    publicKey: byName[names[0]], privateKey: byName[names[1]], urlEndpoint: byName[names[2]],
  };
  if (!config.publicKey || !config.privateKey || !config.urlEndpoint) throw new Error('missing ImageKit parameters');
  cached = config;
  return config;
}

/** Lambda Function URL handler (payload format 2.0). */
export async function handler(event, _context, deps = {}) {
  const origin = event?.headers?.origin || event?.headers?.Origin || '';
  const method = event?.requestContext?.http?.method || 'GET';
  if (method === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(origin), body: '' };
  if (method !== 'GET') return json(405, { success: false, message: 'Method not allowed. Use GET.' }, origin);
  try {
    const config = deps.config || await loadConfig(deps.ssm);
    return json(200, { success: true, ...authenticationParameters(config) }, origin);
  } catch (err) {
    console.error('Signer failed:', err.message);       // never log the keys, only the reason
    return json(500, { success: false, message: 'Failed to generate authentication parameters' }, origin);
  }
}
