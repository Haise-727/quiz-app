import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PiArrowRightBold, PiClockBold, PiEyeBold } from 'react-icons/pi';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/firebase';
import MediaRenderer from '@/components/MediaRenderer';
import HotspotPicker from '@/components/quiz/HotspotPicker';
import MathText from '@/components/MathText';
import { CorrectAnswer, MiniMedia } from '@/components/AnswerReveal';
import PageHeader from '@/components/layout/PageHeader';
import AnimatedNumber from '@/components/game/AnimatedNumber';
import { TINT } from '@/components/game/icons';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getMainMedia, getSubQuestions } from '@/utils/media';
import { ease, rise, stagger } from '@/lib/motion';

/** Which pastel tint a score earns. Pending work is yellow, a strong score green, a weak one red. */
const toneFor = (pct, status) => (status !== 'completed' ? 'yellow' : pct >= 80 ? 'green' : pct >= 60 ? 'blue' : pct >= 40 ? 'yellow' : 'red');
const BAR = { green: 'bg-[hsl(var(--brand))]', blue: 'bg-[hsl(var(--tint-blue-fg))]', yellow: 'bg-[hsl(var(--tint-yellow-fg))]/70', red: 'bg-[hsl(var(--destructive))]/75' };

const Chip = ({ tone = 'neutral', children }) => (
  <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium tabular ${TINT[tone]}`}>{children}</span>
);

// ── Question review card ──────────────────────────────────────────────────────
const QuestionReview = ({ originalQuestion, studentAnswerData, index }) => {
  const isPending = studentAnswerData.status === 'pending_review';
  const isCorrect = !isPending && !!studentAnswerData.isCorrect;
  const isPartial = !isPending && !isCorrect && studentAnswerData.pointsAwarded > 0;
  // A click on the image question shows its picture inside the answer, with the student's mark on it.
  const mainMedia = originalQuestion.type === 'HOTSPOT' ? null : getMainMedia(originalQuestion);

    const statusLabel = isPending ? 'Pending' : isCorrect ? 'Correct' : isPartial ? 'Partial' : 'Incorrect';

  const renderUserAnswer = () => {
    const ua = studentAnswerData.userAnswer;
    if (originalQuestion.type === 'TRUE_FALSE') {
      if (typeof ua !== 'boolean') return <span className="italic text-[hsl(var(--muted-foreground))]">No answer provided</span>;
      return <span>{ua ? 'True' : 'False'}</span>;
    }
    if ((!ua && typeof ua !== 'string') || (Array.isArray(ua) && ua.length === 0))
      return <span className="italic text-[hsl(var(--muted-foreground))]">No answer provided</span>;
    switch (originalQuestion.type) {
      case 'MCQ': {
        const sel = new Set(ua || []);
        if (!sel.size) return <span className="italic text-[hsl(var(--muted-foreground))]">No answer</span>;
        return (
          <div className="flex flex-col gap-1">
            {originalQuestion.mcqData.options.filter(o => sel.has(o.id)).map(o => (
              <div key={o.id} className="flex items-center gap-2">
                <MediaRenderer media={o.media} transform="thumbnail" />
                <span>{o.text}</span>
              </div>
            ))}
          </div>
        );
      }
      case 'NUMERIC':
        return <span className="tabular">{ua}{originalQuestion.numericData?.unit && !String(ua).toLowerCase().includes(String(originalQuestion.numericData.unit).toLowerCase()) ? ` ${originalQuestion.numericData.unit}` : ''}</span>;
      case 'HOTSPOT':
        return <HotspotPicker media={originalQuestion.media} value={ua} />;
      case 'FILL_IN_THE_BLANK': case 'PARAGRAPH':
        return <p className="whitespace-pre-wrap m-0">{ua}</p>;
      case 'REORDER':
        return (
          <ol className="flex flex-col gap-1 list-none p-0 m-0">
            {ua.map((item, i) => (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                <span className="w-5 h-5 rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] flex items-center justify-center text-xs font-medium shrink-0">{i + 1}</span>
                <MediaRenderer media={item.media} transform="thumbnail" />
                {item.text}
              </li>
            ))}
          </ol>
        );
      case 'CATEGORIZE':
        return (
          <div className="grid grid-cols-2 gap-3">
            {originalQuestion.categorizeData.categories.map(cat => (
              <div key={cat.id}>
                <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] mb-1">{cat.name}</p>
                {(ua[cat.id] || []).map(i => (
                  <div key={i.id} className="flex items-center gap-1 text-sm"><MediaRenderer media={i.media} transform="thumbnail" />{i.text}</div>
                ))}
              </div>
            ))}
          </div>
        );
      case 'MATCH_THE_FOLLOWING':
        return (
          <div className="flex flex-col gap-1">
            {originalQuestion.matchData.pairs.map(p => (
              <div key={p.id} className="flex items-center gap-2 text-sm flex-wrap">
                <div className="flex items-center gap-1 bg-[hsl(var(--muted))] px-2 py-0.5 rounded">
                  <MediaRenderer media={p.promptMedia} transform="thumbnail" />{p.prompt}
                </div>
                <span className="text-[hsl(var(--muted-foreground))]">to</span>
                <div className="flex items-center gap-1 bg-[hsl(var(--muted))] px-2 py-0.5 rounded">
                  {ua.pairs?.[p.id]
                    ? <><MediaRenderer media={ua.pairs[p.id].answerMedia} transform="thumbnail" />{ua.pairs[p.id].answerText}</>
                    : <span className="italic text-[hsl(var(--muted-foreground))]">unmatched</span>}
                </div>
              </div>
            ))}
          </div>
        );
      case 'VISUAL_COMPREHENSION': case 'LISTENING_COMPREHENSION':
        // userAnswer is { [subQuestionIndex]: [chosenOptionId, ...] }
        return (
          <div className="flex flex-col gap-3">
            {getSubQuestions(originalQuestion).map((sq, si) => {
              const picked = new Set((ua?.[si] || []).map(String));
              const chosen = (sq.mcqData?.options || []).filter(o => picked.has(String(o.id)));
              return (
                <div key={sq.id ?? si} className="flex flex-col gap-1">
                  <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">{si + 1}. {sq.questionText}</p>
                  {chosen.length === 0
                    ? <span className="italic text-[hsl(var(--muted-foreground))]">No answer</span>
                    : chosen.map(o => (
                        <div key={o.id} className="flex items-center gap-2">
                          <MediaRenderer media={o.media} transform="thumbnail" />
                          <span>{o.text}</span>
                        </div>
                      ))}
                </div>
              );
            })}
          </div>
        );
      default: return <span className="italic text-[hsl(var(--muted-foreground))]">Review unavailable</span>;
    }
  };

  const renderCorrectAnswer = () => {
    switch (originalQuestion.type) {
      case 'TRUE_FALSE':
        return <span>{originalQuestion.trueFalseData.correctAnswer ? 'True' : 'False'}</span>;
      case 'MCQ':
        return (
          <div className="flex flex-col gap-1">
            {originalQuestion.mcqData.correctOptions.map(id => {
              const o = originalQuestion.mcqData.options.find(x => x.id === id);
              return <div key={id} className="flex items-center gap-2"><MediaRenderer media={o?.media} transform="thumbnail" />{o?.text}</div>;
            })}
          </div>
        );
      case 'NUMERIC': case 'HOTSPOT':
        return <CorrectAnswer q={originalQuestion} tone="plain" />;
      case 'FILL_IN_THE_BLANK':
        return <p className="m-0">{originalQuestion.fillBlankData.answers.map(a => a.text).join(' / ')}</p>;
      case 'REORDER':
        return (
          <ol className="flex flex-col gap-1 list-none p-0 m-0">
            {originalQuestion.reorderData.items.map((item, i) => (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                <span className="w-5 h-5 rounded-full bg-[hsl(var(--tint-green))] text-[hsl(var(--tint-green-fg))] flex items-center justify-center text-xs font-medium shrink-0">{i + 1}</span>
                <MiniMedia media={item.media} />
                {item.text}
              </li>
            ))}
          </ol>
        );
      case 'MATCH_THE_FOLLOWING':
        return (
          <div className="flex flex-col gap-1">
            {originalQuestion.matchData.pairs.map(p => (
              <div key={p.id} className="flex items-center gap-2 flex-wrap text-sm">
                <MiniMedia media={p.promptMedia} />{p.prompt} <span className="text-[hsl(var(--muted-foreground))]">to</span> <MiniMedia media={p.answerMedia} />{p.answer}
              </div>
            ))}
          </div>
        );
      case 'CATEGORIZE':
        return (
          <div className="grid grid-cols-2 gap-3">
            {originalQuestion.categorizeData.categories.map(cat => (
              <div key={cat.id}>
                <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] mb-1">{cat.name}</p>
                {originalQuestion.categorizeData.items.filter(i => i.categoryId === cat.id).map(i => (
                  <div key={i.id} className="flex items-center gap-1.5 text-sm"><MiniMedia media={i.media} />{i.text}</div>
                ))}
              </div>
            ))}
          </div>
        );
      case 'VISUAL_COMPREHENSION': case 'LISTENING_COMPREHENSION':
        return <CorrectAnswer q={originalQuestion} tone="plain" />;
      default: return null;
    }
  };

  const tone = isPending ? 'yellow' : isCorrect ? 'green' : isPartial ? 'blue' : 'red';
  return (
    <li className="py-7">
      <div className="flex items-start gap-4">
        <span className="tabular mt-1 w-6 shrink-0 font-mono text-xs text-[hsl(var(--muted-foreground))]">{String(index + 1).padStart(2, '0')}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="min-w-0 flex-1 text-base font-medium leading-snug"><MathText text={originalQuestion.questionText} /></p>
            <Chip tone={tone}>{isPending ? 'Pending' : `${studentAnswerData.pointsAwarded}/${originalQuestion.points} ${statusLabel.toLowerCase()}`}</Chip>
          </div>

          {mainMedia && (
            <div className="mt-4 max-h-48 overflow-hidden rounded-lg">
              <MediaRenderer media={mainMedia} transform="question_main" />
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2.5">
            <div className={`rounded-lg px-4 py-3 ${isCorrect ? TINT.green : 'bg-[hsl(var(--muted))]'}`}>
              <p className="eyebrow mb-1.5">Your answer</p>
              <div className="text-sm text-[hsl(var(--foreground))]">{renderUserAnswer()}</div>
            </div>
            {!isCorrect && !isPending && (
              <div className={`rounded-lg px-4 py-3 ${TINT.green}`}>
                <p className="eyebrow mb-1.5 !text-current opacity-80">Correct answer</p>
                <div className="text-sm">{renderCorrectAnswer()}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const Skeleton = ({ className = '' }) => <div className={`animate-pulse rounded-md bg-[hsl(var(--muted))] ${className}`} />;

export default function YourResults() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedResult, setSelectedResult] = useState(null);
  const [reviewQuiz, setReviewQuiz] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [showWrongOnly, setShowWrongOnly] = useState(false);

  useEffect(() => {
    if (!currentUser) { navigate('/login'); return; }
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'quiz_results'), where('userId', '==', currentUser.uid), orderBy('completedAt', 'desc')));
        // The daily question is saved in the same collection, but it is not a quiz attempt:
        // leave it out so it cannot change the counts, the average, the trend or the list.
        setResults(snap.docs.filter((d) => d.data().kind !== 'daily').map((d) => {
          const data = d.data();
          const display = data.status === 'completed' ? data.finalScore : data.score;
          const pct = data.maxScore > 0 ? Math.round((display / data.maxScore) * 100) : 0;
          const correct = (data.answers || []).filter((a) => a.pointsAwarded > 0).length;
          return { id: d.id, ...data, displayScore: display, percentage: pct, correctCount: correct };
        }));
      } catch { toast.error('We could not load your results.'); }
      finally { setLoading(false); }
    })();
  }, [currentUser, navigate]);

  const openReview = async (result) => {
    setSelectedResult(result); setReviewLoading(true);
    try {
      const snap = await getDoc(doc(db, 'quizzes', result.quizId));
      setReviewQuiz(snap.exists() ? snap.data() : null);
    } catch { setReviewQuiz(null); }
    finally { setReviewLoading(false); }
  };

  const relDate = (ts) => {
    if (!ts?.toDate) return 'Unknown date';
    const d = ts.toDate(), s = Math.round((Date.now() - d) / 1000);
    if (s < 60) return 'Just now';
    const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
    const dy = Math.round(h / 24); if (dy === 1) return 'Yesterday';
    if (dy < 7) return `${dy} days ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const completed = results.filter((r) => r.status === 'completed');
  const avgScore = completed.length ? Math.round(completed.reduce((t, r) => t + r.percentage, 0) / completed.length) : 0;
  const bestScore = completed.length ? Math.max(...completed.map((r) => r.percentage)) : 0;

  // Only finished attempts: one that is still waiting for marking has no real score yet.
  const trend = useMemo(() => [...results].filter((r) => r.status === 'completed').reverse().map((r) => ({
    date: r.completedAt?.toDate ? r.completedAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
    Score: r.percentage,
    title: r.quizTitle,
  })), [results]);

  // Average per subject (or quiz title when there is no subject), best first.
  const breakdown = useMemo(() => {
    const groups = {};
    results.filter((r) => r.status === 'completed').forEach((r) => {
      const key = r.subject || r.quizTitle || 'Unknown';
      groups[key] = groups[key] || { name: key, total: 0, count: 0 };
      groups[key].total += r.percentage; groups[key].count += 1;
    });
    return Object.values(groups).map((g) => ({ name: g.name, avg: Math.round(g.total / g.count), count: g.count })).sort((a, b) => b.avg - a.avg);
  }, [results]);

  const stats = [
    ['Quizzes taken', results.length, (n) => Math.round(n).toString()],
    ['Average score', avgScore, (n) => `${Math.round(n)}%`],
    ['Best score', bestScore, (n) => `${Math.round(n)}%`],
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader serif eyebrow="Student" title="Your results." description={loading ? ' ' : `${results.length} ${results.length === 1 ? 'attempt' : 'attempts'} so far.`} />

      {loading ? (
        <div className="mt-12 space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-48 w-full" /><Skeleton className="h-24 w-full" /></div>
      ) : results.length === 0 ? (
        <div className="mt-12 border-y border-[hsl(var(--border))] py-20 text-center">
          <p className="text-hero text-4xl">Nothing here yet.</p>
          <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">Finish a quiz and your score shows up here.</p>
          <Button className="mt-7" variant="brand" size="lg" onClick={() => navigate('/student/attend-quiz')}>Join a quiz <PiArrowRightBold /></Button>
        </div>
      ) : (
        <motion.div variants={stagger(0.06)} initial="hidden" animate="show">
          <motion.dl variants={rise} className="mt-12 grid grid-cols-3 divide-x divide-[hsl(var(--border))] border-y border-[hsl(var(--border))]">
            {stats.map(([label, value, format], i) => (
              <div key={label} className={`py-5 ${i === 0 ? 'pr-5' : 'px-5'}`}>
                <dt className="eyebrow">{label}</dt>
                <dd className="mt-2 text-3xl font-medium"><AnimatedNumber value={value} format={format} duration={0.8} /></dd>
              </div>
            ))}
          </motion.dl>

          {trend.length >= 2 && (
            <motion.section variants={rise} aria-label="Score trend" className="mt-12">
              <h2 className="text-xl font-semibold tracking-tight">Score trend</h2>
              <div className="mt-5 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis domain={[0, 100]} tickLine={false} axisLine={false} fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      cursor={{ stroke: 'hsl(var(--border))' }}
                      contentStyle={{ background: 'hsl(var(--card))', borderRadius: 10, border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))', fontSize: 12 }}
                      formatter={(value, _n, item) => [`${value}%`, item.payload.title]}
                    />
                    <Line type="monotone" dataKey="Score" stroke="hsl(var(--brand))" strokeWidth={2.5} dot={{ r: 3.5, strokeWidth: 0, fill: 'hsl(var(--brand))' }} activeDot={{ r: 5.5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </motion.section>
          )}

          {breakdown.length >= 2 && (
            <motion.section variants={rise} aria-label="Average by subject" className="mt-12">
              <h2 className="text-xl font-semibold tracking-tight">By subject</h2>
              <ul className="mt-5 space-y-4">
                {breakdown.map((g) => (
                  <li key={g.name}>
                    <div className="flex items-baseline justify-between gap-4 text-sm">
                      <span className="min-w-0 truncate">{g.name}</span>
                      <span className="tabular font-mono text-xs text-[hsl(var(--muted-foreground))]">{g.avg}% over {g.count}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                      <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: g.avg / 100 }} transition={{ duration: 0.8, ease, delay: 0.2 }} className="h-full origin-left rounded-full bg-[hsl(var(--brand))]" />
                    </div>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}

          <motion.section variants={rise} aria-label="All attempts" className="mt-14">
            <h2 className="text-xl font-semibold tracking-tight">All attempts</h2>
            <ul className="mt-4 divide-y divide-[hsl(var(--border))] border-y border-[hsl(var(--border))]">
              {results.map((result) => {
                const tone = toneFor(result.percentage, result.status);
                return (
                  <li key={result.id} className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-3 py-5">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-medium">{result.quizTitle}</h3>
                      <p className="tabular mt-1 flex flex-wrap items-center gap-x-3 font-mono text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                        <span>{relDate(result.completedAt)}</span>
                        <span>{result.correctCount}/{result.answers?.length} right</span>
                        {result.status === 'completed' && <span>{result.finalScore}/{result.maxScore} pts</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      {result.status === 'completed'
                        ? <span className={`tabular w-14 text-right text-2xl font-medium ${tone === 'red' ? 'text-[hsl(var(--destructive))]' : ''}`}>{result.percentage}%</span>
                        : <Chip tone="yellow"><PiClockBold className="mr-1 h-3 w-3" /> Pending</Chip>}
                      <Button variant="outline" size="sm" onClick={() => openReview(result)}><PiEyeBold /> Review</Button>
                    </div>
                    {result.status === 'completed' && (
                      <div className="col-span-2 h-1 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                        <div className={`h-full rounded-full ${BAR[tone]}`} style={{ width: `${result.percentage}%` }} />
                      </div>
                    )}
                    {result.status === 'pending' && (
                      <p className={`col-span-2 rounded-lg px-3 py-2 text-xs ${TINT.yellow}`}>Some answers are waiting for your teacher to mark them.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </motion.section>
        </motion.div>
      )}

      <Dialog open={!!selectedResult} onOpenChange={(open) => { if (!open) { setSelectedResult(null); setReviewQuiz(null); setShowWrongOnly(false); } }}>
        <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden">
          <DialogHeader className="shrink-0 border-b border-[hsl(var(--border))] pb-4">
            <DialogTitle className="text-hero text-3xl font-normal">{selectedResult?.quizTitle}</DialogTitle>
            {selectedResult && (
              <div className="mt-2 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <p className="tabular flex items-center gap-3 text-sm text-[hsl(var(--muted-foreground))]">
                  <Chip tone={toneFor(selectedResult.percentage, selectedResult.status)}>{selectedResult.status === 'completed' ? `${selectedResult.percentage}%` : 'Pending'}</Chip>
                  {selectedResult.correctCount}/{selectedResult.answers?.length} right
                  {selectedResult.status === 'completed' && <>, {selectedResult.finalScore}/{selectedResult.maxScore} pts</>}
                </p>
                {selectedResult.status === 'completed' && (
                  <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
                    <input type="checkbox" checked={showWrongOnly} onChange={(e) => setShowWrongOnly(e.target.checked)} className="h-4 w-4 cursor-pointer accent-[hsl(var(--ink))]" />
                    Only the ones I missed
                  </label>
                )}
              </div>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5">
            {reviewLoading ? (
              <div className="space-y-4 py-6"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
            ) : reviewQuiz && selectedResult ? (() => {
              const rows = reviewQuiz.questions
                .map((q, i) => ({ q, ans: selectedResult.answers[i], origIndex: i }))
                .filter(({ ans }) => {
                  if (!showWrongOnly) return true;
                  const pending = ans?.status === 'pending_review';
                  return pending || !ans?.isCorrect;
                });
              if (rows.length === 0) return <p className="py-14 text-center text-[hsl(var(--muted-foreground))]">You got every one right.</p>;
              return (
                <AnimatePresence initial={false}>
                  <ul className="divide-y divide-[hsl(var(--border))]">
                    {rows.map(({ q, ans, origIndex }) => <QuestionReview key={q.id || origIndex} originalQuestion={q} studentAnswerData={ans} index={origIndex} />)}
                  </ul>
                </AnimatePresence>
              );
            })() : (
              <p className="py-14 text-center text-[hsl(var(--muted-foreground))]">We could not load the details. The quiz may have been deleted.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
