import React, { useEffect, useState, useCallback } from 'react';
import { db } from '../../firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  PlayCircle, BookOpen, BarChart2, TrendingUp,
  Trophy, Clock, Target, ChevronRight, Star,
  Users, Hash, Loader2, GraduationCap, Calendar, CheckCircle2,
} from 'lucide-react';
import { joinClassByCode, getStudentClasses } from '../../utils/classHelpers';
import { getQuizzesByIds, getDueStatus, formatDueDate } from '../../utils/assignmentHelpers';

const StudentDashboard = () => {
  const navigate = useNavigate();
  const { currentUser: user, displayName } = useAuth();

  const [data, setData] = useState({
    recentResults: [],
    stats: { quizzesTaken: 0, averageScore: 0, bestScore: 0, totalTimeSpent: 0 },
  });
  const [loading, setLoading] = useState(true);

  // Classes state
  const [classes, setClasses]       = useState([]);
  const [classCode, setClassCode]   = useState('');
  const [joining, setJoining]       = useState(false);
  const [classError, setClassError] = useState('');
  const [completedQuizIds, setCompletedQuizIds] = useState(new Set());
  const [assignedQuizInfo, setAssignedQuizInfo] = useState({}); // quizId → { title, ... }

  // ── Data fetchers ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'quiz_results'),
          where('userId', '==', user.uid),
          orderBy('completedAt', 'desc'))
      );
      const results = snap.docs.map(d => d.data());
      let totalPct = 0, best = 0, time = 0;
      results.forEach(r => {
        const pct = r.maxScore > 0 ? (r.finalScore / r.maxScore) * 100 : 0;
        totalPct += pct; if (pct > best) best = pct; time += r.timeSpent || 0;
      });
      setCompletedQuizIds(new Set(results.map(r => r.quizId)));
      setData({
        recentResults: results.slice(0, 5),
        stats: {
          quizzesTaken: results.length,
          averageScore: results.length > 0 ? Math.round(totalPct / results.length) : 0,
          bestScore: Math.round(best),
          totalTimeSpent: time,
        },
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchClasses = useCallback(async () => {
    if (!user) return;
    try {
      const list = await getStudentClasses(user.uid);
      setClasses(list);
      const allQuizIds = list.flatMap(cls => cls.quizIds || []);
      if (allQuizIds.length) {
        const info = await getQuizzesByIds(allQuizIds);
        setAssignedQuizInfo(info);
      }
    } catch { /* silent */ }
  }, [user]);

  useEffect(() => { fetchData(); },   [fetchData]);
  useEffect(() => { fetchClasses(); }, [fetchClasses]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleJoinClass = async (e) => {
    e.preventDefault();
    if (!classCode.trim()) return;
    setJoining(true);
    setClassError('');
    try {
      const joined = await joinClassByCode({
        code: classCode,
        studentId: user.uid,
        studentName: displayName || user?.email?.split('@')[0] || 'Student',
      });
      setClasses(prev => [...prev, joined]);
      setClassCode('');
      toast.success(`Joined "${joined.name}"!`);
    } catch (err) {
      setClassError(err.message || 'Failed to join class.');
    } finally {
      setJoining(false);
    }
  };

  // ── Utilities ──────────────────────────────────────────────────────────────

  const formatTime = s => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };
  const formatDate = ts => {
    if (!ts?.toDate) return 'N/A';
    return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const greeting = displayName || user?.displayName || user?.email?.split('@')[0] || 'Student';

  if (loading) return (
    <div className="min-h-screen w-screen bg-[hsl(var(--background))] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-[hsl(var(--border))] border-t-[hsl(var(--primary))] rounded-full animate-spin" />
    </div>
  );

  const { stats, recentResults } = data;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="w-full relative">
      {/* ── Greeting Header ── */}
      <div className="pb-4">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="animate-fade-in">
          <p className="text-[11px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
            Welcome back
          </p>
          <h1 className="text-3xl font-bold text-[hsl(var(--foreground))] tracking-tight mt-1">
            {greeting.split(' ')[0]}
          </h1>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">Ready to level up today?</p>
        </motion.div>
      </div>

      {/* ── 70/30 Grid Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 mt-4">

          {/* LEFT Column (70%) */}
          <div className="flex flex-col gap-6">

            {/* Quick Actions (Flashcard grid) */}
            <section>
              <h2 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">Quick Actions</h2>
              <motion.div 
                variants={{
                  hidden: { opacity: 0 },
                  show: {
                    opacity: 1,
                    transition: { staggerChildren: 0.05 }
                  }
                }}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 sm:grid-cols-3 gap-4"
              >
                {[
                  { icon: PlayCircle, label: 'Join a Quiz', desc: 'Enter a code to start taking a quiz', onClick: () => navigate('/student/attend-quiz') },
                  { icon: BookOpen,   label: 'Your Results', desc: 'Review your scores and history', onClick: () => navigate('/student/results') },
                  { icon: BarChart2,  label: 'Analytics',    desc: 'View detailed performance metrics', onClick: () => navigate('/student/results') },
                ].map(({ icon: Icon, label, desc, onClick }) => (
                  <motion.button
                    key={label}
                    onClick={onClick}
                    variants={{
                      hidden: { opacity: 0, y: 12 },
                      show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100 } }
                    }}
                    whileHover={{ y: -4, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex flex-col items-center justify-center p-5 rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] hover:border-[hsl(var(--primary))] text-center cursor-pointer transition-all duration-200 group relative overflow-hidden min-h-[140px] shadow-sm hover:shadow-md"
                  >
                    <div className="w-12 h-12 rounded-xl bg-[hsl(var(--muted))] border border-[hsl(var(--border))] flex items-center justify-center mb-3 group-hover:bg-[hsl(var(--primary))]/10 group-hover:border-[hsl(var(--primary))]/30 transition-colors duration-200">
                      <Icon className="w-5 h-5 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))] transition-colors duration-200" />
                    </div>
                    <span className="text-sm font-bold text-[hsl(var(--foreground))] tracking-tight">{label}</span>
                    <span className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1 leading-snug px-2">{desc}</span>
                  </motion.button>
                ))}
              </motion.div>
            </section>

            {/* Enrolled Classes */}
            <section>
              <h2 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">My Classes</h2>
              
              {/* Join Form */}
              <form onSubmit={handleJoinClass} className="flex gap-2 mb-3">
                <div className="relative flex-1">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                  <Input
                    value={classCode}
                    onChange={e => { setClassCode(e.target.value.toUpperCase()); setClassError(''); }}
                    placeholder="Enter 6-digit invite code…"
                    maxLength={6}
                    className="pl-9 font-mono tracking-widest uppercase bg-[hsl(var(--muted))]/20 border-[hsl(var(--border))] text-sm h-9 focus-visible:ring-[hsl(var(--primary))]/30 focus-visible:border-[hsl(var(--primary))]"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={joining || !classCode.trim()}
                  className="gap-1.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-0 hover:bg-[hsl(var(--primary))]/90 text-xs h-9 py-2 px-3 rounded-md shrink-0"
                >
                  {joining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
                  Join
                </Button>
              </form>
              {classError && (
                <p className="text-xs text-red-500 mb-2 -mt-1">{classError}</p>
              )}

              {classes.length === 0 ? (
                <Card className="border border-[hsl(var(--border))] bg-[hsl(var(--card))] rounded-lg">
                  <CardContent className="flex flex-col items-center justify-center py-6 text-center">
                    <GraduationCap className="w-5 h-5 text-[hsl(var(--muted-foreground))] mb-2" />
                    <p className="font-medium text-xs text-[hsl(var(--foreground))]">Not enrolled in any class</p>
                    <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5">Enter an invite code above to join.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="flex flex-col gap-2">
                  {classes.map((cls) => (
                    <Card key={cls.id} className="border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden rounded-lg">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-[hsl(var(--foreground))] truncate">{cls.name}</p>
                            {cls.description && (
                              <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">{cls.description}</p>
                            )}
                            <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5">by {cls.teacherName}</p>
                          </div>
                          <div className="flex items-center gap-1 bg-[hsl(var(--muted))] rounded px-2 py-0.5 shrink-0 border border-[hsl(var(--border))]">
                            <span className="font-mono font-bold text-[hsl(var(--primary))] tracking-wider text-xs">{cls.code}</span>
                          </div>
                        </div>

                        {cls.quizIds && cls.quizIds.length > 0 ? (
                          <div className="mt-2 pt-2 border-t border-[hsl(var(--border))] flex flex-col gap-1.5">
                            <p className="text-[9px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-0.5">
                              {cls.quizIds.length} Assigned Quiz{cls.quizIds.length !== 1 ? 'zes' : ''}
                            </p>
                            {cls.quizIds.map(qId => {
                              const info = assignedQuizInfo[qId];
                              const due = cls.dueDates?.[qId];
                              const dueStatus = getDueStatus(due);
                              const done = completedQuizIds.has(qId);
                              return (
                                <button
                                  key={qId}
                                  onClick={() => navigate(`/student/quiz/${qId}`)}
                                  className="flex items-center gap-2 text-left text-xs px-2.5 py-1.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 hover:border-[hsl(var(--primary))]/40 hover:bg-[hsl(var(--primary))]/5 transition-colors cursor-pointer"
                                >
                                  {done
                                    ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                                    : <PlayCircle className="w-3.5 h-3.5 text-[hsl(var(--primary))] shrink-0" />}
                                  <span className="flex-1 min-w-0 truncate font-medium text-[hsl(var(--foreground))]">{info?.title || 'Quiz'}</span>
                                  {due && (
                                    <span className={`inline-flex items-center gap-1 shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                      dueStatus === 'overdue' ? 'bg-red-500/10 text-red-500' :
                                      dueStatus === 'due-soon' ? 'bg-amber-500/10 text-amber-600' :
                                      'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
                                    }`}>
                                      <Calendar className="w-2.5 h-2.5" /> {formatDueDate(due)}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-2 pt-2 border-t border-[hsl(var(--border))]">
                            No quizzes assigned yet.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {/* Recent Activity */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Recent Activity</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/student/results')}
                  className="text-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]/80 hover:bg-transparent text-xs p-0 h-auto"
                >
                  View all
                </Button>
              </div>
              <Card className="border border-[hsl(var(--border))] bg-[hsl(var(--card))] rounded-lg">
                <div className="p-0">
                  {recentResults.length > 0 ? recentResults.map((r, i) => {
                    const pct = Math.round((r.finalScore / r.maxScore) * 100);
                    return (
                      <div
                        key={r.completedAt?.seconds || i}
                        className={`flex items-center justify-between px-4 py-3 hover:bg-[hsl(var(--muted))]/20 transition-colors ${i !== recentResults.length - 1 ? 'border-b border-[hsl(var(--border))]' : ''}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Star className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                          <div className="min-w-0">
                            <p className="text-sm text-[hsl(var(--foreground))] font-semibold truncate">{r.quizTitle}</p>
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">{formatDate(r.completedAt)}</p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-xs rounded px-1.5 py-0.5 border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 ${pct >= 80 ? 'text-[hsl(var(--primary))] border-[hsl(var(--primary))]/20' : pct >= 60 ? 'text-blue-400 border-blue-400/20' : 'text-amber-500 border-amber-500/20'}`}
                        >
                          {pct}%
                        </Badge>
                      </div>
                    );
                  }) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                      <PlayCircle className="w-5 h-5 text-[hsl(var(--muted-foreground))] mb-2" />
                      <p className="font-semibold text-xs text-[hsl(var(--foreground))]">No quizzes taken yet</p>
                      <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5">Click "Join a Quiz" to get started!</p>
                    </div>
                  )}
                </div>
              </Card>
            </section>

          </div>

          {/* RIGHT Column (30%) - Sidebar */}
          <div className="flex flex-col gap-6">

            {/* Performance Sidebar Panel */}
            <section>
              <h2 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">Performance</h2>
              <Card className="border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 rounded-lg">
                
                {/* Progress indicators */}
                <div className="flex flex-col gap-4">
                  
                  {/* Average Score */}
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="font-medium text-[hsl(var(--foreground))]">Average Score</span>
                      <span className="font-bold text-[hsl(var(--primary))]">{stats.averageScore}%</span>
                    </div>
                    <Progress
                      value={stats.averageScore}
                      indicatorClassName="bg-[hsl(var(--primary))]"
                      className="h-1 bg-[hsl(var(--muted))]"
                    />
                  </div>

                  {/* Best Score */}
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="font-medium text-[hsl(var(--foreground))]">Best Score</span>
                      <span className="font-bold text-[hsl(var(--primary))]">{stats.bestScore}%</span>
                    </div>
                    <Progress
                      value={stats.bestScore}
                      indicatorClassName="bg-[hsl(var(--primary))]"
                      className="h-1 bg-[hsl(var(--muted))]"
                    />
                  </div>

                  <Separator className="my-2 bg-[hsl(var(--border))]" />

                  {/* Metrics stack */}
                  <div className="grid grid-cols-2 gap-2 text-center mt-1">
                    {[
                      { label: 'Taken', value: stats.quizzesTaken },
                      { label: 'Best Score', value: `${stats.bestScore}%` },
                      { label: 'Avg Score', value: `${stats.averageScore}%` },
                      { label: 'Time Spent', value: formatTime(stats.totalTimeSpent) },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-[hsl(var(--muted))]/20 rounded-md p-2 border border-[hsl(var(--border))]">
                        <p className="font-bold text-sm text-[hsl(var(--foreground))] tracking-tight">{value}</p>
                        <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={() => navigate('/student/attend-quiz')}
                    className="w-full text-xs font-semibold h-8 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary))]/90 mt-2 gap-1.5"
                  >
                    <PlayCircle className="w-3.5 h-3.5" />
                    Join a Quiz
                  </Button>

                </div>
              </Card>
            </section>

          </div>

        </div>
    </div>
  );
};

export default StudentDashboard;
