import { reviveAll, revive, rpc } from './http';

/** Classes and enrolments on AWS. Same functions as api/firebase/classes.js. */

const generateCode = () =>
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').sort(() => 0.5 - Math.random()).join('').slice(0, 6);

export const createClass = async ({ name, description, teacherId, teacherName }) => {
  const created = await rpc('create', {
    col: 'classes',
    data: { name, description: description || '', teacherId, teacherName, code: generateCode(), quizIds: [] },
  });
  return created.id;
};

export const getTeacherClasses = async (teacherId) =>
  reviveAll(await rpc('query', { col: 'classes', index: 'byTeacher', value: teacherId }));

export const updateClass = async (classId, { name, description }) => {
  await rpc('update', { col: 'classes', id: classId, set: { name, description } });
};

/** Delete a class and all its enrolment records. */
export const deleteClass = async (classId) => {
  const enrolments = await rpc('query', { col: 'class_enrollments', index: 'byClass', value: classId });
  if (enrolments.length) await rpc('removeMany', { col: 'class_enrollments', ids: enrolments.map((e) => e.id) });
  await rpc('remove', { col: 'classes', id: classId });
};

export const addQuizToClass = async (classId, quizId) => {
  await rpc('update', { col: 'classes', id: classId, add: { quizIds: quizId } });
};

export const removeQuizFromClass = async (classId, quizId) => {
  await rpc('update', { col: 'classes', id: classId, remove: { quizIds: quizId } });
};

export const getClassEnrollments = async (classId) =>
  reviveAll(await rpc('query', { col: 'class_enrollments', index: 'byClass', value: classId }));

/** Enrol a student by invite code. Returns the class. Throws a sentence the screen can show. */
export const joinClassByCode = async ({ code, studentId, studentName }) => {
  const found = await rpc('query', { col: 'classes', index: 'byCode', value: code.trim().toUpperCase(), limit: 5 });
  if (!found.length) throw new Error('No class found with that code. Please check and try again.');
  const cls = found[0];
  const mine = await rpc('query', { col: 'class_enrollments', index: 'byClass', value: cls.id, filters: { studentId } });
  if (mine.length) throw new Error('You are already enrolled in this class.');
  await rpc('create', { col: 'class_enrollments', data: { classId: cls.id, studentId, studentName } });
  return revive(cls);
};

export const getStudentClasses = async (studentId) => {
  const enrolments = await rpc('query', { col: 'class_enrollments', index: 'byStudent', value: studentId });
  const ids = [...new Set(enrolments.map((e) => e.classId))];
  if (!ids.length) return [];
  const found = await rpc('getMany', { col: 'classes', ids });
  return Object.entries(found).map(([id, c]) => ({ ...revive(c), id }));
};

export const leaveClass = async ({ classId, studentId }) => {
  const mine = await rpc('query', { col: 'class_enrollments', index: 'byClass', value: classId, filters: { studentId } });
  if (mine.length) await rpc('removeMany', { col: 'class_enrollments', ids: mine.map((e) => e.id) });
};

/** Set or clear a quiz's due date within a class. Stored as classes/{id}.dueDates[quizId]. */
export const setQuizDueDate = async (classId, quizId, dueDateISO) => {
  await rpc('update', { col: 'classes', id: classId, set: { [`dueDates.${quizId}`]: dueDateISO || null } });
};
