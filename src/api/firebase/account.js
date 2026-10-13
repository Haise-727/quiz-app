import { collection, deleteDoc, doc, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { EmailAuthProvider, deleteUser, reauthenticateWithCredential, reauthenticateWithPopup } from 'firebase/auth';
import { auth, db, googleProvider } from '@/firebase';
import { deletionPlan, exportPlan, toPlain } from '@/utils/accountPlan';
import { downloadExport } from '../downloadExport';

export { downloadExport };

/**
 * Letting a person take their data with them and delete their account. What belongs to whom
 * is in utils/accountPlan.js (pure and tested). This file does the Firebase calls.
 *
 * Both need the Firestore rules in firestore.rules: a person may delete their own profile,
 * their own results and their own notifications. If the rules have not been published yet the
 * calls fail with "permission denied" and this says so in plain words.
 */

const BATCH = 400;                 // Firestore allows 500 writes in a batch. This leaves room.

/** Everything the app holds about this person, as plain JSON they can save. */
export async function exportMyData(user, role) {
  const profile = await getDoc(doc(db, 'users', user.uid));
  const out = {
    exportedAt: new Date().toISOString(),
    account: { uid: user.uid, email: user.email, ...toPlain(profile.exists() ? profile.data() : {}) },
  };
  for (const step of exportPlan(role)) {
    const snap = await getDocs(query(collection(db, step.collection), where(step.field, '==', user.uid)));
    out[step.key] = snap.docs.map((d) => ({ id: d.id, ...toPlain(d.data()) }));
  }
  return out;
}


/** Firebase only deletes a sign in that was used a moment ago, so the person proves who they are again first. */
export async function reauthenticate(user, password) {
  const usesPassword = user.providerData.some((p) => p.providerId === 'password');
  if (usesPassword) {
    if (!password) throw new Error('Type your password to confirm.');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  } else {
    await reauthenticateWithPopup(user, googleProvider);
  }
}

/**
 * Delete the person's data and then their sign in. Steps run in the order of the plan, then the
 * profile document, then the sign in account last. `onProgress(label)` is told what is happening.
 */
export async function deleteMyAccount(user, role, { password, onProgress } = {}) {
  await reauthenticate(user, password);

  try {
    for (const step of deletionPlan(role)) {
      onProgress?.(`Removing ${step.label}`);
      const snap = await getDocs(query(collection(db, step.collection), where(step.field, '==', user.uid)));
      for (let i = 0; i < snap.docs.length; i += BATCH) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + BATCH).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }
    onProgress?.('Removing your profile');
    await deleteDoc(doc(db, 'users', user.uid));
  } catch (err) {
    if (err?.code === 'permission-denied') {
      throw new Error('The database would not let us delete everything. The project owner needs to publish the latest rules (firestore.rules). Nothing about your sign in was removed.');
    }
    throw err;
  }

  onProgress?.('Closing your account');
  await deleteUser(auth.currentUser || user);
}
