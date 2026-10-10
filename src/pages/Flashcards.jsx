import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion';
import {
  PiArrowArcLeftBold, PiArrowLeftBold, PiArrowRightBold, PiCheckBold, PiFlameFill, PiShuffleBold,
  PiSpeakerHighBold, PiSpeakerSlashBold, PiXBold,
} from 'react-icons/pi';
import { db } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import Confetti from '@/components/Confetti';
import AnimatedNumber from '@/components/game/AnimatedNumber';
import MediaRenderer from '@/components/MediaRenderer';
import { CorrectAnswer } from '@/components/AnswerReveal';
import { getMainMedia, mediaKind } from '@/utils/media';
import { isSoundEnabled, playClick, playComplete, playCorrect, playStreak, toggleSound } from '@/utils/sounds';
import { ease, rise, spring, springPop, stagger } from '@/lib/motion';

const BACK_LABEL = {
  MCQ: 'Correct answer', TRUE_FALSE: 'Correct answer', FILL_IN_THE_BLANK: 'Answer',
  MATCH_THE_FOLLOWING: 'Matches', REORDER: 'Correct order', CATEGORIZE: 'Categories',
  VISUAL_COMPREHENSION: 'Answers', LISTENING_COMPREHENSION: 'Answers', PARAGRAPH: 'Hint',
};

const SWIPE = 110;          // how far a card has to travel before it counts as a choice

const SEGMENT = {
  know: 'bg-[hsl(var(--brand))]',
  learning: 'bg-[hsl(var(--tint-yellow-fg))]/60',
  unseen: 'bg-[hsl(var(--border))]',
};

/**
 * The card. Both faces share one grid cell, so it is as tall as the fuller face and a picture
 * or video never spills out. Once it is turned over it can be thrown: right for "got it",
 * left for "still learning", with the choice tinting the card as it moves. Buttons and the
 * keyboard do the same, so nothing needs a swipe.
 */
function FlipCard({ question, flipped, onFlip, onChoose }) {
  const media = getMainMedia(question);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 0, 220], [-7, 0, 7]);
  const knowTint = useTransform(x, [0, SWIPE], [0, 1]);
  const learnTint = useTransform(x, [-SWIPE, 0], [1, 0]);
  const moved = useRef(false);

  return (
    <motion.div
      style={{ x, rotate, perspective: 1400 }}
      drag={flipped ? 'x' : false}
      dragSnapToOrigin
      dragElastic={0.55}
      onDragStart={() => { moved.current = true; }}
      onDragEnd={(_, info) => {
        if (info.offset.x > SWIPE) onChoose('know');
        else if (info.offset.x < -SWIPE) onChoose('learning');
        setTimeout(() => { moved.current = false; }, 0);
      }}
      className="relative w-full max-w-2xl touch-pan-y select-none"
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={flipped ? 'Card showing the answer. Press to turn it back.' : 'Card showing the question. Press to see the answer.'}
        onClick={() => { if (!moved.current) onFlip(); }}
        onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onFlip(); } }}
        className="cursor-pointer rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background))]"
      >
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.42, ease: [0.4, 0, 0.2, 1] }}
          style={{ transformStyle: 'preserve-3d' }}
          className="relative grid min-h-[20rem]"
        >
          <div style={{ gridArea: '1 / 1', backfaceVisibility: 'hidden' }} className="flex flex-col items-center justify-center rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 text-center sm:p-12">
            <p className="eyebrow mb-5">Question</p>
            {media && (
              <div className="mb-5 flex max-w-full justify-center" onClick={(e) => e.stopPropagation()}>
                <MediaRenderer media={media} transform="question_main" className={mediaKind(media) === 'audio' ? 'w-full max-w-md' : 'block max-h-56 max-w-full rounded-xl'} />
              </div>
            )}
            <p className="text-hero text-3xl leading-tight sm:text-4xl">{question.questionText}</p>
            <p className="mt-8 text-sm text-[hsl(var(--muted-foreground))]">Tap to turn over</p>
          </div>

          <div style={{ gridArea: '1 / 1', backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }} className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-[hsl(var(--ink))]/70 bg-[hsl(var(--card))] p-8 text-center sm:p-12">
            <motion.div aria-hidden style={{ opacity: knowTint }} className="pointer-events-none absolute inset-0 bg-[hsl(var(--tint-green))]" />
            <motion.div aria-hidden style={{ opacity: learnTint }} className="pointer-events-none absolute inset-0 bg-[hsl(var(--tint-yellow))]" />
            <div className="relative w-full">
              <p className="eyebrow mb-5">{BACK_LABEL[question.type] || 'Answer'}</p>
              <div className="text-lg font-medium leading-relaxed sm:text-xl">
                <CorrectAnswer q={question} centered tone="plain" />
              </div>
              <p className="mt-8 text-sm text-[hsl(var(--muted-foreground))]">Drag the card right or left, or use the buttons</p>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

