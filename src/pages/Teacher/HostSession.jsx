import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import {
  PiArrowRightBold, PiCheckBold, PiCopyBold, PiDownloadSimpleBold, PiEyeBold, PiLinkBold, PiPauseFill, PiPlayFill,
  PiSkullBold, PiSpinnerGapBold, PiTrophyBold, PiUsersBold, PiXBold,
} from 'react-icons/pi';
import { db } from '@/firebase';
import { Button } from '@/components/ui/button';
import Logo from '@/components/Logo';
import MediaRenderer from '@/components/MediaRenderer';
import { CorrectAnswer } from '@/components/AnswerReveal';
import AnswerBars from '@/components/live/AnswerBars';
import Countdown from '@/components/live/Countdown';
import LiveClock from '@/components/live/LiveClock';
import LiveOption from '@/components/live/LiveOption';
import Leaderboard from '@/components/live/Leaderboard';
import LobbySettings from '@/components/live/LobbySettings';
import Podium from '@/components/live/Podium';
import TeamBoard from '@/components/live/TeamBoard';
import HotspotPicker from '@/components/quiz/HotspotPicker';
import MathText from '@/components/MathText';
import { tileFor } from '@/components/live/tiles';
import { downloadCsv, safeFileName } from '@/utils/csv';
import { getMainMedia, getSubQuestions, mediaKind } from '@/utils/media';
import { shuffle } from '@/utils/quizAttempt';
import {
  alivePlayerIds, deleteSession, endGame, getPlaySequence, isOut, isPaused, kickPlayer, listenToSession, nextQuestion,
  pauseGame, questionDeadline, rankPlayers, rankSuddenDeath, rankTeams, resumeGame, revealQuestion, serverNow,
  eliminatePlayers, setQuestionDeadline, showLeaderboard, startGame, suddenDeathOut, suddenDeathOver, TEAM_NAMES, updateSettings,
} from '@/utils/liveSession';
import { playComplete } from '@/utils/sounds';
import { pop, rise, stagger } from '@/lib/motion';

const TYPE_LABEL = {
  MCQ: 'Multiple choice', TRUE_FALSE: 'True or false', FILL_IN_THE_BLANK: 'Type the answer',
  MATCH_THE_FOLLOWING: 'Match them up', REORDER: 'Put in order', CATEGORIZE: 'Sort into groups',
  VISUAL_COMPREHENSION: 'Look, then answer', LISTENING_COMPREHENSION: 'Listen, then answer',
  NUMERIC: 'Type a number', HOTSPOT: 'Tap the picture',
};

