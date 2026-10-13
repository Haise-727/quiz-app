import { db } from '@/firebase';
import { buildTestQuiz, isInvalidSchema } from '../devToolsData';
import {
  collection, getDocs, query, where,
  deleteDoc, doc, addDoc, serverTimestamp,
} from 'firebase/firestore';


export async function clearInvalidQuizzes(teacherUid) {
  const snap = await getDocs(
    query(collection(db, 'quizzes'), where('createdBy', '==', teacherUid))
  );
  const invalid = snap.docs.filter(d => isInvalidSchema(d.data()));
  await Promise.all(invalid.map(d => deleteDoc(doc(db, 'quizzes', d.id))));
  return invalid.length;
}

/** Deletes every quiz_result belonging to quizzes this teacher owns. Irreversible. */
export async function clearAllQuizResults(teacherUid) {
  const snap = await getDocs(
    query(collection(db, 'quiz_results'), where('teacherId', '==', teacherUid))
  );
  await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'quiz_results', d.id))));
  return snap.size;
}

export async function seedTestQuiz(teacherUid) {
  const quiz = { ...buildTestQuiz(teacherUid), createdAt: serverTimestamp() };
  const ref = await addDoc(collection(db, 'quizzes'), quiz);
  return ref.id;
}
