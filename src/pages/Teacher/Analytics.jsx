import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft, Users, Trophy, TrendingUp, Clock,
  Download, ChevronUp, ChevronDown, ChevronsUpDown,
  LogOut, GraduationCap, User, AlertCircle, CheckCircle2,
} from 'lucide-react';

// ── Custom chart tooltips ─────────────────────────────────────────────────────
const DistTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[hsl(var(--border))] rounded-xl px-3 py-2 shadow-lg text-sm">
      <p className="font-bold text-[hsl(var(--foreground))]">{label}</p>
      <p className="text-[hsl(var(--muted-foreground))]">{payload[0].value} student{payload[0].value !== 1 ? 's' : ''}</p>
    </div>
  );
};

const QuestionTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-[hsl(var(--border))] rounded-xl px-3 py-2 shadow-lg text-sm max-w-[220px]">
      <p className="font-bold text-[hsl(var(--foreground))]">{d.name}</p>
      <p className="text-[hsl(var(--muted-foreground))] text-xs leading-snug mb-1.5">{d.label}</p>
      <p className={`font-semibold ${d.passRate >= 70 ? 'text-green-600' : d.passRate >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
        {d.passRate}% pass rate
      </p>
    </div>
  );
};

// ── Sort icon helper ──────────────────────────────────────────────────────────
const SortIcon = ({ col, sortBy, sortDir }) => {
  if (sortBy !== col) return <ChevronsUpDown className="w-3 h-3 text-[hsl(var(--muted-foreground))]" />;
  return sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
};

// ── Main page ─────────────────────────────────────────────────────────────────
const Analytics = () => {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const { currentUser, displayName, signOut: ctxSignOut, switchRole } = useAuth();

  const [loading, setLoading] = useState(true);
  const [quiz, setQuiz] = useState(null);
  const [subs, setSubs] = useState([]);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('status');
  const [sortDir, setSortDir] = useState('asc');

  const fetchData = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true); setError('');
    try {
      const quizSnap = await getDoc(doc(db, 'quizzes', quizId));
      if (!quizSnap.exists() || quizSnap.data().createdBy !== currentUser.uid) {
        setError("Quiz not found or you don't have permission."); setLoading(false); return;
      }
      setQuiz({ id: quizSnap.id, ...quizSnap.data() });

      const subsSnap = await getDocs(
        query(collection(db, 'quiz_results'), where('quizId', '==', quizId))
      );
      const raw = subsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Batch-fetch display names (30-item Firestore limit per query)
      const userIds = [...new Set(raw.map(s => s.userId).filter(id => !id.startsWith('guest_')))];
      const names = {};
      for (let i = 0; i < userIds.length; i += 30) {
        const batch = userIds.slice(i, i + 30);
        if (batch.length) {
          const snap = await getDocs(query(collection(db, 'users'), where('__name__', 'in', batch)));
          snap.forEach(d => { names[d.id] = d.data().displayName || d.data().email; });
        }
      }

      setSubs(raw.map(s => ({
        ...s,
        userName: s.userId.startsWith('guest_') ? (s.username || 'Guest') : (names[s.userId] || 'Unknown'),
        isGuest: s.userId.startsWith('guest_'),
        displayScore: s.status === 'completed' ? s.finalScore : s.score,
        pct: s.maxScore > 0
          ? Math.round(((s.status === 'completed' ? s.finalScore : s.score) / s.maxScore) * 100)
          : 0,
      })));
    } catch (err) { setError('Failed to load analytics.'); console.error(err); }
    finally { setLoading(false); }
  }, [quizId, currentUser]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const completed = subs.filter(s => s.status === 'completed');
  const pending   = subs.filter(s => s.status === 'pending');
  const avgScore  = completed.length
    ? Math.round(completed.reduce((a, s) => a + s.pct, 0) / completed.length) : 0;
  const passRate  = completed.length
    ? Math.round(completed.filter(s => s.pct >= 60).length / completed.length * 100) : 0;

  const scoreDistData = [
    { name: '0–20%',   min: 0,  max: 20,  color: '#ef4444' },
    { name: '21–40%',  min: 21, max: 40,  color: '#f97316' },
    { name: '41–60%',  min: 41, max: 60,  color: '#f59e0b' },
    { name: '61–80%',  min: 61, max: 80,  color: '#3b82f6' },
    { name: '81–100%', min: 81, max: 101, color: '#22c55e' },
  ].map(b => ({ ...b, count: completed.filter(s => s.pct >= b.min && s.pct < b.max).length }));

  const perQuestionData = quiz?.questions?.map((q, i) => {
    const n = completed.length;
    const correct = n ? completed.filter(s => (s.answers?.[i]?.pointsAwarded ?? 0) >= q.points).length : 0;
    const passRate = n ? Math.round((correct / n) * 100) : 0;
    return {
      name: `Q${i + 1}`,
      passRate,
      label: q.questionText.length > 45 ? q.questionText.slice(0, 45) + '…' : q.questionText,
      type: q.type,
    };
  }) ?? [];

  // ── Sorting ───────────────────────────────────────────────────────────────
  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };
  const sorted = [...subs].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'name')   cmp = a.userName.localeCompare(b.userName);
    if (sortBy === 'score')  cmp = a.displayScore - b.displayScore;
    if (sortBy === 'pct')    cmp = a.pct - b.pct;
    if (sortBy === 'date')   cmp = (a.completedAt?.toDate?.() || 0) - (b.completedAt?.toDate?.() || 0);
    if (sortBy === 'status') cmp = a.status.localeCompare(b.status);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  // ── CSV export ────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const rows = [
      ['Name', 'Type', 'Score', 'Max', 'Percentage', 'Status', 'Date'],
      ...subs.map(s => [
        s.userName, s.isGuest ? 'Guest' : 'Student',
        s.displayScore, s.maxScore, `${s.pct}%`, s.status,
        s.completedAt?.toDate?.().toLocaleDateString() || '—',
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${(quiz?.title || 'quiz').replace(/[^a-z0-9]/gi, '_')}-results.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleSignOut   = async () => { await ctxSignOut(); navigate('/login'); };
  const handleSwitch    = async () => { try { await switchRole('student'); } catch {} };
  const initials = displayName ? displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'T';
  const fmtDate = ts => ts?.toDate?.().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) ?? '—';

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen w-screen bg-gradient-to-br from-[#f12711] to-[#f5af19]">
      <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-[#f12711] via-[#e85a19] to-[#f5af19] relative overflow-x-hidden">
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 20% 80%,rgba(0,0,0,0.1) 0%,transparent 60%)' }} />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5">
        <button onClick={() => navigate('/teacher/your-quizzes')}
          className="flex items-center gap-2 text-white/70 hover:text-white text-sm font-medium transition-colors">
          <ArrowLeft className="w-4 h-4" /> Your Quizzes
        </button>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="border-white/20 text-white bg-white/10 hidden md:flex">🏫 Teacher</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Avatar className="w-9 h-9 border-2 border-white/20 cursor-pointer hover:border-white/50 transition-colors">
                <AvatarFallback className="bg-white/20 text-white font-bold text-sm">{initials}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="font-normal">
                <p className="font-semibold">{displayName || 'Teacher'}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Teacher account</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/profile')} className="gap-2 cursor-pointer">
                <User className="w-4 h-4" /> My Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSwitch} className="gap-2 cursor-pointer">
                <GraduationCap className="w-4 h-4 text-[#4776e6]" /> Switch to Student
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
          <h1 className="text-3xl md:text-4xl font-black text-white drop-shadow">Analytics 📈</h1>
          <p className="text-white/70 mt-1 font-semibold">{quiz?.title}</p>
        </motion.div>
      </div>

      {/* Main card */}
      <div className="relative z-10 mx-4 md:mx-10 mb-10 rounded-3xl bg-[#f8fafc] shadow-2xl overflow-hidden">
        <div className="p-6 md:p-8 flex flex-col gap-8">

          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}

          {/* Stat row */}
          <section>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: Users,      label: 'Total Submissions', value: subs.length,      color: 'from-[#e85a19] to-[#f5af19]' },
                { icon: TrendingUp, label: 'Average Score',     value: `${avgScore}%`,   color: 'from-[#4776e6] to-[#6366f1]' },
                { icon: Trophy,     label: 'Pass Rate (≥60%)',  value: `${passRate}%`,   color: 'from-[#10b981] to-[#059669]' },
                { icon: Clock,      label: 'Pending Review',    value: pending.length,   color: pending.length > 0 ? 'from-[#f59e0b] to-[#d97706]' : 'from-gray-400 to-gray-500' },
              ].map(({ icon: Icon, label, value, color }, i) => (
                <motion.div key={label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
                  <Card className="border-0 shadow-md overflow-hidden">
                    <div className={`h-1.5 bg-gradient-to-r ${color}`} />
                    <CardContent className="pt-4 pb-5 flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shrink-0`}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-2xl font-black text-[hsl(var(--foreground))]">{value}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] font-medium mt-0.5">{label}</p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Charts */}
          {subs.length > 0 && (
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Score distribution */}
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Score Distribution</CardTitle>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Completed submissions only</p>
                </CardHeader>
                <CardContent>
                  {completed.length === 0 ? (
                    <div className="flex items-center justify-center h-[200px] text-[hsl(var(--muted-foreground))] text-sm">
                      No completed submissions yet
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={scoreDistData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip content={<DistTooltip />} />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                          {scoreDistData.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Per-question pass rate */}
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Pass Rate per Question</CardTitle>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">% of students who answered correctly</p>
                </CardHeader>
                <CardContent>
                  {completed.length === 0 ? (
                    <div className="flex items-center justify-center h-[200px] text-[hsl(var(--muted-foreground))] text-sm">
                      No completed submissions yet
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={perQuestionData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                        <Tooltip content={<QuestionTooltip />} />
                        <Bar dataKey="passRate" radius={[6, 6, 0, 0]}>
                          {perQuestionData.map((e, i) => (
                            <Cell key={i} fill={e.passRate >= 70 ? '#22c55e' : e.passRate >= 40 ? '#f59e0b' : '#ef4444'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </section>
          )}

          {/* Student table */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">Student Results</h2>
              {subs.length > 0 && (
                <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </Button>
              )}
            </div>

            {subs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--muted))] flex items-center justify-center mb-4">
                  <Users className="w-8 h-8 text-[hsl(var(--muted-foreground))]" />
                </div>
                <p className="font-semibold text-[hsl(var(--foreground))]">No submissions yet</p>
                <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">Students haven't taken this quiz yet.</p>
              </div>
            ) : (
              <Card className="border-0 shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[hsl(var(--muted))]/50 border-b border-[hsl(var(--border))]">
                        {[
                          { key: 'name',   label: 'Student' },
                          { key: 'score',  label: 'Score' },
                          { key: 'pct',    label: '%' },
                          { key: 'status', label: 'Status' },
                          { key: 'date',   label: 'Date' },
                        ].map(col => (
                          <th key={col.key}
                            onClick={() => handleSort(col.key)}
                            className="px-4 py-3 text-left text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide cursor-pointer hover:text-[hsl(var(--foreground))] transition-colors select-none">
                            <span className="flex items-center gap-1">
                              {col.label}
                              <SortIcon col={col.key} sortBy={sortBy} sortDir={sortDir} />
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((s, i) => (
                        <tr key={s.id} className={`border-b border-[hsl(var(--border))] transition-colors hover:bg-[hsl(var(--muted))]/30 ${i === sorted.length - 1 ? 'border-0' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${s.status === 'completed' ? 'bg-gradient-to-br from-[#e85a19] to-[#f5af19]' : 'bg-amber-400'}`}>
                                {s.userName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-semibold text-[hsl(var(--foreground))]">{s.userName}</p>
                                {s.isGuest && <span className="text-xs text-[hsl(var(--muted-foreground))]">Guest</span>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-semibold text-[hsl(var(--foreground))]">
                            {s.displayScore}<span className="text-[hsl(var(--muted-foreground))] font-normal">/{s.maxScore}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-bold ${s.pct >= 80 ? 'text-green-600' : s.pct >= 60 ? 'text-blue-600' : s.pct >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                              {s.pct}%
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={s.status === 'completed' ? 'success' : 'warning'}>
                              {s.status === 'completed' ? 'Done' : 'Pending'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">{fmtDate(s.completedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </section>

        </div>
      </div>
    </div>
  );
};

export default Analytics;
