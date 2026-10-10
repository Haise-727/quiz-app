import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  PiArrowRightBold, PiCalendarBlankBold, PiCheckCircleFill, PiPlayCircleBold, PiSpinnerGapBold,
} from 'react-icons/pi';
import { useAuth } from '@/contexts/AuthContext';
import JoinField from '@/components/game/JoinField';
import { useProgress } from '@/contexts/ProgressContext';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/layout/PageHeader';
import AnimatedNumber from '@/components/game/AnimatedNumber';
import BadgeTile from '@/components/game/BadgeTile';
import LevelBadge from '@/components/game/LevelBadge';
import StreakChip from '@/components/game/StreakChip';
import XPBar from '@/components/game/XPBar';
import { joinClassByCode, getStudentClasses } from '@/utils/classHelpers';
import { formatDueDate, getDueStatus, getQuizzesByIds } from '@/utils/assignmentHelpers';
import { findActiveQuizByCode } from '@/utils/quizLookup';
import { pop, rise, stagger } from '@/lib/motion';

const formatTime = (s) => {
  if (s < 60) return `${Math.round(s)}s`;
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
const formatDate = (ts) => (ts?.toDate ? ts.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const greetingFor = (hour) => (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');

/**
 * A big, plain input with a button beside it, used to join a quiz or a live game.
 * Underlined rather than boxed, in mono type so a code is easy to read back.
 */
const Skeleton = ({ className = '' }) => <div className={`animate-pulse rounded-lg bg-[hsl(var(--muted))] ${className}`} />;

export default function StudentDashboard() {
  const navigate = useNavigate();
  const { currentUser: user, displayName } = useAuth();

  // Progress comes from the shared context, so the sidebar and this page always agree.
  const { results, normalized, stats, level, badges } = useProgress();
  const [classes, setClasses] = useState([]);
  const [quizInfo, setQuizInfo] = useState({});
  const [quizError, setQuizError] = useState('');
  const [pinError, setPinError] = useState('');
  const [joiningQuiz, setJoiningQuiz] = useState(false);
  const [classError, setClassError] = useState('');
  const [joiningClass, setJoiningClass] = useState(false);

  const fetchClasses = useCallback(async () => {
    if (!user) return;
    try {
      const list = await getStudentClasses(user.uid);
      setClasses(list);
      const ids = list.flatMap((c) => c.quizIds || []);
      if (ids.length) setQuizInfo(await getQuizzesByIds(ids));
    } catch { /* classes are optional, the page works without them */ }
  }, [user]);

  useEffect(() => { fetchClasses(); }, [fetchClasses]);

  const progress = useMemo(() => {
    if (!results) return null;
    const pcts = normalized.map((r) => (r.maxScore > 0 ? (r.finalScore / r.maxScore) * 100 : 0));
    return {
      stats, level,
      badges: [...badges].sort((a, b) => Number(b.earned) - Number(a.earned) || (b.value / b.target) - (a.value / a.target)),
      taken: normalized.length,
      average: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0,
      best: pcts.length ? Math.round(Math.max(...pcts)) : 0,
      time: results.reduce((sum, r) => sum + (r.timeSpent || 0), 0),
    };
  }, [results, normalized, stats, level, badges]);

  const doneQuizIds = useMemo(() => new Set((results || []).map((r) => r.quizId)), [results]);

  const joinQuiz = async (code) => {
    setQuizError(''); setJoiningQuiz(true);
    try {
      const id = await findActiveQuizByCode(code);
      if (!id) { setQuizError('No active quiz has that code.'); return; }
      navigate(`/student/quiz/${id}`);
    } catch { setQuizError('We could not look that up. Try again.'); } finally { setJoiningQuiz(false); }
  };

  const joinGame = (pin) => {
    if (!/^\d{6}$/.test(pin)) { setPinError('A game PIN is six digits.'); return; }
    setPinError('');
    navigate(`/play/${pin}`);
  };

  const joinClass = async (code) => {
    setClassError(''); setJoiningClass(true);
    try {
      const joined = await joinClassByCode({ code, studentId: user.uid, studentName: displayName || user?.email?.split('@')[0] || 'Student' });
      setClasses((prev) => [...prev, joined]);
      toast.success(`Joined ${joined.name}`);
    } catch (err) { setClassError(err.message || 'We could not join that class.'); } finally { setJoiningClass(false); }
  };

  const first = (displayName || user?.displayName || user?.email?.split('@')[0] || 'there').split(' ')[0];
  const recent = (results || []).slice(0, 6);

  return (
    <div className="mx-auto w-full max-w-5xl pb-16">
      <PageHeader eyebrow="Dashboard" serif title={`${greetingFor(new Date().getHours())}, ${first}.`} />

      {/* Progress: the thing everything else feeds into. */}
      <section aria-label="Your progress" className="mt-10 border-y border-[hsl(var(--border))] py-6">
        {!progress ? (
          <div className="flex items-center gap-5"><Skeleton className="h-16 w-16" /><div className="flex-1"><Skeleton className="h-3 w-48" /><Skeleton className="mt-3 h-2 w-full" /></div></div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <LevelBadge level={progress.level.level} size="lg" />
            <div className="min-w-[14rem] flex-1">
              <XPBar before={progress.level} />
              <p className="tabular mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                {progress.level.span - progress.level.intoLevel} XP to level {progress.level.level + 1}
                <span className="px-2">·</span>{progress.stats.xp.toLocaleString()} XP in total
              </p>
            </div>
            <div className="flex flex-col items-start gap-1.5 sm:items-end">
              <StreakChip days={progress.stats.streak.current} doneToday={progress.stats.streak.doneToday} />
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Best streak {progress.stats.streak.best} {progress.stats.streak.best === 1 ? 'day' : 'days'}</p>
            </div>
          </div>
        )}
      </section>

      {/* Ways in. */}
      <section aria-label="Join" className="mt-10 grid gap-x-12 gap-y-8 sm:grid-cols-2">
        <JoinField label="Quiz code" placeholder="AB12CD" maxLength={6} button="Join quiz" busy={joiningQuiz} error={quizError} onSubmit={joinQuiz} />
        <JoinField label="Live game PIN" placeholder="000000" maxLength={6} inputMode="numeric" button="Join game" error={pinError} onSubmit={joinGame} />
      </section>
      <p className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">
        Or <button type="button" onClick={() => navigate('/student/attend-quiz')} className="font-medium text-[hsl(var(--foreground))] underline underline-offset-4">browse every available quiz</button>.
      </p>

      {/* The numbers. */}
      <dl className="mt-12 grid grid-cols-2 gap-y-6 border-y border-[hsl(var(--border))] sm:grid-cols-4 sm:divide-x sm:divide-[hsl(var(--border))]">
        {[
          ['Quizzes taken', progress?.taken ?? 0, (n) => Math.round(n).toString()],
          ['Average score', progress?.average ?? 0, (n) => `${Math.round(n)}%`],
          ['Best score', progress?.best ?? 0, (n) => `${Math.round(n)}%`],
        ].map(([label, value, format], i) => (
          <div key={label} className={`py-5 ${i === 0 ? 'sm:pr-6' : 'sm:px-6'}`}>
            <dt className="eyebrow">{label}</dt>
            <dd className="mt-2 text-3xl font-medium text-[hsl(var(--foreground))]">{progress ? <AnimatedNumber value={value} format={format} duration={0.8} /> : <Skeleton className="h-8 w-16" />}</dd>
          </div>
        ))}
        <div className="py-5 sm:pl-6">
          <dt className="eyebrow">Time spent</dt>
          <dd className="tabular mt-2 text-3xl font-medium text-[hsl(var(--foreground))]">{progress ? formatTime(progress.time) : <Skeleton className="h-8 w-16" />}</dd>
        </div>
      </dl>

      {/* Badges. */}
      <section aria-label="Badges" className="mt-14">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Badges</h2>
          {progress && <p className="eyebrow tabular">{progress.badges.filter((b) => b.earned).length} of {progress.badges.length} earned</p>}
        </div>
        {progress ? (
          <motion.div variants={stagger(0.04)} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {progress.badges.map((b) => <BadgeTile key={b.id} badge={b} />)}
          </motion.div>
        ) : <Skeleton className="h-32 w-full" />}
      </section>

      {/* Classes. */}
      <section aria-label="Classes" className="mt-14">
        <h2 className="text-xl font-semibold tracking-tight">My classes</h2>
        <div className="mt-5 max-w-md"><JoinField label="Class invite code" placeholder="AB12CD" maxLength={6} button="Join class" busy={joiningClass} error={classError} onSubmit={joinClass} /></div>
        {classes.length === 0 ? (
          <p className="mt-6 text-sm text-[hsl(var(--muted-foreground))]">You are not in a class yet. Ask your teacher for an invite code.</p>
        ) : (
          <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="mt-8 grid gap-x-12 gap-y-10 md:grid-cols-2">
            {classes.map((cls) => (
              <motion.div key={cls.id} variants={rise}>
                <div className="flex items-baseline justify-between gap-3 border-b border-[hsl(var(--border))] pb-2">
                  <p className="truncate font-medium">{cls.name}</p>
                  <span className="shrink-0 font-mono text-xs tracking-widest text-[hsl(var(--muted-foreground))]">{cls.code}</span>
                </div>
                <p className="mt-1.5 text-xs text-[hsl(var(--muted-foreground))]">{cls.teacherName ? `Taught by ${cls.teacherName}` : ''}</p>
                {(cls.quizIds || []).length === 0 ? (
                  <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">Nothing assigned yet.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-[hsl(var(--border))]">
                    {cls.quizIds.map((id) => {
                      const due = cls.dueDates?.[id];
                      const status = getDueStatus(due);
                      const done = doneQuizIds.has(id);
                      return (
                        <li key={id}>
                          <button type="button" onClick={() => navigate(`/student/quiz/${id}`)} className="group flex w-full items-center gap-3 py-3 text-left">
                            {done ? <PiCheckCircleFill className="h-4 w-4 shrink-0 text-[hsl(var(--brand))]" /> : <PiPlayCircleBold className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]" />}
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">{quizInfo[id]?.title || 'Quiz'}</span>
                            {due && (
                              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${status === 'overdue' ? 'bg-[hsl(var(--tint-red))] text-[hsl(var(--tint-red-fg))]' : status === 'due-soon' ? 'bg-[hsl(var(--tint-yellow))] text-[hsl(var(--tint-yellow-fg))]' : 'bg-[hsl(var(--tint-neutral))] text-[hsl(var(--tint-neutral-fg))]'}`}>
                                <PiCalendarBlankBold className="h-3 w-3" />{formatDueDate(due)}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
      </section>

      {/* Recent activity. */}
      <section aria-label="Recent activity" className="mt-14">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Recent activity</h2>
          {recent.length > 0 && <button type="button" onClick={() => navigate('/student/results')} className="text-sm font-medium text-[hsl(var(--foreground))] underline underline-offset-4">View all</button>}
        </div>
        {results === null ? <Skeleton className="mt-4 h-40 w-full" /> : recent.length === 0 ? (
          <motion.div variants={pop} initial="hidden" animate="show" className="mt-6 border-t border-[hsl(var(--border))] pt-8">
            <p className="text-lg font-medium">Nothing here yet.</p>
            <p className="mt-1 text-[hsl(var(--muted-foreground))]">Finish your first quiz to earn XP and start a streak.</p>
            <Button className="mt-5" variant="brand" size="lg" onClick={() => navigate('/student/attend-quiz')}>Find a quiz <PiArrowRightBold /></Button>
          </motion.div>
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))] border-t border-[hsl(var(--border))]">
            {recent.map((r, i) => {
              const pct = r.maxScore > 0 ? Math.round((r.finalScore / r.maxScore) * 100) : 0;
              return (
                <li key={r.completedAt?.seconds ?? i} className="flex items-center gap-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.quizTitle || 'Quiz'}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{formatDate(r.completedAt)}{r.status === 'pending' ? ' · waiting for marking' : ''}</p>
                  </div>
                  <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-[hsl(var(--muted))] sm:block">
                    <div className="h-full rounded-full bg-[hsl(var(--brand))]" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="tabular w-12 text-right text-sm font-medium">{pct}%</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
