import { collection, getDocs, query, where } from 'firebase/firestore';
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
