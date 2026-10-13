import { reviveAll, revive, rpc } from './http';

/** Quizzes on AWS. Same functions as api/firebase/quizzes.js. The server stamps createdAt and updatedAt. */

const QUIZZES = 'quizzes';

export async function getQuiz(id) {
  return revive(await rpc('get', { col: QUIZZES, id }));
}

export async function createQuiz(data) {
  const created = await rpc('create', { col: QUIZZES, data });
  return created.id;
}

export async function updateQuiz(id, patch) {
  await rpc('update', { col: QUIZZES, id, set: patch, stamp: ['updatedAt'] });
}

export async function setQuizActive(id, active) {
  await rpc('update', { col: QUIZZES, id, set: { active } });
}

export async function setQuizAllowCloning(id, allowCloning) {
  await rpc('update', { col: QUIZZES, id, set: { allowCloning } });
}

export async function setQuizFolder(id, folder) {
  await rpc('update', folder ? { col: QUIZZES, id, set: { folder } } : { col: QUIZZES, id, unset: ['folder'] });
}

export async function deleteQuiz(id) {
  await rpc('remove', { col: QUIZZES, id });
}

export async function listMyQuizzes(teacherId) {
  return reviveAll(await rpc('query', { col: QUIZZES, index: 'byOwner', value: teacherId, order: 'desc' }));
}

export async function listMyQuizzesUnordered(teacherId) {
  return listMyQuizzes(teacherId);
}

export async function listActiveQuizzes() {
  return reviveAll(await rpc('query', { col: QUIZZES, index: 'byActive', value: 'Y', order: 'desc' }));
}

export async function findActiveQuizByCode(code) {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) return null;
  const found = await rpc('query', { col: QUIZZES, index: 'byCode', value: clean, filters: { active: true }, limit: 5 });
  return found.length ? found[0].id : null;
}

export async function getActiveQuizzes(max = 60) {
  return reviveAll(await rpc('query', { col: QUIZZES, index: 'byActive', value: 'Y', order: 'desc', limit: max }));
}

/** Quizzes by id as { id: quiz }. Ones that cannot be read are left out, and so are quizzes switched off. */
export async function getReadableQuizzes(ids) {
  const found = await getQuizzesByIds(ids);
  return Object.fromEntries(Object.entries(found).filter(([, q]) => q.active !== false));
}

export async function getQuizzesByIds(quizIds) {
  const unique = [...new Set(quizIds)].filter(Boolean);
  const result = {};
  for (let i = 0; i < unique.length; i += 100) {
    const got = await rpc('getMany', { col: QUIZZES, ids: unique.slice(i, i + 100) });
    Object.entries(got).forEach(([id, q]) => { result[id] = revive(q); });
  }
  return result;
}

/** True when no quiz we can see already uses this join code (open quizzes, and the owner's own). */
export async function isJoinCodeFree(code) {
  const taken = await rpc('query', { col: QUIZZES, index: 'byCode', value: code, limit: 5 });
  return taken.length === 0;
}