/** What the room sees while players work: the choices, but never the answer. */
function ProjectorBody({ question, pieces }) {
  switch (question.type) {
    case 'MCQ':
      return (
        <div className="grid gap-4 md:grid-cols-2">
          {question.mcqData.options.map((opt, i) => <LiveOption key={opt.id} index={i} size="xl" media={opt.media} state="display"><MathText text={opt.text} /></LiveOption>)}
        </div>
      );
    case 'TRUE_FALSE':
      return <div className="grid grid-cols-2 gap-4">{[true, false].map((v, i) => <LiveOption key={String(v)} index={i} size="xl" state="display">{v ? 'True' : 'False'}</LiveOption>)}</div>;
    case 'FILL_IN_THE_BLANK':
      return <p className="border-b-2 border-dashed border-[hsl(var(--input))] pb-3 text-3xl text-[hsl(var(--muted-foreground))]">Players are typing their answer</p>;
    case 'NUMERIC':
      return <p className="border-b-2 border-dashed border-[hsl(var(--input))] pb-3 text-3xl text-[hsl(var(--muted-foreground))]">Players are typing a number</p>;
    case 'HOTSPOT':
      return <p className="border-b-2 border-dashed border-[hsl(var(--input))] pb-3 text-3xl text-[hsl(var(--muted-foreground))]">Players are tapping the picture</p>;
    case 'MATCH_THE_FOLLOWING':
      return (
        <div className="grid gap-8 md:grid-cols-2">
          <ul className="flex flex-col gap-3">{question.matchData.pairs.map((p) => <li key={p.id} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-xl font-medium">{p.prompt}</li>)}</ul>
          <ul className="flex flex-col gap-3">{pieces.map((p) => <li key={p.id} className="rounded-xl border border-dashed border-[hsl(var(--input))] px-4 py-3 text-xl">{p.text}</li>)}</ul>
        </div>
      );
    case 'REORDER':
      return <ul className="flex flex-col gap-3">{pieces.map((p) => <li key={p.id} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-xl font-medium">{p.text}</li>)}</ul>;
    case 'CATEGORIZE':
      return (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-3">{question.categorizeData.categories.map((c) => <span key={c.id} className="rounded-xl bg-[hsl(var(--ink))] px-4 py-2 text-lg font-medium text-[hsl(var(--ink-foreground))]">{c.name}</span>)}</div>
          <div className="flex flex-wrap gap-3">{pieces.map((p) => <span key={p.id} className="rounded-xl border border-dashed border-[hsl(var(--input))] px-4 py-2.5 text-xl">{p.text}</span>)}</div>
        </div>
      );
    case 'VISUAL_COMPREHENSION':
    case 'LISTENING_COMPREHENSION':
      return (
        <ol className="flex flex-col gap-8">
          {getSubQuestions(question).filter((s) => s?.mcqData).map((s, i) => (
            <li key={s.id ?? i}>
              <p className="mb-3 text-xl font-medium">{i + 1}. {s.questionText}</p>
              <div className="grid gap-3 md:grid-cols-2">{s.mcqData.options.map((o, k) => <LiveOption key={o.id} index={k} state="display">{o.text}</LiveOption>)}</div>
            </li>
          ))}
        </ol>
      );
    default: return null;
  }
}

/**
 * The teacher's screen, built to be put on a projector. It controls the game: it holds the
 * lobby and its rules, starts each question with a shared 3, 2, 1, keeps the clock, reveals the
 * answer with how the room voted, shows the standings and ends on a podium. Players' phones
 * follow whatever state this page writes to the session.
 */
export default function HostSession() {
  const { pin } = useParams();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(null);
  const [opened, setOpened] = useState(false);
  const [zeroed, setZeroed] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const joinUrl = `${window.location.origin}/play/${pin}`;
  const joinHost = `${window.location.host}/play`;

  useEffect(() => {
    const unsub = listenToSession(pin, (s) => {
      setSession(s);
      setLoading(false);
      if (!s) return;
      setQuiz((current) => {
        if (!current) getDoc(doc(db, 'quizzes', s.quizId)).then((snap) => { if (snap.exists()) setQuiz(snap.data()); });
        return current;
      });
    });
    return () => unsub();
  }, [pin]);

  const sequence = useMemo(() => getPlaySequence(quiz, session?.order), [quiz, session?.order]);
  const idx = session?.currentQuestionIndex ?? 0;
  const question = sequence[idx] || null;
  const media = getMainMedia(question);
  const ranked = useMemo(() => rankPlayers(session?.players), [session?.players]);
  const answers = useMemo(() => session?.answers?.[idx] || {}, [session?.answers, idx]);
  const answeredCount = Object.keys(answers).length;
  const limitMs = (parseInt(question?.timeLimit, 10) || 30) * 1000;
  const endsAt = questionDeadline(session, question);
  const paused = isPaused(session);
  const settings = session?.settings || {};
  const teamCount = Number(settings.teams) || 0;
  const suddenDeath = !!settings.suddenDeath;
  const aliveCount = alivePlayerIds(session?.players).length;
  // Who can still answer: everyone, or in sudden death only those still in.
  const askedCount = suddenDeath ? aliveCount : ranked.length;
  const orderedFinal = useMemo(() => (suddenDeath ? rankSuddenDeath(session?.players) : ranked), [suddenDeath, session?.players, ranked]);
  const teamsRanked = useMemo(() => (teamCount ? rankTeams(session?.players, teamCount) : []), [session?.players, teamCount]);
  const gameOver = suddenDeath && suddenDeathOver(session?.players);

  // Loose pieces of a drag question, shuffled once per question: the stored order of a Reorder
  // question IS the answer, so it must never be shown as it is.
  const pieces = useMemo(() => {
    switch (question?.type) {
      case 'MATCH_THE_FOLLOWING': return shuffle(question.matchData?.pairs).map((p) => ({ id: p.id, text: p.answer }));
      case 'REORDER': return shuffle(question.reorderData?.items).map((i) => ({ id: i.id, text: i.text }));
      case 'CATEGORIZE': return shuffle(question.categorizeData?.items).map((i) => ({ id: i.id, text: i.text }));
      default: return [];
    }
  }, [question]);

  // The 3, 2, 1. The question opens at a server time every screen was given.
  useEffect(() => {
    if (session?.state !== 'question') { setOpened(false); return undefined; }
    const wait = (session.questionStartedAt || 0) - serverNow();
    if (wait <= 0) { setOpened(true); return undefined; }
    setOpened(false);
    const id = setTimeout(() => setOpened(true), wait);
    return () => clearTimeout(id);
  }, [session?.state, session?.currentQuestionIndex, session?.questionStartedAt]);

  // ── The shared clock ────────────────────────────────────────────────────────────────
  // The clock is held until THIS screen's copy of the question's media has loaded, then moved
  // out by writing the deadline everyone reads. Audio and video also get the clip's length on
  // top of the limit, because a 30 second question cannot hold a 90 second recording. The media
  // stays mounted but hidden during the 3, 2, 1, so it is already loading and can be measured.
  const mediaBoxRef = useRef(null);
  const [clockSettledFor, setClockSettledFor] = useState(null);
  const clockSettled = !media || clockSettledFor === idx;

  useEffect(() => {
    if (!session || session.state !== 'question' || !question || !session.questionStartedAt) return undefined;
    if (!media) { setClockSettledFor(idx); return undefined; }

    setClockSettledFor(null);
    const startedAt = session.questionStartedAt;
    let settled = false;
    const settle = (clipMs) => {
      if (settled) return;
      settled = true;
      // The clip is counted from the moment the question opens, or from now if the media was slow.
      // A deadline only ever moves later, so nobody's clock is cut short.
      setQuestionDeadline(pin, Math.max(startedAt, serverNow()) + (clipMs || 0) + limitMs).catch(() => {});
      setClockSettledFor(idx);
    };
    const element = mediaBoxRef.current?.querySelector('img, video, audio');
    if (!element) { settle(0); return undefined; }
    const onMetadata = () => settle(Number.isFinite(element.duration) ? Math.round(element.duration * 1000) : 0);
    const onSettled = () => settle(0);

    if (element.tagName === 'IMG') {
      if (element.complete) { settle(0); return undefined; }
      element.addEventListener('load', onSettled);
    } else {
      if (element.readyState >= 1) { onMetadata(); return undefined; }
      element.addEventListener('loadedmetadata', onMetadata);
    }
    element.addEventListener('error', onSettled);
    const failsafe = setTimeout(onSettled, 10000);       // a file that never arrives must not freeze the game
    return () => {
      clearTimeout(failsafe);
      element.removeEventListener('load', onSettled);
      element.removeEventListener('loadedmetadata', onMetadata);
      element.removeEventListener('error', onSettled);
    };
  }, [session?.state, idx, session?.questionStartedAt, question, media, pin, limitMs]); // eslint-disable-line react-hooks/exhaustive-deps

  // The clock hit zero. Reveal as soon as the media has settled, so the room never misses the
  // picture the question is about.
  useEffect(() => { setZeroed(false); }, [idx, session?.questionEndsAt, session?.state]);

  // Closing a question.
  const doReveal = () => { revealQuestion(pin); };

  // Sudden death: a moment after the reveal, knock out whoever did not answer fully right. The wait
  // is on purpose. A player's answer is stored a beat after their phone says "locked in", and an
  // answer still on its way must be counted. Running it twice is harmless: it only looks at players
  // who are still in, and the rule never knocks out everyone.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  useEffect(() => {
    if (!suddenDeath || session?.state !== 'reveal') return undefined;
    const id = setTimeout(() => {
      const s = sessionRef.current;
      if (s?.state !== 'reveal') return;
      eliminatePlayers(pin, suddenDeathOut(s.players, s.answers?.[idx]), idx).catch(() => {});
    }, 1500);
    return () => clearTimeout(id);
  }, [suddenDeath, session?.state, idx, pin]);
  useEffect(() => {
    if (zeroed && clockSettled && session?.state === 'question' && !paused) doReveal();
  }, [zeroed, clockSettled, session?.state, pin, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ─────────────────────────────────────────────────────────────────────────
  const copy = async (value, kind) => {
    try { await navigator.clipboard.writeText(value); setCopied(kind); toast.success(kind === 'link' ? 'Join link copied' : 'Game code copied'); setTimeout(() => setCopied(null), 2000); }
    catch { toast.error(`We could not copy. Share this instead: ${value}`); }
  };

  const handleStart = async () => {
    if (ranked.length === 0) { toast.error('Wait for at least one player to join.'); return; }
    try { await startGame(pin); } catch { toast.error('We could not start the game.'); }
  };
  const handleNext = async () => {
    const next = idx + 1;
    // The game also ends when sudden death leaves one player standing.
    if (next >= sequence.length || gameOver) { playComplete(); try { await endGame(pin); } catch { toast.error('We could not end the game.'); } return; }
    try { await nextQuestion(pin, next); } catch { toast.error('We could not move on.'); }
  };
  const handlePause = () => { (paused ? resumeGame(pin, session) : pauseGame(pin)).catch(() => toast.error('We could not change the pause.')); };
  const handleSettings = (patch) => { updateSettings(pin, quiz, patch).catch(() => toast.error('We could not change that setting.')); };
  const handleEnd = async () => { try { await deleteSession(pin); } catch { /* the session may already be gone */ } navigate('/teacher/your-quizzes'); };

  const exportResults = () => {
    const header = ['Rank', 'Name', 'Score', 'Correct answers', 'Best streak'];
    if (teamCount) header.push('Team');
    if (suddenDeath) header.push('Knocked out on question');
    downloadCsv(`${safeFileName(session?.quizTitle)}-live-results.csv`, [
      header,
      ...orderedFinal.map((p) => {
        const row = [p.rank, p.name, p.score, p.correctCount || 0, p.bestStreak || 0];
        if (teamCount) row.push(Number.isInteger(p.team) ? TEAM_NAMES[p.team] : '');
        if (suddenDeath) row.push(isOut(p) ? p.eliminatedAt + 1 : 'Still in');
        return row;
      }),
    ]);
  };

  // How the room answered, for the reveal.
  const bars = useMemo(() => {
    if (!question) return null;
    const list = Object.values(answers);
    if (question.type === 'MCQ') {
      const right = new Set(question.mcqData.correctOptions.map(String));
      return question.mcqData.options.map((o) => ({
        id: o.id, label: o.text || 'Picture answer', correct: right.has(String(o.id)),
        count: list.filter((a) => (Array.isArray(a.answer) ? a.answer : [a.answer]).map(String).includes(String(o.id))).length,
      }));
    }
    if (question.type === 'TRUE_FALSE') {
      return [true, false].map((v) => ({ id: String(v), label: v ? 'True' : 'False', correct: question.trueFalseData.correctAnswer === v, count: list.filter((a) => a.answer === v).length }));
    }
    return [
      { id: 'all', label: 'Got it all right', correct: true, count: list.filter((a) => a.correct).length },
      { id: 'part', label: 'Part right', correct: false, count: list.filter((a) => !a.correct && a.points > 0).length },
      { id: 'miss', label: 'Missed it', correct: false, count: list.filter((a) => !a.correct && !(a.points > 0)).length },
    ];
  }, [question, answers]);

  if (loading) return <div className="grid min-h-dvh place-items-center bg-[hsl(var(--background))]"><PiSpinnerGapBold className="h-8 w-8 animate-spin text-[hsl(var(--muted-foreground))]" /></div>;
  if (!session) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[hsl(var(--background))] px-6 text-center text-[hsl(var(--foreground))]">
        <div>
          <p className="eyebrow">Live game</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">This game has ended or could not be found</h1>
          <Button className="mt-7" onClick={() => navigate('/teacher/your-quizzes')}>Back to your quizzes</Button>
        </div>
      </div>
    );
  }

  const state = session.state;

  return (
    <div className="relative flex min-h-dvh flex-col bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(50%_100%_at_50%_0%,hsl(var(--brand)/0.08),transparent)]" />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-5">
        <div className="flex min-w-0 items-center gap-4">
          <Logo />
          <span className="hidden h-5 w-px bg-[hsl(var(--border))] sm:block" />
          <p className="hidden min-w-0 truncate text-sm text-[hsl(var(--muted-foreground))] sm:block">{session.quizTitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="tabular inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--tint-neutral))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--tint-neutral-fg))]"><PiUsersBold className="h-4 w-4" />{suddenDeath && state !== 'lobby' ? `${aliveCount} of ${ranked.length} in` : ranked.length}</span>
          {paused && <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--tint-yellow))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--tint-yellow-fg))]"><PiPauseFill className="h-4 w-4" /> Paused</span>}
          {confirmEnd ? (
            <span className="flex items-center gap-2 text-sm">
              End for everyone?
              <Button size="sm" variant="destructive" onClick={handleEnd}>End game</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmEnd(false)}>Keep playing</Button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmEnd(true)} aria-label="End game" title="End game" className="grid h-9 w-9 place-items-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"><PiXBold className="h-5 w-5" /></button>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 pb-14">
        <AnimatePresence mode="wait" initial={false}>
          {/* ── Lobby ── */}
          {state === 'lobby' && (
            <motion.div key="lobby" variants={stagger(0.06)} initial="hidden" animate="show" exit={{ opacity: 0 }} className="grid gap-x-16 gap-y-12 pb-28 pt-4 lg:grid-cols-[1fr_1fr]">
              <div>
                <motion.p variants={rise} className="eyebrow">Join at {joinHost}</motion.p>
                <motion.p variants={rise} className="tabular mt-3 font-mono text-[clamp(4rem,11vw,8rem)] font-medium leading-none tracking-[0.12em]">{pin}</motion.p>

                <motion.div variants={rise} className="mt-8 flex flex-wrap items-center gap-6">
                  <div className="rounded-2xl border border-[hsl(var(--border))] bg-white p-3">
                    <QRCodeSVG value={joinUrl} size={150} level="M" bgColor="#FFFFFF" fgColor="#181816" title="Scan to join the game" />
                  </div>
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">Scan the code with a phone camera, or share the link.</p>
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2"><PiLinkBold className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" /><span className="truncate font-mono text-xs text-[hsl(var(--muted-foreground))]">{joinUrl}</span></div>
                    <div className="mt-3 flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => copy(joinUrl, 'link')}>{copied === 'link' ? <PiCheckBold /> : <PiCopyBold />}{copied === 'link' ? 'Copied' : 'Copy link'}</Button>
                      <Button variant="outline" size="sm" onClick={() => copy(pin, 'code')}>{copied === 'code' ? <PiCheckBold /> : <PiCopyBold />}{copied === 'code' ? 'Copied' : 'Copy code'}</Button>
                    </div>
                  </div>
                </motion.div>

                <motion.div variants={rise} className="mt-10">
                  <p className="eyebrow mb-1">Rules</p>
                  <LobbySettings settings={session.settings} onChange={handleSettings} disabled={!quiz} />
                </motion.div>
              </div>

              <div className="flex flex-col">
                <motion.div variants={rise} className="flex items-baseline justify-between">
                  <h2 className="text-xl font-semibold tracking-tight">Players</h2>
                  <p className="eyebrow tabular">{ranked.length} joined</p>
                </motion.div>
                <motion.ul variants={stagger(0.03)} className="mt-4 flex min-h-32 flex-wrap content-start gap-2.5" aria-label="Players in the game">
                  {ranked.length === 0 && <li className="text-[hsl(var(--muted-foreground))]">Waiting for the first player. Names appear here as people join.</li>}
                  {ranked.map((p) => {
                    const t = teamCount > 0 && Number.isInteger(p.team) ? tileFor(p.team) : null;
                    return (
                    <motion.li key={p.id} variants={pop} className={`group inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-1.5 pl-4 pr-2 text-lg ${p.connected === false ? 'opacity-50' : ''}`} title={p.connected === false ? 'Not connected right now' : undefined}>
                      {t && <t.Icon className={`h-4 w-4 ${t.fg}`} aria-label={`${TEAM_NAMES[p.team]} team`} />}{p.name}
                      <button type="button" onClick={() => kickPlayer(pin, p.id)} aria-label={`Remove ${p.name}`} title="Remove player" className="grid h-6 w-6 place-items-center rounded-full text-[hsl(var(--muted-foreground))] opacity-60 hover:bg-[hsl(var(--muted))] hover:opacity-100"><PiXBold className="h-3.5 w-3.5" /></button>
                    </motion.li>
                    );
                  })}
                </motion.ul>
              </div>

              {/* Pinned to the bottom of the screen: starting the game is the main action, so it
                  must never be below the fold on a laptop. */}
              <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]/90 backdrop-blur-md">
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    <span className="tabular font-medium text-[hsl(var(--foreground))]">{sequence.length}</span> questions{session.skippedCount ? `, ${session.skippedCount} skipped because they need marking by hand` : ''}
                  </p>
                  <Button variant="brand" size="xl" className="min-w-56" onClick={handleStart} disabled={ranked.length === 0}><PiPlayFill /> Start game</Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── A question: the 3, 2, 1 first, then the clock ── */}
          {state === 'question' && question && (
            <motion.div key={`q-${idx}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col">
              {/* Always mounted, hidden until the countdown ends: it loads, and can be measured, in the meantime. */}
              {media && (
                <div ref={mediaBoxRef} className={opened ? 'mb-7 overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50 flex justify-center' : 'hidden'}>
                  <MediaRenderer media={media} transform="question_main" className={mediaKind(media) === 'audio' ? 'w-full max-w-xl p-3' : 'max-h-[34vh] w-auto max-w-full object-contain'} />
                </div>
              )}

              {!opened ? (
                <div className="grid flex-1 place-items-center">
                  <Countdown size="xl" startsAt={session.questionStartedAt} pausedAt={session.pausedAt} label={`Question ${idx + 1} of ${sequence.length}`} hint={`${TYPE_LABEL[question.type] || 'Question'}, ${Math.round(limitMs / 1000)} seconds`} />
                </div>
              ) : (
                <>
                  <div className="mb-6 flex items-end justify-between gap-8">
                    <p className="eyebrow">Question {idx + 1} of {sequence.length}</p>
                    <div className="w-56 shrink-0 sm:w-72"><LiveClock big endsAt={endsAt} pausedAt={session.pausedAt} limitMs={limitMs} running={clockSettled} onZero={() => setZeroed(true)} /></div>
                  </div>
                  <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight md:text-5xl"><MathText text={question.questionText} /></h1>
                  <div className="mt-9"><ProjectorBody question={question} pieces={pieces} /></div>
                  <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-[hsl(var(--border))] pt-6">
                    <p className="tabular text-lg"><span className="text-3xl font-semibold">{answeredCount}</span> <span className="text-[hsl(var(--muted-foreground))]">of {askedCount} answered</span></p>
                    <div className="flex items-center gap-3">
                      <Button variant="outline" size="lg" onClick={handlePause}>{paused ? <PiPlayFill /> : <PiPauseFill />} {paused ? 'Resume' : 'Pause'}</Button>
                      <Button variant="outline" size="lg" onClick={doReveal} disabled={paused}><PiEyeBold /> Reveal now</Button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ── The reveal ── */}
          {state === 'reveal' && question && (
            <motion.div key={`reveal-${idx}`} variants={stagger(0.07)} initial="hidden" animate="show" exit={{ opacity: 0 }} className="flex flex-1 flex-col">
              <motion.p variants={rise} className="eyebrow">Question {idx + 1} of {sequence.length}</motion.p>
              <motion.h1 variants={rise} className="mt-3 text-balance text-3xl font-semibold leading-tight tracking-tight md:text-4xl"><MathText text={question.questionText} /></motion.h1>
              <motion.div variants={rise} className="mt-9 max-w-3xl">{bars && <AnswerBars rows={bars} total={askedCount} />}</motion.div>
              {question.type === 'HOTSPOT' && (
                <motion.div variants={rise} className="mt-9">
                  {/* Every player's tap as a dot, green if it landed in the right area, red if not. */}
                  <HotspotPicker
                    media={question.media}
                    regions={question.hotspotData?.regions || []}
                    marks={Object.values(answers).filter((a) => a.answer && Number.isFinite(a.answer.x)).map((a) => ({ x: a.answer.x, y: a.answer.y, right: !!a.correct }))}
                  />
                </motion.div>
              )}
              {suddenDeath && (() => {
                // Already marked out by this question, plus anyone about to be (the mark lands a moment later).
                const pending = suddenDeathOut(session.players, answers);
                const names = ranked.filter((p) => p.eliminatedAt === idx || pending.includes(p.id)).map((p) => p.name);
                const left = aliveCount - pending.length;
                return (
                  <motion.p variants={rise} className="mt-9 flex max-w-3xl items-center gap-3 rounded-2xl bg-[hsl(var(--tint-red))] px-5 py-4 text-lg font-medium text-[hsl(var(--tint-red-fg))]">
                    <PiSkullBold className="h-6 w-6 shrink-0" />
                    {names.length > 0 ? `Knocked out: ${names.join(', ')}. ${left} still in.` : `Nobody is knocked out this time. ${left} still in.`}
                  </motion.p>
                );
              })()}
              {!['MCQ', 'TRUE_FALSE', 'HOTSPOT'].includes(question.type) && (
                <motion.div variants={rise} className="mt-9 max-w-3xl rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
                  <p className="eyebrow mb-3">The answer</p>
                  <div className="text-lg"><CorrectAnswer q={question} tone="plain" /></div>
                </motion.div>
              )}
              <motion.div variants={rise} className="mt-auto pt-10">
                <Button size="xl" onClick={() => showLeaderboard(pin)}><PiTrophyBold /> Show leaderboard</Button>
              </motion.div>
            </motion.div>
          )}

          {/* ── The standings ── */}
          {state === 'leaderboard' && (
            <motion.div key={`board-${idx}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
              <p className="eyebrow text-center">After question {idx + 1} of {sequence.length}</p>
              <h1 className="text-hero mb-8 mt-3 text-center text-6xl">Leaderboard</h1>
              {teamCount > 0 && <div className="mb-6"><TeamBoard big players={session.players} teams={teamCount} /></div>}
              <Leaderboard big players={session.players} answers={session.answers?.[idx]} limit={5} suddenDeath={suddenDeath} />
              <div className="mt-auto flex justify-center pt-12">
                <Button size="xl" variant="brand" onClick={handleNext}>{idx + 1 >= sequence.length || gameOver ? 'Finish game' : 'Next question'} <PiArrowRightBold /></Button>
              </div>
            </motion.div>
          )}

          {/* ── The end ── */}
          {state === 'ended' && (
            <motion.div key="ended" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center">
              <p className="eyebrow">Game over</p>
              <h1 className="text-hero mb-10 mt-3 text-center text-6xl">
                {teamCount > 0 && teamsRanked[0] ? `${teamsRanked[0].name} team wins`
                  : suddenDeath && orderedFinal[0] ? `${orderedFinal[0].name} is the last one standing`
                  : orderedFinal[0] ? `${orderedFinal[0].name} wins` : 'That is a wrap'}
              </h1>
              {teamCount > 0
                ? <Podium big ranked={teamsRanked.map((t) => ({ id: `team-${t.team}`, name: `${t.name} team`, score: t.average, rank: t.rank }))} />
                : <Podium big ranked={orderedFinal} />}
              {orderedFinal.length > (teamCount > 0 ? 0 : 3) && (
                <ol className="mt-10 w-full divide-y divide-[hsl(var(--border))] border-y border-[hsl(var(--border))]">
                  {orderedFinal.slice(teamCount > 0 ? 0 : 3).map((p) => (
                    <li key={p.id} className="flex items-center gap-4 py-3 text-lg"><span className="tabular w-8 text-center font-mono text-sm text-[hsl(var(--muted-foreground))]">{p.rank}</span><span className="flex-1 truncate">{p.name}</span><span className="tabular font-semibold">{p.score}</span></li>
                  ))}
                </ol>
              )}
              <div className="mt-12 flex flex-wrap justify-center gap-3">
                <Button variant="outline" size="lg" onClick={exportResults}><PiDownloadSimpleBold /> Export results</Button>
                <Button size="lg" onClick={handleEnd}>Close game</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
