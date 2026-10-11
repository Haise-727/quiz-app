import { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { PiCheckBold, PiCheckCircleFill, PiSpinnerGapBold, PiXCircleFill } from 'react-icons/pi';
import { db } from '@/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useProgress } from '@/contexts/ProgressContext';
import { Button } from '@/components/ui/button';
import QuestionView from '@/components/quiz/QuestionView';
import { CorrectAnswer } from '@/components/AnswerReveal';
import AnimatedNumber from '@/components/game/AnimatedNumber';
import BadgeTile from '@/components/game/BadgeTile';
import StreakChip from '@/components/game/StreakChip';
import { TINT } from '@/components/game/icons';
import { changeAnswer, initialAnswer, isAnswered } from '@/utils/quizAttempt';
import { normalizeResult, progressSummary, XP_RULES } from '@/utils/gamification';
import { buildDailyResult, dailyCandidates, dailyWasRight, findDailyResult, gradeDaily, localDateString, pickDaily } from '@/utils/daily';
import { getActiveQuizzes } from '@/utils/quizLookup';
import { pop, rise, springPop, stagger } from '@/lib/motion';

const noop = () => {};

/** A reward landing: starts small and overshoots a little (springPop from motion.js). */
const land = { hidden: { opacity: 0, scale: 0.6 }, show: { opacity: 1, scale: 1, transition: springPop } };

/**
 * One question a day, the same for every student, to give the streak a reason to exist.
 * The rules (which question, what it is worth) live in utils/daily.js and gamification.js.
 * This card does three things: pick today's question, let the student answer it with the
 * same QuestionView the quizzes use, and save the answer once as a quiz_results document.
 *
 * Three looks: the question, the reward right after answering, and a quiet "answered"
 * line on every later visit that day. It renders nothing when there is no question to ask.
 */
export default function DailyQuestion() {
  const { currentUser } = useAuth();
  const { normalized, dailyNormalized, refresh } = useProgress();

  const [today] = useState(() => localDateString());            // the student's own date, fixed for this visit
  const [candidate, setCandidate] = useState(undefined);        // undefined: loading, null: nothing to ask
  const [answer, setAnswer] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [outcome, setOutcome] = useState(null);                 // set right after answering: { right, summary }
  const startedRef = useRef(false);

  const loaded = normalized !== undefined && normalized !== null;
  const already = loaded ? findDailyResult(dailyNormalized, today) : null;

  // Fetch the question only once we know the student has not answered yet, and only once.
  useEffect(() => {
    if (!loaded || already || startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const picked = pickDaily(dailyCandidates(await getActiveQuizzes(60)), today);
        setCandidate(picked);
        if (picked) setAnswer(initialAnswer(picked.question));
      } catch (err) {
        console.error('Could not load the daily question:', err);
        setCandidate(null);                                     // a card that cannot load is better hidden
      }
    })();
  }, [loaded, already, today]);

  const ready = useMemo(() => !!candidate && isAnswered(candidate.question, answer), [candidate, answer]);

  const check = async () => {
    if (!candidate || !ready || saving) return;
    setSaving(true); setSaveError('');
    try {
      const right = gradeDaily(candidate.question, answer);
      await addDoc(collection(db, 'quiz_results'), buildDailyResult({
        userId: currentUser.uid, dateString: today, candidate, correct: right, completedAt: serverTimestamp(),
      }));
      // What this answer changed, worked out the same way the quiz reward screen does it.
      const mine = normalizeResult({ ...buildDailyResult({ userId: currentUser.uid, dateString: today, candidate, correct: right }), completedAt: new Date() });
      setOutcome({ right, summary: progressSummary(normalized, [...normalized, mine]) });
      refresh();                                               // the sidebar and dashboard pick up the new XP and streak
    } catch (err) {
      console.error('Could not save the daily answer:', err);
      setSaveError('We could not save your answer. Check your connection and press Check again.');
    } finally {
      setSaving(false);
    }
  };

  // Nothing to show: still loading progress, or no question exists, or it could not load.
  if (!loaded) return <div className="mt-10 h-40 animate-pulse rounded-lg bg-[hsl(var(--muted))]" />;
  if (!already && !outcome && candidate === null) return null;

  return (
    <section aria-label="Daily question" className="mt-10 border-y border-[hsl(var(--border))] py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-xl font-semibold tracking-tight">Daily question</h2>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">One a day keeps your streak going. {XP_RULES.dailyRight} XP for a right answer, {XP_RULES.dailyWrong} for a wrong one.</p>
      </div>

      {outcome ? (
        <Reveal candidate={candidate} outcome={outcome} />
      ) : already ? (
        <Answered right={dailyWasRight(already)} />
      ) : candidate === undefined ? (
        <div className="mt-5 space-y-3" aria-busy="true">
          <div className="h-6 w-3/4 animate-pulse rounded-lg bg-[hsl(var(--muted))]" />
          <div className="h-12 w-full animate-pulse rounded-lg bg-[hsl(var(--muted))]" />
        </div>
      ) : (
        <div className="mt-6 max-w-2xl">
          <QuestionView
            question={candidate.question}
            answer={answer}
            onChange={(value, sub) => setAnswer((current) => changeAnswer(candidate.question, current, value, sub))}
            onDragEnd={noop}
            onEnter={check}
          />
          {saveError && <p role="alert" className="mt-4 text-sm text-[hsl(var(--destructive))]">{saveError}</p>}
          <Button className="mt-6" size="lg" onClick={check} disabled={!ready || saving}>
            {saving ? <PiSpinnerGapBold className="animate-spin" /> : null}Check<PiCheckBold />
          </Button>
        </div>
      )}
    </section>
  );
}

