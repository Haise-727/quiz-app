import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '@/firebase';

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
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
      if (snap.exists() && snap.data().active !== false) found[id] = { id, ...snap.data() };
    } catch { /* not readable: leave it out */ }
  }));
  return found;
}
