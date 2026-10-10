import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/firebase';
import { useAuth } from './AuthContext';
import { badgeProgress, levelInfo, normalizeResult, statsFromResults } from '@/utils/gamification';

/**
 * A signed in student's progress (XP, level, streak, badges), worked out from their saved
 * quiz results. It is loaded once and shared, so the sidebar, the dashboard and the quiz
 * screens all agree and none of them runs its own query. Call refresh() after a quiz is
 * submitted and every screen updates.
 *
 * Teachers do not get progress, so nothing is fetched for them.
 */
const ProgressContext = createContext({ loading: false, results: null, stats: null, level: null, badges: [], refresh: async () => {} });

export function ProgressProvider({ children }) {
  const { currentUser, userRole } = useAuth();
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(false);
  const uid = currentUser?.uid;
  const isStudent = userRole === 'student';

  const refresh = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'quiz_results'), where('userId', '==', uid), orderBy('completedAt', 'desc')));
      setRaw(snap.docs.map((d) => d.data()));
    } catch (err) {
      console.error('Could not load progress:', err);
      setRaw((prev) => prev ?? []);       // keep what we had; an empty list is better than a broken page
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    if (uid && isStudent) refresh();
    else setRaw(null);                    // signed out, or a teacher
  }, [uid, isStudent, refresh]);

  const value = useMemo(() => {
    if (!raw) return { loading, results: null, stats: null, level: null, badges: [], refresh };
    const normalized = raw.map(normalizeResult).filter(Boolean);
    const stats = statsFromResults(normalized);
    return { loading, results: raw, normalized, stats, level: levelInfo(stats.xp), badges: badgeProgress(stats), refresh };
  }, [raw, loading, refresh]);

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useProgress = () => useContext(ProgressContext);
