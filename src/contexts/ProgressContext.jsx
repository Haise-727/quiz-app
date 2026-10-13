import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { listMyResults } from '@/api/results';
import { useAuth } from './AuthContext';
import { badgeProgress, levelInfo, normalizeResult, statsFromResults } from '@/utils/gamification';

/**
 * A signed in student's progress (XP, level, streak, badges), worked out from their saved
 * quiz results. It is loaded once and shared, so the sidebar, the dashboard and the quiz
 * screens all agree and none of them runs its own query. Call refresh() after a quiz is
 * submitted and every screen updates.
 *
 * Results come in two kinds. `results` and `normalized` hold EVERYTHING (the daily
 * question included), which is what XP, the streak and badges are worked out from.
 * `quizResults` and `quizNormalized` hold quiz attempts only, for any screen that shows
 * counts, averages or a list of quizzes, so a daily answer can never distort them.
 * `dailyNormalized` is the daily answers alone.
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
      setRaw(await listMyResults(uid));
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
    if (!raw) return { loading, results: null, normalized: null, quizResults: null, quizNormalized: null, dailyNormalized: null, stats: null, level: null, badges: [], refresh };
    const normalized = raw.map(normalizeResult).filter(Boolean);
    const stats = statsFromResults(normalized);
    const isDaily = (r) => r.kind === 'daily';
    return {
      loading, results: raw, normalized,
      quizResults: raw.filter((r) => !isDaily(r)),
      quizNormalized: normalized.filter((r) => !isDaily(r)),
      dailyNormalized: normalized.filter(isDaily),
      stats, level: levelInfo(stats.xp), badges: badgeProgress(stats), refresh,
    };
  }, [raw, loading, refresh]);

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useProgress = () => useContext(ProgressContext);
