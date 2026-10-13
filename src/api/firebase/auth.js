import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider } from '@/firebase';

/**
 * Signing in and out. Pages and contexts use these functions and never touch the Firebase SDK.
 * A "user" here is `{ uid, email, displayName, usesPassword }` plus whatever the SDK adds;
 * only those four fields are relied on outside this folder.
 */

/** Call `callback(user | null)` now and every time the signed in person changes. Returns an unsubscribe function. */
export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

/** The signed in person right now, or null. */
export function getCurrentUser() {
  return auth.currentUser;
}

/** Google popup. Returns the user. */
export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signInWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

/** Make a sign in account with an email and password, and give it a display name. */
export async function createEmailAccount(email, password, name) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name || email.split('@')[0] });
  return cred;
}

export async function setAuthDisplayName(user, name) {
  await updateProfile(user, { displayName: name });
}

export async function signOutUser() {
  await signOut(auth);
}

/** Turn a sign in error into a sentence for the person, or null when nothing should be shown. */
export function handleAuthError(error) {
  switch (error?.code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'Incorrect email or password.';
    case 'auth/email-already-in-use': return 'An account with this email already exists.';
    case 'auth/weak-password': return 'Password must be at least 6 characters.';
    case 'auth/invalid-email': return 'Please enter a valid email address.';
    case 'auth/too-many-requests': return 'Too many attempts. Please try again later.';
    case 'auth/popup-closed-by-user': return null; // user cancelled, no error message needed
    default: return error?.message || 'Something went wrong. Please try again.';
  }
}

