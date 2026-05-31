import React, { useEffect, useState, useCallback } from 'react';
import { db } from '../../firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
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
  PlayCircle, BookOpen, BarChart2, TrendingUp, LogOut,
  Trophy, Clock, Target, ChevronRight, Star, School,
} from 'lucide-react';

const StudentDashboard = () => {
  const navigate = useNavigate();
  const { currentUser: user, signOut: ctxSignOut, displayName, switchRole } = useAuth();

  const [data, setData] = useState({
    recentResults: [],
    stats: { quizzesTaken: 0, averageScore: 0, bestScore: 0, totalTimeSpent: 0 },
  });
  const [loading, setLoading] = useState(true);

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

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSignOut = async () => {
    await ctxSignOut();
    navigate('/login');
  };

  const handleSwitchRole = async () => {
    try {
      await switchRole('teacher');
      toast.success('Switched to Teacher mode');
    } catch {
      toast.error('Failed to switch role.');
    }
  };

  const formatTime = s => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };
  const formatDate = ts => {
    if (!ts?.toDate) return 'N/A';
    return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const initials = (displayName || user?.displayName || user?.email || 'S')
    .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const greeting = displayName || user?.displayName || user?.email?.split('@')[0] || 'Student';

  if (loading) return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-[#3a1c71] to-[#4776e6] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
    </div>
  );

  const { stats, recentResults } = data;

  const scoreColor = pct => pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-blue-600' : pct >= 40 ? 'text-amber-600' : 'text-red-600';
  const scoreBg   = pct => pct >= 80 ? 'success' : pct >= 60 ? 'info' : pct >= 40 ? 'warning' : 'destructive';

  return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-[#3a1c71] via-[#2d3a9e] to-[#4776e6] relative overflow-x-hidden">
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 80% 20%,rgba(255,255,255,0.05) 0%,transparent 60%)' }} />

      {/* ── Top nav ── */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center text-white font-black text-sm">Q</div>
          <span className="text-white font-bold text-lg tracking-tight hidden sm:block">Quizlike</span>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="border-white/20 text-white bg-white/10 hidden md:flex">
            🎓 Student
          </Badge>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Avatar className="w-9 h-9 border-2 border-white/20 cursor-pointer hover:border-white/50 transition-colors">
                <AvatarFallback className="bg-white/20 text-white font-bold text-sm">{initials}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="font-normal">
                <p className="font-semibold text-[hsl(var(--foreground))]">{greeting}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Student account</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSwitchRole} className="gap-2 cursor-pointer">
                <School className="w-4 h-4 text-[#e85a19]" />
                Switch to Teacher
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="gap-2 cursor-pointer text-red-600 focus:text-red-600">
                <LogOut className="w-4 h-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ── Hero strip ── */}
      <div className="relative z-10 px-6 md:px-10 pb-8">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl md:text-4xl font-black text-white drop-shadow">
            Hey, {greeting.split(' ')[0]} 👋
          </h1>
          <p className="text-white/60 mt-1">Ready to level up today?</p>
        </motion.div>
      </div>

      {/* ── Main content ── */}
      <div className="relative z-10 mx-4 md:mx-10 mb-10 rounded-3xl bg-[#f8fafc] shadow-2xl overflow-hidden">
        <div className="p-6 md:p-8 flex flex-col gap-8">

          {/* ── Stat row ── */}
          <section>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: Target,  label: 'Quizzes Taken', value: stats.quizzesTaken,           suffix: '',  color: 'from-[#3a1c71] to-[#4776e6]' },
                { icon: TrendingUp, label: 'Average Score', value: `${stats.averageScore}`,   suffix: '%', color: 'from-[#4776e6] to-[#6366f1]' },
                { icon: Trophy,  label: 'Best Score',    value: `${stats.bestScore}`,          suffix: '%', color: 'from-[#10b981] to-[#059669]' },
                { icon: Clock,   label: 'Time Spent',    value: formatTime(stats.totalTimeSpent), suffix: '',color: 'from-[#f59e0b] to-[#d97706]' },
              ].map(({ icon: Icon, label, value, suffix, color }, i) => (
                <motion.div key={label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                  <Card className="border-0 shadow-md overflow-hidden">
                    <div className={`h-1.5 bg-gradient-to-r ${color}`} />
                    <CardContent className="pt-4 pb-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-2xl font-black text-[hsl(var(--foreground))]">{value}{suffix}</p>
                          <p className="text-xs text-[hsl(var(--muted-foreground))] font-medium mt-0.5">{label}</p>
                        </div>
                        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center`}>
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">

            {/* ── Left: Actions + Recent ── */}
            <div className="flex flex-col gap-6">

              {/* Quick actions */}
              <section>
                <h2 className="text-lg font-bold text-[hsl(var(--foreground))] mb-4">What would you like to do?</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { icon: PlayCircle, label: 'Join a Quiz',   desc: 'Enter a code to start',        onClick: () => navigate('/student/attend-quiz'), color: '#4776e6', bg: 'from-[#3a1c71] to-[#4776e6]', white: true },
                    { icon: BookOpen,   label: 'Your Results',  desc: 'Review your scores',            onClick: () => navigate('/student/results'),     color: '#10b981', bg: 'from-[#10b981] to-[#059669]', white: true },
                    { icon: BarChart2,  label: 'Analytics',     desc: 'Progress over time (soon)',     onClick: () => toast.info('Coming soon!'),       color: '#f59e0b', bg: 'from-[#f59e0b] to-[#d97706]', white: true },
                  ].map(({ icon: Icon, label, desc, onClick, bg, white }) => (
                    <motion.button
                      key={label}
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={onClick}
                      className={`flex items-center gap-3 p-4 rounded-2xl text-left bg-gradient-to-br ${bg} text-white cursor-pointer transition-all hover:shadow-lg`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-bold text-sm">{label}</p>
                        <p className="text-xs opacity-70 mt-0.5">{desc}</p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </section>

              {/* Recent results */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">Recent Activity</h2>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/student/results')} className="text-[#4776e6] hover:text-[#3a1c71] gap-1">
                    View all <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <Card className="shadow-sm">
                  <CardContent className="p-0">
                    {recentResults.length > 0 ? recentResults.map((r, i) => {
                      const pct = Math.round((r.finalScore / r.maxScore) * 100);
                      return (
                        <div key={r.completedAt?.seconds || i}
                          className={`flex items-center gap-4 px-5 py-4 hover:bg-[hsl(var(--muted))]/50 transition-colors ${i !== recentResults.length - 1 ? 'border-b border-[hsl(var(--border))]' : ''}`}>
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#4776e6] to-[#8b5cf6] flex items-center justify-center flex-shrink-0">
                            <Star className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-[hsl(var(--foreground))] truncate">{r.quizTitle}</p>
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">{formatDate(r.completedAt)}</p>
                          </div>
                          <Badge variant={scoreBg(pct)}>{pct}%</Badge>
                        </div>
                      );
                    }) : (
                      <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                        <div className="w-14 h-14 rounded-2xl bg-[hsl(var(--muted))] flex items-center justify-center mb-3">
                          <PlayCircle className="w-7 h-7 text-[hsl(var(--muted-foreground))]" />
                        </div>
                        <p className="font-semibold text-[hsl(var(--foreground))]">No quizzes taken yet</p>
                        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">Click "Join a Quiz" to get started!</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </section>
            </div>

            {/* ── Right: Progress sidebar ── */}
            <aside>
              <h2 className="text-lg font-bold text-[hsl(var(--foreground))] mb-4">Your Progress</h2>
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#4776e6] to-[#8b5cf6] flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Overall Performance</CardTitle>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">{stats.quizzesTaken} quiz{stats.quizzesTaken !== 1 ? 'zes' : ''} completed</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  {/* Average */}
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-medium text-[hsl(var(--foreground))]">Average Score</span>
                      <span className="font-bold text-[#4776e6]">{stats.averageScore}%</span>
                    </div>
                    <Progress
                      value={stats.averageScore}
                      indicatorClassName="bg-gradient-to-r from-[#4776e6] to-[#8b5cf6]"
                      className="h-2.5"
                    />
                  </div>

                  {/* Best */}
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-medium text-[hsl(var(--foreground))]">Best Score</span>
                      <span className="font-bold text-green-600">{stats.bestScore}%</span>
                    </div>
                    <Progress
                      value={stats.bestScore}
                      indicatorClassName="bg-gradient-to-r from-green-500 to-emerald-500"
                      className="h-2.5"
                    />
                  </div>

                  <Separator />

                  {/* Quick stats grid */}
                  <div className="grid grid-cols-3 gap-3 text-center">
                    {[
                      { label: 'Taken',    value: stats.quizzesTaken },
                      { label: 'Best %',   value: `${stats.bestScore}%` },
                      { label: 'Time',     value: formatTime(stats.totalTimeSpent) },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-[hsl(var(--muted))] rounded-xl py-3 px-2">
                        <p className="font-black text-base text-[hsl(var(--foreground))]">{value}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <Button variant="student" size="lg" onClick={() => navigate('/student/attend-quiz')} className="w-full gap-2">
                    <PlayCircle className="w-4 h-4" />
                    Join a Quiz Now
                  </Button>
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
