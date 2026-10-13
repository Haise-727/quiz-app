import { reviveAll, rpc } from './http';

/** Quiz results on AWS. Same functions as api/firebase/results.js. The server stamps completedAt. */

const RESULTS = 'quiz_results';

export async function submitResult(result) {
  const created = await rpc('create', { col: RESULTS, data: result });
  return created.id;
}

export async function listMyResults(userId) {
  return reviveAll(await rpc('query', { col: RESULTS, index: 'byUser', value: userId, order: 'desc' }));
}

export async function listMyResultsUnordered(userId) {
  return listMyResults(userId);
}

export async function listResultsForQuiz(quizId, teacherId) {
  return reviveAll(await rpc('query', { col: RESULTS, index: 'byQuiz', value: quizId, filters: { teacherId } }));
}

export async function listResultsForTeacher(teacherId) {
  return reviveAll(await rpc('query', { col: RESULTS, index: 'byTeacher', value: teacherId }));
}

export async function gradeResult(resultId, patch) {
  await rpc('update', { col: RESULTS, id: resultId, set: patch });
}

export async function getCompletionCount(quizId, studentIds) {
  if (!studentIds.length) return 0;
  const out = await rpc('completionCount', { quizId, studentIds });
  return out.count;
}
