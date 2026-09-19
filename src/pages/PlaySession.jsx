import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import Confetti from '../components/Confetti';
import MediaRenderer from '../components/MediaRenderer';
import {
  listenToSession, joinSession, leaveSession, submitAnswer,
  generateGuestId, LIVE_SUPPORTED_TYPES,
} from '../utils/liveSession';
import { playCorrect, playWrong, playComplete, playTick } from '../utils/sounds';
import { Home, Hash, Users, Clock, CheckCircle2, XCircle, Trophy, Crown, Medal, Loader2, GripVertical } from 'lucide-react';

const DRAG_TYPES = ['MATCH_THE_FOLLOWING', 'REORDER', 'CATEGORIZE'];

const shuffleArray = (arr) => (Array.isArray(arr) ? [...arr].sort(() => Math.random() - 0.5) : []);

/**
 * Working state for the three drag-and-drop types, rebuilt whenever the
 * question changes. Only ids ever leave this object — see the answer shapes
 * documented in utils/liveSession.js.
 */
const buildDragState = (question) => {
  if (!question) return null;
  switch (question.type) {
    case 'MATCH_THE_FOLLOWING':
      return {
        type: question.type,
        slots: {}, // { [promptPairId]: answer card }
        bank: shuffleArray(question.matchData?.pairs).map(pair => ({ id: pair.id, text: pair.answer, media: pair.answerMedia })),
      };
    case 'REORDER':
      return { type: question.type, order: shuffleArray(question.reorderData?.items) };
    case 'CATEGORIZE':
      return {
        type: question.type,
        columns: {
          ...Object.fromEntries((question.categorizeData?.categories || []).map(cat => [String(cat.id), []])),
          bank: shuffleArray(question.categorizeData?.items),
        },
      };
    default:
      return null;
  }
};

