import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { PiArrowRightBold, PiLockSimpleFill, PiSpinnerGapBold } from 'react-icons/pi';
import { db } from '@/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import Logo from '@/components/Logo';
import MediaRenderer from '@/components/MediaRenderer';
import { QuestionBody } from '@/components/quiz/QuestionView';
import Countdown from '@/components/live/Countdown';
import LiveClock from '@/components/live/LiveClock';
import LiveOption from '@/components/live/LiveOption';
import Leaderboard from '@/components/live/Leaderboard';
import PlayerHud from '@/components/live/PlayerHud';
import Podium from '@/components/live/Podium';
import PowerUpBar from '@/components/live/PowerUpBar';
import ResultCard from '@/components/live/ResultCard';
import { changeAnswer, dragAnswer, initialAnswer, isMultiSelect } from '@/utils/quizAttempt';
import { mediaKind } from '@/utils/media';
import {
  fiftyFiftyHide, generateGuestId, getMainMedia, getPlaySequence, hasLiveAnswer, joinSession, leaveSession,
  listenToSession, ordinal, previousRanks, questionDeadline, rankPlayers, serverNow, streakBonusPct, submitAnswer,
  toLiveAnswer, spendPowerUp,
} from '@/utils/liveSession';
import { playBadge, playClick, playComplete, playCorrect, playSelect, playWrong } from '@/utils/sounds';
import { pop, rise, stagger } from '@/lib/motion';

const TYPE_LABEL = {
  MCQ: 'Multiple choice', TRUE_FALSE: 'True or false', FILL_IN_THE_BLANK: 'Type the answer',
  MATCH_THE_FOLLOWING: 'Match them up', REORDER: 'Put in order', CATEGORIZE: 'Sort into groups',
  VISUAL_COMPREHENSION: 'Look, then answer', LISTENING_COMPREHENSION: 'Listen, then answer',
};

const RULES = [
  ['streakBonus', 'Streak bonus'], ['powerUps', 'Power-ups'], ['shuffle', 'Shuffled'], ['lockOnStart', 'Locks when started'],
];

/**
 * The player's phone: join with a code, wait in the lobby, then play. It listens to one
 * shared session and shows whichever screen the host has moved everyone to. What each
 * screen is made of lives in components/live; this file decides which to show and sends
 * the answers.
 */
