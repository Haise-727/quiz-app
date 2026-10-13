import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PiArrowDownRightBold, PiArrowRightBold, PiArrowUpRightBold, PiPlusBold, PiWarningCircleBold } from 'react-icons/pi';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/layout/PageHeader';
import AnimatedNumber from '@/components/game/AnimatedNumber';
import Skeleton from '@/components/teacher/Skeleton';
import { ease, rise, spring, stagger } from '@/lib/motion';
import { getUserNames } from '../../api/users';
import { listResultsForTeacher } from '../../api/results';
import { listMyQuizzesUnordered } from '../../api/quizzes';
import { NEEDS_HELP_BELOW, mostMissed, studentRows, summarize, weeklyActivity } from '../../utils/insights';

/**
 * Insights: what is happening across ALL of a teacher's quizzes, not one at a time.
 *
 * This page only fetches and draws. Every sum (weekly counts, the hardest questions, each
 * student's average and trend) is a pure function in utils/insights.js, which is where the
 * rules are tested (scripts/test-insights.mjs).
 *
 * Two reads, both plain equality queries so they need no index and satisfy the rules:
 *   quiz_results where teacherId == me     every submission to any of my quizzes
 *   quizzes      where createdBy == me     titles and question text for the hardest list
 */

/** The rows of the students table shown before "Show all". */
const STUDENT_PAGE = 12;

/** A thin horizontal bar: a hairline track with one green fill that grows from the left. */
const Bar = ({ pct, label }) => (
  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--muted))]" role="img" aria-label={label}>
    <motion.div
      className="h-full origin-left rounded-full bg-[hsl(var(--brand))]"
      style={{ width: '100%' }}
      initial={{ scaleX: 0 }}
      animate={{ scaleX: Math.max(0, Math.min(100, pct)) / 100 }}
      transition={{ duration: 0.6, ease }}
    />
  </div>
);

