import { rpc } from './http';

/** Profiles and display names on AWS. Same functions as api/firebase/users.js. */

const withoutId = (doc) => {
  if (!doc) return null;
  const { id: _id, ...rest } = doc;
  return rest;
};

export async function getUserProfile(uid) {
  return withoutId(await rpc('get', { col: 'users', id: uid }));
}

export async function createUserProfile(uid, { email, role, displayName }) {
  const now = new Date().toISOString();
  return withoutId(await rpc('create', { col: 'users', data: { email, role, displayName, createdAt: now, lastActive: now } }));
}

export async function updateUserProfile(uid, patch) {
  await rpc('update', { col: 'users', id: uid, set: patch });
}

const known = new Map();

/** uid -> display name, for the ids it can find. Guests and missing profiles are left out. */
export async function getUserNames(uids) {
  const wanted = [...new Set((uids || []).filter((id) => id && !String(id).startsWith('guest_')))];
  const missing = wanted.filter((id) => !known.has(id));
  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100);
    let found = {};
    try { found = await rpc('names', { ids: chunk }); } catch { /* leave them out */ }
    chunk.forEach((id) => known.set(id, found[id] || null));
  }
  const out = {};
  wanted.forEach((id) => { if (known.get(id)) out[id] = known.get(id); });
  return out;
}
