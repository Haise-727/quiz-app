import { rpc } from './http';
import { createQuiz, listMyQuizzesUnordered } from './quizzes';
import { buildTestQuiz, isInvalidSchema } from '../devToolsData';

/** The teacher's test helpers on AWS. Same functions as api/firebase/devTools.js. */

export async function clearInvalidQuizzes(teacherUid) {
  const mine = await listMyQuizzesUnordered(teacherUid);
  const invalid = mine.filter((q) => isInvalidSchema(q));
  if (invalid.length) await rpc('removeMany', { col: 'quizzes', ids: invalid.map((q) => q.id) });
  return invalid.length;
}

/** Deletes every result sent to this teacher's quizzes. Irreversible. */
export async function clearAllQuizResults(teacherUid) {
  const results = await rpc('query', { col: 'quiz_results', index: 'byTeacher', value: teacherUid });
  if (results.length) await rpc('removeMany', { col: 'quiz_results', ids: results.map((r) => r.id) });
  return results.length;
}

export async function seedTestQuiz(teacherUid) {
  return createQuiz(buildTestQuiz(teacherUid));
}
