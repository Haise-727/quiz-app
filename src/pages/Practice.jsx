import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { AnimatePresence, motion } from 'framer-motion';
import {
  PiArrowLeftBold, PiArrowRightBold, PiCheckBold, PiCheckCircleFill, PiEyeBold, PiFlameFill,
  PiMinusCircleFill, PiSpeakerHighBold, PiSpeakerSlashBold, PiXBold, PiXCircleFill,
} from 'react-icons/pi';
import { db } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import Confetti from '@/components/Confetti';
import AnimatedNumber from '@/components/game/AnimatedNumber';
import QuestionView from '@/components/quiz/QuestionView';
import { CorrectAnswer } from '@/components/AnswerReveal';
import useQuizKeys from '@/hooks/useQuizKeys';
import { changeAnswer, dragAnswer, gradeQuestion, initialAnswer, isAnswered, isMultiSelect } from '@/utils/quizAttempt';
import { isSoundEnabled, playClick, playComplete, playCorrect, playSelect, playStreak, playWrong, toggleSound } from '@/utils/sounds';
import { ease, rise, slideQuestion, spring, springPop, stagger } from '@/lib/motion';

const SEGMENT = {
  correct: 'bg-[hsl(var(--brand))]',
  partial: 'bg-[hsl(var(--tint-yellow-fg))]/60',
  wrong: 'bg-[hsl(var(--destructive))]/70',
  seen: 'bg-[hsl(var(--ink))]/35',
  upcoming: 'bg-[hsl(var(--border))]',
};

// These show right and wrong on the options themselves, so they need no separate answer.
const OPTION_TYPES = ['MCQ', 'TRUE_FALSE', 'VISUAL_COMPREHENSION', 'LISTENING_COMPREHENSION'];

/** How a checked question counts: right, partly right, wrong, or only looked at. */
const verdictOf = (c) => {
  if (!c) return null;
  if (c.revealed || c.status === 'pending_review') return 'seen';
  if (c.correct) return 'correct';
  return c.pts > 0 ? 'partial' : 'wrong';
};

