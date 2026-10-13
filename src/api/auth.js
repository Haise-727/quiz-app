import { USE_AWS } from './backend';
import * as fb from './firebase/auth';
import * as aws from './aws/auth';

/**
 * Chooses the backend for this file's functions: AWS when the app was built with VITE_BACKEND=aws, Firebase otherwise.
 * See api/README.md. The two files behind it have the same functions, and the page code never knows which one it got.
 */
const impl = USE_AWS ? aws : fb;

export const watchAuth = (...args) => impl.watchAuth(...args);
export const getCurrentUser = (...args) => impl.getCurrentUser(...args);
export const signInWithGoogle = (...args) => impl.signInWithGoogle(...args);
export const signInWithEmail = (...args) => impl.signInWithEmail(...args);
export const createEmailAccount = (...args) => impl.createEmailAccount(...args);
export const setAuthDisplayName = (...args) => impl.setAuthDisplayName(...args);
export const signOutUser = (...args) => impl.signOutUser(...args);
export { handleAuthError } from './firebase/auth';

/** AWS only: called on /auth/callback after Google sends the person back. Finishes the sign in. */
export const finishGoogleSignIn = (search) => (USE_AWS ? aws.finishGoogleSignIn(search) : Promise.reject(new Error('Not used with Firebase.')));
