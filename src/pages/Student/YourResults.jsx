import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../firebase';
import { collection, query, where, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import MediaRenderer from '../../components/MediaRenderer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Trophy, Target, TrendingUp, Clock, Eye,
  PlayCircle, LogOut, School, CheckCircle2, XCircle, AlertCircle, User,
} from 'lucide-react';

// ── Question review card ──────────────────────────────────────────────────────
const QuestionReview = ({ originalQuestion, studentAnswerData, index }) => {
  const isPending = studentAnswerData.status === 'pending_review';
  const isCorrect = !isPending && studentAnswerData.pointsAwarded >= originalQuestion.points;
  const isPartial = !isPending && !isCorrect && studentAnswerData.pointsAwarded > 0;
  const mainMedia = originalQuestion.visualData?.mainMedia || originalQuestion.listeningData?.mainMedia || originalQuestion.media;

  const statusColor = isPending ? 'border-l-amber-400' : isCorrect ? 'border-l-green-500' : 'border-l-red-400';
  const statusBadge = isPending ? 'warning' : isCorrect ? 'success' : isPartial ? 'info' : 'destructive';
  const statusLabel = isPending ? 'Pending' : isCorrect ? 'Correct' : isPartial ? 'Partial' : 'Incorrect';

  const renderUserAnswer = () => {
    const ua = studentAnswerData.userAnswer;
    if ((!ua && typeof ua !== 'string') || (Array.isArray(ua) && ua.length === 0))
      return <span className="italic text-[hsl(var(--muted-foreground))]">No answer provided</span>;
    switch (originalQuestion.type) {
      case 'MCQ': {
        const sel = new Set(ua || []);
        if (!sel.size) return <span className="italic text-[hsl(var(--muted-foreground))]">No answer</span>;
        return (
          <div className="flex flex-col gap-1">
            {originalQuestion.mcqData.options.filter(o => sel.has(o.id)).map(o => (
              <div key={o.id} className="flex items-center gap-2">
                <MediaRenderer media={o.media} transform="thumbnail" />
                <span>{o.text}</span>
              </div>
            ))}
          </div>
        );
      }
      case 'FILL_IN_THE_BLANK': case 'PARAGRAPH':
        return <p className="whitespace-pre-wrap m-0">{ua}</p>;
      case 'REORDER':
        return (
          <ol className="flex flex-col gap-1 list-none p-0 m-0">
            {ua.map((item, i) => (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                <span className="w-5 h-5 rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                <MediaRenderer media={item.media} transform="thumbnail" />
                {item.text}
              </li>
            ))}
          </ol>
        );
      case 'CATEGORIZE':
        return (
          <div className="grid grid-cols-2 gap-3">
            {originalQuestion.categorizeData.categories.map(cat => (
              <div key={cat.id}>
                <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] mb-1">{cat.name}</p>
                {(ua[cat.id] || []).map(i => (
                  <div key={i.id} className="flex items-center gap-1 text-sm"><MediaRenderer media={i.media} transform="thumbnail" />{i.text}</div>
                ))}
              </div>
            ))}
          </div>
        );
      case 'MATCH_THE_FOLLOWING':
        return (
          <div className="flex flex-col gap-1">
            {originalQuestion.matchData.pairs.map(p => (
              <div key={p.id} className="flex items-center gap-2 text-sm flex-wrap">
                <div className="flex items-center gap-1 bg-[hsl(var(--muted))] px-2 py-0.5 rounded">
                  <MediaRenderer media={p.promptMedia} transform="thumbnail" />{p.prompt}
                </div>
                <span className="text-[hsl(var(--muted-foreground))]">→</span>
                <div className="flex items-center gap-1 bg-[hsl(var(--muted))] px-2 py-0.5 rounded">
                  {ua.pairs?.[p.id]
                    ? <><MediaRenderer media={ua.pairs[p.id].answerMedia} transform="thumbnail" />{ua.pairs[p.id].answerText}</>
                    : <span className="italic text-[hsl(var(--muted-foreground))]">unmatched</span>}
                </div>
              </div>
            ))}
          </div>
        );
      default: return <span className="italic text-[hsl(var(--muted-foreground))]">Review unavailable</span>;
    }
  };

  const renderCorrectAnswer = () => {
    switch (originalQuestion.type) {
      case 'MCQ':
        return (
          <div className="flex flex-col gap-1">
            {originalQuestion.mcqData.correctOptions.map(id => {
              const o = originalQuestion.mcqData.options.find(x => x.id === id);
              return <div key={id} className="flex items-center gap-2"><MediaRenderer media={o?.media} transform="thumbnail" />{o?.text}</div>;
            })}
          </div>
        );
      case 'FILL_IN_THE_BLANK':
        return <p className="m-0">{originalQuestion.fillBlankData.answers.map(a => a.text).join(' / ')}</p>;
      case 'REORDER':
        return (
          <ol className="flex flex-col gap-1 list-none p-0 m-0">
            {originalQuestion.reorderData.items.map((item, i) => (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                <span className="w-5 h-5 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                {item.text}
              </li>
            ))}
          </ol>
        );
      case 'MATCH_THE_FOLLOWING':
        return (
          <div className="flex flex-col gap-1">
            {originalQuestion.matchData.pairs.map(p => (
              <div key={p.id} className="text-sm">{p.prompt} → {p.answer}</div>
            ))}
          </div>
        );
      case 'CATEGORIZE':
        return (
          <div className="grid grid-cols-2 gap-3">
            {originalQuestion.categorizeData.categories.map(cat => (
              <div key={cat.id}>
                <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] mb-1">{cat.name}</p>
                {originalQuestion.categorizeData.items.filter(i => i.categoryId === cat.id).map(i => (
                  <div key={i.id} className="text-sm">{i.text}</div>
                ))}
              </div>
            ))}
          </div>
        );
      default: return null;
    }
  };

  return (
    <div className={`border-l-4 ${statusColor} bg-[hsl(var(--muted))]/30 rounded-r-xl p-4`}>
      <div className="flex items-start gap-3 mb-3">
        <span className="w-7 h-7 rounded-full bg-[hsl(var(--foreground))] text-[hsl(var(--background))] flex items-center justify-center text-xs font-black shrink-0">
          {index + 1}
        </span>
        <p className="font-semibold text-[hsl(var(--foreground))] text-sm flex-1 leading-relaxed">{originalQuestion.questionText}</p>
        <Badge variant={statusBadge} className="shrink-0">
          {isPending ? 'Pending' : `${studentAnswerData.pointsAwarded}/${originalQuestion.points}`} — {statusLabel}
        </Badge>
      </div>

      {mainMedia && (
        <div className="max-h-48 overflow-hidden rounded-lg mb-3">
          <MediaRenderer media={mainMedia} transform="question_main" />
        </div>
      )}

      <div className="pl-10 flex flex-col gap-2">
        <div className="rounded-lg p-3 bg-[#eef2ff] border border-[#c7d2fe]">
          <p className="text-xs font-bold text-[#4338ca] uppercase tracking-wide mb-1.5">Your Answer</p>
          <div className="text-sm text-[hsl(var(--foreground))]">{renderUserAnswer()}</div>
        </div>
        {!isCorrect && !isPending && (
          <div className="rounded-lg p-3 bg-green-50 border border-green-200">
            <p className="text-xs font-bold text-green-700 uppercase tracking-wide mb-1.5">Correct Answer</p>
            <div className="text-sm text-green-800">{renderCorrectAnswer()}</div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const YourResults = () => {
  const navigate = useNavigate();
  const { currentUser, displayName, signOut: ctxSignOut, switchRole } = useAuth();

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedResult, setSelectedResult] = useState(null);
  const [reviewQuiz, setReviewQuiz] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  useEffect(() => {
    if (!currentUser) { navigate('/login'); return; }
    const fetch = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'quiz_results'), where('userId', '==', currentUser.uid), orderBy('completedAt', 'desc'))
        );
        setResults(snap.docs.map(d => {
          const data = d.data();
          const display = data.status === 'completed' ? data.finalScore : data.score;
          const pct = data.maxScore > 0 ? Math.round((display / data.maxScore) * 100) : 0;
          const correct = (data.answers || []).filter(a => a.pointsAwarded > 0).length;
          return { id: d.id, ...data, displayScore: display, percentage: pct, correctCount: correct };
        }));
      } catch { toast.error('Failed to load results.'); }
      finally { setLoading(false); }
    };
    fetch();
  }, [currentUser, navigate]);

  const openReview = async (result) => {
    setSelectedResult(result); setReviewLoading(true);
    try {
      const snap = await getDoc(doc(db, 'quizzes', result.quizId));
      setReviewQuiz(snap.exists() ? snap.data() : null);
    } catch { setReviewQuiz(null); }
    finally { setReviewLoading(false); }
  };

  const handleSignOut = async () => { await ctxSignOut(); navigate('/login'); };
  const handleSwitchRole = async () => { try { await switchRole('teacher'); } catch { toast.error('Failed.'); } };

  const initials = (displayName || currentUser?.email || 'S').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const relDate = (ts) => {
    if (!ts?.toDate) return 'Unknown';
    const d = ts.toDate(), s = Math.round((Date.now() - d) / 1000);
    if (s < 60) return 'Just now';
    const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
    const dy = Math.round(h / 24); if (dy === 1) return 'Yesterday';
    if (dy < 7) return `${dy}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const scoreBadge = (pct, status) => {
    if (status !== 'completed') return 'warning';
    if (pct >= 80) return 'success';
    if (pct >= 60) return 'info';
    if (pct >= 40) return 'warning';
    return 'destructive';
  };

  const scoreIcon = (pct, status) => {
    if (status !== 'completed') return <AlertCircle className="w-4 h-4" />;
    if (pct >= 60) return <CheckCircle2 className="w-4 h-4" />;
    return <XCircle className="w-4 h-4" />;
  };

  // Summary stats
  const totalTaken = results.length;
  const completed = results.filter(r => r.status === 'completed');
  const avgScore = completed.length > 0 ? Math.round(completed.reduce((s, r) => s + r.percentage, 0) / completed.length) : 0;
  const bestScore = completed.length > 0 ? Math.max(...completed.map(r => r.percentage)) : 0;

  if (loading) return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-[#3a1c71] to-[#4776e6] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-[#3a1c71] via-[#2d3a9e] to-[#4776e6] relative overflow-x-hidden">
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 80% 20%,rgba(255,255,255,0.05) 0%,transparent 60%)' }} />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5">
        <button onClick={() => navigate('/student/dashboard')}
          className="flex items-center gap-2 text-white/70 hover:text-white text-sm font-medium transition-colors">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </button>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="border-white/20 text-white bg-white/10 hidden md:flex">🎓 Student</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Avatar className="w-9 h-9 border-2 border-white/20 cursor-pointer hover:border-white/50 transition-colors">
                <AvatarFallback className="bg-white/20 text-white font-bold text-sm">{initials}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="font-normal">
                <p className="font-semibold">{displayName || 'Student'}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Student account</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/profile')} className="gap-2 cursor-pointer">
                <User className="w-4 h-4" /> My Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSwitchRole} className="gap-2 cursor-pointer">
                <School className="w-4 h-4 text-[#e85a19]" /> Switch to Teacher
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="gap-2 cursor-pointer text-red-600 focus:text-red-600">
                <LogOut className="w-4 h-4" /> Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Hero */}
      <div className="relative z-10 px-6 md:px-10 pb-6">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl md:text-4xl font-black text-white drop-shadow">Your Results 📊</h1>
          <p className="text-white/60 mt-1">{totalTaken} quiz{totalTaken !== 1 ? 'zes' : ''} completed</p>
        </motion.div>
      </div>

      {/* Main */}
      <div className="relative z-10 mx-4 md:mx-10 mb-10 rounded-3xl bg-[#f8fafc] shadow-2xl overflow-hidden">
        <div className="p-6 md:p-8 flex flex-col gap-8">

          {/* Summary stats */}
          {totalTaken > 0 && (
            <section>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { icon: Target, label: 'Taken', value: totalTaken, color: 'from-[#3a1c71] to-[#4776e6]' },
                  { icon: TrendingUp, label: 'Average', value: `${avgScore}%`, color: 'from-[#4776e6] to-[#6366f1]' },
                  { icon: Trophy, label: 'Best', value: `${bestScore}%`, color: 'from-[#10b981] to-[#059669]' },
                ].map(({ icon: Icon, label, value, color }, i) => (
                  <motion.div key={label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                    <Card className="border-0 shadow-md overflow-hidden">
                      <div className={`h-1.5 bg-gradient-to-r ${color}`} />
                      <CardContent className="pt-4 pb-5 flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shrink-0`}>
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="text-xl font-black text-[hsl(var(--foreground))]">{value}</p>
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {/* Results list */}
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--muted))] flex items-center justify-center mb-4">
                <PlayCircle className="w-8 h-8 text-[hsl(var(--muted-foreground))]" />
              </div>
              <p className="font-semibold text-[hsl(var(--foreground))]">No results yet</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1 mb-6">Complete a quiz to see your results here.</p>
              <Button variant="student" onClick={() => navigate('/student/attend-quiz')} className="gap-2">
                <PlayCircle className="w-4 h-4" /> Join a Quiz
              </Button>
            </div>
          ) : (
            <section>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {results.map((result, i) => (
                  <motion.div key={result.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <Card className="border-0 shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 overflow-hidden">
                      <div className={`h-1 bg-gradient-to-r ${result.percentage >= 80 ? 'from-green-500 to-emerald-500' : result.percentage >= 60 ? 'from-blue-500 to-indigo-500' : result.percentage >= 40 ? 'from-amber-500 to-orange-500' : 'from-red-500 to-rose-500'}`} />
                      <CardContent className="pt-4 pb-5">
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div className="flex items-center gap-2">
                            {scoreIcon(result.percentage, result.status)}
                            <h3 className="font-bold text-[hsl(var(--foreground))] leading-snug">{result.quizTitle}</h3>
                          </div>
                          <Badge variant={scoreBadge(result.percentage, result.status)} className="shrink-0">
                            {result.status === 'completed' ? `${result.percentage}%` : 'Pending'}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-[hsl(var(--muted-foreground))] mb-4">
                          <span>{result.correctCount}/{result.answers?.length} correct</span>
                          <span>·</span>
                          <span>{relDate(result.completedAt)}</span>
                          {result.status === 'completed' && (
                            <>
                              <span>·</span>
                              <span>{result.finalScore}/{result.maxScore} pts</span>
                            </>
                          )}
                        </div>

                        {result.status === 'completed' && (
                          <div className="mb-4">
                            <Progress value={result.percentage} className="h-2"
                              indicatorClassName={`${result.percentage >= 80 ? 'bg-gradient-to-r from-green-500 to-emerald-500' : result.percentage >= 60 ? 'bg-gradient-to-r from-blue-500 to-indigo-500' : result.percentage >= 40 ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gradient-to-r from-red-500 to-rose-500'}`}
                            />
                          </div>
                        )}

                        {result.status === 'pending' && (
                          <div className="flex items-center gap-2 text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs mb-4">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            Some answers are pending teacher review.
                          </div>
                        )}

                        <Button variant="outline" size="sm" onClick={() => openReview(result)} className="w-full gap-2">
                          <Eye className="w-3.5 h-3.5" /> View Review
                        </Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Review Dialog */}
      <Dialog open={!!selectedResult} onOpenChange={open => { if (!open) { setSelectedResult(null); setReviewQuiz(null); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0 pb-4 border-b border-[hsl(var(--border))]">
            <DialogTitle className="text-xl">{selectedResult?.quizTitle} — Review</DialogTitle>
            {selectedResult && (
              <div className="flex items-center gap-3 mt-2">
                <Badge variant={scoreBadge(selectedResult.percentage, selectedResult.status)}>
                  {selectedResult.status === 'completed' ? `${selectedResult.percentage}%` : 'Pending'}
                </Badge>
                <span className="text-sm text-[hsl(var(--muted-foreground))]">
                  {selectedResult.correctCount}/{selectedResult.answers?.length} correct · {selectedResult.finalScore}/{selectedResult.maxScore} pts
                </span>
              </div>
            )}
          </DialogHeader>

          <div className="overflow-y-auto flex-1 pt-4">
            {reviewLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-4 border-[#4776e6]/20 border-t-[#4776e6] rounded-full animate-spin" />
              </div>
            ) : reviewQuiz && selectedResult ? (
              <div className="flex flex-col gap-4">
                {reviewQuiz.questions.map((q, i) => (
                  <QuestionReview key={q.id || i} originalQuestion={q} studentAnswerData={selectedResult.answers[i]} index={i} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">
                Could not load review details — the quiz may have been deleted.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default YourResults;
