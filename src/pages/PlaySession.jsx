import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { PiArrowRightBold, PiLockSimpleFill, PiPauseFill, PiSignOutBold, PiSkullBold, PiSpinnerGapBold } from 'react-icons/pi';
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
import TeamBoard from '@/components/live/TeamBoard';
import MathText from '@/components/MathText';
import PlayerHud from '@/components/live/PlayerHud';
import Podium from '@/components/live/Podium';
import PowerUpBar from '@/components/live/PowerUpBar';
import ResultCard from '@/components/live/ResultCard';
import { changeAnswer, dragAnswer, initialAnswer, isMultiSelect } from '@/utils/quizAttempt';
import { mediaKind } from '@/utils/media';
import {
  alivePlayerIds, fiftyFiftyHide, generateGuestId, getMainMedia, getPlaySequence, hasLiveAnswer, isOut, isPaused,
  joinSession, leaveSession, listenToSession, ordinal, previousRanks, questionDeadline, rankPlayers, rankSuddenDeath,
  rankTeams, serverNow, setPresence, streakBonusPct, submitAnswer, TEAM_NAMES, toLiveAnswer, spendPowerUp, watchPresence,
} from '@/utils/liveSession';
import { tileFor } from '@/components/live/tiles';
import { playBadge, playClick, playComplete, playCorrect, playSelect, playWrong } from '@/utils/sounds';
import { pop, rise, stagger } from '@/lib/motion';

const TYPE_LABEL = {
  MCQ: 'Multiple choice', TRUE_FALSE: 'True or false', FILL_IN_THE_BLANK: 'Type the answer',
  MATCH_THE_FOLLOWING: 'Match them up', REORDER: 'Put in order', CATEGORIZE: 'Sort into groups',
  VISUAL_COMPREHENSION: 'Look, then answer', LISTENING_COMPREHENSION: 'Listen, then answer',
  NUMERIC: 'Type a number', HOTSPOT: 'Tap the picture',
};

/**
 * A phone remembers which seat it had in a game, so a reload, a dropped signal or going out
 * of the room and back does not lose the player's place. Seats are forgotten after six hours.
 */
const SEAT_KEY = 'quizlike_live_seat';
const readSeat = () => { try { const v = JSON.parse(localStorage.getItem(SEAT_KEY)); return v && Date.now() - v.at < 6 * 3600 * 1000 ? v : null; } catch { return null; } };
const saveSeat = (seat) => { try { localStorage.setItem(SEAT_KEY, JSON.stringify({ ...seat, at: Date.now() })); } catch { /* private mode: rejoin by name still works */ } };
const clearSeat = () => { try { localStorage.removeItem(SEAT_KEY); } catch { /* nothing to clear */ } };

