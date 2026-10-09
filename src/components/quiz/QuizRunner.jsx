import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { AnimatePresence, motion } from 'framer-motion';
import { PiArrowLeftBold, PiArrowRightBold, PiCheckBold, PiWarningCircleBold } from 'react-icons/pi';
import { db } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import useQuizKeys from '@/hooks/useQuizKeys';
import { changeAnswer, dragAnswer, gradeAttempt, initAnswers, isAnswered } from '@/utils/quizAttempt';
import { levelInfo, normalizeResult, progressSummary, streakInfo, totalXp } from '@/utils/gamification';
import { isSoundEnabled, playClick, playComplete, playSelect, playTick, toggleSound } from '@/utils/sounds';
import { slideQuestion } from '@/lib/motion';
import QuizIntro from './QuizIntro';
import QuizResult from './QuizResult';
import QuizTopBar from './QuizTopBar';
import QuestionView from './QuestionView';

/**
 * Takes one graded quiz from "Start" to the reward screen. The signed in quiz and the
 * guest quiz are this same component. They only differ in WHO is playing and WHERE the
 * result is stored, which their pages pass in:
 *
 * @param quizId       which quiz
 * @param mode         'student' or 'guest'
 * @param loadHistory  async () => earlier attempts by this player, or throws if unknown
 * @param saveResult   async (result, { name }) => id of the stored result
 * @param remember     (attempt) => void, called after a save, for progress kept on the device
 * @param afterSave    async ({ id, result, quiz, needsManual }) => void, for side effects
 * @param onExit       leave the quiz
 * @param onReview     open the review of this attempt, if there is one
 */
