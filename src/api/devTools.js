import { db } from '../firebase';
import {
  collection, getDocs, query, where,
  deleteDoc, doc, addDoc, serverTimestamp,
} from 'firebase/firestore';

const isInvalidSchema = (data) => {
  if (!data.questions?.length) return false;
  const q = data.questions[0];
  return (
    q.text !== undefined ||
    typeof q.correctOption === 'number' ||
    (Array.isArray(q.options) && typeof q.options[0] === 'string')
  );
};

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
  const quiz = {
    title: 'All-Types Test Quiz',
    description: 'Dev seed quiz covering every question type. Safe to delete.',
    createdBy: teacherUid,
    createdAt: serverTimestamp(),
    active: true,
    totalPoints: 80,
    questions: [
      {
        id: 'q1',
        type: 'MCQ',
        questionText: 'What is 2 + 2?',
        points: 10,
        timeLimit: 30,
        mcqData: {
          options: [
            { id: 'a', text: '3', media: null },
            { id: 'b', text: '4', media: null },
            { id: 'c', text: '5', media: null },
            { id: 'd', text: '6', media: null },
          ],
          correctOptions: ['b'],
        },
      },
      {
        id: 'q1b',
        type: 'TRUE_FALSE',
        questionText: 'The Great Wall of China is visible from space with the naked eye.',
        points: 10,
        timeLimit: 20,
        trueFalseData: { correctAnswer: false },
      },
      {
        id: 'q2',
        type: 'MCQ',
        questionText: 'Which are programming languages? (select all that apply)',
        points: 10,
        timeLimit: 30,
        mcqData: {
          options: [
            { id: 'a', text: 'Python', media: null },
            { id: 'b', text: 'HTML', media: null },
            { id: 'c', text: 'JavaScript', media: null },
            { id: 'd', text: 'Photoshop', media: null },
          ],
          correctOptions: ['a', 'c'],
        },
      },
      {
        id: 'q3',
        type: 'FILL_IN_THE_BLANK',
        questionText: 'The capital of France is ___.',
        points: 10,
        timeLimit: 30,
        fillBlankData: {
          answers: [{ text: 'Paris' }, { text: 'paris' }],
        },
      },
      {
        id: 'q4',
        type: 'PARAGRAPH',
        questionText: 'Describe photosynthesis in 2-3 sentences.',
        points: 10,
        timeLimit: 120,
      },
      {
        id: 'q5',
        type: 'MATCH_THE_FOLLOWING',
        questionText: 'Match each country to its capital city.',
        points: 10,
        timeLimit: 60,
        matchData: {
          pairs: [
            { id: 'p1', prompt: 'France', answer: 'Paris', promptMedia: null, answerMedia: null },
            { id: 'p2', prompt: 'Germany', answer: 'Berlin', promptMedia: null, answerMedia: null },
            { id: 'p3', prompt: 'Japan', answer: 'Tokyo', promptMedia: null, answerMedia: null },
          ],
        },
      },
      {
        id: 'q6',
        type: 'REORDER',
        questionText: 'Order these planets from closest to the Sun (innermost first).',
        points: 10,
        timeLimit: 60,
        reorderData: {
          items: [
            { id: 'r1', text: 'Mercury', media: null },
            { id: 'r2', text: 'Venus', media: null },
            { id: 'r3', text: 'Earth', media: null },
            { id: 'r4', text: 'Mars', media: null },
          ],
        },
      },
      {
        id: 'q7',
        type: 'CATEGORIZE',
        questionText: 'Sort each item into the correct category.',
        points: 10,
        timeLimit: 60,
        categorizeData: {
          categories: [
            { id: 'cat1', name: 'Fruits' },
            { id: 'cat2', name: 'Vegetables' },
          ],
          items: [
            { id: 'i1', text: 'Apple', media: null, categoryId: 'cat1' },
            { id: 'i2', text: 'Carrot', media: null, categoryId: 'cat2' },
            { id: 'i3', text: 'Banana', media: null, categoryId: 'cat1' },
            { id: 'i4', text: 'Broccoli', media: null, categoryId: 'cat2' },
          ],
        },
      },
    ],
  };
  const ref = await addDoc(collection(db, 'quizzes'), quiz);
  return ref.id;
}
