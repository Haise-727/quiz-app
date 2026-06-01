import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  RotateCcw, BookOpen, Eye, Home, Trophy,
} from 'lucide-react';

// ── Correct answer renderer ───────────────────────────────────────────────────
const CorrectAnswer = ({ q }) => {
  switch (q.type) {
    case 'MCQ':
      return (
        <div className="flex flex-col gap-1">
          {q.mcqData.correctOptions.map(id => {
            const opt = q.mcqData.options.find(o => o.id === id);
            return <p key={id} className="font-semibold text-green-300">✓ {opt?.text}</p>;
          })}
        </div>
      );
    case 'FILL_IN_THE_BLANK':
      return <p className="font-semibold text-green-300">✓ {q.fillBlankData.answers.map(a => a.text).join(' / ')}</p>;
    case 'MATCH_THE_FOLLOWING':
      return (
        <div className="flex flex-col gap-1">
          {q.matchData.pairs.map(p => (
            <p key={p.id} className="text-sm text-green-300">{p.prompt} → <strong>{p.answer}</strong></p>
          ))}
        </div>
      );
    case 'REORDER':
      return (
        <ol className="flex flex-col gap-1">
          {q.reorderData.items.map((item, i) => (
            <li key={item.id} className="text-sm text-green-300">{i + 1}. {item.text}</li>
          ))}
        </ol>
      );
    case 'CATEGORIZE':
      return (
        <div className="flex flex-col gap-2">
          {q.categorizeData.categories.map(cat => (
            <div key={cat.id}>
              <p className="text-xs font-bold text-green-400 uppercase">{cat.name}:</p>
              <p className="text-sm text-green-300">
                {q.categorizeData.items.filter(i => i.categoryId === cat.id).map(i => i.text).join(', ')}
              </p>
            </div>
          ))}
        </div>
      );
    case 'PARAGRAPH':
      return <p className="text-sm italic text-white/40">Open-ended — no auto-answer.</p>;
    default:
      return <p className="text-sm text-white/40">No auto-answer for this type.</p>;
  }
};