export default function QuizRunner({ quizId, mode, loadHistory, saveResult, remember, afterSave, onExit, exitLabel, onReview, onAgain }) {
  const [quiz, setQuiz] = useState(null);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState('loading');           // loading, intro, playing, submitting, done
  const [answers, setAnswers] = useState([]);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [visited, setVisited] = useState(() => new Set([0]));
  const [timeLeft, setTimeLeft] = useState(0);
  const [timeTotal, setTimeTotal] = useState(0);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [name, setName] = useState('');
  const [progress, setProgress] = useState(null);          // level and streak shown on the intro
  const [result, setResult] = useState(null);
  const [summary, setSummary] = useState(null);
  const [submitError, setSubmitError] = useState('');

  // Latest values for code that runs later (timers, shortcuts, submit). Reading state
  // from a closure there is how the old pages lost the last answer when time ran out.
  const answersRef = useRef([]);
  const indexRef = useRef(0);
  const startedRef = useRef(Date.now());
  const spentRef = useRef([]);
  const submittingRef = useRef(false);
  const nameRef = useRef('');
  nameRef.current = name;
  // The page's callbacks, read through a ref. If they were hook dependencies, a page that
  // re-created them on every render would restart the question timer each time.
  const callbacks = useRef({});
  callbacks.current = { loadHistory, saveResult, remember, afterSave };

  // ── Load the quiz ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!quizId) { setError('No quiz was given.'); return; }
      try {
        const snap = await getDoc(doc(db, 'quizzes', quizId));
        if (cancelled) return;
        if (!snap.exists()) { setError('We could not find that quiz.'); return; }
        const data = snap.data();
        if (!(data.questions || []).length) { setError('This quiz has no questions yet.'); return; }
        const initial = initAnswers(data);
        answersRef.current = initial;
        spentRef.current = new Array(initial.length).fill(0);
        setQuiz(data);
        setAnswers(initial);
        setPhase('intro');
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setError(err?.code === 'permission-denied'
          ? 'This quiz is not available. Its teacher may have turned it off.'
          : 'We could not load this quiz. Check your connection and try again.');
      }
    })();
    return () => { cancelled = true; };
  }, [quizId]);

  // ── Level and streak for the intro ──────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'student') return;
    let cancelled = false;
    callbacks.current.loadHistory().then((history) => {
      if (cancelled) return;
      setProgress({ level: levelInfo(totalXp(history)), streak: streakInfo(history) });
    }).catch(() => {});   // no history is fine, the intro just leaves the panel out
    return () => { cancelled = true; };
  }, [mode]);

  // ── Moving around ───────────────────────────────────────────────────────────────────
  const recordSpent = useCallback(() => {
    spentRef.current[indexRef.current] = (spentRef.current[indexRef.current] || 0) + (Date.now() - startedRef.current) / 1000;
    startedRef.current = Date.now();
  }, []);

  const submit = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    recordSpent();
    setSubmitError('');
    setPhase('submitting');
    try {
      const { detailed, total, needsManual } = gradeAttempt(quiz, answersRef.current);
      const base = {
        quizId,
        quizTitle: quiz.title,
        status: needsManual ? 'pending' : 'completed',
        score: total,
        finalScore: total,
        maxScore: quiz.totalPoints,
        answers: detailed,
        teacherId: quiz.createdBy,
        // Seconds. The dashboard reads this, but nothing used to save it, so "time spent" was always 0.
        timeSpent: Math.round(spentRef.current.reduce((a, b) => a + (b || 0), 0)),
        completedAt: serverTimestamp(),
      };

      // What the player had before this attempt, so we can say what it earned.
      let before = null;
      try { before = await callbacks.current.loadHistory(); } catch { before = null; }

      const id = await callbacks.current.saveResult(base, { name: nameRef.current });
      const saved = { id, ...base };

      const attempt = normalizeResult({ ...base, completedAt: new Date(), questionCount: detailed.length });
      callbacks.current.remember?.(attempt);
      setSummary(before ? progressSummary(before, [...before, attempt]) : null);
      setResult(saved);
      playComplete();
      setPhase('done');

      // Anything extra (telling a teacher about paragraphs to mark) must never undo a saved result.
      try { await callbacks.current.afterSave?.({ id, result: saved, quiz, needsManual }); } catch (e) { console.error('After save step failed:', e); }
    } catch (err) {
      console.error('Submit failed:', err);
      submittingRef.current = false;
      setSubmitError('We could not submit your answers. Check your connection and press Submit again.');
      setPhase('playing');
    }
  }, [quiz, quizId, recordSpent]);

  const goTo = useCallback((next, dir) => {
    recordSpent();
    indexRef.current = next;
    setDirection(dir);
    setIndex(next);
    setVisited((v) => new Set(v).add(next));
  }, [recordSpent]);

  /** Next question, or submit from the last one. `timedOut` skips the click sound. */
  const advance = useCallback((timedOut = false) => {
    if (!quiz) return;
    if (indexRef.current < quiz.questions.length - 1) {
      if (!timedOut) playClick();
      goTo(indexRef.current + 1, 1);
    } else {
      submit();
    }
  }, [quiz, goTo, submit]);

  const back = useCallback(() => {
    if (indexRef.current > 0) { playClick(); goTo(indexRef.current - 1, -1); }
  }, [goTo]);

  // ── The clock ───────────────────────────────────────────────────────────────────────
  // Measured against a start time rather than counting ticks, so it stays right when the
  // tab is in the background and the browser slows its timers down.
  useEffect(() => {
    if (phase !== 'playing' || !quiz) return undefined;
    const limit = parseInt(quiz.questions[index].timeLimit, 10) || 60;
    const startedAt = Date.now();
    startedRef.current = startedAt;
    setTimeTotal(limit);
    setTimeLeft(limit);
    let shown = limit;
    let fired = false;
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.ceil(limit - (Date.now() - startedAt) / 1000));
      if (remaining !== shown) {
        shown = remaining;
        setTimeLeft(remaining);
        if (remaining > 0 && remaining <= 10) playTick();
      }
      if (remaining <= 0 && !fired) { fired = true; clearInterval(id); advance(true); }
    }, 200);
    return () => clearInterval(id);
  }, [phase, index, quiz, advance]);

  // ── Answering ───────────────────────────────────────────────────────────────────────
  const setAnswerAt = (i, next) => {
    const copy = answersRef.current.slice();
    copy[i] = next;
    answersRef.current = copy;
    setAnswers(copy);
  };

  const question = quiz?.questions?.[index];
  const onChange = (value, sub = null) => {
    if (question.type === 'MCQ' || question.type === 'TRUE_FALSE' || sub !== null) playSelect();
    setAnswerAt(index, changeAnswer(question, answersRef.current[index], value, sub));
  };
  const onDragEnd = (drag) => {
    if (!drag.destination) return;
    playClick();
    setAnswerAt(index, dragAnswer(question, answersRef.current[index], drag.source, drag.destination));
  };

  // Keyboard: Enter starts or moves on, arrows move, 1 to 9 or A to Z choose an option.
  useQuizKeys({
    onNext: () => (phase === 'intro' ? setPhase('playing') : advance(false)),
    onPrev: back,
    onChoose: (i, letter) => {
      if (phase !== 'playing' || !question) return;
      if (question.type === 'MCQ') {
        const opt = question.mcqData.options[i];
        if (opt) onChange(opt.id);
      } else if (question.type === 'TRUE_FALSE') {
        if (letter === 't' || i === 0) onChange(true);
        else if (letter === 'f' || i === 1) onChange(false);
      }
    },
  }, phase === 'intro' || phase === 'playing');

  // ── Screens ─────────────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <main className="grid min-h-dvh place-items-center px-6">
        <div className="max-w-md text-center">
          <p className="eyebrow">Quiz unavailable</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">{error}</h1>
          <Button className="mt-7" onClick={onExit}>{exitLabel}</Button>
        </div>
      </main>
    );
  }

  if (phase === 'loading' || phase === 'submitting') {
    return (
      <main className="grid min-h-dvh place-items-center">
        <div className="flex flex-col items-center gap-4" role="status">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--border))] border-t-[hsl(var(--ink))]" />
          <p className="eyebrow">{phase === 'submitting' ? 'Marking your answers' : 'Loading quiz'}</p>
        </div>
      </main>
    );
  }

  if (phase === 'intro') {
    return <QuizIntro quiz={quiz} mode={mode} name={name} onNameChange={setName} progress={progress} onStart={() => setPhase('playing')} />;
  }

  if (phase === 'done') {
    return <QuizResult result={result} summary={summary} mode={mode} onExit={onExit} exitLabel={exitLabel} onReview={onReview ? () => onReview(result) : undefined} onAgain={onAgain} />;
  }

  // Playing
  const states = quiz.questions.map((q, i) => {
    if (!visited.has(i)) return 'upcoming';
    return isAnswered(q, answers[i]) ? 'answered' : 'skipped';
  });
  const isLast = index === quiz.questions.length - 1;
  const unanswered = quiz.questions.filter((q, i) => !isAnswered(q, answers[i])).length;
  const hasOptions = question.type === 'MCQ' || question.type === 'TRUE_FALSE';

  return (
    <div className="relative flex min-h-dvh flex-col bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      {/* One soft pool of light behind the question, nothing else. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(55%_100%_at_50%_0%,hsl(var(--brand)/0.07),transparent)]" />

      <QuizTopBar
        title={quiz.title}
        index={index}
        states={states}
        timeLeft={timeLeft}
        timeTotal={timeTotal}
        soundOn={soundOn}
        onToggleSound={() => setSoundOn(toggleSound())}
      />

      <main className="relative mx-auto w-full max-w-3xl flex-1 px-5 py-9 sm:px-6 sm:py-12">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={question.id ?? index}
            custom={direction}
            variants={slideQuestion}
            initial="enter"
            animate="center"
            exit="exit"
          >
            <QuestionView
              question={question}
              answer={answers[index]}
              onChange={onChange}
              onDragEnd={onDragEnd}
              onEnter={() => advance(false)}
            />
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="sticky bottom-0 z-10 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]/85 backdrop-blur-md">
        {submitError && (
          <p role="alert" className="mx-auto flex max-w-3xl items-center gap-2 bg-[hsl(var(--tint-red))] px-6 py-2.5 text-sm text-[hsl(var(--tint-red-fg))]">
            <PiWarningCircleBold className="h-4 w-4 shrink-0" /> {submitError}
          </p>
        )}
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
          <Button variant="ghost" onClick={back} disabled={index === 0}><PiArrowLeftBold /> Back</Button>

          <p className="hidden text-xs text-[hsl(var(--muted-foreground))] sm:[@media(pointer:fine)]:block">
            {isLast && unanswered > 0 ? (
              <span className="text-[hsl(var(--tint-yellow-fg))]">{unanswered} unanswered</span>
            ) : hasOptions ? (
              <span className="inline-flex items-center gap-1.5"><Kbd>1</Kbd> to <Kbd>{question.type === 'TRUE_FALSE' ? '2' : Math.min(question.mcqData?.options?.length || 4, 9)}</Kbd> to choose <span className="px-1">·</span> <Kbd>Enter</Kbd> next</span>
            ) : (
              <span className="inline-flex items-center gap-1.5"><Kbd>Enter</Kbd> next</span>
            )}
          </p>

          {isLast ? (
            <Button variant="brand" size="lg" onClick={() => advance(false)}>
              Submit <PiCheckBold />
            </Button>
          ) : (
            <Button size="lg" onClick={() => advance(false)}>
              Next <PiArrowRightBold />
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
