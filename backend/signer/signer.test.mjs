// Run with: node --test backend/signer/signer.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import ImageKit from 'imagekit';
import { authenticationParameters, handler, sign } from './index.mjs';

const config = { publicKey: 'public_x', privateKey: 'private_y', urlEndpoint: 'https://ik.imagekit.io/demo' };

test('signature matches the official imagekit package', () => {
  const sdk = new ImageKit(config);
  const expected = sdk.getAuthenticationParameters('tok-123', 1900000000);
  assert.equal(sign('tok-123', 1900000000, config.privateKey), expected.signature);
});

test('parameters carry token, expiry in 30 minutes, signature and public settings', () => {
  const p = authenticationParameters(config, 1_000_000_000_000, 'abc');
  assert.equal(p.token, 'abc');
  assert.equal(p.expire, 1_000_000_000 + 1800);
  assert.equal(p.signature, sign('abc', p.expire, config.privateKey));
  assert.equal(p.publicKey, 'public_x');
  assert.ok(!JSON.stringify(p).includes('private_y'), 'the private key must never be in the response');
});

const get = (method = 'GET', origin = 'https://app.example') => ({ headers: { origin }, requestContext: { http: { method } } });

test('GET returns 200 with success true and no private key', async () => {
  const res = await handler(get(), {}, { config });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.success, true);
  assert.ok(body.signature && body.token && body.expire);
  assert.ok(!res.body.includes('private_y'));
});

test('OPTIONS is answered for CORS and POST is refused', async () => {
  assert.equal((await handler(get('OPTIONS'), {}, { config })).statusCode, 204);
  assert.equal((await handler(get('POST'), {}, { config })).statusCode, 405);
});

test('missing settings give a 500 that says nothing secret', async () => {
  const ssm = {
    SSMClient: class { send() { return Promise.resolve({ Parameters: [] }); } },
    GetParametersCommand: class {},
  };
  const res = await handler(get(), {}, { ssm });
  assert.equal(res.statusCode, 500);
  assert.equal(JSON.parse(res.body).success, false);
});
