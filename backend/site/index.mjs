/**
 * Serves the built React app from a Lambda Function URL.
 *
 * Why this exists: the normal AWS way (S3 behind CloudFront) needs the account to be verified
 * by AWS Support first. A Function URL is HTTPS, has no charge of its own and sits inside the
 * Lambda free allowance (1 million requests a month), so it is the cheap stand in until
 * CloudFront is allowed. The files live inside the function package, in ./dist.
 *
 * It does what vercel.json does: every path that is not a file returns index.html (the app has
 * its own router), and the same security headers go on every response.
 *
 * Limits to know: a Lambda response can be at most 6 MB. The biggest file in the build is about
 * 1.3 MB, and text is gzipped, so there is room. There is no CDN: every visitor reaches Mumbai.
 */
import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.SITE_ROOT || join(fileURLToPath(new URL('.', import.meta.url)), 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8', '.map': 'application/json', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
};
const TEXTY = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.map']);

// The same headers as vercel.json.
const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

const memory = new Map();   // path -> { body, gzipped } so a warm function does not read or compress twice

/** The file for a request path, or null. Refuses anything that would leave the dist folder. */
export function resolvePath(rawPath) {
  let path;
  try { path = decodeURIComponent(rawPath || '/'); } catch { return null; }
  const full = normalize(join(ROOT, path));
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null;
  return full;
}

async function load(full) {
  if (memory.has(full)) return memory.get(full);
  const body = await readFile(full);
  const entry = { body, gzipped: TEXTY.has(extname(full)) ? gzipSync(body) : null };
  memory.set(full, entry);
  return entry;
}

async function fileOrNull(full) {
  try { return (await stat(full)).isFile() ? full : null; } catch { return null; }
}

export async function handler(event) {
  const method = event?.requestContext?.http?.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    return { statusCode: 405, headers: { Allow: 'GET, HEAD', ...SECURITY }, body: 'Method not allowed' };
  }
  const requested = resolvePath(event?.rawPath);
  if (!requested) return { statusCode: 400, headers: SECURITY, body: 'Bad request' };

  // A real file, or else a path the app's router handles, so index.html. A missing file with an
  // extension (a stale script, an image) is a true 404 and must not be answered with HTML.
  let file = await fileOrNull(requested);
  if (!file) {
    if (extname(requested)) return { statusCode: 404, headers: SECURITY, body: 'Not found' };
    file = await fileOrNull(join(ROOT, 'index.html'));
    if (!file) return { statusCode: 404, headers: SECURITY, body: 'Not found' };
  }

  const ext = extname(file);
  const { body, gzipped } = await load(file);
  const wantsGzip = gzipped && /\bgzip\b/.test(event?.headers?.['accept-encoding'] || '');
  const headers = {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    // Built files have a hash in their name, so they never change. index.html must always be fresh.
    'Cache-Control': file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    Vary: 'Accept-Encoding',
    ...SECURITY,
  };
  if (wantsGzip) headers['Content-Encoding'] = 'gzip';
  const payload = wantsGzip ? gzipped : body;
  return {
    statusCode: 200,
    headers,
    isBase64Encoded: true,
    body: method === 'HEAD' ? '' : payload.toString('base64'),
  };
}
