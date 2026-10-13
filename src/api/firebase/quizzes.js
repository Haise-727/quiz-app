import {
  addDoc, collection, deleteDoc, deleteField, doc, getDoc, getDocs, limit, orderBy, query,
  serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import { db } from '@/firebase';

/**
 * Everything the app does with quizzes. This file is one of the few that talks to the
 * database (see api/README.md), so a page never needs to know it is Firestore underneath.
 *
 * Every function returns plain objects with an `id`, never a Firestore snapshot.
 */

const withId = (d) => ({ id: d.id, ...d.data() });

// ── One quiz ────────────────────────────────────────────────────────────────────────

/** One quiz with its id, or null when it does not exist. May throw when it is not readable. */
export async function getQuiz(id) {
  const snap = await getDoc(doc(db, 'quizzes', id));
  return snap.exists() ? withId(snap) : null;
}

/**
 * Save a new quiz. The server stamps `createdAt`, so callers do not send it.
 * Returns the new quiz id.
 */
export async function createQuiz(data) {
  const ref = await addDoc(collection(db, 'quizzes'), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

/** Change some fields of a quiz. The server stamps `updatedAt`. */
export async function updateQuiz(id, patch) {
  await updateDoc(doc(db, 'quizzes', id), { ...patch, updatedAt: serverTimestamp() });
}

/** Switch a quiz on (students can find it) or off. No `updatedAt`: this is not an edit. */
export async function setQuizActive(id, active) {
  await updateDoc(doc(db, 'quizzes', id), { active });
}

/** Switch whether other teachers may clone a quiz. */
export async function setQuizAllowCloning(id, allowCloning) {
  await updateDoc(doc(db, 'quizzes', id), { allowCloning });
}

/** Put a quiz in a folder. An empty folder takes the quiz out of any folder. */
export async function setQuizFolder(id, folder) {
  await updateDoc(doc(db, 'quizzes', id), { folder: folder ? folder : deleteField() });
}

export async function deleteQuiz(id) {
  await deleteDoc(doc(db, 'quizzes', id));
}

// ── Lists ───────────────────────────────────────────────────────────────────────────

/** A teacher's own quizzes, newest first. */
export async function listMyQuizzes(teacherId) {
  const snap = await getDocs(
    query(collection(db, 'quizzes'), where('createdBy', '==', teacherId), orderBy('createdAt', 'desc'))
  );
  return snap.docs.map(withId);
}

/** A teacher's own quizzes in no particular order (cheaper: needs no index). */
export async function listMyQuizzesUnordered(teacherId) {
  const snap = await getDocs(query(collection(db, 'quizzes'), where('createdBy', '==', teacherId)));
  return snap.docs.map(withId);
}

/** Every quiz that is switched on. */
export async function listActiveQuizzes() {
  const snap = await getDocs(query(collection(db, 'quizzes'), where('active', '==', true)));
  return snap.docs.map(withId);
}

/**
 * The id of the active quiz with this join code, or null. Codes are six letters and digits,
 * so they are tidied the way a person types them (spaces, lower case) before the search.
 */
export async function findActiveQuizByCode(code) {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) return null;
  const snap = await getDocs(query(collection(db, 'quizzes'), where('code', '==', clean), where('active', '==', true)));
  return snap.empty ? null : snap.docs[0].id;
}

/**
 * Up to `max` active quizzes with their ids, for the daily question. The `active == true`
 * filter is also what the database rule needs to allow the read.
 */
export async function getActiveQuizzes(max = 60) {
  const snap = await getDocs(query(collection(db, 'quizzes'), where('active', '==', true), limit(max)));
  return snap.docs.map(withId);
}

/**
 * Quiz documents by id, as { [id]: quiz }, skipping any that cannot be read.
 * getQuizzesByIds asks for them in one query, and the database refuses the WHOLE query if
 * even one quiz in it is switched off. A student's old results often point at such quizzes,
 * so this reads them one by one and simply leaves the unreadable ones out.
 */
export async function getReadableQuizzes(ids) {
  const unique = [...new Set(ids)].filter(Boolean);
  const found = {};
  await Promise.all(unique.map(async (id) => {
    try {
      const snap = await getDoc(doc(db, 'quizzes', id));
      if (snap.exists() && snap.data().active !== false) found[id] = withId(snap);
    } catch { /* not readable: leave it out */ }
  }));
  return found;
}

/** Batch-fetch quiz docs for a list of quiz ids (Firestore 'in' query, 30-item chunks). */
export async function getQuizzesByIds(quizIds) {
  const unique = [...new Set(quizIds)].filter(Boolean);
  const result = {};
  for (let i = 0; i < unique.length; i += 30) {
    const batch = unique.slice(i, i + 30);
    if (!batch.length) continue;
    const snap = await getDocs(query(collection(db, 'quizzes'), where('__name__', 'in', batch)));
    snap.forEach((d) => { result[d.id] = withId(d); });
  }
  return result;
}

/**
 * True when no quiz we are allowed to see already uses this join code: no open (active) quiz,
 * and none of this teacher's own. A draft owned by another teacher is invisible to us, so in
 * theory a code could repeat once that draft is opened. With 36 letters and digits over six
 * places that is about one in two billion, and joining only looks at open quizzes.
 */
export async function isJoinCodeFree(code, ownerId) {
  const [open, mine] = await Promise.all([
    getDocs(query(collection(db, 'quizzes'), where('code', '==', code), where('active', '==', true), limit(1))),
    getDocs(query(collection(db, 'quizzes'), where('code', '==', code), where('createdBy', '==', ownerId), limit(1))),
  ]);
  return open.empty && mine.empty;
}
