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
  RotateCcw, BookOpen, Eye, Home, Trophy, Volume2, VolumeX,
} from 'lucide-react';
import { playCorrect, playWrong, playComplete, isSoundEnabled, toggleSound } from '../utils/sounds';

// ── Correct answer renderer ───────────────────────────────────────────────────
const CorrectAnswer = ({ q }) => {
  switch (q.type) {
    case 'MCQ':
      return (
        <div className="flex flex-col gap-1">
          {q.mcqData.correctOptions.map(id => {
            const opt = q.mcqData.options.find(o => o.id === id);
            return <p key={id} className="font-semibold text-[hsl(var(--primary))]">✓ {opt?.text}</p>;
          })}
        </div>
      );
    case 'TRUE_FALSE':
      return <p className="font-semibold text-[hsl(var(--primary))]">✓ {q.trueFalseData.correctAnswer ? 'True' : 'False'}</p>;
    case 'FILL_IN_THE_BLANK':
      return <p className="font-semibold text-[hsl(var(--primary))]">✓ {q.fillBlankData.answers.map(a => a.text).join(' / ')}</p>;
    case 'MATCH_THE_FOLLOWING':
      return (
        <div className="flex flex-col gap-1">
          {q.matchData.pairs.map(p => (
            <p key={p.id} className="text-sm text-[hsl(var(--primary))]">{p.prompt} → <strong>{p.answer}</strong></p>
          ))}
        </div>
      );
    case 'REORDER':
      return (
        <ol className="flex flex-col gap-1">
          {q.reorderData.items.map((item, i) => (
            <li key={item.id} className="text-sm text-[hsl(var(--primary))]">{i + 1}. {item.text}</li>
          ))}
        </ol>
      );
    case 'CATEGORIZE':
      return (
        <div className="flex flex-col gap-2">
          {q.categorizeData.categories.map(cat => (
            <div key={cat.id}>
              <p className="text-xs font-bold text-[hsl(var(--primary))] uppercase">{cat.name}:</p>
              <p className="text-sm text-[hsl(var(--primary))]">
                {q.categorizeData.items.filter(i => i.categoryId === cat.id).map(i => i.text).join(', ')}
              </p>
            </div>
          ))}
        </div>
      );
    case 'PARAGRAPH':
      return <p className="text-sm italic text-[hsl(var(--muted-foreground))]">Open-ended — no auto-answer.</p>;
    default:
      return <p className="text-sm text-[hsl(var(--muted-foreground))]">No auto-answer for this type.</p>;
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
  const [results, setResults] = useState([]);
  const [fillInput, setFillInput] = useState('');
  const [mcqSelection, setMcqSelection] = useState([]);
  const [done, setDone] = useState(false);
  const [direction, setDirection] = useState(1);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());

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
    <div className="min-h-screen w-screen bg-[hsl(var(--background))] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[hsl(var(--border))] border-t-[hsl(var(--primary))] rounded-full animate-spin" />
    </div>
  );
  if (error) return (
    <div className="min-h-screen w-screen bg-[hsl(var(--background))] flex flex-col items-center justify-center gap-4 text-[hsl(var(--foreground))] p-8">
      <XCircle className="w-12 h-12 text-red-500 mb-2" />
      <h2 className="text-lg font-bold">{error}</h2>
      <Button onClick={() => navigate('/')} variant="outline" className="border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]">Go Home</Button>
    </div>
  );

  const q = quiz?.questions[index];
  const r = results[index];
  const score = results.filter(r => r.answered && r.correct === true).length;
  const scorePct = quiz ? Math.round((score / quiz.questions.length) * 100) : 0;

  const answer = (updates) => {
    if (updates.correct === true) playCorrect();
    else if (updates.correct === false) playWrong();
    setResults(prev => { const n = [...prev]; n[index] = { ...n[index], answered: true, ...updates }; return n; });
  };

  const isMultiSelect = (q.mcqData?.correctOptions?.length || 0) > 1;

  const toggleMcqOption = (optId) => {
    if (r.answered) return;
    setMcqSelection(prev => prev.includes(optId) ? prev.filter(id => id !== optId) : [...prev, optId]);
  };

  const submitMcq = (selectedIds) => {
    if (r.answered || !selectedIds.length) return;
    const correctIds = q.mcqData.correctOptions.map(String);
    const given = selectedIds.map(String);
    const isCorrect = correctIds.length > 0 && correctIds.length === given.length && correctIds.every(id => given.includes(id));
    answer({ correct: isCorrect, selected: selectedIds });
  };

  const handleMCQ = (optId) => {
    if (isMultiSelect) { toggleMcqOption(optId); return; }
    submitMcq([optId]);
  };

  const handleFill = () => {
    if (r.answered || !fillInput.trim()) return;
    const correct = q.fillBlankData.answers.map(a => a.text.toLowerCase()).includes(fillInput.trim().toLowerCase());
    answer({ correct, selected: fillInput.trim() });
  };

  const handleTrueFalse = (val) => {
    if (r.answered) return;
    answer({ correct: val === q.trueFalseData.correctAnswer, selected: val });
  };

  const handleReveal = () => { if (!r.answered) answer({ correct: null, selected: null }); };

  const goNext = () => {
    if (index < quiz.questions.length - 1) {
      setDirection(1); setIndex(i => i + 1); setFillInput(''); setMcqSelection([]);
    } else {
      playComplete();
      setDone(true);
    }
  };

  const goPrev = () => {
    if (index > 0) {
      setDirection(-1); setIndex(i => i - 1); setMcqSelection([]);
      const prevSelected = results[index - 1]?.selected;
      setFillInput(typeof prevSelected === 'string' ? prevSelected : '');
    }
  };

  const reset = () => {
    setIndex(0); setDone(false); setFillInput('');
    setResults(quiz.questions.map(() => ({ answered: false, correct: false, selected: null })));
  };

  // ── Done screen ──────────────────────────────────────────────────────────────
  // ── Done screen ──────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen w-screen bg-[hsl(var(--background))] flex items-center justify-center p-6 relative overflow-hidden">
        {/* Decorative background grid and blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] bg-[linear-gradient(to_right,hsl(var(--foreground))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground))_1px,transparent_1px)] bg-[size:3rem_3rem]" />
          <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/10 blur-[120px]" />
          <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/5 blur-[120px]" />
        </div>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-8 w-full max-w-lg text-[hsl(var(--foreground))] text-center shadow-md">
          <Trophy className="w-10 h-10 text-[hsl(var(--primary))] mx-auto mb-3" />
          <h1 className="text-xl font-bold tracking-tight mb-1">Practice Complete!</h1>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mb-6">{quiz.title}</p>

          <div className="w-28 h-28 mx-auto rounded-full bg-[hsl(var(--muted))]/30 border border-[hsl(var(--border))] flex flex-col items-center justify-center mb-6">
            <span className="text-3xl font-bold text-[hsl(var(--primary))]">{scorePct}%</span>
            <span className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">{score}/{quiz.questions.length} correct</span>
          </div>

          <div className="flex flex-col gap-2">
            {quiz.questions.map((q, i) => (
              <div key={i} className={`flex items-center gap-3 text-left px-3 py-2 rounded-md text-xs border ${results[i].correct === true ? 'bg-[hsl(var(--primary))]/5 border-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]' : results[i].correct === false ? 'bg-red-500/5 border-red-500/20 text-red-400' : 'bg-[hsl(var(--muted))]/20 border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]'}`}>
                {results[i].correct === true ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> :
                 results[i].correct === false ? <XCircle className="w-3.5 h-3.5 shrink-0" /> :
                 <Eye className="w-3.5 h-3.5 shrink-0" />}
                <span className="truncate">{q.questionText}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-3 mt-6">
            <Button onClick={reset} variant="outline" className="flex-1 gap-2 border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]">
              <RotateCcw className="w-3.5 h-3.5" /> Again
            </Button>
            <Button onClick={() => navigate('/')} className="flex-1 gap-2 bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary-hover))] text-[hsl(var(--primary-foreground))] border-0">
              <Home className="w-3.5 h-3.5" /> Home
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Active question ──────────────────────────────────────────────────────────
  const variants = {
    enter: d => ({ x: d > 0 ? 120 : -120, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: d => ({ x: d < 0 ? 120 : -120, opacity: 0 }),
  };

  return (
    <div className="min-h-screen w-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] flex flex-col items-center py-8 px-4 relative overflow-x-hidden">
      {/* Decorative background grid and blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] bg-[linear-gradient(to_right,hsl(var(--foreground))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground))_1px,transparent_1px)] bg-[size:3rem_3rem]" />
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/5 blur-[120px]" />
      </div>

      {/* Header */}
      <div className="relative z-10 w-full max-w-2xl flex items-center justify-between mb-6">
        <Link to="/" className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
          <Home className="w-4 h-4" />
        </Link>
        <div className="text-center">
          <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-widest font-semibold mb-0.5">Practice Mode</p>
          <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))] truncate max-w-48">{quiz.title}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSoundOn(toggleSound())} title={soundOn ? 'Mute sounds' : 'Unmute sounds'}
            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <Badge variant="outline" className="bg-[hsl(var(--muted))]/50 border-[hsl(var(--border))] text-xs">
            {index + 1}/{quiz.questions.length}
          </Badge>
        </div>
      </div>

      {/* Progress */}
      <div className="w-full max-w-2xl mb-6">
        <div className="h-1 bg-[hsl(var(--muted))] rounded-full overflow-hidden">
          <motion.div className="h-full bg-[hsl(var(--primary))]"
            animate={{ width: `${((index + 1) / quiz.questions.length) * 100}%` }}
            transition={{ duration: 0.2 }} />
        </div>
        <div className="flex justify-center gap-1 mt-2">
          {quiz.questions.map((_, i) => (
            <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === index ? 'bg-[hsl(var(--primary))] scale-110' : results[i].correct === true ? 'bg-[hsl(var(--primary))]/80' : results[i].correct === false ? 'bg-red-500/80' : results[i].answered ? 'bg-[hsl(var(--muted-foreground))]' : 'bg-[hsl(var(--muted))]'}`} />
          ))}
        </div>
      </div>

      {/* Question card */}
      <AnimatePresence initial={false} custom={direction} mode="wait">
        <motion.div key={index} custom={direction} variants={variants} initial="enter" animate="center" exit="exit"
          transition={{ type: 'tween', ease: 'easeInOut', duration: 0.2 }}
          className="w-full max-w-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-6 mb-6">

          <p className="text-lg font-bold leading-relaxed mb-4">{q.questionText}</p>

          {/* MCQ */}
          {q.type === 'MCQ' && (
            <div className="flex flex-col gap-2">
              {isMultiSelect && !r.answered && (
                <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wide font-semibold -mt-1 mb-1">Select all that apply</p>
              )}
              {q.mcqData.options.map(opt => {
                const liveSelection = r.answered ? r.selected : mcqSelection;
                const isSelected = (liveSelection || []).includes(opt.id);
                const isCorrectOpt = q.mcqData.correctOptions.includes(opt.id);
                let cls = 'border-[hsl(var(--border))] bg-transparent hover:border-[hsl(var(--primary))]/40 hover:bg-[hsl(var(--muted))]/40';
                if (r.answered) {
                  if (isCorrectOpt) cls = 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5 text-[hsl(var(--primary))]';
                  else if (isSelected) cls = 'border-red-500 bg-red-500/5 text-red-400';
                  else cls = 'border-[hsl(var(--border))] bg-transparent opacity-40';
                } else if (isSelected) {
                  cls = 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5 text-[hsl(var(--primary))]';
                }
                return (
                  <button key={opt.id} disabled={r.answered}
                    onClick={() => handleMCQ(opt.id)}
                    className={`flex items-center gap-3 p-3 rounded-md border text-xs text-left transition-all ${r.answered ? 'cursor-default' : 'cursor-pointer'} ${cls}`}>
                    <div className={`w-4 h-4 ${isMultiSelect ? 'rounded' : 'rounded-full'} border flex items-center justify-center shrink-0 transition-all ${r.answered && isCorrectOpt ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]' : r.answered && isSelected ? 'border-red-500 bg-red-500' : isSelected ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]' : 'border-[hsl(var(--border))]'}`}>
                      {r.answered && isCorrectOpt && <CheckCircle2 className="w-2.5 h-2.5 text-[hsl(var(--primary-foreground))]" />}
                      {r.answered && isSelected && !isCorrectOpt && <XCircle className="w-2.5 h-2.5 text-white" />}
                      {!r.answered && isSelected && <CheckCircle2 className="w-2.5 h-2.5 text-[hsl(var(--primary-foreground))]" />}
                    </div>
                    <span className="font-medium">{opt.text}</span>
                  </button>
                );
              })}
              {isMultiSelect && !r.answered && (
                <Button onClick={() => submitMcq(mcqSelection)} disabled={!mcqSelection.length}
                  className="mt-1 bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary-hover))] text-[hsl(var(--primary-foreground))] border-0">
                  Submit Answer
                </Button>
              )}
              {r.answered && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  className={`mt-2 px-3 py-2 rounded-md text-xs font-semibold ${r.correct ? 'bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                  {r.correct ? 'Correct!' : 'Not quite — the correct answer is highlighted.'}
                </motion.div>
              )}
            </div>
          )}

          {/* True / False */}
          {q.type === 'TRUE_FALSE' && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-3">
                {[true, false].map(val => {
                  const isSelected = r.selected === val;
                  const isCorrectVal = q.trueFalseData.correctAnswer === val;
                  let cls = 'border-[hsl(var(--border))] bg-transparent hover:border-[hsl(var(--primary))]/40 hover:bg-[hsl(var(--muted))]/40';
                  if (r.answered) {
                    if (isCorrectVal) cls = 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5 text-[hsl(var(--primary))]';
                    else if (isSelected) cls = 'border-red-500 bg-red-500/5 text-red-400';
                    else cls = 'border-[hsl(var(--border))] bg-transparent opacity-40';
                  }
                  return (
                    <button key={String(val)} disabled={r.answered} onClick={() => handleTrueFalse(val)}
                      className={`flex items-center justify-center gap-2 py-3 rounded-md border font-bold text-sm transition-all ${r.answered ? 'cursor-default' : 'cursor-pointer'} ${cls}`}>
                      {val ? 'True' : 'False'}
                    </button>
                  );
                })}
              </div>
              {r.answered && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  className={`mt-1 px-3 py-2 rounded-md text-xs font-semibold ${r.correct ? 'bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                  {r.correct ? 'Correct!' : 'Not quite — the correct answer is highlighted.'}
                </motion.div>
              )}
            </div>
          )}

          {/* Fill in blank */}
          {q.type === 'FILL_IN_THE_BLANK' && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Input value={fillInput} onChange={e => setFillInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleFill()}
                  disabled={r.answered}
                  placeholder="Type your answer…"
                  className="bg-transparent border-[hsl(var(--border))] text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))]/40 focus-visible:border-[hsl(var(--primary))]" />
                {!r.answered && (
                  <Button onClick={handleFill} className="bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 text-[hsl(var(--primary-foreground))] border-0 shrink-0 text-xs py-1.5 px-3 rounded-md">
                    Check
                  </Button>
                )}
              </div>
              {r.answered && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  className={`px-3 py-2 rounded-md text-xs ${r.correct ? 'bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                  {r.correct ? 'Correct!' : <>Correct answer: <strong>{q.fillBlankData.answers.map(a => a.text).join(' / ')}</strong></>}
                </motion.div>
              )}
            </div>
          )}

          {/* Other types */}
          {!['MCQ', 'TRUE_FALSE', 'FILL_IN_THE_BLANK'].includes(q.type) && (
            <div>
              {!r.answered ? (
                <Button onClick={handleReveal} variant="outline" className="gap-2 border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] text-xs py-1.5 px-3">
                  <Eye className="w-3.5 h-3.5" /> Reveal Answer
                </Button>
              ) : (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  className="border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 rounded-md p-3">
                  <p className="text-[10px] font-bold text-[hsl(var(--primary))] uppercase tracking-wide mb-1.5">Correct Answer</p>
                  <CorrectAnswer q={q} />
                </motion.div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="relative z-10 w-full max-w-2xl flex items-center justify-between">
        <Button onClick={goPrev} disabled={index === 0} variant="ghost"
          className="gap-1.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/20 disabled:opacity-20 text-xs py-1 px-3">
          <ChevronLeft className="w-3.5 h-3.5" /> Prev
        </Button>
        {r.answered && (
          <Button onClick={goNext} className="gap-1.5 bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 text-[hsl(var(--primary-foreground))] border-0 px-6 text-xs h-8 rounded-md">
            {index < quiz.questions.length - 1 ? 'Next' : 'Finish'}
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        )}
        {!r.answered && <div />}
      </div>
    </div>
  );
};

export default Practice;
