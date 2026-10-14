// Run with: node --test backend/api/authn-google.test.mjs
// A Google sign in counts as a verified email; a plain account with an unverified email does not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { resetKeyCache, verifyToken } from './authn.mjs';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const CFG = { region: 'ap-south-1', poolId: 'ap-south-1_pool', clientId: 'client1', fetchFn: async () => ({ ok: true, json: async () => ({ keys: [jwk] }) }) };
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(claims) {
  const head = b64u({ alg: 'RS256', kid: 'k1' });
  const body = b64u({ sub: 'u1', email: 'a@b.com', token_use: 'id', aud: 'client1', iss: 'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_pool', exp: Math.floor(Date.now() / 1000) + 600, ...claims });
  return `${head}.${body}.${createSign('RSA-SHA256').update(`${head}.${body}`).sign(privateKey).toString('base64url')}`;
}

test('Google identity counts as verified even when Cognito says email_verified is false', async () => {
  resetKeyCache();
  const g = await verifyToken(token({ email_verified: false, identities: [{ providerName: 'Google', providerType: 'Google' }] }), CFG);
  assert.equal(g.emailVerified, true);
});

test('a plain account is verified only when Cognito says so (moved over from Firebase)', async () => {
  resetKeyCache();
  assert.equal((await verifyToken(token({ email_verified: false }), CFG)).emailVerified, false);
  assert.equal((await verifyToken(token({}), CFG)).emailVerified, false);
  assert.equal((await verifyToken(token({ email_verified: true }), CFG)).emailVerified, true);
  assert.equal((await verifyToken(token({ email_verified: 'true' }), CFG)).emailVerified, true);
  assert.equal((await verifyToken(token({ identities: [{ providerName: 'SomeoneElse' }] }), CFG)).emailVerified, false);
});
