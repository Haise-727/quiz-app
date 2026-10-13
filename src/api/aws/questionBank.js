import { reviveAll, rpc } from './http';
import { cleanQuestionForFirestore } from '../questionBankData';

/** The teacher's saved questions on AWS. Same functions as api/firebase/questionBank.js. */

export { cleanQuestionForFirestore };

export const saveToBank = async (question, teacherId) => {
  const created = await rpc('create', { col: 'question_bank', data: { ...cleanQuestionForFirestore(question), teacherId } });
  return created.id;
};

/** The document id goes last: the saved question carries its own id, which must not hide it. */
export const getBankQuestions = async (teacherId) => {
  const list = reviveAll(await rpc('query', { col: 'question_bank', index: 'byTeacher', value: teacherId }));
  return list.map((d) => ({ ...d, id: d.id }));
};

export const deleteBankQuestion = async (id) => {
  await rpc('remove', { col: 'question_bank', id });
};
