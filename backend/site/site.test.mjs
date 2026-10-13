// Run with: node --test backend/site/site.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const root = mkdtempSync(join(tmpdir(), 'site-'));
mkdirSync(join(root, 'assets'));
writeFileSync(join(root, 'index.html'), '<html>app</html>');
writeFileSync(join(root, 'assets', 'app-abc.js'), 'console.log(1)');
writeFileSync(join(root, 'logo.png'), Buffer.from([137, 80, 78, 71]));
process.env.SITE_ROOT = root;
const { handler, resolvePath } = await import('./index.mjs');

const get = (rawPath, headers = {}, method = 'GET') => handler({ rawPath, headers, requestContext: { http: { method } } });
const text = (res) => Buffer.from(res.body, 'base64');

test('the root and unknown app routes return index.html', async () => {
  for (const p of ['/', '/student/dashboard', '/quiz/abc123']) {
    const res = await get(p);
    assert.equal(res.statusCode, 200);
    assert.equal(text(res).toString(), '<html>app</html>');
    assert.equal(res.headers['Cache-Control'], 'no-cache');
  }
});

test('a built file is served with its type and a long cache', async () => {
  const res = await get('/assets/app-abc.js');
  assert.equal(res.headers['Content-Type'], 'text/javascript; charset=utf-8');
  assert.match(res.headers['Cache-Control'], /immutable/);
});

test('text is gzipped only when the browser accepts it', async () => {
  const plain = await get('/assets/app-abc.js');
  assert.equal(plain.headers['Content-Encoding'], undefined);
  const zipped = await get('/assets/app-abc.js', { 'accept-encoding': 'gzip, br' });
  assert.equal(zipped.headers['Content-Encoding'], 'gzip');
  assert.equal(gunzipSync(text(zipped)).toString(), 'console.log(1)');
  const png = await get('/logo.png', { 'accept-encoding': 'gzip' });
  assert.equal(png.headers['Content-Encoding'], undefined);
});

test('a missing file with an extension is a real 404, not index.html', async () => {
  assert.equal((await get('/assets/old-hash.js')).statusCode, 404);
});

test('paths that climb out of the folder are refused', async () => {
  assert.equal(resolvePath('/../../etc/passwd'), null);
  assert.equal(resolvePath('/%2e%2e/%2e%2e/secret'), null);
  assert.equal((await get('/../../etc/passwd')).statusCode === 200 && text(await get('/../../etc/passwd')).toString() !== '<html>app</html>', false);
});

test('security headers are on every response and only GET and HEAD are allowed', async () => {
  const res = await get('/');
  assert.equal(res.headers['X-Frame-Options'], 'DENY');
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal((await get('/', {}, 'POST')).statusCode, 405);
  assert.equal((await get('/', {}, 'HEAD')).body, '');
});