/** "12 Oct", the label under a week's bar. */
const weekLabel = (date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** The arrow chip for a trend. A dash when there is none. Colour is never the only signal: the icon and the word say it too. */
const TREND = {
  up:     { Icon: PiArrowUpRightBold,   word: 'Up',     tip: 'Recent results are higher than earlier ones', tone: 'bg-[hsl(var(--tint-green))] text-[hsl(var(--tint-green-fg))]' },
  down:   { Icon: PiArrowDownRightBold, word: 'Down',   tip: 'Recent results are lower than earlier ones',  tone: 'bg-[hsl(var(--tint-red))] text-[hsl(var(--tint-red-fg))]' },
  steady: { Icon: PiArrowRightBold,     word: 'Steady', tip: 'Recent results match earlier ones',           tone: 'bg-[hsl(var(--tint-neutral))] text-[hsl(var(--tint-neutral-fg))]' },
};
const TrendChip = ({ row }) => {
  const t = row.trend && TREND[row.trend];
  if (!t) {
    const why = row.isGuest ? 'Guests cannot be followed across sessions' : 'Needs at least 3 finished results';
    return <span className="text-[hsl(var(--muted-foreground))]" title={why} aria-label={`No trend. ${why}`}>-</span>;
  }
  return (
    <span title={t.tip} aria-label={t.tip} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${t.tone}`}>
      <t.Icon aria-hidden="true" className="h-3 w-3" />
      <span className="hidden sm:inline">{t.word}</span>
    </span>
  );
};

export default function Insights() {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [results, setResults] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [filter, setFilter] = useState('all');           // 'all' | 'help'
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true); setError('');
    try {
      const [rows, myQuizzes] = await Promise.all([
        listResultsForTeacher(currentUser.uid),
        listMyQuizzesUnordered(currentUser.uid),
      ]);
      // A signed in student's result carries no name, so look the names up (one profile at a time).
      const names = await getUserNames(rows.map((r) => r.userId));
      setResults(rows.map((r) => ({ ...r, userName: names[r.userId] || r.userName })));
      setQuizzes(myQuizzes);
    } catch (e) {
      console.error(e);
      setError('We could not load your insights. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);

  // All the sums, worked out once per fetch.
  const summary = useMemo(() => summarize(results), [results]);
  const weeks = useMemo(() => weeklyActivity(results), [results]);
  const hardest = useMemo(() => mostMissed(results, quizzes), [results, quizzes]);
  const students = useMemo(() => studentRows(results), [results]);

  const helpCount = students.filter((s) => s.needsHelp).length;
  const filtered = filter === 'help' ? students.filter((s) => s.needsHelp) : students;
  const visible = showAll ? filtered : filtered.slice(0, STUDENT_PAGE);
  const peak = Math.max(1, ...weeks.map((w) => w.count));

  // ── Loading: skeletons shaped like the page, so nothing jumps when data arrives ──
  if (loading) return (
    <div className="mx-auto w-full max-w-5xl pb-16" role="status" aria-label="Loading insights">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-10 w-56 max-w-full" />
      <Skeleton className="mt-12 h-24 w-full" />
      <div className="mt-14 space-y-3 border-t border-[hsl(var(--border))] pt-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-5xl pb-16">
      <PageHeader eyebrow="Teacher" title="Insights" description="How your students are doing across all of your quizzes." />

      {error && (
        <div role="alert" className="mt-8 flex flex-wrap items-center gap-3 rounded-lg bg-[hsl(var(--tint-red))] px-4 py-3 text-sm text-[hsl(var(--tint-red-fg))]">
          <PiWarningCircleBold className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button size="sm" variant="outline" onClick={load}>Try again</Button>
        </div>
      )}

      {/* Nothing has been submitted yet: say so calmly and point at the next step. */}
      {!error && results.length === 0 ? (
        <motion.div variants={rise} initial="hidden" animate="show" className="mt-10 border-t border-[hsl(var(--border))] pt-8">
          <p className="text-lg font-medium">Nothing to show yet.</p>
          <p className="mt-1 max-w-prose text-[hsl(var(--muted-foreground))]">
            Once students take your quizzes, you will see weekly activity, the questions they miss most, and who could use a hand.
          </p>
          <Button asChild className="mt-5" size="lg"><Link to="/teacher/home"><PiPlusBold /> Create a quiz</Link></Button>
        </motion.div>
      ) : !error && (
        <>
          {/* The numbers. */}
          <dl className="mt-10 grid grid-cols-3 border-y border-[hsl(var(--border))] divide-x divide-[hsl(var(--border))]">
            {[
              ['Submissions', summary.total, (n) => Math.round(n).toString()],
              ['Students', summary.uniqueStudents, (n) => Math.round(n).toString()],
              ['Average score', summary.averageScore ?? 0, (n) => (summary.averageScore === null ? 'None yet' : `${Math.round(n)}%`)],
            ].map(([label, value, format], i) => (
              <div key={label} className={`py-5 ${i === 0 ? 'pr-4 sm:pr-6' : i === 2 ? 'pl-4 sm:pl-6' : 'px-4 sm:px-6'}`}>
                <dt className="eyebrow">{label}</dt>
                <dd className="mt-2 text-2xl font-medium text-[hsl(var(--foreground))] sm:text-3xl"><AnimatedNumber value={value} format={format} duration={0.8} /></dd>
              </div>
            ))}
          </dl>

          {/* 1. Activity: one thin bar per week. */}
          <section aria-label="Activity" className="mt-14">
            <h2 className="text-xl font-semibold tracking-tight">Activity</h2>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Submissions per week, over the last 8 weeks.</p>
            <ol className="mt-6 grid grid-cols-8 gap-1 border-t border-[hsl(var(--border))] pt-5 sm:gap-3">
              {weeks.map((w) => (
                <li key={w.start.getTime()} className="flex flex-col items-center" aria-label={`Week of ${weekLabel(w.start)}: ${w.count} ${w.count === 1 ? 'submission' : 'submissions'}`}>
                  <span className="tabular text-xs font-medium">{w.count}</span>
                  {/* The track is a fixed height; the bar grows up from its floor. */}
                  <div className="mt-2 flex h-28 w-full items-end justify-center" aria-hidden="true">
                    <motion.div
                      className={`w-2 origin-bottom rounded-full ${w.count ? 'bg-[hsl(var(--brand))]' : 'bg-[hsl(var(--muted))]'}`}
                      style={{ height: w.count ? `${Math.max(4, (w.count / peak) * 100)}%` : 3 }}
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ ...spring, delay: 0.05 }}
                    />
                  </div>
                  <span className="tabular mt-2 text-center font-mono text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))] sm:text-xs">{weekLabel(w.start)}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* 2. Most missed questions across all quizzes. */}
          <section aria-label="Most missed questions" className="mt-14">
            <h2 className="text-xl font-semibold tracking-tight">Most missed questions</h2>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Share of students who got the question fully right. Questions that at least 3 students tried.</p>
            {hardest.length === 0 ? (
              <p className="mt-6 border-t border-[hsl(var(--border))] pt-5 text-sm text-[hsl(var(--muted-foreground))]">
                Nothing stands out yet. A question shows up here once 3 students have tried it and some got it wrong.
              </p>
            ) : (
              <motion.ul variants={stagger(0.04)} initial="hidden" animate="show" className="mt-5 divide-y divide-[hsl(var(--border))] border-y border-[hsl(var(--border))]">
                {hardest.map((q) => (
                  <motion.li key={q.key} variants={rise} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4">
                    <div className="min-w-0 flex-1 basis-64">
                      <p className="line-clamp-2 text-sm font-medium text-[hsl(var(--foreground))]" title={q.questionText}>{q.questionText}</p>
                      <p className="mt-1 truncate text-xs text-[hsl(var(--muted-foreground))]">{q.quizTitle}</p>
                    </div>
                    <div className="flex w-full items-center gap-4 sm:w-72">
                      <div className="flex-1"><Bar pct={q.accuracy} label={`${q.accuracy}% fully right, ${q.correct} of ${q.attempts} attempts`} /></div>
                      <span className="tabular w-10 shrink-0 text-right text-sm font-medium">{q.accuracy}%</span>
                      <span className="tabular w-20 shrink-0 text-right text-xs text-[hsl(var(--muted-foreground))]">{q.attempts} {q.attempts === 1 ? 'attempt' : 'attempts'}</span>
                    </div>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </section>

          {/* 3. Students. */}
          <section aria-label="Students" className="mt-14">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Students</h2>
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                  Trend compares the latest 3 results with earlier ones. It needs at least 3 finished results.
                </p>
              </div>
              <div role="group" aria-label="Filter students" className="-mx-1 flex gap-x-1">
                {[['all', `All ${students.length}`], ['help', `Needs help ${helpCount}`]].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setFilter(key); setShowAll(false); }}
                    aria-pressed={filter === key}
                    className={`relative isolate cursor-pointer rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] ${filter === key ? 'font-medium text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
                  >
                    {filter === key && <motion.span layoutId="students-pill" transition={spring} className="absolute inset-0 -z-10 rounded-md bg-[hsl(var(--muted))]" />}
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <p className="mt-6 border-t border-[hsl(var(--border))] pt-5 text-sm text-[hsl(var(--muted-foreground))]">
                {filter === 'help' ? `Nobody averages below ${NEEDS_HELP_BELOW}%. That is good news.` : 'No students yet.'}
              </p>
            ) : (
              <table className="mt-5 w-full text-sm">
                <thead>
                  <tr className="border-y border-[hsl(var(--border))]">
                    <th scope="col" className="eyebrow py-3 pr-3 text-left font-normal">Student</th>
                    <th scope="col" className="eyebrow py-3 pr-3 text-right font-normal">Attempts</th>
                    <th scope="col" className="eyebrow py-3 pr-3 text-right font-normal">Average</th>
                    <th scope="col" className="eyebrow py-3 text-right font-normal">Trend</th>
                  </tr>
                </thead>
                <motion.tbody key={filter} variants={stagger(0.03)} initial="hidden" animate="show" className="divide-y divide-[hsl(var(--border))]">
                  {visible.map((s) => (
                    <motion.tr key={s.id} variants={rise}>
                      <td className="max-w-0 py-3.5 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-[hsl(var(--foreground))]">{s.name}</span>
                          {s.isGuest && <span className="shrink-0 rounded-full bg-[hsl(var(--tint-neutral))] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--tint-neutral-fg))]">Guest</span>}
                        </div>
                      </td>
                      <td className="tabular py-3.5 pr-3 text-right">{s.attempts}</td>
                      <td className="py-3.5 pr-3 text-right">
                        <span className="inline-flex items-center justify-end gap-2">
                          {s.needsHelp && <span className="hidden rounded-full bg-[hsl(var(--tint-red))] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--tint-red-fg))] sm:inline">Needs help</span>}
                          <span className="tabular font-medium">{s.average === null ? '-' : `${s.average}%`}</span>
                        </span>
                      </td>
                      <td className="py-3.5 text-right"><TrendChip row={s} /></td>
                    </motion.tr>
                  ))}
                </motion.tbody>
              </table>
            )}

            {filtered.length > STUDENT_PAGE && (
              <Button variant="ghost" size="sm" className="mt-3" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all ${filtered.length}`}
              </Button>
            )}
          </section>
        </>
      )}
    </div>
  );
}
