/**
 * assignmentHelpers.js
 * Due-date assignment support, built directly on top of the existing
 * `classes/{classId}.quizIds` array — no new Firestore collection or
 * security rules required. Due dates live in a sibling map field:
 *
 *   classes/{classId}
 *     quizIds   : string[]
 *     dueDates  : { [quizId]: string (ISO date) | null }
 */

import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';

/** Set or clear a quiz's due date within a class. Pass null/empty to clear. */
export const setQuizDueDate = async (classId, quizId, dueDateISO) => {
  await updateDoc(doc(db, 'classes', classId), { [`dueDates.${quizId}`]: dueDateISO || null });
};

/** Batch-fetch quiz docs for a list of quiz IDs (Firestore 'in' query, 30-item chunks). */
export const getQuizzesByIds = async (quizIds) => {
  const unique = [...new Set(quizIds)].filter(Boolean);
  const result = {};
  for (let i = 0; i < unique.length; i += 30) {
    const batch = unique.slice(i, i + 30);
    if (!batch.length) continue;
    const snap = await getDocs(query(collection(db, 'quizzes'), where('__name__', 'in', batch)));
    snap.forEach(d => { result[d.id] = { id: d.id, ...d.data() }; });
  }
  return result;
};

/** Due-date status for display: 'overdue' | 'due-soon' (<=2 days) | 'upcoming' | null (no due date set). */
export const getDueStatus = (dueDateISO) => {
  if (!dueDateISO) return null;
  const due = new Date(dueDateISO);
  const diffDays = (due - new Date()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 2) return 'due-soon';
  return 'upcoming';
};

/** Format an ISO due date as a short, friendly string. */
export const formatDueDate = (dueDateISO) => {
  if (!dueDateISO) return null;
  return new Date(dueDateISO).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/**
 * Count how many of the given students have at least one submission for a quiz.
 * Used by the teacher's class view to show "X / Y completed".
 */
export const getCompletionCount = async (quizId, studentIds) => {
  if (!studentIds.length) return 0;
  let completed = new Set();
  for (let i = 0; i < studentIds.length; i += 30) {
    const batch = studentIds.slice(i, i + 30);
    const snap = await getDocs(query(
      collection(db, 'quiz_results'),
      where('quizId', '==', quizId),
      where('userId', 'in', batch),
    ));
    snap.forEach(d => completed.add(d.data().userId));
  }
  return completed.size;
};
