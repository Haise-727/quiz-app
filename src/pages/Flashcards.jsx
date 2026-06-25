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
  CheckCircle2, BookOpen, Trophy, Shuffle, Volume2, VolumeX,
} from 'lucide-react';
import { playClick, playCorrect, playComplete, isSoundEnabled, toggleSound } from '../utils/sounds';

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
    case 'TRUE_FALSE':
      return { label: 'Correct Answer', content: q.trueFalseData.correctAnswer ? 'True' : 'False' };
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
    <div style={{ perspective: '1200px' }} className="w-full max-w-2xl select-none" onClick={onFlip}>
      <motion.div
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        style={{ transformStyle: 'preserve-3d', position: 'relative', minHeight: '280px', cursor: 'pointer' }}
      >
        {/* Front */}
        <div style={{ backfaceVisibility: 'hidden' }}
          className="absolute inset-0 flex flex-col items-center justify-center p-8 rounded-3xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] shadow-md text-[hsl(var(--foreground))]"
        >
          <p className="text-xs font-bold text-[hsl(var(--primary))] uppercase tracking-widest mb-4">Question</p>
          <p className="text-xl md:text-2xl font-bold text-center leading-relaxed">{question.questionText}</p>
          <p className="text-[hsl(var(--muted-foreground))] text-sm mt-6">Tap to reveal answer</p>
        </div>

        {/* Back */}
        <div style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          className="absolute inset-0 flex flex-col items-center justify-center p-8 rounded-3xl bg-[hsl(var(--card))] border border-[hsl(var(--primary))]/30 shadow-md text-[hsl(var(--foreground))]"
        >
          <p className="text-xs font-bold text-[hsl(var(--primary))] uppercase tracking-widest mb-4">{back.label}</p>
          <p className="text-lg md:text-xl font-semibold text-center leading-relaxed whitespace-pre-line">{back.content}</p>
          <p className="text-[hsl(var(--muted-foreground))] text-sm mt-6">Tap to flip back</p>
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
  const [soundOn, setSoundOn] = useState(isSoundEnabled());

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
    <div className="min-h-screen w-screen bg-[hsl(var(--background))] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-[hsl(var(--border))] border-t-[hsl(var(--primary))] rounded-full animate-spin" />
    </div>
  );
  if (error) return (
    <div className="min-h-screen w-screen bg-[hsl(var(--background))] flex flex-col items-center justify-center gap-4 text-[hsl(var(--foreground))] p-8">
      <p className="text-2xl font-bold">{error}</p>
      <Button onClick={() => navigate('/')} variant="outline" className="border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]">Go Home</Button>
    </div>
  );

  const currentIndex = cards[index];
  const q = quiz?.questions[currentIndex];
  const knowCount = Object.values(status).filter(s => s === 'know').length;
  const learningCount = Object.values(status).filter(s => s === 'learning').length;
  const total = quiz?.questions.length ?? 0;
  const progress = total ? Math.round((knowCount / total) * 100) : 0;

  const markAndNext = (mark) => {
    if (mark === 'know') playCorrect(); else playClick();
    setStatus(s => ({ ...s, [currentIndex]: mark }));
    setIsFlipped(false);
    setTimeout(() => {
      if (index < cards.length - 1) setIndex(i => i + 1);
      else { playComplete(); setDone(true); }
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
      <div className="min-h-screen w-screen bg-[hsl(var(--background))] flex items-center justify-center p-6 relative overflow-hidden">
        {/* Background Grid and Blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] bg-[linear-gradient(to_right,hsl(var(--foreground))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground))_1px,transparent_1px)] bg-[size:3rem_3rem]" />
          <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/10 blur-[120px]" />
          <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/5 blur-[120px]" />
        </div>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-3xl p-10 w-full max-w-md text-[hsl(var(--foreground))] text-center shadow-md">
          <Trophy className="w-14 h-14 text-amber-500 mx-auto mb-4" />
          <h1 className="text-3xl font-black mb-1">Session Done!</h1>
          <p className="text-[hsl(var(--muted-foreground))] mb-8">{quiz.title}</p>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-5">
              <p className="text-4xl font-black text-green-600 dark:text-green-400">{knowCount}</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">Knew it</p>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5">
              <p className="text-4xl font-black text-amber-600 dark:text-amber-400">{learningCount}</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">Still learning</p>
            </div>
          </div>

          <Progress value={progress} className="h-2 mb-2 bg-[hsl(var(--muted))]"
            indicatorClassName="bg-[hsl(var(--primary))]" />
          <p className="text-xs text-[hsl(var(--muted-foreground))] mb-8">{knowCount} of {total} cards mastered</p>

          <div className="flex flex-col gap-3">
            {learningCount > 0 && (
              <Button onClick={reviewLearning} className="w-full bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary-hover))] text-white border-0 gap-2 font-semibold">
                <BookOpen className="w-4 h-4" /> Review Still-Learning ({learningCount})
              </Button>
            )}
            <div className="flex gap-3">
              <Button onClick={reset} variant="outline" className="flex-1 gap-2 border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/80">
                <RotateCcw className="w-4 h-4" /> All Over
              </Button>
              <Button onClick={() => navigate('/')} className="flex-1 gap-2 bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary-hover))] text-white border-0 font-semibold">
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
          <Home className="w-5 h-5" />
        </Link>
        <div className="text-center">
          <p className="text-xs text-[hsl(var(--primary))] uppercase tracking-widest font-semibold mb-0.5">Flashcards</p>
          <p className="text-sm font-bold text-[hsl(var(--foreground))]/70 truncate max-w-48">{quiz.title}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setSoundOn(toggleSound())} title={soundOn ? 'Mute sounds' : 'Unmute sounds'}
            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors cursor-pointer bg-transparent border-0">
            {soundOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
          <button onClick={shuffleCards} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors cursor-pointer bg-transparent border-0" title="Shuffle">
            <Shuffle className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="relative z-10 w-full max-w-2xl mb-2">
        <Progress value={progress} className="h-1.5 bg-[hsl(var(--muted))]"
          indicatorClassName="bg-[hsl(var(--primary))]" />
      </div>
      <div className="relative z-10 w-full max-w-2xl flex justify-between text-xs text-[hsl(var(--muted-foreground))] mb-8">
        <span>{index + 1} / {cards.length}</span>
        <span>{knowCount} mastered · {learningCount} learning</span>
      </div>

      {/* Status dots */}
      <div className="relative z-10 flex gap-1 mb-6">
        {cards.map((ci, i) => (
          <div key={ci} className={`w-2 h-2 rounded-full transition-all ${i === index ? 'bg-[hsl(var(--primary))] scale-125' : status[ci] === 'know' ? 'bg-green-500' : status[ci] === 'learning' ? 'bg-amber-500' : 'bg-[hsl(var(--border))]'}`} />
        ))}
      </div>

      {/* Flip card */}
      <AnimatePresence mode="wait">
        <motion.div key={`${currentIndex}-${index}`}
          initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.2 }} className="relative z-10 w-full max-w-2xl mb-8">
          <FlipCard question={q} isFlipped={isFlipped} onFlip={() => { playClick(); setIsFlipped(f => !f); }} />
        </motion.div>
      </AnimatePresence>

      {/* Action buttons */}
      <div className="relative z-10">
        {isFlipped ? (
          <div className="flex gap-4 w-full max-w-xs">
            <Button onClick={() => markAndNext('learning')}
              className="flex-1 gap-2 bg-amber-500/10 border border-amber-500/35 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 font-bold py-6 cursor-pointer">
              Still Learning ↩
            </Button>
            <Button onClick={() => markAndNext('know')}
              className="flex-1 gap-2 bg-green-500/10 border border-green-500/35 text-green-600 dark:text-green-400 hover:bg-green-500/20 font-bold py-6 cursor-pointer">
              <CheckCircle2 className="w-4 h-4" /> Got It ✓
            </Button>
          </div>
        ) : (
          <div className="flex gap-4">
            <Button onClick={() => { setIsFlipped(false); if (index > 0) setIndex(i => i - 1); }}
              disabled={index === 0} variant="ghost"
              className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/50 disabled:opacity-20">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <Button onClick={() => { playClick(); setIsFlipped(true); }}
              className="px-8 bg-[hsl(var(--primary))] text-white border-0 hover:bg-[hsl(var(--primary-hover))] font-semibold">
              Flip Card
            </Button>
            <Button onClick={() => { setIsFlipped(false); if (index < cards.length - 1) setIndex(i => i + 1); else { playComplete(); setDone(true); } }}
              variant="ghost" className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/50">
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Flashcards;
