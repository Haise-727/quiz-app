import { USE_AWS } from './backend';
import * as fb from './firebase/classes';
import * as aws from './aws/classes';

/**
 * Chooses the backend for this file's functions: AWS when the app was built with VITE_BACKEND=aws, Firebase otherwise.
 * See api/README.md. The two files behind it have the same functions, and the page code never knows which one it got.
 */
const impl = USE_AWS ? aws : fb;

export const createClass = (...args) => impl.createClass(...args);
export const getTeacherClasses = (...args) => impl.getTeacherClasses(...args);
export const updateClass = (...args) => impl.updateClass(...args);
export const deleteClass = (...args) => impl.deleteClass(...args);
export const addQuizToClass = (...args) => impl.addQuizToClass(...args);
export const removeQuizFromClass = (...args) => impl.removeQuizFromClass(...args);
export const getClassEnrollments = (...args) => impl.getClassEnrollments(...args);
export const joinClassByCode = (...args) => impl.joinClassByCode(...args);
export const getStudentClasses = (...args) => impl.getStudentClasses(...args);
export const leaveClass = (...args) => impl.leaveClass(...args);
export const setQuizDueDate = (...args) => impl.setQuizDueDate(...args);