const PlaySession = () => {
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
  const [timeLeft, setTimeLeft] = useState(null);
  const [selected, setSelected] = useState(null);
  const [fillInput, setFillInput] = useState('');
  const [mcqSelection, setMcqSelection] = useState([]);
  const [answered, setAnswered] = useState(false);
  const [lastResult, setLastResult] = useState(null); // { correct, points }
  const [dragState, setDragState] = useState(null);
  const [dragTouched, setDragTouched] = useState(false);

  const playerIdRef = useRef(currentUser?.uid || null);
  const pinRef = useRef(null);
  const questionStartRef = useRef(null);

  // ── Join flow ────────────────────────────────────────────────────────────────
  const handleJoin = async () => {
    const pin = pinInput.trim();
    const name = (nameInput || currentUser?.email?.split('@')[0] || 'Player').trim();
    if (!/^\d{6}$/.test(pin)) { setError('Enter the 6-digit game code.'); return; }
    if (!name) { setError('Please enter your name.'); return; }
    setError(''); setJoining(true);
    try {
      const playerId = currentUser?.uid || generateGuestId();
      playerIdRef.current = playerId;
      pinRef.current = pin;
      await joinSession(pin, playerId, name);
      setJoined(true);
    } catch (err) {
      setError(err.message || 'Failed to join game.');
    } finally {
      setJoining(false);
    }
  };

  // ── Subscribe once joined ───────────────────────────────────────────────────
  useEffect(() => {
    if (!joined || !pinRef.current) return;
    const unsub = listenToSession(pinRef.current, (s) => {
      if (!s) { toast.error('The host ended this session.'); navigate('/'); return; }
      setSession(s);
      if (!quiz) {
        getDoc(doc(db, 'quizzes', s.quizId)).then(snap => { if (snap.exists()) setQuiz(snap.data()); });
      }
    });
    return () => {
      unsub();
      if (pinRef.current && playerIdRef.current) leaveSession(pinRef.current, playerIdRef.current).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined]);

  const playableQuestions = useMemo(
    () => quiz?.questions.filter(q => LIVE_SUPPORTED_TYPES.includes(q.type)) || [],
    [quiz]
  );
  const currentQuestion = session ? playableQuestions[session.currentQuestionIndex] : null;

  // Reset per-question state when the question changes
  useEffect(() => {
    setSelected(null); setFillInput(''); setMcqSelection([]); setAnswered(false); setLastResult(null);
    questionStartRef.current = Date.now();
  }, [session?.currentQuestionIndex]);

  // The drag-and-drop board is built from the question itself, which arrives
  // with the quiz a moment after the session does — so key it on the question.
  useEffect(() => {
    setDragState(buildDragState(currentQuestion));
    setDragTouched(false);
  }, [currentQuestion]);

  // Countdown
  useEffect(() => {
    if (!session || session.state !== 'question' || !session.questionStartedAt || !currentQuestion) { setTimeLeft(null); return; }
    const limit = (parseInt(currentQuestion.timeLimit, 10) || 30) * 1000;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((limit - (Date.now() - session.questionStartedAt)) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 10 && remaining > 0) playTick();
    }, 250);
    return () => clearInterval(interval);
  }, [session?.state, session?.questionStartedAt, currentQuestion]);

  // Read own result once reveal happens
  useEffect(() => {
    if (session?.state === 'reveal' && answered && !lastResult) {
      const mine = session.answers?.[session.currentQuestionIndex]?.[playerIdRef.current];
      if (mine) {
        setLastResult({ correct: mine.correct, points: mine.points });
        // The drag-and-drop types can score part marks, which still feels like a win.
        (mine.correct || mine.points > 0) ? playCorrect() : playWrong();
      }
    }
    if (session?.state === 'ended') playComplete();
  }, [session?.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const isMultiSelect = currentQuestion?.type === 'MCQ' && (currentQuestion.mcqData?.correctOptions?.length || 0) > 1;

  const handleAnswer = async (answer) => {
    if (answered || !currentQuestion) return;
    setAnswered(true);
    setSelected(answer);
    const timeTaken = Date.now() - questionStartRef.current;
    try {
      await submitAnswer(pinRef.current, session.currentQuestionIndex, playerIdRef.current, answer, currentQuestion, timeTaken);
    } catch { toast.error('Failed to submit answer.'); setAnswered(false); }
  };

  const toggleMcqOption = (optId) => {
    if (answered) return;
    setMcqSelection(prev => prev.includes(optId) ? prev.filter(id => id !== optId) : [...prev, optId]);
  };

  const handleMcqClick = (optId) => {
    if (isMultiSelect) { toggleMcqOption(optId); return; }
    handleAnswer([optId]);
  };

  // ── Drag and drop (Match / Reorder / Categorize) ─────────────────────────────
  const isDragQuestion = DRAG_TYPES.includes(currentQuestion?.type);

  // dragState is rebuilt by an effect, which lands a render *after* the host
  // moves everyone to the next question. Ignore a board that still belongs to
  // the question before this one, or that render reads the wrong shape.
  const board = dragState?.type === currentQuestion?.type ? dragState : null;

  const handleDragEnd = ({ source, destination }) => {
    if (!destination || answered || !currentQuestion) return;
    setDragState(prev => {
      if (!prev || prev.type !== currentQuestion.type) return prev;

      if (currentQuestion.type === 'REORDER') {
        const order = [...prev.order];
        const [moved] = order.splice(source.index, 1);
        if (!moved) return prev;
        order.splice(destination.index, 0, moved);
        return { ...prev, order };
      }

      if (currentQuestion.type === 'CATEGORIZE') {
        const columns = { ...prev.columns };
        const from = [...(columns[source.droppableId] || [])];
        const [moved] = from.splice(source.index, 1);
        if (!moved) return prev;
        if (source.droppableId === destination.droppableId) {
          from.splice(destination.index, 0, moved);
          columns[source.droppableId] = from;
        } else {
          const to = [...(columns[destination.droppableId] || [])];
          to.splice(destination.index, 0, moved);
          columns[source.droppableId] = from;
          columns[destination.droppableId] = to;
        }
        return { ...prev, columns };
      }

      // MATCH_THE_FOLLOWING — one card per prompt slot, everything else waits
      // in the bank. Dropping onto a taken slot sends the old card back.
      const bank = [...prev.bank];
      const slots = { ...prev.slots };
      let moved;
      if (source.droppableId === 'bank') {
        [moved] = bank.splice(source.index, 1);
      } else {
        moved = slots[source.droppableId];
        delete slots[source.droppableId];
      }
      if (!moved) return prev;
      if (destination.droppableId === 'bank') {
        bank.splice(destination.index, 0, moved);
      } else {
        const displaced = slots[destination.droppableId];
        if (displaced) bank.push(displaced);
        slots[destination.droppableId] = moved;
      }
      return { ...prev, bank, slots };
    });
    setDragTouched(true);
  };

  /** Flattens the board into the serialisable shape scoreAnswer expects. */
  const buildDragAnswer = () => {
    if (!currentQuestion || !board) return null;
    switch (currentQuestion.type) {
      case 'MATCH_THE_FOLLOWING':
        return Object.fromEntries(
          Object.entries(board.slots).map(([pairId, card]) => [String(pairId), String(card.id)])
        );
      case 'REORDER':
        return board.order.map(item => String(item.id));
      case 'CATEGORIZE': {
        const placed = {};
        Object.entries(board.columns).forEach(([columnId, items]) => {
          if (columnId === 'bank') return;
          items.forEach(item => { placed[String(item.id)] = String(columnId); });
        });
        return placed;
      }
      default:
        return null;
    }
  };

  const hasDragPlacement = (() => {
    if (!board || !currentQuestion) return false;
    if (currentQuestion.type === 'REORDER') return true; // any order is a valid guess
    if (currentQuestion.type === 'MATCH_THE_FOLLOWING') return Object.keys(board.slots).length > 0;
    if (currentQuestion.type === 'CATEGORIZE') {
      return Object.entries(board.columns).some(([columnId, items]) => columnId !== 'bank' && items.length > 0);
    }
    return false;
  })();

  const submitDragAnswer = () => {
    const answer = buildDragAnswer();
    if (answer) handleAnswer(answer);
  };

  // The host reveals the instant the clock hits zero, so lock in whatever the
  // player has arranged rather than throwing their work away. Nothing is sent
  // if they never touched the board — that still scores 0, as before.
  useEffect(() => {
    if (timeLeft !== 0 || session?.state !== 'question') return;
    if (answered || !isDragQuestion || !dragTouched) return;
    submitDragAnswer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  const players = session?.players ? Object.entries(session.players).map(([id, p]) => ({ id, ...p })) : [];
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const myRank = sortedPlayers.findIndex(p => p.id === playerIdRef.current) + 1;
  const me = players.find(p => p.id === playerIdRef.current);

  // Shared class strings for the drag-and-drop boards
  const dragCard = 'flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-[hsl(var(--primary))]/50 bg-[hsl(var(--primary))]/20 text-sm font-semibold select-none';
  const dropZone = 'rounded-xl border-2 border-dashed transition-colors';

  // ── Join screen ──────────────────────────────────────────────────────────────
  if (!joined) {
    return (
      <div className="min-h-screen w-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] flex items-center justify-center p-4"
        style={{ background: 'radial-gradient(ellipse at 50% 30%, hsl(var(--primary) / 0.12) 0%, hsl(var(--background)) 70%)' }}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
          <Link to="/" className="flex items-center justify-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--ring))] text-white flex items-center justify-center font-black text-sm">Q</div>
            <span className="font-bold text-lg">Quizlike Live</span>
          </Link>

          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-3xl p-8">
            <Hash className="w-8 h-8 text-[hsl(var(--primary))] mx-auto mb-3" />
            <h1 className="text-xl font-bold text-center mb-6">Join Live Game</h1>

            <div className="flex flex-col gap-4">
              <Input
                placeholder="6-digit game code"
                value={pinInput}
                onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                className="bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))] text-center text-2xl font-mono tracking-widest placeholder:text-[hsl(var(--muted-foreground))]"
              />
              <Input
                placeholder="Your name"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                maxLength={24}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                className="bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]"
              />
              {error && <p className="text-[hsl(var(--destructive))] text-sm text-center">{error}</p>}
              <Button onClick={handleJoin} disabled={joining} size="lg"
                className="gap-2 bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--ring))] text-white border-0 hover:opacity-90">
                {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                Join Game
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!session) return (
    <div className="min-h-screen w-screen bg-[hsl(var(--background))] flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-[hsl(var(--muted-foreground))] animate-spin" />
    </div>
  );

  // ── Joined: render by state ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] flex flex-col items-center py-8 px-4 relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, hsl(var(--primary) / 0.12) 0%, hsl(var(--background)) 60%)' }}>

      <Link to="/" className="absolute top-5 left-5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
        <Home className="w-5 h-5" />
      </Link>

      <AnimatePresence mode="wait">

        {session.state === 'lobby' && (
          <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center mt-16">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--ring))] text-white flex items-center justify-center font-black text-xl mx-auto mb-4">
              {(nameInput || 'P').charAt(0).toUpperCase()}
            </div>
            <h1 className="text-2xl font-bold mb-1">You're in!</h1>
            <p className="text-[hsl(var(--muted-foreground))] mb-8">Waiting for the host to start…</p>
            <div className="flex items-center justify-center gap-2 text-[hsl(var(--muted-foreground))]">
              <Users className="w-4 h-4" /> {players.length} player{players.length !== 1 ? 's' : ''} joined
            </div>
          </motion.div>
        )}

        {session.state === 'question' && currentQuestion && (
          <motion.div key="question" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full max-w-lg">
            <div className="flex items-center justify-between mb-5">
              <Badge variant="outline" className="border-[hsl(var(--border))] text-[hsl(var(--foreground))] bg-[hsl(var(--muted))] text-xs">
                Q{session.currentQuestionIndex + 1}/{playableQuestions.length}
              </Badge>
              <div className={`flex items-center gap-1.5 font-bold px-3 py-1 rounded-full border text-sm ${timeLeft <= 10 ? 'bg-[hsl(var(--destructive))]/20 text-[hsl(var(--destructive))] border-[hsl(var(--destructive))]/30' : 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] border-[hsl(var(--border))]'}`}>
                <Clock className="w-3.5 h-3.5" /> {timeLeft ?? '–'}s
              </div>
            </div>

            <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl p-6 mb-5">
              <p className="text-lg font-bold leading-relaxed">{currentQuestion.questionText}</p>
            </div>

            <>
              {currentQuestion.type === 'MCQ' && (
                <div className="flex flex-col gap-3">
                  {isMultiSelect && !answered && (
                    <p className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wide font-semibold -mb-1">Select all that apply</p>
                  )}
                  {currentQuestion.mcqData.options.map(opt => {
                    // `selected` still holds the previous question's answer for the
                    // one render before the reset effect runs, and that answer is
                    // only an array for MCQ.
                    const liveSelection = answered ? selected : mcqSelection;
                    const isPicked = Array.isArray(liveSelection) && liveSelection.includes(opt.id);
                    return (
                      <button key={opt.id} disabled={answered} onClick={() => handleMcqClick(opt.id)}
                        className={`px-5 py-4 rounded-xl border-2 text-left font-semibold transition-colors ${
                          answered
                            ? isPicked ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/15 cursor-default' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] opacity-40 cursor-default'
                            : isPicked ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/15 cursor-pointer' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10 cursor-pointer'
                        }`}>
                        {opt.text}
                      </button>
                    );
                  })}
                  {isMultiSelect && !answered && (
                    <Button onClick={() => handleAnswer(mcqSelection)} disabled={!mcqSelection.length}
                      className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--ring))] text-white border-0 hover:opacity-90">
                      Submit Answer
                    </Button>
                  )}
                </div>
              )}
              {currentQuestion.type === 'TRUE_FALSE' && (
                <div className="grid grid-cols-2 gap-3">
                  <button disabled={answered} onClick={() => handleAnswer(true)}
                    className={`py-8 rounded-xl border-2 font-black text-xl text-emerald-600 dark:text-emerald-300 transition-colors ${answered ? (selected === true ? 'border-emerald-400 bg-emerald-500/25' : 'border-emerald-500/20 bg-emerald-500/5 opacity-40') + ' cursor-default' : 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 cursor-pointer'}`}>
                    TRUE
                  </button>
                  <button disabled={answered} onClick={() => handleAnswer(false)}
                    className={`py-8 rounded-xl border-2 font-black text-xl text-[hsl(var(--destructive))] transition-colors ${answered ? (selected === false ? 'border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/25' : 'border-[hsl(var(--destructive))]/20 bg-[hsl(var(--destructive))]/5 opacity-40') + ' cursor-default' : 'border-[hsl(var(--destructive))]/40 bg-[hsl(var(--destructive))]/10 hover:bg-[hsl(var(--destructive))]/20 cursor-pointer'}`}>
                    FALSE
                  </button>
                </div>
              )}
              {currentQuestion.type === 'FILL_IN_THE_BLANK' && (
                <div className="flex gap-2">
                  <Input value={fillInput} onChange={e => setFillInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAnswer(fillInput)}
                    disabled={answered}
                    placeholder="Type your answer…"
                    className="bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] disabled:opacity-60" />
                  <Button onClick={() => handleAnswer(fillInput)} disabled={!fillInput.trim() || answered}
                    className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--ring))] text-white border-0 shrink-0">
                    Submit
                  </Button>
                </div>
              )}
              {currentQuestion.type === 'MATCH_THE_FOLLOWING' && board && (
                <DragDropContext onDragEnd={handleDragEnd}>
                  <div className="flex flex-col gap-3">
                    {!answered && (
                      <p className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wide font-semibold">Drag an answer onto each prompt</p>
                    )}
                    {currentQuestion.matchData.pairs.map(pair => {
                      const card = board.slots[String(pair.id)];
                      return (
                        <div key={pair.id} className="grid grid-cols-2 gap-2 items-stretch">
                          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-sm font-semibold">
                            <MediaRenderer media={pair.promptMedia} transform="thumbnail" className="w-9 h-9 rounded object-cover shrink-0" />
                            <span className="min-w-0 break-words">{pair.prompt}</span>
                          </div>
                          <Droppable droppableId={String(pair.id)}>
                            {(provided, snapshot) => (
                              <div ref={provided.innerRef} {...provided.droppableProps}
                                className={`${dropZone} min-h-[52px] flex items-center justify-center p-1 ${snapshot.isDraggingOver ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10' : card ? 'border-[hsl(var(--primary))]/40 bg-[hsl(var(--card))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'}`}>
                                {card ? (
                                  <Draggable draggableId={String(card.id)} index={0} isDragDisabled={answered}>
                                    {(p) => (
                                      <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps}
                                        className={`${dragCard} ${answered ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}>
                                        <MediaRenderer media={card.media} transform="thumbnail" className="w-8 h-8 rounded object-cover shrink-0" />
                                        <span className="min-w-0 break-words">{card.text}</span>
                                      </div>
                                    )}
                                  </Draggable>
                                ) : (
                                  <span className="text-xs text-[hsl(var(--muted-foreground))]">Drop here</span>
                                )}
                                {provided.placeholder}
                              </div>
                            )}
                          </Droppable>
                        </div>
                      );
                    })}

                    <Droppable droppableId="bank" direction="horizontal">
                      {(provided, snapshot) => (
                        <div ref={provided.innerRef} {...provided.droppableProps}
                          className={`${dropZone} flex flex-wrap gap-2 p-2 min-h-[56px] ${snapshot.isDraggingOver ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'}`}>
                          {board.bank.map((card, i) => (
                            <Draggable key={card.id} draggableId={String(card.id)} index={i} isDragDisabled={answered}>
                              {(p) => (
                                <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps}
                                  className={`${dragCard} ${answered ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}>
                                  <MediaRenderer media={card.media} transform="thumbnail" className="w-8 h-8 rounded object-cover shrink-0" />
                                  <span className="min-w-0 break-words">{card.text}</span>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                          {!board.bank.length && <span className="text-xs text-[hsl(var(--muted-foreground))] self-center px-2">Every answer is placed</span>}
                        </div>
                      )}
                    </Droppable>

                    {!answered && (
                      <Button onClick={submitDragAnswer} disabled={!hasDragPlacement}
                        className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--ring))] text-white border-0 hover:opacity-90">
                        Submit Answer
                      </Button>
                    )}
                  </div>
                </DragDropContext>
              )}
              {currentQuestion.type === 'REORDER' && board && (
                <DragDropContext onDragEnd={handleDragEnd}>
                  <div className="flex flex-col gap-3">
                    {!answered && (
                      <p className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wide font-semibold">Drag into the right order</p>
                    )}
                    <Droppable droppableId="reorder-list">
                      {(provided) => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col gap-2">
                          {board.order.map((item, i) => (
                            <Draggable key={item.id} draggableId={String(item.id)} index={i} isDragDisabled={answered}>
                              {(p, snapshot) => (
                                <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps}
                                  className={`flex items-center gap-3 px-3 py-3 rounded-xl border-2 select-none ${answered ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} ${snapshot.isDragging ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/25' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'}`}>
                                  <span className="w-5 text-center font-black text-[hsl(var(--muted-foreground))] text-sm shrink-0">{i + 1}</span>
                                  <MediaRenderer media={item.media} transform="thumbnail" className="w-9 h-9 rounded object-cover shrink-0" />
                                  <span className="flex-1 min-w-0 text-sm font-semibold break-words">{item.text}</span>
                                  <GripVertical className="w-4 h-4 text-[hsl(var(--muted-foreground))] shrink-0" />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                    {!answered && (
                      <Button onClick={submitDragAnswer}
                        className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--ring))] text-white border-0 hover:opacity-90">
                        Submit Answer
                      </Button>
                    )}
                  </div>
                </DragDropContext>
              )}
              {currentQuestion.type === 'CATEGORIZE' && board && (
                <DragDropContext onDragEnd={handleDragEnd}>
                  <div className="flex flex-col gap-3">
                    {!answered && (
                      <p className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wide font-semibold">Drag every item into a group</p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {currentQuestion.categorizeData.categories.map(cat => (
                        <Droppable key={cat.id} droppableId={String(cat.id)}>
                          {(provided, snapshot) => (
                            <div ref={provided.innerRef} {...provided.droppableProps}
                              className={`${dropZone} p-2 flex flex-col gap-2 min-h-[110px] ${snapshot.isDraggingOver ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'}`}>
                              <p className="text-xs font-bold text-center text-[hsl(var(--primary))] truncate">{cat.name}</p>
                              {(board.columns[String(cat.id)] || []).map((item, i) => (
                                <Draggable key={item.id} draggableId={String(item.id)} index={i} isDragDisabled={answered}>
                                  {(p) => (
                                    <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps}
                                      className={`${dragCard} ${answered ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}>
                                      <MediaRenderer media={item.media} transform="thumbnail" className="w-8 h-8 rounded object-cover shrink-0" />
                                      <span className="min-w-0 break-words">{item.text}</span>
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      ))}
                    </div>

                    <Droppable droppableId="bank" direction="horizontal">
                      {(provided, snapshot) => (
                        <div ref={provided.innerRef} {...provided.droppableProps}
                          className={`${dropZone} flex flex-wrap gap-2 p-2 min-h-[56px] ${snapshot.isDraggingOver ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'}`}>
                          {(board.columns.bank || []).map((item, i) => (
                            <Draggable key={item.id} draggableId={String(item.id)} index={i} isDragDisabled={answered}>
                              {(p) => (
                                <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps}
                                  className={`${dragCard} ${answered ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}>
                                  <MediaRenderer media={item.media} transform="thumbnail" className="w-8 h-8 rounded object-cover shrink-0" />
                                  <span className="min-w-0 break-words">{item.text}</span>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                          {!(board.columns.bank || []).length && <span className="text-xs text-[hsl(var(--muted-foreground))] self-center px-2">Every item is sorted</span>}
                        </div>
                      )}
                    </Droppable>

                    {!answered && (
                      <Button onClick={submitDragAnswer} disabled={!hasDragPlacement}
                        className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--ring))] text-white border-0 hover:opacity-90">
                        Submit Answer
                      </Button>
                    )}
                  </div>
                </DragDropContext>
              )}
              {answered && (
                <p className="text-center text-[hsl(var(--muted-foreground))] text-sm mt-5">Answer locked in — waiting for others…</p>
              )}
            </>
          </motion.div>
        )}

        {session.state === 'reveal' && (
          <motion.div key="reveal" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-center mt-16">
            {lastResult ? (
              <>
                {lastResult.correct
                  ? <CheckCircle2 className="w-16 h-16 text-emerald-600 dark:text-emerald-400 mx-auto mb-4" />
                  : lastResult.points > 0
                    ? <CheckCircle2 className="w-16 h-16 text-amber-400 mx-auto mb-4" />
                    : <XCircle className="w-16 h-16 text-[hsl(var(--destructive))] mx-auto mb-4" />}
                <h1 className="text-2xl font-black mb-1">
                  {lastResult.correct ? 'Correct!' : lastResult.points > 0 ? 'Partly right' : 'Not quite'}
                </h1>
                <p className="text-[hsl(var(--muted-foreground))] mb-2">{lastResult.points > 0 ? `+${lastResult.points} points` : 'Better luck next time'}</p>
              </>
            ) : (
              <>
                <XCircle className="w-16 h-16 text-[hsl(var(--muted-foreground))] mx-auto mb-4" />
                <h1 className="text-2xl font-black mb-1">Time's up!</h1>
                <p className="text-[hsl(var(--muted-foreground))]">You didn't answer in time.</p>
              </>
            )}
          </motion.div>
        )}

        {session.state === 'leaderboard' && (
          <motion.div key="leaderboard" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full max-w-md">
            <h2 className="text-xl font-black text-center mb-2">Leaderboard</h2>
            <p className="text-center text-[hsl(var(--muted-foreground))] text-sm mb-6">You're #{myRank} with {me?.score ?? 0} points</p>
            <div className="flex flex-col gap-2">
              {sortedPlayers.slice(0, 5).map((p, i) => (
                <div key={p.id} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl ${p.id === playerIdRef.current ? 'bg-[hsl(var(--primary))]/15 border border-[hsl(var(--primary))]/40' : 'bg-[hsl(var(--card))] border border-[hsl(var(--border))]'}`}>
                  <span className="font-black w-5 text-[hsl(var(--muted-foreground))]">{i + 1}</span>
                  <span className="flex-1 font-semibold truncate">{p.name}</span>
                  <span className="font-black">{p.score}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {session.state === 'ended' && (
          <motion.div key="ended" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center mt-12">
            {myRank <= 3 && <Confetti />}
            <Trophy className="w-14 h-14 text-amber-400 mx-auto mb-4" />
            <h1 className="text-2xl font-black mb-1">Game Over!</h1>
            <div className="flex items-center justify-center gap-2 mb-1">
              {myRank === 1 && <Crown className="w-5 h-5 text-amber-400" />}
              {myRank === 2 && <Medal className="w-5 h-5 text-slate-400" />}
              {myRank === 3 && <Medal className="w-5 h-5 text-amber-700" />}
              <p className="text-[hsl(var(--foreground))] font-semibold">You finished #{myRank} of {players.length}</p>
            </div>
            <p className="text-3xl font-black mb-8">{me?.score ?? 0} pts</p>
            <Link to="/">
              <Button size="lg" className="gap-2 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/70">
                <Home className="w-4 h-4" /> Back Home
              </Button>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PlaySession;
