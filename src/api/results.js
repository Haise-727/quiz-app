import { USE_AWS } from './backend';
import * as fb from './firebase/results';
import * as aws from './aws/results';

/**
 * Chooses the backend for this file's functions: AWS when the app was built with VITE_BACKEND=aws, Firebase otherwise.
 * See api/README.md. The two files behind it have the same functions, and the page code never knows which one it got.
 */
const impl = USE_AWS ? aws : fb;

export const submitResult = (...args) => impl.submitResult(...args);
export const listMyResults = (...args) => impl.listMyResults(...args);
export const listMyResultsUnordered = (...args) => impl.listMyResultsUnordered(...args);
export const listResultsForQuiz = (...args) => impl.listResultsForQuiz(...args);
export const listResultsForTeacher = (...args) => impl.listResultsForTeacher(...args);
export const gradeResult = (...args) => impl.gradeResult(...args);
export const getCompletionCount = (...args) => impl.getCompletionCount(...args);