// ── Main page ─────────────────────────────────────────────────────────────────
const Practice = () => {
  const { quizId } = useParams();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  // results[i]: { answered: bool, correct: bool|null, selected: any }
  const [results, setResults] = useState([]);
  const [fillInput, setFillInput] = useState('');
  const [done, setDone] = useState(false);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'quizzes', quizId));
        if (!snap.exists()) { setError('Quiz not found.'); return; }
        const data = snap.data();
        setQuiz(data);
        setResults(data.questions.map(() => ({ answered: false, correct: false, selected: null })));
      } catch { setError('Failed to load quiz.'); }
      finally { setLoading(false); }
    };
    load();
  }, [quizId]);

  if (loading) return (
    <div className="min-h-screen w-screen bg-[#0d1b2a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-teal-500/30 border-t-teal-400 rounded-full animate-spin" />
    </div>
  );
  if (error) return (
    <div className="min-h-screen w-screen bg-[#0d1b2a] flex flex-col items-center justify-center gap-4 text-white p-8">
      <div className="text-5xl">😞</div>
      <h2 className="text-2xl font-bold">{error}</h2>
      <Button onClick={() => navigate('/')} variant="outline" className="border-white/20 text-white hover:bg-white/10">Go Home</Button>
    </div>
  );

  const q = quiz?.questions[index];
  const r = results[index];
  const allAnswered = results.every(r => r.answered);
  const score = results.filter(r => r.answered && r.correct === true).length;
  const scorePct = quiz ? Math.round((score / quiz.questions.length) * 100) : 0;

  // ── Handlers ────────────────────────────────────────────────────────────────
  const answer = (updates) => {
    setResults(prev => { const n = [...prev]; n[index] = { ...n[index], answered: true, ...updates }; return n; });
  };

  const handleMCQ = (optId) => {
    if (r.answered) return;
    const correctIds = q.mcqData.correctOptions.map(String);
    const isCorrect = correctIds.length === 1 && correctIds.includes(String(optId));
    answer({ correct: isCorrect, selected: optId });
  };

  const handleFill = () => {
    if (r.answered || !fillInput.trim()) return;
    const correct = q.fillBlankData.answers.map(a => a.text.toLowerCase()).includes(fillInput.trim().toLowerCase());
    answer({ correct, selected: fillInput.trim() });
  };

  const handleReveal = () => { if (!r.answered) answer({ correct: null, selected: null }); };

  const goNext = () => {
    if (index < quiz.questions.length - 1) {
      setDirection(1); setIndex(i => i + 1); setFillInput('');
    } else {
      setDone(true);
    }
  };

  const goPrev = () => {
    if (index > 0) { setDirection(-1); setIndex(i => i - 1); setFillInput(results[index - 1]?.selected || ''); }
  };

  const reset = () => {
    setIndex(0); setDone(false); setFillInput('');
    setResults(quiz.questions.map(() => ({ answered: false, correct: false, selected: null })));
  };

  // ── Done screen ──────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen w-screen bg-[#0d1b2a] flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="bg-white/5 border border-white/10 rounded-3xl p-10 w-full max-w-lg text-white text-center">
          <Trophy className="w-14 h-14 text-amber-400 mx-auto mb-4" />
          <h1 className="text-3xl font-black mb-1">Practice Complete!</h1>
          <p className="text-white/50 mb-8">{quiz.title}</p>

          <div className="w-36 h-36 mx-auto rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex flex-col items-center justify-center shadow-2xl mb-8">
            <span className="text-5xl font-black">{scorePct}%</span>
            <span className="text-xs opacity-70 mt-0.5">{score}/{quiz.questions.length} correct</span>
          </div>

          <div className="flex flex-col gap-2">
            {quiz.questions.map((q, i) => (
              <div key={i} className={`flex items-center gap-3 text-left px-4 py-2.5 rounded-xl text-sm ${results[i].correct === true ? 'bg-green-500/10 border border-green-500/20' : results[i].correct === false ? 'bg-red-500/10 border border-red-500/20' : 'bg-white/5 border border-white/10'}`}>
                {results[i].correct === true ? <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" /> :
                 results[i].correct === false ? <XCircle className="w-4 h-4 text-red-400 shrink-0" /> :
                 <Eye className="w-4 h-4 text-white/30 shrink-0" />}
                <span className="truncate text-white/80">{q.questionText}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-3 mt-8">
            <Button onClick={reset} variant="outline" className="flex-1 gap-2 border-white/20 text-white hover:bg-white/10">
              <RotateCcw className="w-4 h-4" /> Again
            </Button>
            <Button onClick={() => navigate('/')} className="flex-1 gap-2 bg-teal-500 hover:bg-teal-400 text-white border-0">
              <Home className="w-4 h-4" /> Home
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Active question ──────────────────────────────────────────────────────────
  const variants = {
    enter: d => ({ x: d > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: d => ({ x: d < 0 ? 300 : -300, opacity: 0 }),
  };

  return (
    <div className="min-h-screen w-screen bg-[#0d1b2a] text-white flex flex-col items-center py-8 px-4">

      {/* Header */}
      <div className="w-full max-w-2xl flex items-center justify-between mb-6">
        <Link to="/" className="text-white/40 hover:text-white/70 transition-colors">
          <Home className="w-5 h-5" />
        </Link>
        <div className="text-center">
          <p className="text-xs text-white/40 uppercase tracking-widest font-semibold mb-0.5">Practice Mode</p>
          <p className="text-sm font-bold text-white/70 truncate max-w-48">{quiz.title}</p>
        </div>
        <Badge className="bg-teal-500/20 text-teal-300 border-teal-500/30">
          {index + 1}/{quiz.questions.length}
        </Badge>
      </div>

      {/* Progress */}
      <div className="w-full max-w-2xl mb-8">
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <motion.div className="h-full bg-teal-400 rounded-full"
            animate={{ width: `${((index + 1) / quiz.questions.length) * 100}%` }}
            transition={{ duration: 0.3 }} />
        </div>
        <div className="flex justify-center gap-1.5 mt-2">
          {quiz.questions.map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full transition-all ${i === index ? 'bg-teal-400 scale-125' : results[i].correct === true ? 'bg-green-500' : results[i].correct === false ? 'bg-red-500' : results[i].answered ? 'bg-white/30' : 'bg-white/10'}`} />
          ))}
        </div>
      </div>

      {/* Question card */}
      <AnimatePresence initial={false} custom={direction} mode="wait">
        <motion.div key={index} custom={direction} variants={variants} initial="enter" animate="center" exit="exit"
          transition={{ type: 'tween', ease: 'circOut', duration: 0.35 }}
          className="w-full max-w-2xl bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 mb-6">

          <p className="text-xl md:text-2xl font-bold leading-relaxed mb-6">{q.questionText}</p>

          {/* MCQ */}
          {q.type === 'MCQ' && (
            <div className="flex flex-col gap-3">
              {q.mcqData.options.map(opt => {
                const isSelected = r.selected === opt.id;
                const isCorrectOpt = q.mcqData.correctOptions.includes(opt.id);
                let cls = 'border-white/20 bg-white/5 hover:border-teal-400/60 hover:bg-teal-500/5';
                if (r.answered) {
                  if (isCorrectOpt) cls = 'border-green-500 bg-green-500/10 text-green-300';
                  else if (isSelected) cls = 'border-red-500 bg-red-500/10 text-red-300';
                  else cls = 'border-white/10 bg-white/5 opacity-50';
                }
                return (
                  <button key={opt.id} disabled={r.answered}
                    onClick={() => handleMCQ(opt.id)}
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${r.answered ? 'cursor-default' : 'cursor-pointer'} ${cls}`}>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${r.answered && isCorrectOpt ? 'border-green-400 bg-green-400' : r.answered && isSelected ? 'border-red-400 bg-red-400' : 'border-white/30'}`}>
                      {r.answered && isCorrectOpt && <CheckCircle2 className="w-4 h-4 text-white" />}
                      {r.answered && isSelected && !isCorrectOpt && <XCircle className="w-4 h-4 text-white" />}
                    </div>
                    <span className="font-medium">{opt.text}</span>
                  </button>
                );
              })}
              {r.answered && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className={`mt-2 px-4 py-3 rounded-xl text-sm font-semibold ${r.correct ? 'bg-green-500/15 border border-green-500/30 text-green-300' : 'bg-red-500/15 border border-red-500/30 text-red-300'}`}>
                  {r.correct ? '🎉 Correct!' : '❌ Not quite — the correct answer is highlighted above.'}
                </motion.div>
              )}
            </div>
          )}

          {/* Fill in blank */}
          {q.type === 'FILL_IN_THE_BLANK' && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <Input value={fillInput} onChange={e => setFillInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleFill()}
                  disabled={r.answered}
                  placeholder="Type your answer…"
                  className="bg-white/5 border-white/20 text-white placeholder-white/30 focus-visible:border-teal-400" />
                {!r.answered && (
                  <Button onClick={handleFill} className="bg-teal-500 hover:bg-teal-400 text-white border-0 shrink-0">
                    Check
                  </Button>
                )}
              </div>
              {r.answered && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className={`px-4 py-3 rounded-xl text-sm ${r.correct ? 'bg-green-500/15 border border-green-500/30 text-green-300' : 'bg-red-500/15 border border-red-500/30 text-red-300'}`}>
                  {r.correct ? '🎉 Correct!' : <>❌ Correct answer: <strong>{q.fillBlankData.answers.map(a => a.text).join(' / ')}</strong></>}
                </motion.div>
              )}
            </div>
          )}

          {/* Other types */}
          {!['MCQ', 'FILL_IN_THE_BLANK'].includes(q.type) && (
            <div>
              {!r.answered ? (
                <Button onClick={handleReveal} variant="outline" className="gap-2 border-white/20 text-white hover:bg-white/10">
                  <Eye className="w-4 h-4" /> Reveal Answer
                </Button>
              ) : (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-white/5 border border-teal-500/30 rounded-xl p-4">
                  <p className="text-xs font-bold text-teal-400 uppercase tracking-wide mb-2">Correct Answer</p>
                  <CorrectAnswer q={q} />
                </motion.div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="w-full max-w-2xl flex items-center justify-between">
        <Button onClick={goPrev} disabled={index === 0} variant="ghost"
          className="gap-2 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-20">
          <ChevronLeft className="w-4 h-4" /> Prev
        </Button>
        {r.answered && (
          <Button onClick={goNext} className="gap-2 bg-teal-500 hover:bg-teal-400 text-white border-0 px-8">
            {index < quiz.questions.length - 1 ? 'Next' : 'Finish'}
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}
        {!r.answered && <div />}
      </div>
    </div>
  );
};

export default Practice;
