import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Confetti from '../../components/Confetti';
import {
  listenToSession, startGame, revealQuestion, showLeaderboard,
  nextQuestion, endGame, deleteSession, LIVE_SUPPORTED_TYPES,
} from '../../utils/liveSession';
import { playComplete, playTick } from '../../utils/sounds';
import {
  Users, Play, Eye, Trophy, ChevronRight, Hash, Loader2,
  Crown, Medal, X, Clock,
} from 'lucide-react';

const HostSession = () => {
  const { pin } = useParams();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(null);
  const tickedRef = useRef(false);

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
    <div className="min-h-screen w-screen bg-[#0d0d20] flex items-center justify-center">
      <Loader2 className="w-10 h-10 text-white/40 animate-spin" />
    </div>
  );
  if (!session) return (
    <div className="min-h-screen w-screen bg-[#0d0d20] flex flex-col items-center justify-center gap-4 text-white p-8">
      <p className="text-xl font-bold">Session not found or has ended.</p>
      <Button onClick={() => navigate('/teacher/your-quizzes')} variant="outline" className="border-white/20 text-white hover:bg-white/10">
        Back to Your Quizzes
      </Button>
    </div>
  );

  const optionVoteCount = (optId) => Object.values(currentAnswers).filter(a => {
    const ans = Array.isArray(a.answer) ? a.answer.map(String) : [String(a.answer)];
    return ans.includes(String(optId));
  }).length;

  return (
    <div className="min-h-screen w-screen text-white relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 0%,rgba(139,92,246,0.15) 0%,#0d0d20 60%)' }}>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5">
        <div>
          <p className="text-xs text-white/40 uppercase tracking-widest font-semibold">Live Session</p>
          <p className="font-bold text-white/80 truncate max-w-xs">{session.quizTitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="border-white/20 text-white bg-white/10 gap-1.5">
            <Users className="w-3.5 h-3.5" /> {players.length}
          </Badge>
          <button onClick={handleEndSession} title="End session"
            className="text-white/40 hover:text-red-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="relative z-10 max-w-4xl mx-auto px-6 pb-16">
        <AnimatePresence mode="wait">

          {/* ── Lobby ── */}
          {session.state === 'lobby' && (
            <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
              <p className="text-white/50 mb-2 mt-8">Players join at <strong className="text-white">your-app-url</strong> with code</p>
              <div className="flex items-center justify-center gap-3 mb-10">
                <Hash className="w-10 h-10 text-[#a78bfa]" />
                <span className="text-6xl md:text-7xl font-black tracking-widest text-white">{pin}</span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-10 min-h-[60px]">
                {players.length === 0 ? (
                  <p className="col-span-full text-white/30 text-sm py-6">Waiting for players to join…</p>
                ) : players.map(p => (
                  <motion.div key={p.id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl p-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#4776e6] to-[#8b5cf6] flex items-center justify-center font-bold text-sm">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs font-medium truncate w-full text-center">{p.name}</span>
                  </motion.div>
                ))}
              </div>

              <Button onClick={handleStart} size="lg" disabled={players.length === 0}
                className="gap-2 px-10 py-6 text-lg bg-gradient-to-r from-[#4776e6] to-[#8b5cf6] text-white border-0 hover:opacity-90">
                <Play className="w-5 h-5" /> Start Game
              </Button>
            </motion.div>
          )}

          {/* ── Question ── */}
          {session.state === 'question' && currentQuestion && (
            <motion.div key="question" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-6">
                <Badge variant="outline" className="border-white/20 text-white bg-white/10">
                  Question {session.currentQuestionIndex + 1} / {playableQuestions.length}
                </Badge>
                <div className={`flex items-center gap-1.5 font-black text-xl px-4 py-1.5 rounded-full border ${timeLeft <= 10 ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-white/10 text-white border-white/20'}`}>
                  <Clock className="w-4 h-4" /> {timeLeft ?? '–'}s
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-3xl p-8 md:p-10 text-center mb-6">
                <p className="text-2xl md:text-3xl font-bold leading-relaxed">{currentQuestion.questionText}</p>
              </div>

              <div className="flex items-center justify-center gap-3 mb-8">
                <Users className="w-4 h-4 text-white/40" />
                <span className="text-white/60 font-medium">{answeredCount} / {players.length} answered</span>
              </div>

              <div className="flex justify-center">
                <Button onClick={handleReveal} size="lg" className="gap-2 bg-white/10 border border-white/20 text-white hover:bg-white/20">
                  <Eye className="w-4 h-4" /> Reveal Now
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── Reveal ── */}
          {session.state === 'reveal' && currentQuestion && (
            <motion.div key="reveal" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <p className="text-center text-white/50 mb-4 font-semibold uppercase tracking-wide text-xs">Correct Answer</p>
              <div className="bg-white/5 border border-green-500/30 rounded-3xl p-8 text-center mb-8">
                <p className="text-xl md:text-2xl font-bold mb-4">{currentQuestion.questionText}</p>
                {currentQuestion.type === 'MCQ' && (
                  <div className="flex flex-col gap-2 max-w-md mx-auto">
                    {currentQuestion.mcqData.options.map(opt => {
                      const isCorrect = currentQuestion.mcqData.correctOptions.includes(opt.id);
                      const votes = optionVoteCount(opt.id);
                      return (
                        <div key={opt.id} className={`flex items-center justify-between px-4 py-2.5 rounded-xl border ${isCorrect ? 'border-green-500/40 bg-green-500/10 text-green-300' : 'border-white/10 bg-white/5 text-white/60'}`}>
                          <span className="font-medium">{opt.text}</span>
                          <Badge variant="outline" className="border-white/20 text-white/70">{votes}</Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
                {currentQuestion.type === 'TRUE_FALSE' && (
                  <p className="text-2xl font-black text-green-400">{currentQuestion.trueFalseData.correctAnswer ? 'TRUE' : 'FALSE'}</p>
                )}
                {currentQuestion.type === 'FILL_IN_THE_BLANK' && (
                  <p className="text-xl font-bold text-green-400">{currentQuestion.fillBlankData.answers.map(a => a.text).join(' / ')}</p>
                )}
              </div>
              <div className="flex justify-center">
                <Button onClick={handleLeaderboard} size="lg" className="gap-2 bg-gradient-to-r from-[#4776e6] to-[#8b5cf6] text-white border-0 hover:opacity-90">
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
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl ${i === 0 ? 'bg-amber-500/15 border border-amber-500/30' : 'bg-white/5 border border-white/10'}`}>
                    <span className="font-black text-lg w-6 text-white/50">{i + 1}</span>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#4776e6] to-[#8b5cf6] flex items-center justify-center font-bold text-xs shrink-0">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="flex-1 font-semibold truncate">{p.name}</span>
                    {p.streak >= 2 && <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30 text-xs">🔥{p.streak}</Badge>}
                    <span className="font-black text-lg">{p.score}</span>
                  </motion.div>
                ))}
              </div>
              <div className="flex justify-center">
                <Button onClick={handleNext} size="lg" className="gap-2 bg-gradient-to-r from-[#4776e6] to-[#8b5cf6] text-white border-0 hover:opacity-90">
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
                  const icons = [<Medal key="m" className="w-5 h-5 text-slate-300" />, <Crown key="c" className="w-6 h-6 text-amber-400" />, <Medal key="m2" className="w-5 h-5 text-amber-700" />];
                  return (
                    <motion.div key={p.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }}
                      className="flex flex-col items-center gap-2 w-24">
                      {icons[i]}
                      <span className="font-bold text-sm truncate w-full text-center">{p.name}</span>
                      <span className="font-black text-lg">{p.score}</span>
                      <div className={`w-full ${heights[i]} rounded-t-xl bg-gradient-to-t from-[#4776e6] to-[#8b5cf6] flex items-start justify-center pt-2 font-black text-xl`}>
                        {i === 1 ? 1 : i === 0 ? 2 : 3}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <Button onClick={handleEndSession} size="lg" className="gap-2 bg-white/10 border border-white/20 text-white hover:bg-white/20">
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
