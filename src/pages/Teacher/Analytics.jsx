import { downloadCsv, safeFileName } from '../../utils/csv';
import { getUserNames } from '../../api/users';
import { getQuiz } from '../../api/quizzes';
import { listResultsForQuiz } from '../../api/results';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { motion } from 'framer-motion';
import { PiCaretDownBold, PiCaretUpBold, PiDownloadSimpleBold, PiWarningCircleBold } from 'react-icons/pi';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/layout/PageHeader';
import AnimatedNumber from '@/components/game/AnimatedNumber';
import { ease, rise, stagger } from '@/lib/motion';

const Skeleton = ({ className = '' }) => <div className={`animate-pulse rounded-lg bg-[hsl(var(--muted))] ${className}`} />;

/** One thin horizontal bar: a hairline track with a single green fill that grows from the left. */
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

// ── Sort icon helper ──────────────────────────────────────────────────────────
const SortIcon = ({ col, sortBy, sortDir }) => {
  if (sortBy !== col) return <PiCaretDownBold className="h-3 w-3 opacity-0 group-hover:opacity-40" aria-hidden="true" />;
  return sortDir === 'asc' ? <PiCaretUpBold className="h-3 w-3" aria-hidden="true" /> : <PiCaretDownBold className="h-3 w-3" aria-hidden="true" />;
};

