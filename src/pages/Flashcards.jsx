import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  ChevronLeft, ChevronRight, RotateCcw, Home,
  CheckCircle2, BookOpen, Trophy, Shuffle,
} from 'lucide-react';

// ── Derive the "back" content for each question type ─────────────────────────
const getBack = (q) => {
  switch (q.type) {
    case 'MCQ': {
      const answers = q.mcqData.correctOptions.map(id => {
        const opt = q.mcqData.options.find(o => o.id === id);
        return opt?.text ?? '—';
      });
      return { label: 'Correct Answer', content: answers.join(' · ') };
    }
    case 'FILL_IN_THE_BLANK':
      return { label: 'Answer', content: q.fillBlankData.answers.map(a => a.text).join(' / ') };
    case 'MATCH_THE_FOLLOWING':
      return {
        label: 'Matches',
        content: q.matchData.pairs.map(p => `${p.prompt} → ${p.answer}`).join('\n'),
      };
    case 'REORDER':
      return {
        label: 'Correct Order',
        content: q.reorderData.items.map((item, i) => `${i + 1}. ${item.text}`).join('\n'),
      };
    case 'CATEGORIZE':
      return {
        label: 'Categories',
        content: q.categorizeData.categories
          .map(cat => `${cat.name}: ${q.categorizeData.items.filter(i => i.categoryId === cat.id).map(i => i.text).join(', ')}`)
          .join('\n'),
      };
    case 'PARAGRAPH':
      return { label: 'Hint', content: 'Open-ended — no auto-answer.' };
    default:
      return { label: 'Answer', content: 'See question for details.' };
  }
};