/** The moment after answering: right or wrong, the correct answer, and what it earned. */
function Reveal({ candidate, outcome }) {
  const { right, summary } = outcome;
  const streak = summary.streakAfter;
  // Only badges that this answer unlocked (for example Daily habit on the seventh day).
  const newBadges = summary.newBadges;
  return (
    <motion.div variants={stagger(0.08)} initial="hidden" animate="show" className="mt-5 max-w-2xl">
      {/* Read out by screen readers as soon as it appears. */}
      <p className="sr-only" role="status" aria-live="polite">{right ? 'Right.' : 'Not quite.'} You earned {summary.xpGained} XP.</p>

      <motion.p variants={rise} className="text-lg font-medium leading-snug">{candidate.question.questionText}</motion.p>

      <motion.div variants={rise} className={`mt-4 flex items-start gap-3 rounded-lg px-4 py-3 ${right ? TINT.green : TINT.red}`}>
        {right ? <PiCheckCircleFill className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> : <PiXCircleFill className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />}
        <div className="min-w-0">
          <p className="font-medium">{right ? 'Right.' : 'Not quite.'}</p>
          <p className="eyebrow mb-1 mt-2 !text-current opacity-80">Correct answer</p>
          <div className="text-sm"><CorrectAnswer q={candidate.question} tone="plain" /></div>
        </div>
      </motion.div>

      <motion.div variants={rise} className="mt-5 flex flex-wrap items-center gap-3">
        <motion.span variants={land} className={`tabular inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${TINT.green}`}>
          <AnimatedNumber value={summary.xpGained} format={(n) => `+${Math.round(n)} XP`} duration={0.7} delay={0.15} />
        </motion.span>
        <motion.span variants={land}>
          <StreakChip days={streak.current} doneToday={streak.doneToday} />
        </motion.span>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Come back tomorrow for a new one.</p>
      </motion.div>

      {newBadges.length > 0 && (
        <motion.div variants={stagger(0.06, 0.2)} className="mt-5 grid max-w-xs grid-cols-2 gap-3">
          {newBadges.map((b) => <BadgeTile key={b.id} badge={b} isNew />)}
        </motion.div>
      )}
    </motion.div>
  );
}

/** What a later visit on the same day shows: it is done, and how it went. */
function Answered({ right }) {
  const xp = right ? XP_RULES.dailyRight : XP_RULES.dailyWrong;
  return (
    <motion.div variants={pop} initial="hidden" animate="show" className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${right ? TINT.green : TINT.red}`}>
        {right ? <PiCheckCircleFill aria-hidden /> : <PiXCircleFill aria-hidden />}
        {right ? 'Answered right' : 'Answered, not quite'}
      </span>
      <span className="tabular text-sm font-medium">+{xp} XP</span>
      <p className="text-sm text-[hsl(var(--muted-foreground))]">You have done today's question. Come back tomorrow for a new one.</p>
    </motion.div>
  );
}
