/**
 * classHelpers.js
 * Firestore helpers for the Class Management feature.
 *
 * Firestore schema:
 *   classes/{classId}
 *     name         : string
 *     description  : string
 *     teacherId    : string  (uid)
 *     teacherName  : string
 *     code         : string  (6-char uppercase invite code)
 *     quizIds      : string[]
 *     createdAt    : serverTimestamp
 *
 *   class_enrollments/{enrollmentId}
 *     classId      : string
 *     studentId    : string  (uid)
 *     studentName  : string
 *     joinedAt     : serverTimestamp
 */

import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

// ── Helpers ──────────────────────────────────────────────────────────────────

const generateCode = () =>
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    .split('')
    .sort(() => 0.5 - Math.random())
    .join('')
    .slice(0, 6);

// ── Teacher: Class CRUD ───────────────────────────────────────────────────────

/** Create a new class and return its Firestore ID. */
export const createClass = async ({ name, description, teacherId, teacherName }) => {
  const ref = await addDoc(collection(db, 'classes'), {
    name,
    description: description || '',
    teacherId,
    teacherName,
    code: generateCode(),
    quizIds: [],
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

/** Fetch all classes owned by a teacher. */
export const getTeacherClasses = async (teacherId) => {
  const snap = await getDocs(
    query(collection(db, 'classes'), where('teacherId', '==', teacherId))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

/** Update a class's name / description. */
export const updateClass = async (classId, { name, description }) => {
  await updateDoc(doc(db, 'classes', classId), { name, description });
};

/** Delete a class and all its enrollment records. */
export const deleteClass = async (classId) => {
  // Remove enrollments first
  const enrollSnap = await getDocs(
    query(collection(db, 'class_enrollments'), where('classId', '==', classId))
  );
  await Promise.all(enrollSnap.docs.map(d => deleteDoc(d.ref)));
  await deleteDoc(doc(db, 'classes', classId));
};

/** Add a quiz ID to a class's quizIds array. */
export const addQuizToClass = async (classId, quizId) => {
  await updateDoc(doc(db, 'classes', classId), { quizIds: arrayUnion(quizId) });
};

/** Remove a quiz ID from a class's quizIds array. */
export const removeQuizFromClass = async (classId, quizId) => {
  await updateDoc(doc(db, 'classes', classId), { quizIds: arrayRemove(quizId) });
};

/** Fetch all students enrolled in a class. */
export const getClassEnrollments = async (classId) => {
  const snap = await getDocs(
    query(collection(db, 'class_enrollments'), where('classId', '==', classId))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// ── Student: Enrollment ───────────────────────────────────────────────────────

/**
 * Enroll a student by invite code.
 * Returns the class document on success.
 * Throws a user-friendly Error string on failure.
 */
export const joinClassByCode = async ({ code, studentId, studentName }) => {
  const snap = await getDocs(
    query(collection(db, 'classes'), where('code', '==', code.trim().toUpperCase()))
  );
  if (snap.empty) throw new Error('No class found with that code. Please check and try again.');

  const classDoc = snap.docs[0];
  const classId  = classDoc.id;

  // Check if already enrolled
  const existing = await getDocs(
    query(
      collection(db, 'class_enrollments'),
      where('classId', '==', classId),
      where('studentId', '==', studentId)
    )
  );
  if (!existing.empty) throw new Error('You are already enrolled in this class.');

  await addDoc(collection(db, 'class_enrollments'), {
    classId,
    studentId,
    studentName,
    joinedAt: serverTimestamp(),
  });

  return { id: classId, ...classDoc.data() };
};

/** Fetch all classes a student is enrolled in, with class data. */
export const getStudentClasses = async (studentId) => {
  const enrollSnap = await getDocs(
    query(collection(db, 'class_enrollments'), where('studentId', '==', studentId))
  );
  const classIds = enrollSnap.docs.map(d => d.data().classId);
  if (classIds.length === 0) return [];

  const classPromises = classIds.map(id => getDoc(doc(db, 'classes', id)));
  const classDocs = await Promise.all(classPromises);
  return classDocs
    .filter(d => d.exists())
    .map(d => ({ id: d.id, ...d.data() }));
};

/** Leave a class (student removes their own enrollment). */
export const leaveClass = async ({ classId, studentId }) => {
  const snap = await getDocs(
    query(
      collection(db, 'class_enrollments'),
      where('classId', '==', classId),
      where('studentId', '==', studentId)
    )
  );
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
};
