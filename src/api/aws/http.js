import { getIdToken } from './session';

/**
 * Calls to our own API (backend/api). Every call is one POST with an `op`, see backend/api/index.mjs.
 *
 * The ID token is attached when someone is signed in. Calls that work without one (reading an open quiz, handing in
 * a guest result) simply go out anonymous when nobody is.
 */
const API_URL = import.meta.env.VITE_AWS_API_URL;

/** Firestore style error codes, because a few screens look for them (account deletion looks for permission-denied). */
const CODES = { 401: 'unauthenticated', 403: 'permission-denied', 404: 'not-found', 503: 'unavailable' };

/** Fields the server stamps with its clock. They come back as ISO text and the pages want Firestore style timestamps. */
const STAMP_FIELDS = ['createdAt', 'updatedAt', 'completedAt', 'joinedAt', 'savedAt'];

/** A time that answers the same calls as a Firestore Timestamp, because the pages already use those. */
export class Stamp {
  constructor(ms) { this.ms = ms; }
  get seconds() { return Math.floor(this.ms / 1000); }
  get nanoseconds() { return (this.ms % 1000) * 1e6; }
  toDate() { return new Date(this.ms); }
  toMillis() { return this.ms; }
  toJSON() { return new Date(this.ms).toISOString(); }
  valueOf() { return this.ms; }
}

/** Turn the time fields of a document into Stamps. `users` is left alone: its dates were always plain text. */
export function revive(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const out = { ...doc };
  for (const f of STAMP_FIELDS) {
    if (typeof out[f] === 'string') { const ms = Date.parse(out[f]); if (!Number.isNaN(ms)) out[f] = new Stamp(ms); }
  }
  return out;
}
export const reviveAll = (docs) => (docs || []).map(revive);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** One call. Retries twice when the database says it is busy (the free tier is small on purpose). */
export async function rpc(op, args = {}) {
  if (!API_URL) throw new Error('The AWS API address is not set (VITE_AWS_API_URL).');
  for (let attempt = 0; ; attempt += 1) {
    const token = await getIdToken();
    let res;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ op, ...args }),
      });
    } catch {
      const e = new Error('We could not reach the server. Check your connection.'); e.code = 'unavailable'; throw e;
    }
    const json = await res.json().catch(() => null);
    if (json?.ok) return json.data;
    if (res.status === 503 && attempt < 2) { await wait(400 * (attempt + 1)); continue; }
    const err = new Error(json?.error || `Request failed (${res.status}).`);
    err.code = CODES[res.status] || 'internal';
    err.status = res.status;
    throw err;
  }
}
