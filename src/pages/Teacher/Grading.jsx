import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../../firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { PiArrowLeftBold, PiSpinnerGapBold, PiWarningCircleBold } from 'react-icons/pi';
import MediaRenderer from '../../components/MediaRenderer';
import { mediaKind, getMainMedia, getSubQuestions } from '../../utils/media';
import { Button } from '@/components/ui/button';
import { createNotification } from '../../utils/notifications';
import PageHeader from '@/components/layout/PageHeader';
import AnimatedNumber from '@/components/game/AnimatedNumber';
import { rise, spring, stagger } from '@/lib/motion';

const Skeleton = ({ className = '' }) => <div className={`animate-pulse rounded-lg bg-[hsl(var(--muted))] ${className}`} />;

/** Small pastel pill. `tone` is a theme tint name. */
const tones = {
  green: 'bg-[hsl(var(--tint-green))] text-[hsl(var(--tint-green-fg))]',
  yellow: 'bg-[hsl(var(--tint-yellow))] text-[hsl(var(--tint-yellow-fg))]',
  neutral: 'bg-[hsl(var(--tint-neutral))] text-[hsl(var(--tint-neutral-fg))]',
};
const Pill = ({ tone = 'neutral', children, className = '' }) => (
  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]} ${className}`}>{children}</span>
);

// ── Single answer block inside grading modal ──────────────────────────────────
const AnswerBlock = ({ originalQuestion, answer, onPointsChange, isGraded }) => {
  const renderUserAnswer = () => {
    const ua = answer.userAnswer;
    if (originalQuestion.type === 'TRUE_FALSE') {
      if (typeof ua !== 'boolean') return <span className="italic text-[hsl(var(--muted-foreground))]">No answer provided.</span>;
      return <span>{ua ? 'True' : 'False'}</span>;
    }
    if ((!ua && typeof ua !== 'string') || (Array.isArray(ua) && ua.length === 0))
      return <span className="italic text-[hsl(var(--muted-foreground))]">No answer provided.</span>;
    switch (originalQuestion.type) {
      case 'MCQ':
        return (
          <ul className="flex flex-col gap-1">
            {originalQuestion.mcqData.options.filter(o => ua.includes(o.id)).map(o => (
              <li key={o.id} className="flex items-center gap-2 text-sm">
                <MediaRenderer media={o.media} transform="thumbnail" />
                {o.text || 'Picture or sound answer'}
              </li>
            ))}
          </ul>
        );
      case 'FILL_IN_THE_BLANK': case 'PARAGRAPH':
        return <p className="whitespace-pre-wrap text-sm m-0">{ua}</p>;
      case 'REORDER':
        return (
          <ol className="flex flex-col gap-1">
            {ua.map((item, i) => (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                <span className="text-[hsl(var(--muted-foreground))]">{i + 1}.</span>
                <MediaRenderer media={item.media} transform="thumbnail" />{item.text}
              </li>
            ))}
          </ol>
        );
      case 'CATEGORIZE':
        return (
          <div className="flex flex-col gap-2">
            {originalQuestion.categorizeData.categories.map(cat => (
              <div key={cat.id}>
                <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] mb-1">{cat.name}:</p>
                {(ua[cat.id] || []).map(i => (
                  <div key={i.id} className="flex items-center gap-1 text-sm pl-2">
                    <MediaRenderer media={i.media} transform="thumbnail" />{i.text}
                  </div>
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
                <div className="flex items-center gap-1 bg-[hsl(var(--tint-neutral))] text-[hsl(var(--tint-neutral-fg))] px-2 py-0.5 rounded-full text-xs">
                  <MediaRenderer media={p.promptMedia} transform="thumbnail" />{p.prompt}
                </div>
                <span className="text-[hsl(var(--muted-foreground))]">→</span>
                <div className="flex items-center gap-1 bg-[hsl(var(--tint-neutral))] text-[hsl(var(--tint-neutral-fg))] px-2 py-0.5 rounded-full text-xs">
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
                    : chosen.map(o => <div key={o.id} className="flex items-center gap-2"><MediaRenderer media={o.media} transform="thumbnail" /><span>{o.text}</span></div>)}
                </div>
              );
            })}
          </div>
        );
      default: return <span className="italic text-[hsl(var(--muted-foreground))]">Review unavailable.</span>;
    }
  };

  const media = getMainMedia(originalQuestion);
  const inputId = `points-${answer.questionIndex}`;
  const answered = answer.pointsAwarded !== null && answer.pointsAwarded !== undefined;

  return (
    <motion.li variants={rise} className="grid gap-x-10 gap-y-5 py-8 md:grid-cols-[minmax(0,1fr)_12rem]">
      {/* Left: the question and what the student answered. */}
      <div className="min-w-0">
        <p className="eyebrow tabular">Question {answer.questionIndex + 1}</p>
        <p className="mt-2 text-base font-medium leading-relaxed text-[hsl(var(--foreground))]">{originalQuestion.questionText}</p>

        {media && (
          <div className="mt-4 flex">
            <MediaRenderer media={media} transform="question_main"
              className={mediaKind(media) === 'audio' ? 'w-full max-w-md' : 'block max-w-full max-h-56 rounded-lg'} />
          </div>
        )}

        {originalQuestion.paragraphData?.keywords?.length > 0 && (
          <div className="mt-5">
            <p className="eyebrow mb-2">Grading keywords</p>
            <div className="flex flex-wrap gap-1.5">
              {originalQuestion.paragraphData.keywords.map((kw, i) => (
                <Pill key={i} tone="yellow" className="!text-xs">{kw.text}</Pill>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 border-l-2 border-[hsl(var(--border))] pl-4">
          <p className="eyebrow mb-2">Student answer</p>
          <div className="min-h-[2rem] text-sm text-[hsl(var(--foreground))]">
            {renderUserAnswer()}
          </div>
        </div>
      </div>

      {/* Right: the score controls. */}
      <div className="md:pt-1">
        <label htmlFor={inputId} className="eyebrow block">Points</label>
        <div className={`mt-2 flex items-baseline gap-2 border-b-2 pb-1 transition-colors ${isGraded ? 'border-[hsl(var(--border))]' : 'border-[hsl(var(--input))] focus-within:border-[hsl(var(--ink))]'}`}>
          <input
            id={inputId}
            type="number"
            value={answer.pointsAwarded === null || answer.pointsAwarded === undefined ? '' : answer.pointsAwarded}
            onChange={e => onPointsChange(e.target.value)}
            max={originalQuestion.points}
            min="0"
            disabled={isGraded}
            placeholder="0"
            className="tabular w-full min-w-0 border-none bg-transparent text-3xl font-medium text-[hsl(var(--foreground))] outline-none [appearance:textfield] placeholder:text-[hsl(var(--muted-foreground))]/40 disabled:text-[hsl(var(--muted-foreground))] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="tabular shrink-0 text-sm text-[hsl(var(--muted-foreground))]">of {originalQuestion.points}</span>
        </div>
        {!isGraded && !answered && <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">Not graded yet.</p>}
      </div>
    </motion.li>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const Grading = () => {
  const { quizId } = useParams();
  const { currentUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [quizDetails, setQuizDetails] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [error, setError] = useState('');
  const [selectedSub, setSelectedSub] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true); setError('');
    try {
      const quizSnap = await getDoc(doc(db, 'quizzes', quizId));
      if (!quizSnap.exists() || quizSnap.data().createdBy !== currentUser.uid) {
        setError("Quiz not found or you don't have permission."); setLoading(false); return;
      }
      setQuizDetails(quizSnap.data());

      // teacherId must be included in the query itself (not just checked in rules) -
      // Firestore rejects list queries outright if the security rule can't be proven
      // satisfied from the query's own where clauses, even though every matching doc
      // does have the right teacherId.
      const subsSnap = await getDocs(query(
        collection(db, 'quiz_results'),
        where('quizId', '==', quizId),
        where('teacherId', '==', currentUser.uid),
      ));
      const subs = subsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const userIds = [...new Set(subs.map(s => s.userId).filter(id => !id.startsWith('guest_')))];
      const names = {};
      if (userIds.length) {
        const usersSnap = await getDocs(query(collection(db, 'users'), where('__name__', 'in', userIds)));
        usersSnap.forEach(d => { names[d.id] = d.data().displayName || d.data().email; });
      }

      const enriched = subs.map(s => ({
        ...s,
        userName: s.userId.startsWith('guest_')
          ? (s.username || 'Guest')
          : (names[s.userId] || 'Unknown Student'),
        isGuest: s.userId.startsWith('guest_'),
      }));
      enriched.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (b.status === 'pending' && a.status !== 'pending') return 1;
        return (b.completedAt?.toDate?.() || 0) - (a.completedAt?.toDate?.() || 0);
      });
      setSubmissions(enriched);
    } catch (err) { setError('Failed to load submissions.'); console.error(err); }
    finally { setLoading(false); }
  }, [quizId, currentUser]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openModal = (sub) => {
    setSelectedSub({ ...sub, answers: sub.answers.map((a, i) => ({ ...a, questionIndex: i })) });
  };

  const handlePointsChange = (qi, pts) => {
    const val = pts === '' ? null : parseInt(pts, 10);
    const max = quizDetails.questions[qi].points;
    setSelectedSub(cur => ({
      ...cur,
      answers: cur.answers.map((a, i) =>
        i === qi ? { ...a, pointsAwarded: val === null ? null : (!isNaN(val) && val >= 0 && val <= max ? val : a.pointsAwarded) } : a
      ),
    }));
  };

  const handleSave = async () => {
    if (!selectedSub) return;
    setSaving(true);
    const total = selectedSub.answers.reduce((s, a) => s + (a.pointsAwarded || 0), 0);
    // isCorrect is recomputed here (not just left as whatever auto-grading set) because
    // PARAGRAPH questions never get a real isCorrect from auto-grading - they're always
    // pending_review until a teacher scores them here. Without this, a fully-marked essay
    // would still show as "Incorrect" everywhere that trusts isCorrect.
    const updatedAnswers = selectedSub.answers.map((a, i) => {
      const maxPts = quizDetails.questions[i]?.points ?? 0;
      const pts = a.pointsAwarded ?? 0;
      return { ...a, status: 'manually_graded', pointsAwarded: pts, isCorrect: maxPts > 0 && pts >= maxPts };
    });
    try {
      await updateDoc(doc(db, 'quiz_results', selectedSub.id), {
        score: total, finalScore: total, answers: updatedAnswers, status: 'completed',
      });
      toast.success('Grade saved');

      // Notify the student
      if (selectedSub.userId && !selectedSub.userId.startsWith('guest_')) {
        try {
          await createNotification(
            selectedSub.userId,
            `Your quiz "${quizDetails.title}" has been graded. Final score: ${total}/${selectedSub.maxScore}`,
            'grade_released',
            { quizId, resultId: selectedSub.id }
          );
        } catch (notifErr) {
          console.error("Error creating grade released notification:", notifErr);
        }
      }

      setSelectedSub(null);
      fetchAll();
    } catch (err) { toast.error('Could not save grade.'); console.error(err); }
    finally { setSaving(false); }
  };

  const pendingCount = submissions.filter(s => s.status === 'pending').length;
  const pendingList = submissions.filter(s => s.status === 'pending');
  const doneList = submissions.filter(s => s.status === 'completed');

  // Bring the grading view to the top when one opens, so a long list never leaves you scrolled away.
  const viewRef = useRef(null);
  const openId = selectedSub?.id;
  useEffect(() => { if (openId) viewRef.current?.scrollIntoView({ block: 'start' }); }, [openId]);

  if (loading) return (
    <div className="mx-auto w-full max-w-5xl pb-16" role="status" aria-label="Loading submissions">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-10 w-80 max-w-full" />
      <Skeleton className="mt-12 h-48 w-full" />
    </div>
  );

  // Grading view: one submission, answer on the left and score controls on the right.
  if (selectedSub) {
    const isGraded = selectedSub.status === 'completed';
    const total = selectedSub.answers.reduce((n, a) => n + (a.pointsAwarded || 0), 0);
    const marked = selectedSub.answers.filter(a => a.pointsAwarded !== null && a.pointsAwarded !== undefined).length;
    const count = selectedSub.answers.length;
    return (
      <div ref={viewRef} className="mx-auto w-full max-w-5xl scroll-mt-4 pb-16">
        <button type="button" onClick={() => setSelectedSub(null)}
          className="mb-6 inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
          <PiArrowLeftBold className="h-3.5 w-3.5" /> Back to submissions
        </button>
        <PageHeader
          eyebrow={quizDetails?.title || 'Grading'}
          title={selectedSub.userName}
          description={isGraded ? 'This one is already graded.' : `The auto graded score is ${selectedSub.score} of ${selectedSub.maxScore}.`}
          actions={(
            <>
              {selectedSub.isGuest && <Pill>Guest</Pill>}
              <Pill tone={isGraded ? 'green' : 'yellow'}>{isGraded ? 'Graded' : 'Needs review'}</Pill>
            </>
          )}
        />

        {/* Progress stays in view while you scroll through the answers. */}
        <div className="sticky top-0 z-10 mt-8 border-y border-[hsl(var(--border))] bg-[hsl(var(--background))] py-4">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div className="min-w-[10rem] flex-1">
              <p className="tabular text-sm font-medium" aria-live="polite">{marked} of {count} graded</p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                <motion.div className="h-full origin-left rounded-full bg-[hsl(var(--brand))]" style={{ width: '100%' }}
                  initial={false} animate={{ scaleX: count ? marked / count : 0 }} transition={spring} />
              </div>
            </div>
            <p className="tabular text-sm text-[hsl(var(--muted-foreground))]">
              Total <span className="text-xl font-medium text-[hsl(var(--foreground))]">{total}</span> of {selectedSub.maxScore}
            </p>
            {!isGraded && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setSelectedSub(null)}>Cancel</Button>
                <Button variant="brand" onClick={handleSave} disabled={saving}>
                  {saving ? <><PiSpinnerGapBold className="animate-spin" /> Saving</> : 'Save grade'}
                </Button>
              </div>
            )}
          </div>
        </div>

        <motion.ul variants={stagger(0.05)} initial="hidden" animate="show" className="divide-y divide-[hsl(var(--border))]">
          {quizDetails?.questions.map((q, i) => (
            <AnswerBlock
              key={q.id || i}
              originalQuestion={q}
              answer={selectedSub.answers[i]}
              onPointsChange={pts => handlePointsChange(i, pts)}
              isGraded={isGraded}
            />
          ))}
        </motion.ul>
      </div>
    );
  }

  const Section = ({ title, list }) => (
    <section aria-label={title} className="mt-12">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="eyebrow tabular">{list.length}</p>
      </div>
      <motion.ul variants={stagger(0.04)} initial="hidden" animate="show" className="divide-y divide-[hsl(var(--border))] border-t border-[hsl(var(--border))]">
        {list.map(sub => <SubmissionRow key={sub.id} sub={sub} onGrade={openModal} />)}
      </motion.ul>
    </section>
  );

  return (
    <div className="mx-auto w-full max-w-5xl pb-16">
      <PageHeader
        eyebrow="Grading"
        title={quizDetails?.title || 'Quiz'}
        description={`${submissions.length} ${submissions.length === 1 ? 'submission' : 'submissions'}${pendingCount > 0 ? `, ${pendingCount} waiting for review` : ''}.`}
      />

      {error && (
        <p role="alert" className="mt-8 flex items-center gap-2 rounded-lg bg-[hsl(var(--tint-red))] px-4 py-3 text-sm text-[hsl(var(--tint-red-fg))]">
          <PiWarningCircleBold className="h-4 w-4 shrink-0" />{error}
        </p>
      )}

      {submissions.length === 0 ? (
        <motion.div variants={rise} initial="hidden" animate="show" className="mt-12 border-t border-[hsl(var(--border))] pt-8">
          <p className="text-lg font-medium">No submissions yet.</p>
          <p className="mt-1 text-[hsl(var(--muted-foreground))]">Work shows up here once students hand it in.</p>
        </motion.div>
      ) : (
        <>
          {pendingList.length > 0 && <Section title="Needs review" list={pendingList} />}
          {doneList.length > 0 && <Section title="Graded" list={doneList} />}
        </>
      )}
    </div>
  );
};

// ── Submission row component ──────────────────────────────────────────────────
const SubmissionRow = ({ sub, onGrade }) => {
  const done = sub.status === 'completed';
  const pct = sub.maxScore > 0 ? Math.round(((done ? sub.finalScore : sub.score) / sub.maxScore) * 100) : 0;
  const when = sub.completedAt?.toDate?.().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) || '-';

  return (
    <motion.li variants={rise} className="flex flex-wrap items-center gap-x-5 gap-y-2 py-4">
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{sub.userName}</p>
          {sub.isGuest && <Pill>Guest</Pill>}
        </div>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{when}</p>
      </div>
      <p className="tabular text-sm font-medium">
        {done ? sub.finalScore : sub.score}<span className="font-normal text-[hsl(var(--muted-foreground))]"> of {sub.maxScore}</span>
        {done && <span className="ml-2 text-xs font-normal text-[hsl(var(--muted-foreground))]">{pct}%</span>}
      </p>
      <Pill tone={done ? 'green' : 'yellow'}>{done ? 'Graded' : 'Pending'}</Pill>
      <Button size="sm" variant={done ? 'outline' : 'default'} onClick={() => onGrade(sub)} aria-label={`${done ? 'View' : 'Grade'} ${sub.userName}`}>
        {done ? 'View' : 'Grade'}
      </Button>
    </motion.li>
  );
};

export default Grading;
