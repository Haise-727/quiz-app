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
import { db } from '../firebase';

/**
 * Clean a question object recursively to ensure it has no non-serializable objects (like File or Blob)
 * before saving to Firestore.
 */
export const cleanQuestionForFirestore = (q) => {
  if (!q) return null;
  const clean = JSON.parse(JSON.stringify(q));

  const cleanMediaNode = (node) => {
    if (!node) return;
    delete node.localMediaFile;
    delete node.localCropData;
    delete node.promptLocalMediaFile;
    delete node.promptLocalCropData;
    delete node.answerLocalMediaFile;
    delete node.answerLocalCropData;
  };

  cleanMediaNode(clean);

  if (clean.mcqData?.options) {
    clean.mcqData.options.forEach(opt => cleanMediaNode(opt));
  }
  if (clean.matchData?.pairs) {
    clean.matchData.pairs.forEach(pair => cleanMediaNode(pair));
  }
  if (clean.categorizeData?.items) {
    clean.categorizeData.items.forEach(item => cleanMediaNode(item));
  }
  if (clean.reorderData?.items) {
    clean.reorderData.items.forEach(item => cleanMediaNode(item));
  }
  if (clean.visualData) {
    cleanMediaNode(clean.visualData);
    if (clean.visualData.subQuestions) {
      clean.visualData.subQuestions = clean.visualData.subQuestions.map(sq => cleanQuestionForFirestore(sq));
    }
  }
  if (clean.listeningData) {
    cleanMediaNode(clean.listeningData);
    if (clean.listeningData.subQuestions) {
      clean.listeningData.subQuestions = clean.listeningData.subQuestions.map(sq => cleanQuestionForFirestore(sq));
    }
  }

  return clean;
};

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
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

/** Delete a bank question by its document ID. */
export const deleteBankQuestion = async (id) => {
  await deleteDoc(doc(db, 'question_bank', id));
};
