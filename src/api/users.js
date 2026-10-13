import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase';

// -- Profiles (users/{uid}) ----------------------------------------------------------

/** A person's profile ({ email, role, displayName, createdAt, lastActive }), or null if they have none yet. */
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

/** Make a profile for a new person. Returns it. */
export async function createUserProfile(uid, { email, role, displayName }) {
  const now = new Date().toISOString();
  const profile = { email, role, displayName, createdAt: now, lastActive: now };
  await setDoc(doc(db, 'users', uid), profile);
  return profile;
}

/** Change some profile fields (displayName, role, lastActive). */
export async function updateUserProfile(uid, patch) {
  await updateDoc(doc(db, 'users', uid), patch);
}

/**
 * Display names for a list of user ids, looked up one document at a time.
 *
 * Why one at a time: the obvious way is a single query over the whole list, but a list query
 * on the users collection can only be allowed if EVERY signed in user may list every profile,
 * which hands out every email address (docs/security.md, finding 5). Reading a profile by its
 * id can be allowed without allowing the list. So the rules let you get one profile, and this
 * helper does the getting. It reads a few at a time, remembers what it has read, and returns
 * what it could find: a profile that is missing or unreadable is simply left out.
 *
 * @returns {Promise<Record<string, string>>} uid -> display name (or the part of the email before the @)
 */
const known = new Map();
const CONCURRENCY = 8;

export async function getUserNames(uids) {
  const wanted = [...new Set((uids || []).filter((id) => id && !String(id).startsWith('guest_')))];
  const missing = wanted.filter((id) => !known.has(id));
  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    await Promise.all(missing.slice(i, i + CONCURRENCY).map(async (id) => {
      try {
        const snap = await getDoc(doc(db, 'users', id));
        const data = snap.exists() ? snap.data() : null;
        known.set(id, data ? (data.displayName || String(data.email || '').split('@')[0] || null) : null);
      } catch {
        known.set(id, null);
      }
    }));
  }
  const out = {};
  wanted.forEach((id) => { if (known.get(id)) out[id] = known.get(id); });
  return out;
}
