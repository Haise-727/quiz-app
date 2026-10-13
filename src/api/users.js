import { USE_AWS } from './backend';
import * as fb from './firebase/users';
import * as aws from './aws/users';

/**
 * Chooses the backend for this file's functions: AWS when the app was built with VITE_BACKEND=aws, Firebase otherwise.
 * See api/README.md. The two files behind it have the same functions, and the page code never knows which one it got.
 */
const impl = USE_AWS ? aws : fb;

export const getUserProfile = (...args) => impl.getUserProfile(...args);
export const createUserProfile = (...args) => impl.createUserProfile(...args);
export const updateUserProfile = (...args) => impl.updateUserProfile(...args);
export const getUserNames = (...args) => impl.getUserNames(...args);
