import { normalizeResult } from './gamification.js';

/**
 * Progress for guests, who have no account. Their finished quizzes are remembered on
 * this device only (localStorage), so XP, level, streak and badges still work for them.
 * Only a small summary is kept, never answers. If they sign up later this does not
 * follow them, which the reward screen says plainly.
 */
const KEY = 'quizlike_guest_history';
const MAX_KEPT = 300;

function read() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];   // private mode or a corrupted value: start fresh rather than break the page
  }
}

/** Every remembered attempt, in the shape utils/gamification.js expects. */
export const loadGuestResults = () => read().map(normalizeResult).filter(Boolean);

/** Remember one finished attempt and return the full history including it. */
export function saveGuestResult({ quizId, finalScore, maxScore, questionCount, status }) {
  const entry = { quizId, finalScore, maxScore, questionCount, status, completedAt: new Date().toISOString() };
  const history = [...read(), entry].slice(-MAX_KEPT);
  try {
    localStorage.setItem(KEY, JSON.stringify(history));
  } catch {
    // Storage full or blocked. The attempt still counts on this screen, it just will not be remembered.
  }
  // Built from what we meant to store, not read back, so the reward screen is right either way.
  return history.map(normalizeResult).filter(Boolean);
}
