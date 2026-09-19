import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Confetti from '../../components/Confetti';
import MediaRenderer from '../../components/MediaRenderer';
import {
  listenToSession, startGame, revealQuestion, showLeaderboard,
  nextQuestion, endGame, deleteSession, LIVE_SUPPORTED_TYPES,
} from '../../utils/liveSession';
import { playComplete, playTick } from '../../utils/sounds';
import {
  Users, Play, Eye, Trophy, ChevronRight, Hash, Loader2,
  Crown, Medal, X, Clock, Copy, Check, Link2,
} from 'lucide-react';

const shuffleArray = (arr) => (Array.isArray(arr) ? [...arr].sort(() => Math.random() - 0.5) : []);

const HostSession = () => {
  const [copied, setCopied] = useState(null); // 'link' | 'code' | null
  const { pin } = useParams();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(null);
  const tickedRef = useRef(false);

  // Direct join link for this session, so the teacher can share a URL
  // rather than reading the code out loud.
  const joinUrl = `${window.location.origin}/play/${pin}`;

  const handleCopy = async (value, kind) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      toast.success(kind === 'link' ? 'Join link copied' : 'Game code copied');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard needs a secure context; fall back to showing the value.
      toast.error('Could not copy. Share this instead: ' + value);
    }
  };

  // Load quiz + subscribe to session
  useEffect(() => {
    const unsub = listenToSession(pin, (s) => {
      setSession(s);
      setLoading(false);
      if (!s) return;
      if (!quiz) {
        getDoc(doc(db, 'quizzes', s.quizId)).then(snap => {
          if (snap.exists()) setQuiz(snap.data());
        });
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const playableQuestions = useMemo(
    () => quiz?.questions.filter(q => LIVE_SUPPORTED_TYPES.includes(q.type)) || [],
    [quiz]
  );

  const currentQuestion = session ? playableQuestions[session.currentQuestionIndex] : null;
  const players = session?.players ? Object.entries(session.players).map(([id, p]) => ({ id, ...p })) : [];
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const currentAnswers = session?.answers?.[session.currentQuestionIndex] || {};
  const answeredCount = Object.keys(currentAnswers).length;

  // The projector shows the loose pieces of a drag-and-drop question while
  // players work. Shuffled once per question, because the stored order of a
  // Reorder question is the answer.
  const shuffledPieces = useMemo(() => {
    switch (currentQuestion?.type) {
      case 'MATCH_THE_FOLLOWING':
        return shuffleArray(currentQuestion.matchData?.pairs).map(pair => ({ id: pair.id, text: pair.answer, media: pair.answerMedia }));
      case 'REORDER':
        return shuffleArray(currentQuestion.reorderData?.items);
      case 'CATEGORIZE':
        return shuffleArray(currentQuestion.categorizeData?.items);
      default:
        return [];
    }
  }, [currentQuestion]);

  // Countdown timer during 'question' state
  useEffect(() => {
    if (!session || session.state !== 'question' || !currentQuestion || !session.questionStartedAt) {
      setTimeLeft(null);
      return;
    }
    tickedRef.current = false;
    const limit = (parseInt(currentQuestion.timeLimit, 10) || 30) * 1000;
    const interval = setInterval(() => {
      const elapsed = Date.now() - session.questionStartedAt;
      const remaining = Math.max(0, Math.ceil((limit - elapsed) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 10 && remaining > 0) playTick();
      if (remaining === 0 && !tickedRef.current) {
        tickedRef.current = true;
        revealQuestion(pin);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [session?.state, session?.currentQuestionIndex, session?.questionStartedAt, currentQuestion, pin]);

  const handleStart = async () => {
    if (players.length === 0) { toast.error('Wait for at least one player to join.'); return; }
    try { await startGame(pin); } catch { toast.error('Failed to start game.'); }
  };

  const handleReveal = async () => { try { await revealQuestion(pin); } catch { toast.error('Failed to reveal.'); } };
  const handleLeaderboard = async () => { try { await showLeaderboard(pin); } catch { toast.error('Failed.'); } };

  const handleNext = async () => {
    const next = session.currentQuestionIndex + 1;
    if (next >= playableQuestions.length) {
      playComplete();
      try { await endGame(pin); } catch { toast.error('Failed to end game.'); }
    } else {
      try { await nextQuestion(pin, next); } catch { toast.error('Failed to advance.'); }
    }
  };

  const handleEndSession = async () => {
    try { await deleteSession(pin); } catch { /* ignore */ }
    navigate('/teacher/your-quizzes');
  };

  if (loading) return (
    <div className="min-h-screen w-screen bg-[hsl(var(--background))] flex items-center justify-center">
      <Loader2 className="w-10 h-10 text-[hsl(var(--muted-foreground))] animate-spin" />
    </div>
  );
  if (!session) return (
    <div className="min-h-screen w-screen bg-[hsl(var(--background))] flex flex-col items-center justify-center gap-4 text-[hsl(var(--foreground))] p-8">
      <p className="text-xl font-bold">Session not found or has ended.</p>
      <Button onClick={() => navigate('/teacher/your-quizzes')} variant="outline" className="border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]">
        Back to Your Quizzes
      </Button>
    </div>
  );

  const optionVoteCount = (optId) => Object.values(currentAnswers).filter(a => {
    const ans = Array.isArray(a.answer) ? a.answer.map(String) : [String(a.answer)];
    return ans.includes(String(optId));
  }).length;

  return (
    <div className="min-h-screen w-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, hsl(var(--primary) / 0.15) 0%, hsl(var(--background)) 60%)' }}>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5">
        <div>
          <p className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-widest font-semibold">Live Session</p>
          <p className="font-bold text-[hsl(var(--foreground))] truncate max-w-xs">{session.quizTitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="border-[hsl(var(--border))] text-[hsl(var(--foreground))] bg-[hsl(var(--muted))] gap-1.5">
            <Users className="w-3.5 h-3.5" /> {players.length}
          </Badge>
          <button onClick={handleEndSession} title="End session"
            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="relative z-10 max-w-4xl mx-auto px-6 pb-16">
        <AnimatePresence mode="wait">

          {/* ── Lobby ── */}
          {session.state === 'lobby' && (
            <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
              <p className="text-[hsl(var(--muted-foreground))] mb-2 mt-8">Players join with this code</p>
              <div className="flex items-center justify-center gap-3 mb-4">
                <Hash className="w-10 h-10 text-[hsl(var(--primary))]" />
                <span className="text-6xl md:text-7xl font-black tracking-widest text-[hsl(var(--foreground))]">{pin}</span>
              </div>

              {/* Share: a direct join link, plus the code on its own */}
              <div className="flex flex-col items-center gap-3 mb-10">
                <div className="flex items-center gap-2 max-w-full bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl px-3 py-2">
                  <Link2 className="w-4 h-4 text-[hsl(var(--muted-foreground))] shrink-0" />
                  <span className="text-sm text-[hsl(var(--muted-foreground))] truncate font-mono">{joinUrl}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => handleCopy(joinUrl, 'link')}
                    variant="outline"
                    className="gap-2 border-[hsl(var(--border))] text-[hsl(var(--foreground))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted))]"
                  >
                    {copied === 'link' ? <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    {copied === 'link' ? 'Link copied' : 'Copy join link'}
                  </Button>
                  <Button
                    onClick={() => handleCopy(pin, 'code')}
                    variant="outline"
                    className="gap-2 border-[hsl(var(--border))] text-[hsl(var(--foreground))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted))]"
                  >
                    {copied === 'code' ? <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    {copied === 'code' ? 'Code copied' : 'Copy code'}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-10 min-h-[60px]">
                {players.length === 0 ? (
                  <p className="col-span-full text-[hsl(var(--muted-foreground))] text-sm py-6">Waiting for players to join…</p>
                ) : players.map(p => (
                  <motion.div key={p.id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-1.5 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--ring))] text-white flex items-center justify-center font-bold text-sm">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs font-medium truncate w-full text-center">{p.name}</span>
                  </motion.div>
                ))}
              </div>

              <Button onClick={handleStart} size="lg" disabled={players.length === 0}
                className="gap-2 px-10 py-6 text-lg bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--ring))] text-white border-0 hover:opacity-90">
                <Play className="w-5 h-5" /> Start Game
              </Button>
            </motion.div>
          )}

          {/* ── Question ── */}
          {session.state === 'question' && currentQuestion && (
            <motion.div key="question" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-6">
                <Badge variant="outline" className="border-[hsl(var(--border))] text-[hsl(var(--foreground))] bg-[hsl(var(--muted))]">
                  Question {session.currentQuestionIndex + 1} / {playableQuestions.length}
                </Badge>
                <div className={`flex items-center gap-1.5 font-black text-xl px-4 py-1.5 rounded-full border ${timeLeft <= 10 ? 'bg-[hsl(var(--destructive))]/20 text-[hsl(var(--destructive))] border-[hsl(var(--destructive))]/30' : 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] border-[hsl(var(--border))]'}`}>
                  <Clock className="w-4 h-4" /> {timeLeft ?? '–'}s
                </div>
              </div>

              <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-3xl p-8 md:p-10 text-center mb-6">
                <p className="text-2xl md:text-3xl font-bold leading-relaxed">{currentQuestion.questionText}</p>
              </div>

              {currentQuestion.type === 'MATCH_THE_FOLLOWING' && (
                <div className="grid md:grid-cols-2 gap-4 mb-6">
                  <div className="flex flex-col gap-2">
                    <p className="text-xs uppercase tracking-wide font-semibold text-[hsl(var(--muted-foreground))]">Prompts</p>
                    {(currentQuestion.matchData?.pairs || []).map(pair => (
                      <div key={pair.id} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] font-medium">
                        <MediaRenderer media={pair.promptMedia} transform="thumbnail" className="w-10 h-10 rounded object-cover shrink-0" />
                        <span>{pair.prompt}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="text-xs uppercase tracking-wide font-semibold text-[hsl(var(--muted-foreground))]">Answers</p>
                    <div className="flex flex-wrap gap-2">
                      {shuffledPieces.map(card => (
                        <span key={card.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[hsl(var(--primary))]/15 border border-[hsl(var(--primary))]/30 text-sm font-medium">
                          <MediaRenderer media={card.media} transform="thumbnail" className="w-8 h-8 rounded object-cover shrink-0" />
                          {card.text}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {currentQuestion.type === 'REORDER' && (
                <div className="mb-6">
                  <p className="text-xs uppercase tracking-wide font-semibold text-[hsl(var(--muted-foreground))] mb-2 text-center">
                    Put these {shuffledPieces.length} in order on your device
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {shuffledPieces.map(item => (
                      <span key={item.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-sm font-medium">
                        <MediaRenderer media={item.media} transform="thumbnail" className="w-8 h-8 rounded object-cover shrink-0" />
                        {item.text}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {currentQuestion.type === 'CATEGORIZE' && (
                <div className="mb-6 flex flex-col gap-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {(currentQuestion.categorizeData?.categories || []).map(cat => (
                      <div key={cat.id} className="px-4 py-3 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-center font-bold text-[hsl(var(--primary))] truncate">
                        {cat.name}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {shuffledPieces.map(item => (
                      <span key={item.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[hsl(var(--primary))]/15 border border-[hsl(var(--primary))]/30 text-sm font-medium">
                        <MediaRenderer media={item.media} transform="thumbnail" className="w-8 h-8 rounded object-cover shrink-0" />
                        {item.text}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-center gap-3 mb-8">
                <Users className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                <span className="text-[hsl(var(--muted-foreground))] font-medium">{answeredCount} / {players.length} answered</span>
              </div>

              <div className="flex justify-center">
                <Button onClick={handleReveal} size="lg" className="gap-2 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/70">
                  <Eye className="w-4 h-4" /> Reveal Now
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── Reveal ── */}
          {session.state === 'reveal' && currentQuestion && (
            <motion.div key="reveal" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <p className="text-center text-[hsl(var(--muted-foreground))] mb-4 font-semibold uppercase tracking-wide text-xs">Correct Answer</p>
              <div className="bg-[hsl(var(--card))] border border-emerald-500/30 rounded-3xl p-8 text-center mb-8">
                <p className="text-xl md:text-2xl font-bold mb-4">{currentQuestion.questionText}</p>
                {currentQuestion.type === 'MCQ' && (
                  <div className="flex flex-col gap-2 max-w-md mx-auto">
                    {currentQuestion.mcqData.options.map(opt => {
                      const isCorrect = currentQuestion.mcqData.correctOptions.includes(opt.id);
                      const votes = optionVoteCount(opt.id);
                      return (
                        <div key={opt.id} className={`flex items-center justify-between px-4 py-2.5 rounded-xl border ${isCorrect ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))]'}`}>
                          <span className="font-medium">{opt.text}</span>
                          <Badge variant="outline" className="border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]">{votes}</Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
                {currentQuestion.type === 'TRUE_FALSE' && (
                  <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{currentQuestion.trueFalseData.correctAnswer ? 'TRUE' : 'FALSE'}</p>
                )}
                {currentQuestion.type === 'FILL_IN_THE_BLANK' && (
                  <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{currentQuestion.fillBlankData.answers.map(a => a.text).join(' / ')}</p>
                )}
                {currentQuestion.type === 'MATCH_THE_FOLLOWING' && (
                  <div className="flex flex-col gap-2 max-w-xl mx-auto">
                    {(currentQuestion.matchData?.pairs || []).map(pair => (
                      <div key={pair.id} className="grid grid-cols-2 gap-2 items-stretch">
                        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] font-medium text-left">
                          <MediaRenderer media={pair.promptMedia} transform="thumbnail" className="w-9 h-9 rounded object-cover shrink-0" />
                          <span>{pair.prompt}</span>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-semibold text-left">
                          <MediaRenderer media={pair.answerMedia} transform="thumbnail" className="w-9 h-9 rounded object-cover shrink-0" />
                          <span>{pair.answer}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {currentQuestion.type === 'REORDER' && (
                  <div className="flex flex-col gap-2 max-w-md mx-auto">
                    {(currentQuestion.reorderData?.items || []).map((item, i) => (
                      <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-left">
                        <span className="font-black w-5 shrink-0">{i + 1}</span>
                        <MediaRenderer media={item.media} transform="thumbnail" className="w-9 h-9 rounded object-cover shrink-0" />
                        <span className="font-semibold">{item.text}</span>
                      </div>
                    ))}
                  </div>
                )}
                {currentQuestion.type === 'CATEGORIZE' && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {(currentQuestion.categorizeData?.categories || []).map(cat => (
                      <div key={cat.id} className="rounded-xl bg-[hsl(var(--card))] border border-emerald-500/30 p-3">
                        <p className="font-bold text-[hsl(var(--primary))] mb-2 truncate">{cat.name}</p>
                        <div className="flex flex-col gap-1.5">
                          {(currentQuestion.categorizeData?.items || [])
                            .filter(item => String(item.categoryId) === String(cat.id))
                            .map(item => (
                              <span key={item.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
                                <MediaRenderer media={item.media} transform="thumbnail" className="w-7 h-7 rounded object-cover shrink-0" />
                                {item.text}
                              </span>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-center">
                <Button onClick={handleLeaderboard} size="lg" className="gap-2 bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--ring))] text-white border-0 hover:opacity-90">
                  <Trophy className="w-4 h-4" /> Show Leaderboard
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── Leaderboard ── */}
          {session.state === 'leaderboard' && (
            <motion.div key="leaderboard" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <h2 className="text-2xl font-black text-center mb-6">Leaderboard</h2>
              <div className="flex flex-col gap-2 max-w-lg mx-auto mb-8">
                {sortedPlayers.slice(0, 8).map((p, i) => (
                  <motion.div key={p.id} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl ${i === 0 ? 'bg-amber-500/15 border border-amber-500/30' : 'bg-[hsl(var(--card))] border border-[hsl(var(--border))]'}`}>
                    <span className="font-black text-lg w-6 text-[hsl(var(--muted-foreground))]">{i + 1}</span>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--ring))] text-white flex items-center justify-center font-bold text-xs shrink-0">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="flex-1 font-semibold truncate">{p.name}</span>
                    {p.streak >= 2 && <Badge className="bg-orange-500/20 text-orange-600 dark:text-orange-300 border-orange-500/30 text-xs">🔥{p.streak}</Badge>}
                    <span className="font-black text-lg">{p.score}</span>
                  </motion.div>
                ))}
              </div>
              <div className="flex justify-center">
                <Button onClick={handleNext} size="lg" className="gap-2 bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--ring))] text-white border-0 hover:opacity-90">
                  {session.currentQuestionIndex + 1 >= playableQuestions.length ? 'Finish Game' : 'Next Question'}
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── Ended / Podium ── */}
          {session.state === 'ended' && (
            <motion.div key="ended" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
              <Confetti />
              <Trophy className="w-16 h-16 text-amber-400 mx-auto mb-4 mt-8" />
              <h2 className="text-3xl font-black mb-8">Game Over!</h2>

              <div className="flex items-end justify-center gap-4 mb-10">
                {[sortedPlayers[1], sortedPlayers[0], sortedPlayers[2]].map((p, i) => {
                  if (!p) return <div key={i} className="w-24" />;
                  const heights = ['h-24', 'h-32', 'h-20'];
                  const icons = [<Medal key="m" className="w-5 h-5 text-slate-400" />, <Crown key="c" className="w-6 h-6 text-amber-400" />, <Medal key="m2" className="w-5 h-5 text-amber-700" />];
                  return (
                    <motion.div key={p.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }}
                      className="flex flex-col items-center gap-2 w-24">
                      {icons[i]}
                      <span className="font-bold text-sm truncate w-full text-center">{p.name}</span>
                      <span className="font-black text-lg">{p.score}</span>
                      <div className={`w-full ${heights[i]} rounded-t-xl bg-gradient-to-t from-[hsl(var(--primary))] to-[hsl(var(--ring))] text-white flex items-start justify-center pt-2 font-black text-xl`}>
                        {i === 1 ? 1 : i === 0 ? 2 : 3}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <Button onClick={handleEndSession} size="lg" className="gap-2 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/70">
                Back to Your Quizzes
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default HostSession;