export default function PlaySession() {
  const { pin: pinFromUrl } = useParams();
  const navigate = useNavigate();
  const { currentUser, displayName } = useAuth();

  const [pinInput, setPinInput] = useState(pinFromUrl || '');
  const [nameInput, setNameInput] = useState(displayName || '');
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  const [quiz, setQuiz] = useState(null);
  const [session, setSession] = useState(null);
  const [answer, setAnswer] = useState(null);            // the answer being built, in the quiz page's shape
  const [touched, setTouched] = useState(false);         // has a board been moved at all
  const [answered, setAnswered] = useState(false);
  const [opened, setOpened] = useState(false);           // has the 3, 2, 1 finished for this question
  const [result, setResult] = useState(null);            // { correct, points, parts }

  const playerIdRef = useRef(currentUser?.uid || null);
  const pinRef = useRef(null);
  const startRef = useRef(0);                            // server time this player's question clock started
  const wasInRef = useRef(false);

  // ── Join ────────────────────────────────────────────────────────────────────────────
  const handleJoin = async () => {
    const pin = pinInput.trim();
    const name = (nameInput || currentUser?.email?.split('@')[0] || 'Player').trim();
    if (!/^\d{6}$/.test(pin)) { setError('A game code is six digits.'); return; }
    if (!name) { setError('Please enter your name.'); return; }
    setError(''); setJoining(true);
    try {
      const playerId = currentUser?.uid || generateGuestId();
      playerIdRef.current = playerId;
      pinRef.current = pin;
      await joinSession(pin, playerId, name);
      setJoined(true);
    } catch (err) {
      setError(err.message || 'We could not join that game.');
    } finally {
      setJoining(false);
    }
  };

  // ── Listen to the session once joined ───────────────────────────────────────────────
  useEffect(() => {
    if (!joined || !pinRef.current) return undefined;
    const unsub = listenToSession(pinRef.current, (s) => {
      if (!s) { toast.error('The host ended this game.'); navigate('/'); return; }
      setSession(s);
      setQuiz((current) => {
        if (!current) getDoc(doc(db, 'quizzes', s.quizId)).then((snap) => { if (snap.exists()) setQuiz(snap.data()); });
        return current;
      });
    });
    return () => {
      unsub();
      if (pinRef.current && playerIdRef.current) leaveSession(pinRef.current, playerIdRef.current).catch(() => {});
    };
  }, [joined, navigate]);

  // ── What is being asked ─────────────────────────────────────────────────────────────
  const sequence = useMemo(() => getPlaySequence(quiz, session?.order), [quiz, session?.order]);
  const idx = session?.currentQuestionIndex ?? 0;
  const question = sequence[idx] || null;
  const settings = session?.settings || {};
  const players = session?.players;
  const ranked = useMemo(() => rankPlayers(players), [players]);
  const me = players?.[playerIdRef.current];
  const myRank = ranked.find((p) => p.id === playerIdRef.current)?.rank;
  if (me) wasInRef.current = true;
  const removed = joined && !!session && wasInRef.current && !me;

  const media = getMainMedia(question);
  const multi = question?.type === 'MCQ' && isMultiSelect(question);
  const limitMs = (parseInt(question?.timeLimit, 10) || 30) * 1000;
  const endsAt = questionDeadline(session, question);

  // A fresh answer board for every question.
  useEffect(() => {
    setAnswer(question ? initialAnswer(question) : null);
    setTouched(false); setAnswered(false); setResult(null);
    startRef.current = session?.questionStartedAt || serverNow();
  }, [question]); // eslint-disable-line react-hooks/exhaustive-deps

  // The 3, 2, 1: the question opens at a server time every phone was given.
  useEffect(() => {
    if (session?.state !== 'question') { setOpened(false); return undefined; }
    const wait = (session.questionStartedAt || 0) - serverNow();
    if (wait <= 0) { setOpened(true); return undefined; }
    setOpened(false);
    const id = setTimeout(() => setOpened(true), wait);
    return () => clearTimeout(id);
  }, [session?.state, session?.currentQuestionIndex, session?.questionStartedAt]);

  // If the host pushes the deadline out (a clip is still loading), time from that moment so a
  // slow clip does not eat the speed bonus.
  useEffect(() => {
    if (!answered && session?.questionEndsAt) startRef.current = serverNow();
  }, [session?.questionEndsAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sounds at the reveal and the end.
  useEffect(() => {
    if (session?.state === 'reveal' && answered) {
      const mine = session.answers?.[idx]?.[playerIdRef.current];
      if (mine) { setResult({ correct: mine.correct, points: mine.points, parts: mine.parts }); (mine.correct || mine.points > 0) ? playCorrect() : playWrong(); }
    }
    if (session?.state === 'reveal' && !answered) playWrong();
    if (session?.state === 'ended') playComplete();
  }, [session?.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Answering ───────────────────────────────────────────────────────────────────────
  const submit = async (value = answer) => {
    if (answered || !question) return;
    setAnswered(true);
    const taken = Math.max(0, serverNow() - startRef.current);
    try {
      const res = await submitAnswer(pinRef.current, idx, playerIdRef.current, toLiveAnswer(question, value), question, taken, settings);
      setResult(res);
    } catch (err) {
      toast.error(err.message || 'We could not send your answer.');
      setAnswered(false);
    }
  };

  const change = (value, sub = null) => {
    if (answered) return;
    playSelect();
    const next = changeAnswer(question, answer, value, sub);
    setAnswer(next);
    // One right answer, one tap: lock it in at once. Several right answers wait for the button.
    if ((question.type === 'MCQ' && !multi) || question.type === 'TRUE_FALSE') submit(next);
  };

  const onDragEnd = (drag) => {
    if (!drag.destination || answered) return;
    playClick();
    setTouched(true);
    setAnswer((current) => dragAnswer(question, current, drag.source, drag.destination));
  };

  // The clock hit zero: send what the player has rather than throwing their work away.
  // Nothing is sent for a board they never touched, which still scores 0.
  const onZero = () => {
    if (answered || session?.state !== 'question' || !question) return;
    if (touched || hasLiveAnswer(question, answer)) submit(answer);
  };

  // Power-ups
  const hiddenIds = me?.fiftyFor === idx ? fiftyFiftyHide(question, `${playerIdRef.current}:${idx}`) : [];
  const canFifty = question?.type === 'MCQ' && me?.fiftyFor !== idx && fiftyFiftyHide(question, 'x').length > 0;
  const doubleArmed = me?.doubleFor === idx;
  const onPowerUp = async (kind) => {
    if (answered || !question) return;
    if (kind === 'fifty' && !canFifty) { toast('There is nothing to remove on this question.'); return; }
    try {
      const used = await spendPowerUp(pinRef.current, playerIdRef.current, kind, idx);
      if (used) playBadge(); else toast.error('You have already used that one.');
    } catch { toast.error('We could not use that power-up.'); }
  };

  // ── Screens ─────────────────────────────────────────────────────────────────────────
  const Frame = ({ children, hud = true }) => (
    <div className="relative min-h-dvh bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(55%_100%_at_50%_0%,hsl(var(--brand)/0.08),transparent)]" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-10 pt-4">
        <div className="mb-4 flex items-center justify-between">
          <Link to="/" aria-label="Quizlike home"><Logo size={24} /></Link>
          {session?.quizTitle && <p className="max-w-[55%] truncate text-xs text-[hsl(var(--muted-foreground))]">{session.quizTitle}</p>}
        </div>
        {hud && me && <div className="mb-5"><PlayerHud rank={myRank} score={me.score || 0} streak={me.streak || 0} bonusPct={settings.streakBonus === false ? null : streakBonusPct(me.streak || 0)} /></div>}
        {children}
      </div>
    </div>
  );

  if (!joined) {
    return (
      <div className="relative grid min-h-dvh place-items-center bg-[hsl(var(--background))] px-5 text-[hsl(var(--foreground))]">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(55%_100%_at_50%_0%,hsl(var(--brand)/0.09),transparent)]" />
        <motion.div variants={stagger(0.07)} initial="hidden" animate="show" className="relative w-full max-w-sm">
          <motion.div variants={rise}><Link to="/" aria-label="Quizlike home"><Logo /></Link></motion.div>
          <motion.p variants={rise} className="eyebrow mt-10">Live game</motion.p>
          <motion.h1 variants={rise} className="text-hero mt-3 text-5xl">Join the game</motion.h1>

          <motion.div variants={rise} className="mt-9">
            <label htmlFor="pin" className="eyebrow">Game code</label>
            <input
              id="pin" value={pinInput} inputMode="numeric" autoComplete="off" maxLength={6} placeholder="000000"
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="mt-2 w-full border-0 border-b-2 border-[hsl(var(--input))] bg-transparent pb-2 font-mono text-4xl tracking-[0.25em] outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground))]/35 focus:border-[hsl(var(--ink))]"
            />
          </motion.div>
          <motion.div variants={rise} className="mt-7">
            <label htmlFor="name" className="eyebrow">Your name</label>
            <input
              id="name" value={nameInput} maxLength={24} autoComplete="off" placeholder="What should we call you"
              onChange={(e) => setNameInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              className="mt-2 w-full border-0 border-b-2 border-[hsl(var(--input))] bg-transparent pb-2 text-2xl outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground))]/40 focus:border-[hsl(var(--ink))]"
            />
          </motion.div>
          {error && <p role="alert" className="mt-4 text-sm text-[hsl(var(--destructive))]">{error}</p>}
          <motion.div variants={rise} className="mt-9">
            <Button variant="brand" size="xl" className="w-full" onClick={handleJoin} disabled={joining}>
              {joining ? <PiSpinnerGapBold className="animate-spin" /> : null} Join game <PiArrowRightBold />
            </Button>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  if (!session) {
    return <div className="grid min-h-dvh place-items-center bg-[hsl(var(--background))]"><PiSpinnerGapBold className="h-7 w-7 animate-spin text-[hsl(var(--muted-foreground))]" /></div>;
  }

  if (removed) {
    return (
      <Frame hud={false}>
        <div className="my-auto text-center">
          <PiLockSimpleFill className="mx-auto h-8 w-8 text-[hsl(var(--muted-foreground))]" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">You are no longer in this game</h1>
          <p className="mt-2 text-[hsl(var(--muted-foreground))]">The host may have removed you, or your connection dropped.</p>
          <Button className="mt-7" onClick={() => navigate('/')}>Back to home</Button>
        </div>
      </Frame>
    );
  }

  return (
    <Frame hud={session.state !== 'lobby'}>
      <AnimatePresence mode="wait" initial={false}>
        {/* ── Lobby ── */}
        {session.state === 'lobby' && (
          <motion.div key="lobby" variants={stagger(0.06)} initial="hidden" animate="show" exit={{ opacity: 0 }} className="my-auto">
            <motion.p variants={rise} className="eyebrow">You are in</motion.p>
            <motion.h1 variants={rise} className="text-hero mt-3 text-5xl">Waiting for the host</motion.h1>
            <motion.p variants={rise} className="mt-4 text-[hsl(var(--muted-foreground))]">The game starts when the host presses start. Keep this screen open.</motion.p>

            <motion.ul variants={stagger(0.04)} className="mt-8 flex flex-wrap gap-2" aria-label="Players in the game">
              {ranked.map((p) => (
                <motion.li key={p.id} variants={pop} className={`rounded-full border px-3.5 py-1.5 text-sm ${p.id === playerIdRef.current ? 'border-[hsl(var(--primary))] bg-[hsl(var(--tint-green))] font-medium' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'}`}>{p.name}</motion.li>
              ))}
            </motion.ul>

            <motion.div variants={rise} className="mt-9 border-t border-[hsl(var(--border))] pt-5">
              <p className="eyebrow mb-3">The rules today</p>
              <ul className="flex flex-wrap gap-2 text-xs font-medium">
                {RULES.filter(([key]) => settings[key]).map(([key, label]) => <li key={key} className="rounded-full bg-[hsl(var(--tint-neutral))] px-2.5 py-1 text-[hsl(var(--tint-neutral-fg))]">{label}</li>)}
                {!RULES.some(([key]) => settings[key]) && <li className="text-[hsl(var(--muted-foreground))]">Just you, the clock and the questions.</li>}
              </ul>
            </motion.div>
          </motion.div>
        )}

        {/* ── A question ── */}
        {session.state === 'question' && question && !opened && (
          <motion.div key={`count-${idx}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="my-auto">
            <Countdown startsAt={session.questionStartedAt} label={`Question ${idx + 1} of ${sequence.length}`} hint={`${TYPE_LABEL[question.type] || 'Question'}, ${Math.round(limitMs / 1000)} seconds`} />
          </motion.div>
        )}

        {session.state === 'question' && question && opened && (
          <motion.div key={`q-${idx}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <p className="eyebrow mb-3">Question {idx + 1} of {sequence.length}</p>
            <LiveClock endsAt={endsAt} limitMs={limitMs} running={!answered} onZero={onZero} tick={!answered} />

            {media && (
              <div className="mt-5 flex justify-center overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50">
                <MediaRenderer media={media} transform="question_main" className={mediaKind(media) === 'audio' ? 'w-full p-2' : 'max-h-56 w-auto max-w-full object-contain'} />
              </div>
            )}
            <h1 className="mt-5 text-2xl font-semibold leading-snug tracking-tight">{question.questionText}</h1>
            {multi && <p className="eyebrow mt-2">Choose every right answer</p>}

            {settings.powerUps !== false && me?.powerups && (
              <div className="mt-5"><PowerUpBar powerups={me.powerups} canFifty={canFifty} doubleArmed={doubleArmed} answered={answered} onUse={onPowerUp} /></div>
            )}

            <div className="mt-5">
              {question.type === 'MCQ' && (
                <div className="flex flex-col gap-3">
                  {question.mcqData.options.map((opt, i) => {
                    const chosen = (answer || []).includes(opt.id);
                    const state = answered ? (chosen ? 'locked' : 'unpicked') : chosen ? 'picked' : 'idle';
                    return <LiveOption key={opt.id} index={i} multi={multi} media={opt.media} hidden={hiddenIds.includes(opt.id)} state={state} onSelect={() => change(opt.id)}>{opt.text}</LiveOption>;
                  })}
                </div>
              )}
              {question.type === 'TRUE_FALSE' && (
                <div className="grid grid-cols-2 gap-3">
                  {[true, false].map((v, i) => {
                    const state = answered ? (answer === v ? 'locked' : 'unpicked') : 'idle';
                    return <LiveOption key={String(v)} index={i} size="xl" state={state} onSelect={() => change(v)}>{v ? 'True' : 'False'}</LiveOption>;
                  })}
                </div>
              )}
              {question.type !== 'MCQ' && question.type !== 'TRUE_FALSE' && (
                <div className={answered ? 'pointer-events-none opacity-60' : ''}>
                  <QuestionBody question={question} answer={answer} onChange={change} onDragEnd={onDragEnd} onEnter={() => submit()} />
                </div>
              )}
            </div>

            {answered ? (
              <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-6 flex items-center justify-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                <PiLockSimpleFill className="h-4 w-4" /> Locked in. {Object.keys(session.answers?.[idx] || {}).length} of {ranked.length} have answered.
              </motion.p>
            ) : (multi || !['MCQ', 'TRUE_FALSE'].includes(question.type)) && (
              <Button variant="brand" size="xl" className="mt-6 w-full" disabled={!touched && !hasLiveAnswer(question, answer)} onClick={() => submit()}>
                Lock in answer
              </Button>
            )}
          </motion.div>
        )}

        {/* ── The reveal ── */}
        {session.state === 'reveal' && (
          <motion.div key={`reveal-${idx}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="my-auto py-6">
            <ResultCard
              question={question}
              result={answered ? result : null}
              rank={{ now: myRank, before: previousRanks(players, session.answers?.[idx])[playerIdRef.current] }}
            />
          </motion.div>
        )}

        {/* ── The standings ── */}
        {session.state === 'leaderboard' && (
          <motion.div key={`board-${idx}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="my-auto w-full py-6">
            <p className="eyebrow mb-1 text-center">After question {idx + 1} of {sequence.length}</p>
            <h1 className="text-hero mb-6 text-center text-5xl">Leaderboard</h1>
            <Leaderboard players={players} answers={session.answers?.[idx]} meId={playerIdRef.current} limit={5} />
          </motion.div>
        )}

        {/* ── The end ── */}
        {session.state === 'ended' && (
          <motion.div key="ended" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="my-auto w-full py-6 text-center">
            <p className="eyebrow">Game over</p>
            <h1 className="text-hero mt-3 text-5xl">{myRank ? `You finished ${ordinal(myRank)}` : 'Thanks for playing'}</h1>
            <p className="tabular mt-3 text-[hsl(var(--muted-foreground))]">
              {me ? `${me.score || 0} points · ${me.correctCount || 0} right · best streak ${me.bestStreak || 0}` : ''}
            </p>
            <div className="mt-10"><Podium ranked={ranked} /></div>
            <div className="mt-10 flex justify-center gap-3">
              <Button onClick={() => navigate('/')}>Back to home</Button>
              <Button variant="outline" onClick={() => { window.location.href = '/play'; }}>Join another game</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Frame>
  );
}
