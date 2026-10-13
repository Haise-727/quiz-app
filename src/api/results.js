import {
  addDoc, collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import { db } from '@/firebase';

/**
 * Quiz results: what a student or guest handed in, and what a teacher marked.
 * Daily question answers are results too (kind: 'daily').
 *
 * The browser still sends the score today (security.md, finding 2). When this layer moves to a
 * server, `submitResult` is the one place that starts grading there instead.
 */

const withId = (d) => ({ id: d.id, ...d.data() });

/** Save a result. The server stamps `completedAt`. Returns the new result id. */
export async function submitResult(result) {
  const ref = await addDoc(collection(db, 'quiz_results'), { ...result, completedAt: serverTimestamp() });
  return ref.id;
}

/** Everything one signed in person has handed in, newest first. */
export async function listMyResults(userId) {
  const snap = await getDocs(
    query(collection(db, 'quiz_results'), where('userId', '==', userId), orderBy('completedAt', 'desc'))
  );
  return snap.docs.map(withId);
}

/** The same list in no particular order (needs no index). */
export async function listMyResultsUnordered(userId) {
  const snap = await getDocs(query(collection(db, 'quiz_results'), where('userId', '==', userId)));
  return snap.docs.map(withId);
}

/**
 * Every result for one quiz. The teacher id must be in the query itself, not only checked by the
 * database rule: Firestore refuses a list query it cannot prove allowed from the query alone.
 */
export async function listResultsForQuiz(quizId, teacherId) {
  const snap = await getDocs(
    query(collection(db, 'quiz_results'), where('quizId', '==', quizId), where('teacherId', '==', teacherId))
  );
  return snap.docs.map(withId);
}

/** Every result for every quiz a teacher owns. */
export async function listResultsForTeacher(teacherId) {
  const snap = await getDocs(query(collection(db, 'quiz_results'), where('teacherId', '==', teacherId)));
  return snap.docs.map(withId);
}

/** A teacher marks a result. `patch` holds the new scores, answers and status. */
export async function gradeResult(resultId, patch) {
  await updateDoc(doc(db, 'quiz_results', resultId), patch);
}

/**
 * How many of the given students have at least one result for a quiz. Used by the teacher's
 * class view to show "X / Y completed".
 */
export async function getCompletionCount(quizId, studentIds, teacherId) {
  if (!studentIds.length) return 0;
  const completed = new Set();
  for (let i = 0; i < studentIds.length; i += 30) {
    const batch = studentIds.slice(i, i + 30);
    const snap = await getDocs(query(
      collection(db, 'quiz_results'),
      where('quizId', '==', quizId),
      where('teacherId', '==', teacherId),
      where('userId', 'in', batch),
    ));
    snap.forEach((d) => completed.add(d.data().userId));
  }
  return completed.size;
}
