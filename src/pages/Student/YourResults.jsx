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
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

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
  const [showWrongOnly, setShowWrongOnly] = useState(false);

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
    <div className="min-h-screen w-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-[hsl(var(--border))] border-t-[hsl(var(--primary))] rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen w-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] relative overflow-x-hidden">
      {/* Decorative background grid and blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] bg-[linear-gradient(to_right,hsl(var(--foreground))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground))_1px,transparent_1px)] bg-[size:3rem_3rem]" />
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/5 blur-[120px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5 border-b border-[hsl(var(--border))]">
        <button onClick={() => navigate('/student/dashboard')}
          className="flex items-center gap-2 text-[hsl(var(--foreground))]/70 hover:text-[hsl(var(--foreground))] text-sm font-medium transition-colors">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </button>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="border-[hsl(var(--border))] text-[hsl(var(--foreground))] bg-[hsl(var(--muted))]/50 hidden md:flex">Student</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Avatar className="w-9 h-9 border border-[hsl(var(--border))] cursor-pointer hover:border-[hsl(var(--primary))] transition-colors">
                <AvatarFallback className="bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] font-bold text-sm">{initials}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="font-normal">
                <p className="font-semibold text-[hsl(var(--foreground))]">{displayName || 'Student'}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Student account</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/profile')} className="gap-2 cursor-pointer">
                <User className="w-4 h-4" /> My Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSwitchRole} className="gap-2 cursor-pointer">
                <School className="w-4 h-4 text-[hsl(var(--primary))]" /> Switch to Teacher
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="gap-2 cursor-pointer text-red-650 focus:text-red-650">
                <LogOut className="w-4 h-4" /> Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Hero */}
      <div className="relative z-10 px-6 md:px-10 py-6">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl md:text-4xl font-black text-[hsl(var(--foreground))]">Your Results</h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1">{totalTaken} quiz{totalTaken !== 1 ? 'zes' : ''} completed</p>
        </motion.div>
      </div>

      {/* Main */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.3, delay: 0.05 }}
        className="relative z-10 mx-4 md:mx-10 mb-10 rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] shadow-sm overflow-hidden"
      >
        <div className="p-6 md:p-8 flex flex-col gap-8">

          {/* Summary stats */}
          {totalTaken > 0 && (
            <section>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { icon: Target, label: 'Taken', value: totalTaken, borderColor: 'border-t-purple-500', iconBg: 'bg-purple-500/10', iconColor: 'text-purple-500' },
                  { icon: TrendingUp, label: 'Average', value: `${avgScore}%`, borderColor: 'border-t-blue-500', iconBg: 'bg-blue-500/10', iconColor: 'text-blue-500' },
                  { icon: Trophy, label: 'Best', value: `${bestScore}%`, borderColor: 'border-t-emerald-500', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-500' },
                ].map(({ icon: Icon, label, value, borderColor, iconBg, iconColor }, i) => (
                  <motion.div key={label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                    <Card className={`border border-[hsl(var(--border))] border-t-4 ${borderColor} shadow-sm overflow-hidden bg-[hsl(var(--card))] rounded-2xl`}>
                      <CardContent className="pt-4 pb-5 flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
                          <Icon className={`w-4 h-4 ${iconColor}`} />
                        </div>
                        <div>
                          <p className="text-xl font-black text-[hsl(var(--foreground))]">{value}</p>
                          <p className="text-xs text-[hsl(var(--muted-foreground))] font-medium mt-0.5">{label}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {/* Charts Section */}
          {totalTaken > 0 && (
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
              {/* Score Trend Line Chart */}
              <Card className="border border-[hsl(var(--border))] shadow-sm p-4 bg-[hsl(var(--card))] rounded-2xl">
                <CardHeader className="pb-2 pl-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-[hsl(var(--foreground))]">
                    <TrendingUp className="w-4 h-4 text-[hsl(var(--primary))]" /> Score Trend
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-64 pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={[...results].reverse().map(r => ({
                      date: r.completedAt?.toDate ? r.completedAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A',
                      Score: r.percentage,
                      title: r.quizTitle
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)' }} />
                      <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} tick={{ fill: 'var(--muted-foreground)' }} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid var(--border)', color: 'hsl(var(--foreground))' }}
                        labelStyle={{ fontWeight: 'bold', color: 'hsl(var(--primary))', fontSize: '12px' }}
                        itemStyle={{ fontSize: '12px', color: 'hsl(var(--foreground))' }}
                        formatter={(value, name, props) => [`${value}%`, `Score (${props.payload.title})`]}
                      />
                      <Line type="monotone" dataKey="Score" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Quiz Breakdown Bar Chart (Show only if >= 3 results) */}
              {totalTaken >= 3 ? (
                <Card className="border border-[hsl(var(--border))] shadow-sm p-4 bg-[hsl(var(--card))] rounded-2xl">
                  <CardHeader className="pb-2 pl-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2 text-[hsl(var(--foreground))]">
                      <Trophy className="w-4 h-4 text-[hsl(var(--primary))]" /> Quiz Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="h-64 pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={(() => {
                        const groups = {};
                        results.forEach(r => {
                          const key = r.subject || r.quizTitle || 'Unknown';
                          if (!groups[key]) {
                            groups[key] = { name: key, total: 0, count: 0 };
                          }
                          groups[key].total += r.percentage;
                          groups[key].count += 1;
                        });
                        return Object.values(groups).map(g => ({
                          name: g.name.length > 15 ? g.name.substring(0, 12) + '...' : g.name,
                          fullName: g.name,
                          Average: Math.round(g.total / g.count)
                        }));
                      })()}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)' }} />
                        <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} tick={{ fill: 'var(--muted-foreground)' }} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid var(--border)', color: 'hsl(var(--foreground))' }}
                          labelStyle={{ fontWeight: 'bold', color: 'hsl(var(--primary))', fontSize: '12px' }}
                          itemStyle={{ fontSize: '12px', color: 'hsl(var(--foreground))' }}
                          formatter={(value, name, props) => [`${value}%`, `Average Score (${props.payload.fullName})`]}
                        />
                        <Bar dataKey="Average" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={25} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border border-[hsl(var(--border))] shadow-sm p-6 bg-[hsl(var(--card))] rounded-2xl flex flex-col items-center justify-center text-center h-full min-h-[200px]">
                  <Trophy className="w-8 h-8 text-[hsl(var(--muted-foreground))] mb-2" />
                  <p className="font-bold text-sm text-[hsl(var(--foreground))]">Quiz Breakdown</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 max-w-[280px]">
                    Complete at least 3 quizzes to unlock subject/quiz breakdown analysis.
                  </p>
                </Card>
              )}
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
                    <Card className="border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 overflow-hidden rounded-2xl">
                      <div className={`h-1 ${result.percentage >= 80 ? 'bg-emerald-500' : result.percentage >= 60 ? 'bg-blue-500' : result.percentage >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} />
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
                            <Progress value={result.percentage} className="h-2 bg-[hsl(var(--muted))] border border-[hsl(var(--border))]"
                              indicatorClassName={result.percentage >= 80 ? 'bg-emerald-500' : result.percentage >= 60 ? 'bg-blue-500' : result.percentage >= 40 ? 'bg-amber-500' : 'bg-red-500'}
                            />
                          </div>
                        )}

                        {result.status === 'pending' && (
                          <div className="flex items-center gap-2 text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 text-xs mb-4">
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
      </motion.div>

      {/* Review Dialog */}
      <Dialog open={!!selectedResult} onOpenChange={open => { if (!open) { setSelectedResult(null); setReviewQuiz(null); setShowWrongOnly(false); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0 pb-4 border-b border-[hsl(var(--border))]">
            <DialogTitle className="text-xl">{selectedResult?.quizTitle} — Review</DialogTitle>
            {selectedResult && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-2">
                <div className="flex items-center gap-3">
                  <Badge variant={scoreBadge(selectedResult.percentage, selectedResult.status)}>
                    {selectedResult.status === 'completed' ? `${selectedResult.percentage}%` : 'Pending'}
                  </Badge>
                  <span className="text-sm text-[hsl(var(--muted-foreground))]">
                    {selectedResult.correctCount}/{selectedResult.answers?.length} correct · {selectedResult.finalScore}/{selectedResult.maxScore} pts
                  </span>
                </div>
                {selectedResult.status === 'completed' && (
                  <label className="flex items-center gap-2 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1 cursor-pointer select-none hover:bg-red-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={showWrongOnly}
                      onChange={e => setShowWrongOnly(e.target.checked)}
                      className="accent-red-600 cursor-pointer"
                    />
                    <span>Show Wrong Answers Only</span>
                  </label>
                )}
              </div>
            )}
          </DialogHeader>

          <div className="overflow-y-auto flex-1 pt-4">
            {reviewLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-4 border-[hsl(var(--border))] border-t-[hsl(var(--primary))] rounded-full animate-spin" />
              </div>
            ) : reviewQuiz && selectedResult ? (
              <div className="flex flex-col gap-4">
                {(() => {
                  const filtered = reviewQuiz.questions
                    .map((q, i) => ({ q, ans: selectedResult.answers[i], origIndex: i }))
                    .filter(({ q, ans }) => {
                      if (!showWrongOnly) return true;
                      const isPending = ans?.status === 'pending_review';
                      const isCorrect = !isPending && ans?.pointsAwarded >= q.points;
                      return !isCorrect;
                    });
                  
                  if (filtered.length === 0) {
                    return (
                      <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">
                        No incorrect answers found! Outstanding job!
                      </div>
                    );
                  }

                  return filtered.map(({ q, ans, origIndex }) => (
                    <QuestionReview key={q.id || origIndex} originalQuestion={q} studentAnswerData={ans} index={origIndex} />
                  ));
                })()}
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
