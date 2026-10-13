import { USE_AWS } from './backend';
import * as fb from './firebase/questionBank';
import * as aws from './aws/questionBank';

/**
 * Chooses the backend for this file's functions: AWS when the app was built with VITE_BACKEND=aws, Firebase otherwise.
 * See api/README.md. The two files behind it have the same functions, and the page code never knows which one it got.
 */
const impl = USE_AWS ? aws : fb;

export const saveToBank = (...args) => impl.saveToBank(...args);
export const getBankQuestions = (...args) => impl.getBankQuestions(...args);
export const deleteBankQuestion = (...args) => impl.deleteBankQuestion(...args);
export { cleanQuestionForFirestore } from './firebase/questionBank';