function ComboChip({ n }) {
  return (
    <AnimatePresence>
      {n >= 2 && (
        <motion.span
          key="combo"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={springPop}
          className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--tint-yellow))] px-2.5 py-1 text-xs font-medium tabular text-[hsl(var(--tint-yellow-fg))]"
          aria-label={`${n} correct in a row`}
        >
          <PiFlameFill className="h-3.5 w-3.5 text-[hsl(var(--flame))]" />
          <motion.span key={n} initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={spring}>{n} in a row</motion.span>
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/** What you see under a question once it has been checked. */
function Feedback({ question, check, combo }) {
  const v = verdictOf(check);
  const tone = {
    correct: ['bg-[hsl(var(--tint-green))] text-[hsl(var(--tint-green-fg))]', PiCheckCircleFill, 'Correct'],
    partial: ['bg-[hsl(var(--tint-yellow))] text-[hsl(var(--tint-yellow-fg))]', PiMinusCircleFill, 'Partly right'],
    wrong: ['bg-[hsl(var(--tint-red))] text-[hsl(var(--tint-red-fg))]', PiXCircleFill, 'Not quite'],
    seen: ['bg-[hsl(var(--tint-neutral))] text-[hsl(var(--tint-neutral-fg))]', PiEyeBold, check?.status === 'pending_review' ? 'Open answer, compare with the sample' : 'Answer shown'],
  }[v];
  const [cls, Icon, label] = tone;
  // The verdict can land below a long list of options and under the sticky footer. It is the
  // last thing on the page, so scroll to the bottom once it has had a moment to lay out.
  useEffect(() => {
    const t = setTimeout(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }), 120);
    return () => clearTimeout(t);
  }, []);
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease }}
      aria-live="polite"
      className="mt-8"
    >
      <div className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 ${cls}`}>
        <p className="flex items-center gap-2.5 text-base font-medium">
          <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={springPop} className="inline-flex"><Icon className="h-5 w-5" /></motion.span>
          {label}
        </p>
        {v === 'correct' && <ComboChip n={combo} />}
      </div>
      {v !== 'correct' && !OPTION_TYPES.includes(question.type) && (
        <div className="mt-5">
          <p className="eyebrow mb-2">Correct answer</p>
          <CorrectAnswer q={question} tone="plain" />
        </div>
      )}
    </motion.section>
  );
}

export default function Practice() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [quiz, setQuiz] = useState(null);
  const [phase, setPhase] = useState('loading');           // loading | playing | done | error
  const [error, setError] = useState('');
  const [deck, setDeck] = useState([]);                    // the questions being practised, so a retry can use only the missed ones
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [answers, setAnswers] = useState([]);
  const [checks, setChecks] = useState({});                // index -> { pts, correct, status, revealed }
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const comboRef = useRef(0);

  const begin = useCallback((questions) => {
    setDeck(questions);
    setAnswers(questions.map(initialAnswer));
    setChecks({});
    setIndex(0);
    setDirection(1);
    comboRef.current = 0;
    setCombo(0);
    setBestCombo(0);
    setPhase('playing');
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'quizzes', quizId));
        if (!snap.exists()) { setError('We could not find that quiz.'); setPhase('error'); return; }
        const data = snap.data();
        if (!data.questions?.length) { setError('This quiz has no questions yet.'); setPhase('error'); return; }
        setQuiz(data);
        begin(data.questions);
      } catch {
        setError('We could not load the quiz. Check your connection and try again.');
        setPhase('error');
      }
    })();
  }, [quizId, begin]);

  const leave = () => (location.key !== 'default' ? navigate(-1) : navigate('/browse'));

  const question = deck[index];
  const checked = checks[index];

  // Marks the question and moves the combo. `given` lets a tap grade itself before state settles.
  const check = (given) => {
    if (checks[index]) return;
    const result = { ...gradeQuestion(question, given) };
    if (result.status === 'pending_review') {
      // Nothing to mark: the sample answer is shown, and the combo is left alone.
      playClick();
    } else if (result.correct) {
      comboRef.current += 1;
      playCorrect();
      if (comboRef.current >= 2) setTimeout(() => playStreak(Math.min(comboRef.current, 6)), 140);
    } else {
      comboRef.current = 0;
      playWrong();
    }
    setCombo(comboRef.current);
    setBestCombo((b) => Math.max(b, comboRef.current));
    setChecks((c) => ({ ...c, [index]: result }));
  };

  const reveal = () => {
    if (checks[index]) return;
    comboRef.current = 0;
    setCombo(0);
    setChecks((c) => ({ ...c, [index]: { pts: 0, correct: false, status: 'auto_graded', revealed: true } }));
  };

  const setAnswerAt = (i, next) => setAnswers((list) => { const copy = list.slice(); copy[i] = next; return copy; });

  const onChange = (value, sub = null) => {
    if (checked) return;
    const next = changeAnswer(question, answers[index], value, sub);
    setAnswerAt(index, next);
    const single = question.type === 'TRUE_FALSE' || (question.type === 'MCQ' && !isMultiSelect(question));
    if (single) { playSelect(); check(next); }                  // one tap, instant feedback
    else if (question.type === 'MCQ' || sub !== null) playSelect();
  };

  const onDragEnd = (drag) => {
    if (!drag.destination || checked) return;
    playClick();
    setAnswerAt(index, dragAnswer(question, answers[index], drag.source, drag.destination));
  };

  const isLast = index === deck.length - 1;
  const go = (step) => {
    const to = index + step;
    if (to < 0) return;
    if (to >= deck.length) { playComplete(); setPhase('done'); return; }
    setDirection(step);
    setIndex(to);
  };

  const onPrimary = () => {
    if (checked) go(1);
    else if (isAnswered(question, answers[index])) check(answers[index]);
  };

  useQuizKeys({
    onNext: () => phase === 'playing' && onPrimary(),
    onPrev: () => phase === 'playing' && go(-1),
    onChoose: (i, letter) => {
      if (phase !== 'playing' || !question || checked) return;
      if (question.type === 'MCQ') { const opt = question.mcqData.options[i]; if (opt) onChange(opt.id); }
      else if (question.type === 'TRUE_FALSE') { if (letter === 't' || i === 0) onChange(true); else if (letter === 'f' || i === 1) onChange(false); }
    },
  }, phase === 'playing');

  // ── Results ────────────────────────────────────────────────────────────────────────
  const tally = useMemo(() => {
    const t = { correct: 0, partial: 0, wrong: 0, seen: 0 };
    deck.forEach((_, i) => { const v = verdictOf(checks[i]); if (v) t[v] += 1; });
    return t;
  }, [deck, checks]);
  const gradable = deck.length - tally.seen;
  const pct = gradable > 0 ? Math.round((tally.correct / gradable) * 100) : 0;
  const missed = deck.filter((_, i) => ['wrong', 'partial'].includes(verdictOf(checks[i])) || checks[i]?.revealed);

  // ── Screens ────────────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <main className="grid min-h-dvh place-items-center bg-[hsl(var(--background))] px-6">
        <div className="max-w-md text-center">
          <p className="eyebrow">Practice unavailable</p>
          <h1 className="text-hero mt-3 text-4xl">{error}</h1>
          <Button className="mt-7" onClick={() => navigate('/browse')}>Browse quizzes</Button>
        </div>
      </main>
    );
  }

  if (phase === 'loading') {
    return (
      <main className="grid min-h-dvh place-items-center bg-[hsl(var(--background))]">
        <div className="flex flex-col items-center gap-4" role="status">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--border))] border-t-[hsl(var(--ink))]" />
          <p className="eyebrow">Loading practice</p>
        </div>
      </main>
    );
  }

  if (phase === 'done') {
    return (
      <main className="relative min-h-dvh bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
        {pct === 100 && gradable > 0 && <Confetti count={90} />}
        <motion.div variants={stagger(0.07)} initial="hidden" animate="show" className="mx-auto max-w-2xl px-5 pb-20 pt-16 sm:px-6 sm:pt-24">
          <motion.p variants={rise} className="eyebrow">Practice complete</motion.p>
          <motion.h1 variants={rise} className="text-hero mt-3 text-6xl leading-none sm:text-7xl">
            <AnimatedNumber value={pct} format={(n) => `${Math.round(n)}%`} duration={1} />
          </motion.h1>
          <motion.p variants={rise} className="mt-3 text-[hsl(var(--muted-foreground))]">{quiz.title}</motion.p>

          <motion.dl variants={rise} className="mt-10 grid grid-cols-3 divide-x divide-[hsl(var(--border))] border-y border-[hsl(var(--border))]">
            {[['Right', tally.correct], ['Missed', tally.wrong + tally.partial], ['Best run', bestCombo]].map(([label, value], i) => (
              <div key={label} className={`py-5 ${i === 0 ? 'pr-5' : 'px-5'}`}>
                <dt className="eyebrow">{label}</dt>
                <dd className="mt-2 text-3xl font-medium"><AnimatedNumber value={value} duration={0.8} delay={0.3} /></dd>
              </div>
            ))}
          </motion.dl>

          <motion.ul variants={stagger(0.03)} className="mt-8 divide-y divide-[hsl(var(--border))]">
            {deck.map((q, i) => {
              const v = verdictOf(checks[i]) || 'seen';
              const Icon = { correct: PiCheckCircleFill, partial: PiMinusCircleFill, wrong: PiXCircleFill, seen: PiEyeBold }[v];
              const color = { correct: 'text-[hsl(var(--primary))]', partial: 'text-[hsl(var(--tint-yellow-fg))]', wrong: 'text-[hsl(var(--destructive))]', seen: 'text-[hsl(var(--muted-foreground))]' }[v];
              return (
                <motion.li key={q.id ?? i} variants={rise} className="flex items-center gap-3 py-3 text-sm">
                  <Icon className={`h-4 w-4 shrink-0 ${color}`} aria-label={v} />
                  <span className="min-w-0 flex-1 truncate">{q.questionText}</span>
                </motion.li>
              );
            })}
          </motion.ul>

          <motion.div variants={rise} className="mt-10 flex flex-wrap gap-3">
            {missed.length > 0 && <Button variant="brand" size="lg" onClick={() => begin(missed)}>Practice the {missed.length} I missed <PiArrowRightBold /></Button>}
            <Button variant={missed.length ? 'outline' : 'default'} size="lg" onClick={() => begin(quiz.questions)}>Start over</Button>
            <Button variant="ghost" size="lg" onClick={() => navigate('/browse')}>Back to quizzes</Button>
          </motion.div>
        </motion.div>
      </main>
    );
  }

  const states = deck.map((_, i) => (i === index ? 'current' : verdictOf(checks[i]) || 'upcoming'));
  const ready = isAnswered(question, answers[index]);
  const hasOptions = question.type === 'MCQ' || question.type === 'TRUE_FALSE';

  return (
    <div className="relative flex min-h-dvh flex-col bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(55%_100%_at_50%_0%,hsl(var(--brand)/0.07),transparent)]" />

      <header className="relative mx-auto flex w-full max-w-3xl items-center gap-4 px-5 pt-5 sm:px-6">
        <button type="button" onClick={leave} aria-label="Leave practice" className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]">
          <PiXBold className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <p className="truncate text-sm font-medium"><span className="eyebrow mr-2">Practice</span>{quiz.title}</p>
            <div className="flex shrink-0 items-center gap-3">
              <ComboChip n={combo} />
              <p className="eyebrow tabular">{index + 1} / {deck.length}</p>
            </div>
          </div>
          <div className="flex gap-1" role="progressbar" aria-valuemin={1} aria-valuemax={deck.length} aria-valuenow={index + 1} aria-label="Practice progress">
            {states.map((s, i) => (
              <motion.div
                key={i}
                animate={{ scaleY: i === index ? 1.9 : 1 }}
                transition={spring}
                className={`h-1.5 min-w-[3px] flex-1 origin-center rounded-full transition-colors duration-200 ${s === 'current' ? (checks[i] ? SEGMENT[verdictOf(checks[i])] : SEGMENT.seen) : SEGMENT[s]}`}
              />
            ))}
          </div>
        </div>
        <button type="button" onClick={() => setSoundOn(toggleSound())} aria-label={soundOn ? 'Mute sounds' : 'Unmute sounds'} className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]">
          {soundOn ? <PiSpeakerHighBold className="h-4 w-4" /> : <PiSpeakerSlashBold className="h-4 w-4" />}
        </button>
      </header>

      <main className="relative mx-auto w-full max-w-3xl flex-1 px-5 py-9 sm:px-6 sm:py-12">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div key={`${index}-${deck.length}`} custom={direction} variants={slideQuestion} initial="enter" animate="center" exit="exit">
            {/* Once a question is checked its answer is final, so it stops taking input. */}
            <div inert={checked ? true : undefined} className={checked ? 'opacity-90' : ''}>
              <QuestionView question={question} answer={answers[index]} onChange={onChange} onDragEnd={onDragEnd} onEnter={onPrimary} reveal={!!checked} />
            </div>
            {checked && <Feedback question={question} check={checked} combo={combo} />}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="sticky bottom-0 z-10 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
          <Button variant="ghost" aria-label="Back" onClick={() => go(-1)} disabled={index === 0}><PiArrowLeftBold /> <span className="hidden sm:inline">Back</span></Button>

          <p className="hidden text-xs text-[hsl(var(--muted-foreground))] sm:[@media(pointer:fine)]:block">
            {hasOptions && !checked
              ? <span className="inline-flex items-center gap-1.5"><Kbd>1</Kbd> to <Kbd>{question.type === 'TRUE_FALSE' ? '2' : Math.min(question.mcqData?.options?.length || 4, 9)}</Kbd> answers at once</span>
              : <span className="inline-flex items-center gap-1.5"><Kbd>Enter</Kbd> {checked ? 'next' : 'check'}</span>}
          </p>

          <div className="flex items-center gap-2">
            {!checked && <Button variant="ghost" onClick={reveal}><PiEyeBold /> Show answer</Button>}
            {checked ? (
              <Button size="lg" variant={isLast ? 'brand' : 'default'} onClick={onPrimary}>{isLast ? 'Finish' : 'Next'} {isLast ? <PiCheckBold /> : <PiArrowRightBold />}</Button>
            ) : (
              <Button size="lg" onClick={onPrimary} disabled={!ready}>Check <PiCheckBold /></Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
