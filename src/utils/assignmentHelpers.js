/**
 * assignmentHelpers.js
 * Due-date display helpers (pure, no database). The database calls are api/classes.js
 * (setQuizDueDate) and api/results.js (getCompletionCount). Due dates live in a map field
 * next to the class's quiz list:
 *
 *   classes/{classId}
 *     quizIds   : string[]
 *     dueDates  : { [quizId]: string (ISO date) | null }
 */

/** Due-date status for display: 'overdue' | 'due-soon' (<=2 days) | 'upcoming' | null (no due date set). */
export const getDueStatus = (dueDateISO) => {
  if (!dueDateISO) return null;
  const due = new Date(dueDateISO);
  const diffDays = (due - new Date()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 2) return 'due-soon';
  return 'upcoming';
};

/** Format an ISO due date as a short, friendly string. */
export const formatDueDate = (dueDateISO) => {
  if (!dueDateISO) return null;
  return new Date(dueDateISO).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