// ── Flip card ─────────────────────────────────────────────────────────────────
const FlipCard = ({ question, isFlipped, onFlip }) => {
  const back = getBack(question);
  return (
    <div style={{ perspective: '1200px' }} className="w-full max-w-2xl" onClick={onFlip}>
      <motion.div
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
        style={{ transformStyle: 'preserve-3d', position: 'relative', minHeight: '260px', cursor: 'pointer' }}
      >
        {/* Front */}
        <div style={{ backfaceVisibility: 'hidden' }}
          className="absolute inset-0 flex flex-col items-center justify-center p-8 rounded-3xl bg-white/8 border border-white/15 shadow-2xl">
          <p className="text-xs font-bold text-[#8b5cf6] uppercase tracking-widest mb-4">Question</p>
          <p className="text-xl md:text-2xl font-bold text-white text-center leading-relaxed">{question.questionText}</p>
          <p className="text-white/30 text-sm mt-6">Tap to reveal answer</p>
        </div>

        {/* Back */}
        <div style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          className="absolute inset-0 flex flex-col items-center justify-center p-8 rounded-3xl bg-gradient-to-br from-[#4776e6]/20 to-[#8b5cf6]/20 border border-[#8b5cf6]/30 shadow-2xl">
          <p className="text-xs font-bold text-[#a78bfa] uppercase tracking-widest mb-4">{back.label}</p>
          <p className="text-lg md:text-xl font-semibold text-white text-center leading-relaxed whitespace-pre-line">{back.content}</p>
          <p className="text-white/30 text-sm mt-6">Tap to flip back</p>
        </div>
      </motion.div>
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const Flashcards = () => {
  const { quizId } = useParams();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cards, setCards] = useState([]); // reorderable list of indices
  const [index, setIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  // 'unseen' | 'know' | 'learning'
  const [status, setStatus] = useState({});
  const [done, setDone] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'quizzes', quizId));
        if (!snap.exists()) { setError('Quiz not found.'); return; }
        const data = snap.data();
        setQuiz(data);
        setCards(data.questions.map((_, i) => i));
        setStatus(Object.fromEntries(data.questions.map((_, i) => [i, 'unseen'])));
      } catch { setError('Failed to load quiz.'); }
      finally { setLoading(false); }
    };
    load();
  }, [quizId]);

  if (loading) return (
    <div className="min-h-screen w-screen bg-[#0d0d20] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-[#8b5cf6]/30 border-t-[#8b5cf6] rounded-full animate-spin" />
    </div>
  );
  if (error) return (
    <div className="min-h-screen w-screen bg-[#0d0d20] flex flex-col items-center justify-center gap-4 text-white p-8">
      <p className="text-2xl font-bold">{error}</p>
      <Button onClick={() => navigate('/')} variant="outline" className="border-white/20 text-white">Go Home</Button>
    </div>
  );

  const currentIndex = cards[index];
  const q = quiz?.questions[currentIndex];
  const knowCount = Object.values(status).filter(s => s === 'know').length;
  const learningCount = Object.values(status).filter(s => s === 'learning').length;
  const total = quiz?.questions.length ?? 0;
  const progress = total ? Math.round((knowCount / total) * 100) : 0;

  const markAndNext = (mark) => {
    setStatus(s => ({ ...s, [currentIndex]: mark }));
    setIsFlipped(false);
    setTimeout(() => {
      if (index < cards.length - 1) setIndex(i => i + 1);
      else setDone(true);
    }, 150);
  };

  const reset = () => {
    setIndex(0); setDone(false); setIsFlipped(false);
    setCards(quiz.questions.map((_, i) => i));
    setStatus(Object.fromEntries(quiz.questions.map((_, i) => [i, 'unseen'])));
  };

  const shuffleCards = () => {
    setCards(c => [...c].sort(() => Math.random() - 0.5));
    setIndex(0); setIsFlipped(false);
  };

  const reviewLearning = () => {
    const learningIndices = Object.entries(status)
      .filter(([, s]) => s === 'learning')
      .map(([i]) => parseInt(i));
    if (!learningIndices.length) return;
    setCards(learningIndices);
    setIndex(0); setIsFlipped(false); setDone(false);
  };

  // ── Done screen ──────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen w-screen bg-[#0d0d20] flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="bg-white/5 border border-white/10 rounded-3xl p-10 w-full max-w-md text-white text-center">
          <Trophy className="w-14 h-14 text-amber-400 mx-auto mb-4" />
          <h1 className="text-3xl font-black mb-1">Session Done!</h1>
          <p className="text-white/50 mb-8">{quiz.title}</p>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-5">
              <p className="text-4xl font-black text-green-400">{knowCount}</p>
              <p className="text-sm text-white/50 mt-1">Knew it</p>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5">
              <p className="text-4xl font-black text-amber-400">{learningCount}</p>
              <p className="text-sm text-white/50 mt-1">Still learning</p>
            </div>
          </div>

          <Progress value={progress} className="h-2 mb-2"
            indicatorClassName="bg-gradient-to-r from-[#4776e6] to-[#8b5cf6]" />
          <p className="text-xs text-white/30 mb-8">{knowCount} of {total} cards mastered</p>

          <div className="flex flex-col gap-3">
            {learningCount > 0 && (
              <Button onClick={reviewLearning} className="w-full bg-amber-500 hover:bg-amber-400 text-white border-0 gap-2">
                <BookOpen className="w-4 h-4" /> Review Still-Learning ({learningCount})
              </Button>
            )}
            <div className="flex gap-3">
              <Button onClick={reset} variant="outline" className="flex-1 gap-2 border-white/20 text-white hover:bg-white/10">
                <RotateCcw className="w-4 h-4" /> All Over
              </Button>
              <Button onClick={() => navigate('/')} className="flex-1 gap-2 bg-[#4776e6] hover:bg-[#3a64d8] text-white border-0">
                <Home className="w-4 h-4" /> Home
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Active card ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-screen bg-[#0d0d20] text-white flex flex-col items-center py-8 px-4"
      style={{ background: 'radial-gradient(ellipse at 50% 0%,rgba(139,92,246,0.15) 0%,#0d0d20 60%)' }}>

      {/* Header */}
      <div className="w-full max-w-2xl flex items-center justify-between mb-6">
        <Link to="/" className="text-white/40 hover:text-white/70 transition-colors">
          <Home className="w-5 h-5" />
        </Link>
        <div className="text-center">
          <p className="text-xs text-[#a78bfa] uppercase tracking-widest font-semibold mb-0.5">Flashcards</p>
          <p className="text-sm font-bold text-white/70 truncate max-w-48">{quiz.title}</p>
        </div>
        <button onClick={shuffleCards} className="text-white/40 hover:text-white/70 transition-colors" title="Shuffle">
          <Shuffle className="w-5 h-5" />
        </button>
      </div>

      {/* Progress */}
      <div className="w-full max-w-2xl mb-2">
        <Progress value={progress} className="h-1.5"
          indicatorClassName="bg-gradient-to-r from-[#4776e6] to-[#8b5cf6]" />
      </div>
      <div className="w-full max-w-2xl flex justify-between text-xs text-white/30 mb-8">
        <span>{index + 1} / {cards.length}</span>
        <span>{knowCount} mastered · {learningCount} learning</span>
      </div>

      {/* Status dots */}
      <div className="flex gap-1 mb-6">
        {cards.map((ci, i) => (
          <div key={ci} className={`w-2 h-2 rounded-full transition-all ${i === index ? 'bg-[#a78bfa] scale-125' : status[ci] === 'know' ? 'bg-green-500' : status[ci] === 'learning' ? 'bg-amber-500' : 'bg-white/10'}`} />
        ))}
      </div>

      {/* Flip card */}
      <AnimatePresence mode="wait">
        <motion.div key={`${currentIndex}-${index}`}
          initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.2 }} className="w-full max-w-2xl mb-8">
          <FlipCard question={q} isFlipped={isFlipped} onFlip={() => setIsFlipped(f => !f)} />
        </motion.div>
      </AnimatePresence>

      {/* Action buttons */}
      {isFlipped ? (
        <div className="flex gap-4 w-full max-w-xs">
          <Button onClick={() => markAndNext('learning')}
            className="flex-1 gap-2 bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 font-bold py-6">
            Still Learning ↩
          </Button>
          <Button onClick={() => markAndNext('know')}
            className="flex-1 gap-2 bg-green-500/20 border border-green-500/40 text-green-300 hover:bg-green-500/30 font-bold py-6">
            <CheckCircle2 className="w-4 h-4" /> Got It ✓
          </Button>
        </div>
      ) : (
        <div className="flex gap-4">
          <Button onClick={() => { setIsFlipped(false); if (index > 0) setIndex(i => i - 1); }}
            disabled={index === 0} variant="ghost"
            className="text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-20">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <Button onClick={() => setIsFlipped(true)}
            className="px-8 bg-gradient-to-r from-[#4776e6] to-[#8b5cf6] text-white border-0 hover:opacity-90">
            Flip Card
          </Button>
          <Button onClick={() => { setIsFlipped(false); if (index < cards.length - 1) setIndex(i => i + 1); else setDone(true); }}
            variant="ghost" className="text-white/40 hover:text-white hover:bg-white/10">
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default Flashcards;
