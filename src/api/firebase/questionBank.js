import {
  collection,
  addDoc,
  getDocs,
  doc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { cleanQuestionForFirestore } from '../questionBankData';

export { cleanQuestionForFirestore };

/** Save a question to the user's question bank. */
export const saveToBank = async (question, teacherId) => {
  const cleaned = cleanQuestionForFirestore(question);
  // Add metadata for search/sorting
  const bankItem = {
    ...cleaned,
    teacherId,
    savedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, 'question_bank'), bankItem);
  return ref.id;
};

/** Fetch all bank questions for a teacher. */
export const getBankQuestions = async (teacherId) => {
  const snap = await getDocs(
    query(collection(db, 'question_bank'), where('teacherId', '==', teacherId))
  );
  // The document id goes last: the saved question carries its own id, which must not hide it.
  return snap.docs.map(d => ({ ...d.data(), id: d.id }));
};

/** Delete a bank question by its document ID. */
export const deleteBankQuestion = async (id) => {
  await deleteDoc(doc(db, 'question_bank', id));
};
