import { USE_AWS } from './backend';
import * as fb from './firebase/quizzes';
import * as aws from './aws/quizzes';

/**
 * Chooses the backend for this file's functions: AWS when the app was built with VITE_BACKEND=aws, Firebase otherwise.
 * See api/README.md. The two files behind it have the same functions, and the page code never knows which one it got.
 */
const impl = USE_AWS ? aws : fb;

export const getQuiz = (...args) => impl.getQuiz(...args);
export const createQuiz = (...args) => impl.createQuiz(...args);
export const updateQuiz = (...args) => impl.updateQuiz(...args);
export const setQuizActive = (...args) => impl.setQuizActive(...args);
export const setQuizAllowCloning = (...args) => impl.setQuizAllowCloning(...args);
export const setQuizFolder = (...args) => impl.setQuizFolder(...args);
export const deleteQuiz = (...args) => impl.deleteQuiz(...args);
export const listMyQuizzes = (...args) => impl.listMyQuizzes(...args);
export const listMyQuizzesUnordered = (...args) => impl.listMyQuizzesUnordered(...args);
export const listActiveQuizzes = (...args) => impl.listActiveQuizzes(...args);
export const findActiveQuizByCode = (...args) => impl.findActiveQuizByCode(...args);
export const getActiveQuizzes = (...args) => impl.getActiveQuizzes(...args);
export const getReadableQuizzes = (...args) => impl.getReadableQuizzes(...args);
export const getQuizzesByIds = (...args) => impl.getQuizzesByIds(...args);
export const isJoinCodeFree = (...args) => impl.isJoinCodeFree(...args);
