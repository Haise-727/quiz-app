import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import Confetti from '../components/Confetti';
import {
  listenToSession, joinSession, leaveSession, submitAnswer,
  generateGuestId, LIVE_SUPPORTED_TYPES,
} from '../utils/liveSession';
import { playCorrect, playWrong, playComplete, playTick } from '../utils/sounds';
import { Home, Hash, Users, Clock, CheckCircle2, XCircle, Trophy, Crown, Medal, Loader2 } from 'lucide-react';

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
  const [answered, setAnswered] = useState(false);
  const [lastResult, setLastResult] = useState(null); // { correct, points }

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
    setSelected(null); setFillInput(''); setAnswered(false); setLastResult(null);
    questionStartRef.current = Date.now();
  }, [session?.currentQuestionIndex]);

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
        mine.correct ? playCorrect() : playWrong();
      }
    }
    if (session?.state === 'ended') playComplete();
  }, [session?.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnswer = async (answer) => {
    if (answered || !currentQuestion) return;
    setAnswered(true);
    setSelected(answer);
    const timeTaken = Date.now() - questionStartRef.current;
    try {
      await submitAnswer(pinRef.current, session.currentQuestionIndex, playerIdRef.current, answer, currentQuestion, timeTaken);
    } catch { toast.error('Failed to submit answer.'); setAnswered(false); }
  };

  const players = session?.players ? Object.entries(session.players).map(([id, p]) => ({ id, ...p })) : [];
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const myRank = sortedPlayers.findIndex(p => p.id === playerIdRef.current) + 1;
  const me = players.find(p => p.id === playerIdRef.current);

  // ── Join screen ──────────────────────────────────────────────────────────────
  if (!joined) {
    return (
      <div className="min-h-screen w-screen bg-[#0d0d20] text-white flex items-center justify-center p-4"
        style={{ background: 'radial-gradient(ellipse at 50% 30%,rgba(71,118,230,0.12) 0%,#0d0d20 70%)' }}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
          <Link to="/" className="flex items-center justify-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#4776e6] to-[#8b5cf6] flex items-center justify-center font-black text-sm">Q</div>
            <span className="font-bold text-lg">Quizlike Live</span>
          </Link>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
            <Hash className="w-8 h-8 text-[#a78bfa] mx-auto mb-3" />
            <h1 className="text-xl font-bold text-center mb-6">Join Live Game</h1>

            <div className="flex flex-col gap-4">
              <Input
                placeholder="6-digit game code"
                value={pinInput}
                onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                className="bg-white/5 border-white/20 text-white text-center text-2xl font-mono tracking-widest placeholder:text-white/30"
              />
              <Input
                placeholder="Your name"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                maxLength={24}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
              />
              {error && <p className="text-red-400 text-sm text-center">{error}</p>}
              <Button onClick={handleJoin} disabled={joining} size="lg"
                className="gap-2 bg-gradient-to-r from-[#4776e6] to-[#8b5cf6] text-white border-0 hover:opacity-90">
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
    <div className="min-h-screen w-screen bg-[#0d0d20] flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-white/40 animate-spin" />
    </div>
  );

  // ── Joined: render by state ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-screen bg-[#0d0d20] text-white flex flex-col items-center py-8 px-4 relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 0%,rgba(139,92,246,0.12) 0%,#0d0d20 60%)' }}>

      <Link to="/" className="absolute top-5 left-5 text-white/40 hover:text-white/70 transition-colors">
        <Home className="w-5 h-5" />
      </Link>

      <AnimatePresence mode="wait">

        {session.state === 'lobby' && (
          <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center mt-16">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#4776e6] to-[#8b5cf6] flex items-center justify-center font-black text-xl mx-auto mb-4">
              {(nameInput || 'P').charAt(0).toUpperCase()}
            </div>
            <h1 className="text-2xl font-bold mb-1">You're in!</h1>
            <p className="text-white/40 mb-8">Waiting for the host to start…</p>
            <div className="flex items-center justify-center gap-2 text-white/50">
              <Users className="w-4 h-4" /> {players.length} player{players.length !== 1 ? 's' : ''} joined
            </div>
          </motion.div>
        )}

        {session.state === 'question' && currentQuestion && (
          <motion.div key="question" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full max-w-lg">
            <div className="flex items-center justify-between mb-5">
              <Badge variant="outline" className="border-white/20 text-white bg-white/10 text-xs">
                Q{session.currentQuestionIndex + 1}/{playableQuestions.length}
              </Badge>
              <div className={`flex items-center gap-1.5 font-bold px-3 py-1 rounded-full border text-sm ${timeLeft <= 10 ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-white/10 text-white border-white/20'}`}>
                <Clock className="w-3.5 h-3.5" /> {timeLeft ?? '–'}s
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-5">
              <p className="text-lg font-bold leading-relaxed">{currentQuestion.questionText}</p>
            </div>

            <>
              {currentQuestion.type === 'MCQ' && (
                <div className="flex flex-col gap-3">
                  {currentQuestion.mcqData.options.map(opt => (
                    <button key={opt.id} disabled={answered} onClick={() => handleAnswer(opt.id)}
                      className={`px-5 py-4 rounded-xl border-2 text-left font-semibold transition-colors ${
                        answered
                          ? selected === opt.id ? 'border-[#8b5cf6] bg-[#8b5cf6]/15 cursor-default' : 'border-white/10 bg-white/5 opacity-40 cursor-default'
                          : 'border-white/20 bg-white/5 hover:border-[#8b5cf6] hover:bg-[#8b5cf6]/10 cursor-pointer'
                      }`}>
                      {opt.text}
                    </button>
                  ))}
                </div>
              )}
              {currentQuestion.type === 'TRUE_FALSE' && (
                <div className="grid grid-cols-2 gap-3">
                  <button disabled={answered} onClick={() => handleAnswer(true)}
                    className={`py-8 rounded-xl border-2 font-black text-xl text-green-300 transition-colors ${answered ? (selected === true ? 'border-green-400 bg-green-500/25' : 'border-green-500/20 bg-green-500/5 opacity-40') + ' cursor-default' : 'border-green-500/40 bg-green-500/10 hover:bg-green-500/20 cursor-pointer'}`}>
                    TRUE
                  </button>
                  <button disabled={answered} onClick={() => handleAnswer(false)}
                    className={`py-8 rounded-xl border-2 font-black text-xl text-red-300 transition-colors ${answered ? (selected === false ? 'border-red-400 bg-red-500/25' : 'border-red-500/20 bg-red-500/5 opacity-40') + ' cursor-default' : 'border-red-500/40 bg-red-500/10 hover:bg-red-500/20 cursor-pointer'}`}>
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
                    className="bg-white/5 border-white/20 text-white placeholder:text-white/30 disabled:opacity-60" />
                  <Button onClick={() => handleAnswer(fillInput)} disabled={!fillInput.trim() || answered}
                    className="bg-gradient-to-r from-[#4776e6] to-[#8b5cf6] text-white border-0 shrink-0">
                    Submit
                  </Button>
                </div>
              )}
              {answered && (
                <p className="text-center text-white/40 text-sm mt-5">Answer locked in — waiting for others…</p>
              )}
            </>
          </motion.div>
        )}

        {session.state === 'reveal' && (
          <motion.div key="reveal" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-center mt-16">
            {lastResult ? (
              <>
                {lastResult.correct
                  ? <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto mb-4" />
                  : <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />}
                <h1 className="text-2xl font-black mb-1">{lastResult.correct ? 'Correct!' : 'Not quite'}</h1>
                <p className="text-white/50 mb-2">{lastResult.correct ? `+${lastResult.points} points` : 'Better luck next time'}</p>
              </>
            ) : (
              <>
                <XCircle className="w-16 h-16 text-white/20 mx-auto mb-4" />
                <h1 className="text-2xl font-black mb-1">Time's up!</h1>
                <p className="text-white/50">You didn't answer in time.</p>
              </>
            )}
          </motion.div>
        )}

        {session.state === 'leaderboard' && (
          <motion.div key="leaderboard" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full max-w-md">
            <h2 className="text-xl font-black text-center mb-2">Leaderboard</h2>
            <p className="text-center text-white/40 text-sm mb-6">You're #{myRank} with {me?.score ?? 0} points</p>
            <div className="flex flex-col gap-2">
              {sortedPlayers.slice(0, 5).map((p, i) => (
                <div key={p.id} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl ${p.id === playerIdRef.current ? 'bg-[#8b5cf6]/15 border border-[#8b5cf6]/40' : 'bg-white/5 border border-white/10'}`}>
                  <span className="font-black w-5 text-white/50">{i + 1}</span>
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
              {myRank === 2 && <Medal className="w-5 h-5 text-slate-300" />}
              {myRank === 3 && <Medal className="w-5 h-5 text-amber-700" />}
              <p className="text-white/70 font-semibold">You finished #{myRank} of {players.length}</p>
            </div>
            <p className="text-3xl font-black mb-8">{me?.score ?? 0} pts</p>
            <Link to="/">
              <Button size="lg" className="gap-2 bg-white/10 border border-white/20 text-white hover:bg-white/20">
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