const RULES = [
  ['streakBonus', 'Streak bonus'], ['powerUps', 'Power-ups'], ['shuffle', 'Shuffled'], ['lockOnStart', 'Locks when started'], ['suddenDeath', 'Sudden death'],
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
  const lastStartRef = useRef(0);                        // the questionStartedAt we last saw, to notice a resume
  const wasInRef = useRef(false);

  // ── Join ────────────────────────────────────────────────────────────────────────────
  const handleJoin = async () => {
    const pin = pinInput.trim();
    const name = (nameInput || currentUser?.email?.split('@')[0] || 'Player').trim();
    if (!/^\d{6}$/.test(pin)) { setError('A game code is six digits.'); return; }
    if (!name) { setError('Please enter your name.'); return; }
    setError(''); setJoining(true);
    try {
      // A phone that already had a seat in THIS game keeps using it, and so keeps its score.
      const saved = readSeat();
      const playerId = currentUser?.uid || (saved?.pin === pin ? saved.playerId : null) || generateGuestId();
      playerIdRef.current = playerId;
      pinRef.current = pin;
      // joinSession returns the seat actually given: a name that matches someone who dropped takes their seat.
      const seat = await joinSession(pin, playerId, name);
      playerIdRef.current = seat.playerId;
      saveSeat({ pin, playerId: seat.playerId, name });
      setJoined(true);
    } catch (err) {
      setError(err.message || 'We could not join that game.');
    } finally {
      setJoining(false);
    }
  };

  // ── Coming back ─────────────────────────────────────────────────────────────────────
  // If this phone had a seat in a game that is still going, go straight back into it.
  useEffect(() => {
    const seat = readSeat();
    if (!seat || (pinFromUrl && seat.pin !== pinFromUrl)) return;
    let cancelled = false;
    setJoining(true);
    playerIdRef.current = seat.playerId;
    pinRef.current = seat.pin;
    joinSession(seat.pin, seat.playerId, seat.name)
      .then((back) => {
        if (cancelled) return;
        playerIdRef.current = back.playerId;
        setPinInput(seat.pin); setNameInput(seat.name);
        setJoined(true);
        toast('Welcome back. Your score is kept.');
      })
      .catch(() => { clearSeat(); pinRef.current = null; })     // the game ended or is gone: show the join form
      .finally(() => { if (!cancelled) setJoining(false); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Keep the seat marked as connected while this page is open and online.
    const stopPresence = watchPresence(pinRef.current, playerIdRef.current);
    return () => {
      unsub();
      stopPresence();
      // Leaving the page marks the seat as away. It does NOT delete it, so coming back keeps the score.
      if (pinRef.current && playerIdRef.current) setPresence(pinRef.current, playerIdRef.current, false).catch(() => {});
    };
  }, [joined, navigate]);

  const handleLeave = async () => {
    clearSeat();
    if (pinRef.current && playerIdRef.current) await leaveSession(pinRef.current, playerIdRef.current).catch(() => {});
    window.location.href = '/';
  };

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

  // A click on the image question draws its own picture inside the answer area.
  const media = question?.type === 'HOTSPOT' ? null : getMainMedia(question);
  const paused = isPaused(session);
  const teamCount = Number(settings.teams) || 0;
  const out = !!settings.suddenDeath && isOut(me);
  const outBefore = out && me.eliminatedAt < idx;           // knocked out by an earlier question: only watching now
  const outNow = out && me.eliminatedAt === idx;            // knocked out by the question just played
  const orderedPlayers = useMemo(() => (settings.suddenDeath ? rankSuddenDeath(players) : ranked), [settings.suddenDeath, players, ranked]);
  const finalRank = orderedPlayers.find((p) => p.id === playerIdRef.current)?.rank;
  const teamsRanked = useMemo(() => (teamCount ? rankTeams(players, teamCount) : []), [players, teamCount]);
  const stillIn = alivePlayerIds(players).length;
  const multi = question?.type === 'MCQ' && isMultiSelect(question);
  const limitMs = (parseInt(question?.timeLimit, 10) || 30) * 1000;
  const endsAt = questionDeadline(session, question);

  // A fresh answer board for every question.
  useEffect(() => {
    setAnswer(question ? initialAnswer(question) : null);
    setTouched(false); setAnswered(false); setResult(null);
    startRef.current = session?.questionStartedAt || serverNow();
    lastStartRef.current = session?.questionStartedAt || 0;
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

  // When the host resumes after a pause the start moves later by the length of the pause. Move this
  // player's own stopwatch by the same amount, so a pause never eats the speed bonus.
  useEffect(() => {
    const started = session?.questionStartedAt || 0;
    if (lastStartRef.current && started > lastStartRef.current && !answered) startRef.current += started - lastStartRef.current;
    lastStartRef.current = started;
  }, [session?.questionStartedAt]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (answered || !question || paused || outBefore) return;
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
    if (answered || paused || outBefore || session?.state !== 'question' || !question) return;
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
        <header className="mb-4 flex items-center justify-between">
          <Link to="/" aria-label="Quizlike home"><Logo size={24} /></Link>
          <div className="flex min-w-0 items-center gap-3">
            {session?.quizTitle && <p className="max-w-[10rem] truncate text-xs text-[hsl(var(--muted-foreground))]">{session.quizTitle}</p>}
            {joined && session?.state !== 'ended' && (
              <button type="button" onClick={handleLeave} aria-label="Leave this game" title="Leave this game" className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"><PiSignOutBold className="h-4 w-4" /></button>
            )}
          </div>
        </header>
        <main className="flex flex-1 flex-col">
          {hud && me && <div className="mb-5"><PlayerHud rank={session.state === 'ended' ? finalRank : myRank} score={me.score || 0} streak={me.streak || 0} bonusPct={settings.streakBonus === false ? null : streakBonusPct(me.streak || 0)} team={teamCount ? me.team : null} out={out} /></div>}
          {children}
        </main>
      </div>
    </div>
  );

  if (!joined) {
    return (
      <main className="relative grid min-h-dvh place-items-center bg-[hsl(var(--background))] px-5 text-[hsl(var(--foreground))]">
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
      </main>
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

            {teamCount > 0 && Number.isInteger(me?.team) && (() => { const t = tileFor(me.team); return (
              <motion.p variants={rise} className={`mt-5 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium ${t.bg} ${t.fg}`}><t.Icon className="h-4 w-4" />You are on the {TEAM_NAMES[me.team]} team</motion.p>
            ); })()}

            <motion.ul variants={stagger(0.04)} className="mt-8 flex flex-wrap gap-2" aria-label="Players in the game">
              {ranked.map((p) => {
                const t = teamCount > 0 && Number.isInteger(p.team) ? tileFor(p.team) : null;
                return (
                  <motion.li key={p.id} variants={pop} className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm ${p.connected === false ? 'opacity-50' : ''} ${p.id === playerIdRef.current ? 'border-[hsl(var(--primary))] bg-[hsl(var(--tint-green))] font-medium' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'}`}>
                    {t && <t.Icon className={`h-3.5 w-3.5 ${t.fg}`} aria-label={`${TEAM_NAMES[p.team]} team`} />}{p.name}
                  </motion.li>
                );
              })}
            </motion.ul>

            <motion.div variants={rise} className="mt-9 border-t border-[hsl(var(--border))] pt-5">
              <p className="eyebrow mb-3">The rules today</p>
              <ul className="flex flex-wrap gap-2 text-xs font-medium">
                {RULES.filter(([key]) => settings[key]).map(([key, label]) => <li key={key} className="rounded-full bg-[hsl(var(--tint-neutral))] px-2.5 py-1 text-[hsl(var(--tint-neutral-fg))]">{label}</li>)}
                {teamCount > 0 && <li className="rounded-full bg-[hsl(var(--tint-neutral))] px-2.5 py-1 text-[hsl(var(--tint-neutral-fg))]">{teamCount} teams</li>}
                {!RULES.some(([key]) => settings[key]) && teamCount === 0 && <li className="text-[hsl(var(--muted-foreground))]">Just you, the clock and the questions.</li>}
              </ul>
            </motion.div>
          </motion.div>
        )}

        {/* ── A question ── */}
        {session.state === 'question' && question && !opened && (
          <motion.div key={`count-${idx}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="my-auto">
            <Countdown startsAt={session.questionStartedAt} pausedAt={session.pausedAt} label={`Question ${idx + 1} of ${sequence.length}`} hint={`${TYPE_LABEL[question.type] || 'Question'}, ${Math.round(limitMs / 1000)} seconds`} />
          </motion.div>
        )}

        {session.state === 'question' && question && opened && outBefore && (
          <motion.div key={`out-${idx}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="my-auto py-6 text-center">
            <PiSkullBold className="mx-auto h-9 w-9 text-[hsl(var(--tint-red-fg))]" />
            <h1 className="text-hero mt-4 text-4xl">You are out</h1>
            <p className="mt-3 text-[hsl(var(--muted-foreground))]">Keep watching. <span className="tabular font-medium text-[hsl(var(--foreground))]">{stillIn}</span> {stillIn === 1 ? 'player is' : 'players are'} still in.</p>
            <p className="mt-6 text-sm text-[hsl(var(--muted-foreground))]">Question {idx + 1} of {sequence.length}</p>
          </motion.div>
        )}

        {session.state === 'question' && question && opened && !outBefore && (
          <motion.div key={`q-${idx}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <p className="eyebrow mb-3">Question {idx + 1} of {sequence.length}</p>
            <LiveClock endsAt={endsAt} pausedAt={session.pausedAt} limitMs={limitMs} running={!answered} onZero={onZero} tick={!answered} />
            {paused && (
              <p role="status" className="mt-3 flex items-center gap-2 rounded-xl bg-[hsl(var(--tint-yellow))] px-3.5 py-2.5 text-sm font-medium text-[hsl(var(--tint-yellow-fg))]"><PiPauseFill className="h-4 w-4" /> The host paused the game. Your time is kept.</p>
            )}

            {media && (
              <div className="mt-5 flex justify-center overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50">
                <MediaRenderer media={media} transform="question_main" className={mediaKind(media) === 'audio' ? 'w-full p-2' : 'max-h-56 w-auto max-w-full object-contain'} />
              </div>
            )}
            <h1 className="mt-5 text-2xl font-semibold leading-snug tracking-tight"><MathText text={question.questionText} /></h1>
            {multi && <p className="eyebrow mt-2">Choose every right answer</p>}

            {settings.powerUps !== false && me?.powerups && (
              <div className="mt-5"><PowerUpBar powerups={me.powerups} canFifty={canFifty} doubleArmed={doubleArmed} answered={answered} onUse={onPowerUp} /></div>
            )}

            <div className={`mt-5 ${paused ? 'pointer-events-none opacity-40' : ''}`} inert={paused ? true : undefined}>
              {question.type === 'MCQ' && (
                <div className="flex flex-col gap-3">
                  {question.mcqData.options.map((opt, i) => {
                    const chosen = (answer || []).includes(opt.id);
                    const state = answered ? (chosen ? 'locked' : 'unpicked') : chosen ? 'picked' : 'idle';
                    return <LiveOption key={opt.id} index={i} multi={multi} media={opt.media} hidden={hiddenIds.includes(opt.id)} state={state} onSelect={() => change(opt.id)}><MathText text={opt.text} /></LiveOption>;
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
            {outBefore ? (
              <div className="text-center">
                <PiSkullBold className="mx-auto h-9 w-9 text-[hsl(var(--tint-red-fg))]" />
                <h1 className="text-hero mt-4 text-4xl">You are out</h1>
                <p className="mt-3 text-[hsl(var(--muted-foreground))]"><span className="tabular font-medium text-[hsl(var(--foreground))]">{stillIn}</span> {stillIn === 1 ? 'player is' : 'players are'} still in.</p>
              </div>
            ) : (
              <>
                <ResultCard
                  question={question}
                  result={answered ? result : null}
                  rank={{ now: myRank, before: previousRanks(players, session.answers?.[idx])[playerIdRef.current] }}
                />
                {settings.suddenDeath && (
                  <p role="status" className={`mt-6 rounded-xl px-4 py-3 text-center text-sm font-medium ${outNow ? 'bg-[hsl(var(--tint-red))] text-[hsl(var(--tint-red-fg))]' : 'bg-[hsl(var(--tint-green))] text-[hsl(var(--tint-green-fg))]'}`}>
                    {outNow ? 'That answer knocked you out. You can keep watching.' : `You are still in. ${stillIn} ${stillIn === 1 ? 'player is' : 'players are'} left.`}
                  </p>
                )}
              </>
            )}
          </motion.div>
        )}

        {/* ── The standings ── */}
        {session.state === 'leaderboard' && (
          <motion.div key={`board-${idx}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="my-auto w-full py-6">
            <p className="eyebrow mb-1 text-center">After question {idx + 1} of {sequence.length}</p>
            <h1 className="text-hero mb-6 text-center text-5xl">Leaderboard</h1>
            {teamCount > 0 && <div className="mb-6"><TeamBoard players={players} teams={teamCount} myTeam={me?.team ?? null} /></div>}
            <Leaderboard players={players} answers={session.answers?.[idx]} meId={playerIdRef.current} limit={5} suddenDeath={!!settings.suddenDeath} />
          </motion.div>
        )}

        {/* ── The end ── */}
        {session.state === 'ended' && (
          <motion.div key="ended" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="my-auto w-full py-6 text-center">
            <p className="eyebrow">Game over</p>
            <h1 className="text-hero mt-3 text-5xl">
              {!finalRank ? 'Thanks for playing'
                : settings.suddenDeath && finalRank === 1 ? 'You were the last one standing'
                : teamCount > 0 && Number.isInteger(me?.team) ? `The ${TEAM_NAMES[me.team]} team finished ${ordinal(teamsRanked.find((t) => t.team === me.team)?.rank || 1)}`
                : `You finished ${ordinal(finalRank)}`}
            </h1>
            <p className="tabular mt-3 text-[hsl(var(--muted-foreground))]">
              {me ? `${me.score || 0} points · ${me.correctCount || 0} right · best streak ${me.bestStreak || 0}` : ''}
            </p>
            <div className="mt-10">
              {teamCount > 0
                ? <Podium ranked={teamsRanked.map((t) => ({ id: `team-${t.team}`, name: `${t.name} team`, score: t.average, rank: t.rank }))} />
                : <Podium ranked={orderedPlayers} />}
            </div>
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