export default function Flashcards() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [quiz, setQuiz] = useState(null);
  const [phase, setPhase] = useState('loading');          // loading | playing | done | error
  const [error, setError] = useState('');
  const [cards, setCards] = useState([]);                 // indices into quiz.questions, in the order shown
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [status, setStatus] = useState({});               // question index -> 'unseen' | 'know' | 'learning'
  const [run, setRun] = useState(0);                      // got it, in a row
  const [bestRun, setBestRun] = useState(0);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const runRef = useRef(0);
  const busy = useRef(false);

  const begin = useCallback((data) => {
    setCards(data.questions.map((_, i) => i));
    setStatus(Object.fromEntries(data.questions.map((_, i) => [i, 'unseen'])));
    setIndex(0); setFlipped(false); setRun(0); setBestRun(0); runRef.current = 0;
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
        begin(data);
      } catch {
        setError('We could not load the quiz. Check your connection and try again.');
        setPhase('error');
      }
    })();
  }, [quizId, begin]);

  const leave = () => (location.key !== 'default' ? navigate(-1) : navigate('/browse'));

  const currentIndex = cards[index];
  const question = quiz?.questions[currentIndex];

  const counts = useMemo(() => {
    const v = Object.values(status);
    return { know: v.filter((s) => s === 'know').length, learning: v.filter((s) => s === 'learning').length };
  }, [status]);

  const advance = useCallback((to) => {
    setFlipped(false);
    if (to >= cards.length) { playComplete(); setPhase('done'); } else setIndex(Math.max(0, to));
  }, [cards.length]);

  const choose = useCallback((mark) => {
    if (busy.current || !flipped) return;
    busy.current = true;
    if (mark === 'know') {
      runRef.current += 1;
      playCorrect();
      if (runRef.current >= 3) setTimeout(() => playStreak(Math.min(runRef.current - 1, 6)), 140);
    } else {
      runRef.current = 0;
      playClick();
    }
    setRun(runRef.current);
    setBestRun((b) => Math.max(b, runRef.current));
    setStatus((s) => ({ ...s, [currentIndex]: mark }));
    setTimeout(() => { advance(index + 1); busy.current = false; }, 160);
  }, [flipped, currentIndex, index, advance]);

  const flip = useCallback(() => { playClick(); setFlipped((f) => !f); }, []);

  const shuffleCards = () => {
    setCards((c) => [...c].sort(() => Math.random() - 0.5));
    setIndex(0); setFlipped(false);
  };

  const reviewLearning = () => {
    const ids = Object.entries(status).filter(([, s]) => s === 'learning').map(([i]) => Number(i));
    if (!ids.length) return;
    setCards(ids);
    setStatus((s) => { const copy = { ...s }; ids.forEach((i) => { copy[i] = 'unseen'; }); return copy; });
    setIndex(0); setFlipped(false); runRef.current = 0; setRun(0); setPhase('playing');
  };

  // Space turns the card, 1 or left is "still learning", 2 or right is "got it".
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const onControl = e.target?.closest?.('button, a, [role=button]');
      if ((e.key === ' ' || e.key === 'Enter') && !onControl) { e.preventDefault(); flip(); }
      else if (e.key === 'ArrowLeft' || e.key === '1') { if (flipped) choose('learning'); else advance(index - 1); }
      else if (e.key === 'ArrowRight' || e.key === '2') { if (flipped) choose('know'); else advance(index + 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, flipped, index, choose, flip, advance]);

  if (phase === 'error') {
    return (
      <main className="grid min-h-dvh place-items-center bg-[hsl(var(--background))] px-6">
        <div className="max-w-md text-center">
          <p className="eyebrow">Flashcards unavailable</p>
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
          <p className="eyebrow">Loading cards</p>
        </div>
      </main>
    );
  }

  const total = quiz.questions.length;

  if (phase === 'done') {
    const mastered = counts.know === total;
    return (
      <main className="relative min-h-dvh bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
        {mastered && <Confetti count={90} />}
        <motion.div variants={stagger(0.07)} initial="hidden" animate="show" className="mx-auto max-w-2xl px-5 pb-20 pt-16 sm:px-6 sm:pt-24">
          <motion.p variants={rise} className="eyebrow">Session complete</motion.p>
          <motion.h1 variants={rise} className="text-hero mt-3 text-6xl leading-none sm:text-7xl">
            {mastered ? 'All of them.' : <><AnimatedNumber value={counts.know} duration={0.9} /> of {total}</>}
          </motion.h1>
          <motion.p variants={rise} className="mt-3 text-[hsl(var(--muted-foreground))]">{mastered ? `You knew every card in ${quiz.title}.` : `${quiz.title}: cards you knew.`}</motion.p>

          <motion.div variants={rise} className="mt-10">
            <div className="flex h-2 gap-1 overflow-hidden rounded-full" role="img" aria-label={`${counts.know} known, ${counts.learning} still learning`}>
              {Array.from({ length: total }, (_, i) => (
                <motion.span key={i} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ ...spring, delay: 0.3 + i * 0.03 }} className={`h-full flex-1 origin-bottom ${SEGMENT[status[i] || 'unseen']}`} />
              ))}
            </div>
          </motion.div>

          <motion.dl variants={rise} className="mt-8 grid grid-cols-3 divide-x divide-[hsl(var(--border))] border-y border-[hsl(var(--border))]">
            {[['Knew it', counts.know], ['Still learning', counts.learning], ['Best run', bestRun]].map(([label, value], i) => (
              <div key={label} className={`py-5 ${i === 0 ? 'pr-5' : 'px-5'}`}>
                <dt className="eyebrow">{label}</dt>
                <dd className="mt-2 text-3xl font-medium"><AnimatedNumber value={value} duration={0.8} delay={0.3} /></dd>
              </div>
            ))}
          </motion.dl>

          <motion.div variants={rise} className="mt-10 flex flex-wrap gap-3">
            {counts.learning > 0 && <Button variant="brand" size="lg" onClick={reviewLearning}>Review the {counts.learning} still learning <PiArrowRightBold /></Button>}
            <Button variant={counts.learning ? 'outline' : 'default'} size="lg" onClick={() => begin(quiz)}>Start over</Button>
            <Button variant="ghost" size="lg" onClick={() => navigate('/browse')}>Back to quizzes</Button>
          </motion.div>
        </motion.div>
      </main>
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(55%_100%_at_50%_0%,hsl(var(--brand)/0.07),transparent)]" />

      <header className="relative mx-auto flex w-full max-w-3xl items-center gap-4 px-5 pt-5 sm:px-6">
        <button type="button" onClick={leave} aria-label="Leave flashcards" className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]">
          <PiXBold className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <p className="truncate text-sm font-medium"><span className="eyebrow mr-2">Flashcards</span>{quiz.title}</p>
            <div className="flex shrink-0 items-center gap-3">
              <AnimatePresence>
                {run >= 2 && (
                  <motion.span key="run" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} transition={springPop} className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--tint-yellow))] px-2.5 py-1 text-xs font-medium tabular text-[hsl(var(--tint-yellow-fg))]">
                    <PiFlameFill className="h-3.5 w-3.5 text-[hsl(var(--flame))]" /> {run} in a row
                  </motion.span>
                )}
              </AnimatePresence>
              <p className="eyebrow tabular">{index + 1} / {cards.length}</p>
            </div>
          </div>
          <div className="flex gap-1" role="progressbar" aria-valuemin={1} aria-valuemax={cards.length} aria-valuenow={index + 1} aria-label="Flashcard progress">
            {cards.map((ci, i) => (
              <motion.div key={ci} animate={{ scaleY: i === index ? 1.9 : 1 }} transition={spring} className={`h-1.5 min-w-[3px] flex-1 origin-center rounded-full transition-colors duration-200 ${i === index ? 'bg-[hsl(var(--ink))]/40' : SEGMENT[status[ci] || 'unseen']}`} />
            ))}
          </div>
        </div>
        <button type="button" onClick={shuffleCards} aria-label="Shuffle cards" className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"><PiShuffleBold className="h-4 w-4" /></button>
        <button type="button" onClick={() => setSoundOn(toggleSound())} aria-label={soundOn ? 'Mute sounds' : 'Unmute sounds'} className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]">
          {soundOn ? <PiSpeakerHighBold className="h-4 w-4" /> : <PiSpeakerSlashBold className="h-4 w-4" />}
        </button>
      </header>

      <main className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-5 py-10 sm:px-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${currentIndex}-${index}`}
            initial={{ opacity: 0, x: 40, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.2, ease }}
            className="flex w-full justify-center"
          >
            <FlipCard question={question} flipped={flipped} onFlip={flip} onChoose={choose} />
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="sticky bottom-0 z-10 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
          <Button variant="ghost" aria-label="Back" onClick={() => advance(index - 1)} disabled={index === 0}><PiArrowLeftBold /> <span className="hidden sm:inline">Back</span></Button>
          <p className="hidden text-xs text-[hsl(var(--muted-foreground))] sm:[@media(pointer:fine)]:block">
            <span className="inline-flex items-center gap-1.5"><Kbd>Space</Kbd> turn <span className="px-1">·</span> <Kbd>1</Kbd> <Kbd>2</Kbd> choose</span>
          </p>
          <AnimatePresence mode="wait" initial={false}>
            {flipped ? (
              <motion.div key="choose" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="flex items-center gap-2">
                <Button variant="outline" size="lg" onClick={() => choose('learning')}><PiArrowArcLeftBold /> Still learning</Button>
                <Button variant="brand" size="lg" onClick={() => choose('know')}><PiCheckBold /> Got it</Button>
              </motion.div>
            ) : (
              <motion.div key="flip" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => advance(index + 1)}>Skip <PiArrowRightBold /></Button>
                <Button size="lg" onClick={flip}>Turn over</Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </footer>
    </div>
  );
}
