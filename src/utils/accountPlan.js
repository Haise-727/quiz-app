/**
 * What belongs to a person, written down once: which collections hold their data, which field
 * ties a document to them, and in what order it is removed. Pure and free of Firebase, so
 * scripts/test-account-plan.mjs can check it. utils/accountData.js carries it out.
 *
 * Deleting an account removes the person's own things and the things that only existed for
 * their quizzes. The profile document goes LAST among the data, and the sign in account after
 * everything, so a failure part way never leaves a profile with no data behind it, or data with
 * no way for its owner to sign in and finish the job.
 */

/** Documents everyone can own. */
const EVERYONE = [
  { collection: 'quiz_results', field: 'userId', label: 'your quiz results' },
  { collection: 'class_enrollments', field: 'studentId', label: 'your class memberships' },
  { collection: 'notifications', field: 'userId', label: 'your notifications' },
];

/** Documents only a teacher owns, plus what was made for their quizzes and classes. */
const TEACHER = [
  { collection: 'quiz_results', field: 'teacherId', label: 'the results students sent to your quizzes' },
  { collection: 'quizzes', field: 'createdBy', label: 'your quizzes' },
  { collection: 'classes', field: 'teacherId', label: 'your classes' },
  { collection: 'question_bank', field: 'teacherId', label: 'your question bank' },
];

/**
 * @param role 'student' or 'teacher'. Anything else is treated as a student, the safer plan.
 * @returns {{ collection: string, field: string, label: string }[]} the steps, in order
 */
export function deletionPlan(role) {
  // quiz_results appears twice on purpose, with different fields: results you took, and results sent to your quizzes.
  return role === 'teacher' ? [...TEACHER, ...EVERYONE] : EVERYONE;
}

/** The collections a data export reads, with the field that names the owner. */
export function exportPlan(role) {
  return [
    { collection: 'quiz_results', field: 'userId', key: 'results' },
    { collection: 'class_enrollments', field: 'studentId', key: 'classMemberships' },
    { collection: 'notifications', field: 'userId', key: 'notifications' },
    ...(role === 'teacher' ? [
      { collection: 'quizzes', field: 'createdBy', key: 'quizzes' },
      { collection: 'classes', field: 'teacherId', key: 'classes' },
      { collection: 'question_bank', field: 'teacherId', key: 'questionBank' },
    ] : []),
  ];
}

/**
 * Makes anything from the database safe to write as JSON: timestamps become ISO text, and
 * nothing that is not plain data survives. A timestamp is recognised by its toDate method.
 */
export function toPlain(value) {
  if (value === null || value === undefined) return null;
  if (typeof value.toDate === 'function') { try { return value.toDate().toISOString(); } catch { return null; } }
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toPlain(v)]));
  return value;
}

/** The sentence a confirmation box uses: "your quiz results, your notifications and your quizzes". */
export function describePlan(plan) {
  const labels = plan.map((s) => s.label);
  if (labels.length <= 1) return labels[0] || '';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}