// ── Main page ─────────────────────────────────────────────────────────────────
const Analytics = () => {
  const { quizId } = useParams();
  const { currentUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [quiz, setQuiz] = useState(null);
  const [subs, setSubs] = useState([]);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('status');
  const [sortDir, setSortDir] = useState('asc');

  const fetchData = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true); setError('');
    try {
      const quizDoc = await getQuiz(quizId);
      if (!quizDoc || quizDoc.createdBy !== currentUser.uid) {
        setError("Quiz not found or you don't have permission."); setLoading(false); return;
      }
      setQuiz(quizDoc);

      const raw = await listResultsForQuiz(quizId, currentUser.uid);

      // Display names, read one profile at a time (see api/users.js for why).
      const names = await getUserNames(raw.map(s => s.userId));

      setSubs(raw.map(s => ({
        ...s,
        userName: s.userId.startsWith('guest_') ? (s.username || 'Guest') : (names[s.userId] || 'Unknown'),
        isGuest: s.userId.startsWith('guest_'),
        displayScore: s.status === 'completed' ? s.finalScore : s.score,
        pct: s.maxScore > 0
          ? Math.round(((s.status === 'completed' ? s.finalScore : s.score) / s.maxScore) * 100)
          : 0,
      })));
    } catch (err) { setError('Failed to load analytics.'); console.error(err); }
    finally { setLoading(false); }
  }, [quizId, currentUser]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const completed = subs.filter(s => s.status === 'completed');
  const pending   = subs.filter(s => s.status === 'pending');
  const avgScore  = completed.length
    ? Math.round(completed.reduce((a, s) => a + s.pct, 0) / completed.length) : 0;
  const passRate  = completed.length
    ? Math.round(completed.filter(s => s.pct >= 60).length / completed.length * 100) : 0;

  const scoreDistData = [
    { name: '0 to 20%',   min: 0,  max: 20 },
    { name: '21 to 40%',  min: 21, max: 40 },
    { name: '41 to 60%',  min: 41, max: 60 },
    { name: '61 to 80%',  min: 61, max: 80 },
    { name: '81 to 100%', min: 81, max: 101 },
  ].map(b => ({ ...b, count: completed.filter(s => s.pct >= b.min && s.pct < b.max).length }));

  const perQuestionData = quiz?.questions?.map((q, i) => {
    const n = completed.length;
    const correct = n ? completed.filter(s => !!s.answers?.[i]?.isCorrect).length : 0;
    const passRate = n ? Math.round((correct / n) * 100) : 0;
    return {
      name: `Q${i + 1}`,
      passRate,
      label: q.questionText,
      type: q.type,
    };
  }) ?? [];

  // ── Sorting ───────────────────────────────────────────────────────────────
  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };
  const sorted = [...subs].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'name')   cmp = a.userName.localeCompare(b.userName);
    if (sortBy === 'score')  cmp = a.displayScore - b.displayScore;
    if (sortBy === 'pct')    cmp = a.pct - b.pct;
    if (sortBy === 'date')   cmp = (a.completedAt?.toDate?.() || 0) - (b.completedAt?.toDate?.() || 0);
    if (sortBy === 'status') cmp = a.status.localeCompare(b.status);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  // ── CSV export ────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const rows = [
      ['Name', 'Type', 'Score', 'Max', 'Percentage', 'Status', 'Date'],
      ...subs.map(s => [
        s.userName, s.isGuest ? 'Guest' : 'Student',
        s.displayScore, s.maxScore, `${s.pct}%`, s.status,
        s.completedAt?.toDate?.().toLocaleDateString() || '—',
      ]),
    ];
    // Guests type their own names, so this goes through the CSV helper that neutralises
    // spreadsheet formulas (utils/csv.js).
    downloadCsv(`${safeFileName(quiz?.title)}-results.csv`, rows);
  };

  const fmtDate = ts => ts?.toDate?.().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) ?? '-';

  const statusChip = (done) => (done
    ? 'bg-[hsl(var(--tint-green))] text-[hsl(var(--tint-green-fg))]'
    : 'bg-[hsl(var(--tint-yellow))] text-[hsl(var(--tint-yellow-fg))]');

  if (loading) return (
    <div className="mx-auto w-full max-w-5xl pb-16" role="status" aria-label="Loading analytics">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-10 w-80 max-w-full" />
      <Skeleton className="mt-12 h-24 w-full" />
      <Skeleton className="mt-12 h-48 w-full" />
    </div>
  );

  const columns = [
    { key: 'name',   label: 'Student' },
    { key: 'score',  label: 'Score' },
    { key: 'pct',    label: 'Percent' },
    { key: 'status', label: 'Status' },
    { key: 'date',   label: 'Date' },
  ];
  const ariaSort = (key) => (sortBy === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none');

  return (
    <div className="mx-auto w-full max-w-5xl pb-16">
      <PageHeader
        eyebrow="Analytics"
        title={quiz?.title || 'Quiz'}
        actions={subs.length > 0 && (
          <Button variant="outline" onClick={exportCSV}><PiDownloadSimpleBold /> Export CSV</Button>
        )}
      />

      {error && (
        <p role="alert" className="mt-8 flex items-center gap-2 rounded-lg bg-[hsl(var(--tint-red))] px-4 py-3 text-sm text-[hsl(var(--tint-red-fg))]">
          <PiWarningCircleBold className="h-4 w-4 shrink-0" />{error}
        </p>
      )}

      {/* The numbers. */}
      <dl className="mt-10 grid grid-cols-2 gap-y-2 border-y border-[hsl(var(--border))] sm:grid-cols-4 sm:divide-x sm:divide-[hsl(var(--border))]">
        {[
          ['Submissions', subs.length, (n) => Math.round(n).toString()],
          ['Average score', avgScore, (n) => `${Math.round(n)}%`],
          ['Pass rate, 60% or more', passRate, (n) => `${Math.round(n)}%`],
          ['Waiting for review', pending.length, (n) => Math.round(n).toString()],
        ].map(([label, value, format], i) => (
          <div key={label} className={`py-5 ${i === 0 ? 'sm:pr-6' : i === 3 ? 'sm:pl-6' : 'sm:px-6'}`}>
            <dt className="eyebrow">{label}</dt>
            <dd className="mt-2 text-3xl font-medium text-[hsl(var(--foreground))]"><AnimatedNumber value={value} format={format} duration={0.8} /></dd>
          </div>
        ))}
      </dl>

      {/* Charts, drawn as thin bars in one colour. */}
      {subs.length > 0 && (
        <section aria-label="Charts" className="mt-14 grid gap-x-16 gap-y-12 lg:grid-cols-2">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Score spread</h2>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Finished submissions only.</p>
            {completed.length === 0 ? (
              <p className="mt-6 border-t border-[hsl(var(--border))] pt-5 text-sm text-[hsl(var(--muted-foreground))]">Nothing has been marked as finished yet.</p>
            ) : (
              <motion.ul variants={stagger(0.04)} initial="hidden" animate="show" className="mt-5 divide-y divide-[hsl(var(--border))] border-t border-[hsl(var(--border))]">
                {scoreDistData.map((b) => {
                  const share = completed.length ? (b.count / completed.length) * 100 : 0;
                  return (
                    <motion.li key={b.name} variants={rise} className="flex items-center gap-4 py-3">
                      <span className="tabular w-20 shrink-0 text-sm text-[hsl(var(--muted-foreground))]">{b.name}</span>
                      <div className="flex-1"><Bar pct={share} label={`${b.count} of ${completed.length} students scored ${b.name}`} /></div>
                      <span className="tabular w-16 shrink-0 text-right text-sm font-medium">{b.count} {b.count === 1 ? 'student' : 'students'}</span>
                    </motion.li>
                  );
                })}
              </motion.ul>
            )}
          </div>

          <div>
            <h2 className="text-xl font-semibold tracking-tight">Accuracy by question</h2>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Share of students who answered correctly.</p>
            {completed.length === 0 ? (
              <p className="mt-6 border-t border-[hsl(var(--border))] pt-5 text-sm text-[hsl(var(--muted-foreground))]">Nothing has been marked as finished yet.</p>
            ) : (
              <motion.ul variants={stagger(0.04)} initial="hidden" animate="show" className="mt-5 divide-y divide-[hsl(var(--border))] border-t border-[hsl(var(--border))]">
                {perQuestionData.map((d) => (
                  <motion.li key={d.name} variants={rise} className="py-3">
                    <div className="flex items-baseline gap-3">
                      <span className="tabular w-8 shrink-0 text-xs font-medium text-[hsl(var(--muted-foreground))]">{d.name}</span>
                      <span className="min-w-0 flex-1 truncate text-sm" title={d.label}>{d.label}</span>
                      <span className="tabular shrink-0 text-sm font-medium">{d.passRate}%</span>
                    </div>
                    <div className="mt-2 pl-11"><Bar pct={d.passRate} label={`${d.name}: ${d.passRate}% correct`} /></div>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </div>
        </section>
      )}

      {/* Students. */}
      <section aria-label="Student results" className="mt-14">
        <h2 className="mb-2 text-xl font-semibold tracking-tight">Students</h2>

        {subs.length === 0 ? (
          <motion.div variants={rise} initial="hidden" animate="show" className="mt-4 border-t border-[hsl(var(--border))] pt-8">
            <p className="text-lg font-medium">No submissions yet.</p>
            <p className="mt-1 text-[hsl(var(--muted-foreground))]">Results show up here once someone takes this quiz.</p>
          </motion.div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-y border-[hsl(var(--border))]">
                  {columns.map(col => (
                    <th key={col.key} scope="col" aria-sort={ariaSort(col.key)} className="py-3 pr-4 text-left font-normal">
                      <button type="button" onClick={() => handleSort(col.key)} className="eyebrow group inline-flex cursor-pointer items-center gap-1 hover:text-[hsl(var(--foreground))]">
                        {col.label}
                        <SortIcon col={col.key} sortBy={sortBy} sortDir={sortDir} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <motion.tbody variants={stagger(0.03)} initial="hidden" animate="show" className="divide-y divide-[hsl(var(--border))]">
                {sorted.map((s) => (
                  <motion.tr key={s.id} variants={rise}>
                    <td className="py-3.5 pr-4">
                      <span className="font-medium text-[hsl(var(--foreground))]">{s.userName}</span>
                      {s.isGuest && <span className="ml-2 rounded-full bg-[hsl(var(--tint-neutral))] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--tint-neutral-fg))]">Guest</span>}
                    </td>
                    <td className="tabular py-3.5 pr-4 font-medium">
                      {s.displayScore}<span className="font-normal text-[hsl(var(--muted-foreground))]"> of {s.maxScore}</span>
                    </td>
                    <td className="tabular py-3.5 pr-4 font-medium">{s.pct}%</td>
                    <td className="py-3.5 pr-4">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusChip(s.status === 'completed')}`}>
                        {s.status === 'completed' ? 'Done' : 'Pending'}
                      </span>
                    </td>
                    <td className="py-3.5 text-[hsl(var(--muted-foreground))]">{fmtDate(s.completedAt)}</td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default Analytics;
