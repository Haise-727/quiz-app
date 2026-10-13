import { deletionPlan, exportPlan, toPlain } from '@/utils/accountPlan';
import { downloadExport } from '../downloadExport';
import { cognito, COGNITO_CLIENT_ID, clearSession, currentSession, passwordSignIn } from './session';
import { rpc } from './http';
import { getUserProfile } from './users';

/**
 * Take your data with you, and delete your account, on AWS. Same functions as api/firebase/account.js.
 * What belongs to whom is in utils/accountPlan.js (pure and tested). This file carries it out.
 */

export { downloadExport };

/** Which index finds "everything of this collection that belongs to this person". */
const INDEX_FOR = {
  'quiz_results.userId': 'byUser',
  'quiz_results.teacherId': 'byTeacher',
  'class_enrollments.studentId': 'byStudent',
  'quizzes.createdBy': 'byOwner',
  'classes.teacherId': 'byTeacher',
  'question_bank.teacherId': 'byTeacher',
  'notifications.userId': null,        // a notification's own key is the person, so no index is needed
};

const fetchStep = (step, uid) => rpc('query', { col: step.collection, index: INDEX_FOR[`${step.collection}.${step.field}`], value: uid, limit: 500 });

/** Everything the app holds about this person, as plain JSON they can save. */
export async function exportMyData(user, role) {
  const profile = await getUserProfile(user.uid);
  const out = {
    exportedAt: new Date().toISOString(),
    account: { uid: user.uid, email: user.email, ...toPlain(profile || {}) },
  };
  for (const step of exportPlan(role)) {
    const rows = await fetchStep(step, user.uid);
    out[step.key] = rows.map((d) => ({ ...toPlain(d), id: d.id }));
  }
  return out;
}

/** Deleting an account needs a recent sign in, so the person proves who they are again first. */
export async function reauthenticate(user, password) {
  const usesPassword = user.providerData.some((p) => p.providerId === 'password');
  if (usesPassword) {
    if (!password) throw new Error('Type your password to confirm.');
    await passwordSignIn(user.email, password);
    return;
  }
  const ageSeconds = Date.now() / 1000 - (currentSession() ? (user.authTime || 0) : 0);
  if (ageSeconds > 600) {
    throw new Error('For safety, sign out, sign in with Google again, and then delete your account straight away.');
  }
}

/**
 * Delete the person's data and then their sign in. Steps run in the order of the plan, then the profile,
 * then the sign in account last. `onProgress(label)` is told what is happening.
 */
export async function deleteMyAccount(user, role, { password, onProgress } = {}) {
  await reauthenticate(user, password);

  for (const step of deletionPlan(role)) {
    onProgress?.(`Removing ${step.label}`);
    const rows = await fetchStep(step, user.uid);
    for (let i = 0; i < rows.length; i += 200) {
      await rpc('removeMany', { col: step.collection, ids: rows.slice(i, i + 200).map((d) => d.id) });
    }
  }
  onProgress?.('Removing your profile');
  await rpc('remove', { col: 'users', id: user.uid });

  onProgress?.('Closing your account');
  const session = currentSession();
  if (session?.accessToken) await cognito('DeleteUser', { AccessToken: session.accessToken });
  clearSession();
  void COGNITO_CLIENT_ID;
}
