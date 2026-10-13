import { USE_AWS } from './backend';
import * as fb from './firebase/devTools';
import * as aws from './aws/devTools';

/**
 * Chooses the backend for this file's functions: AWS when the app was built with VITE_BACKEND=aws, Firebase otherwise.
 * See api/README.md. The two files behind it have the same functions, and the page code never knows which one it got.
 */
const impl = USE_AWS ? aws : fb;

export const clearInvalidQuizzes = (...args) => impl.clearInvalidQuizzes(...args);
export const clearAllQuizResults = (...args) => impl.clearAllQuizResults(...args);
export const seedTestQuiz = (...args) => impl.seedTestQuiz(...args);
