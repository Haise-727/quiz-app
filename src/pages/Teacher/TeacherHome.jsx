import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus, LayoutDashboard, BookOpen, Upload, LogOut, Activity,
  CheckSquare, AlignLeft, GitCompare, Grid3X3, ArrowUpDown,
  BookMarked, Image, Layers, GraduationCap, Trash2, Sparkles, Loader2, Wrench, User,
} from 'lucide-react';
import { clearInvalidQuizzes, seedTestQuiz } from '../../utils/devTools';

const AnimatedCounter = ({ value, duration = 1500 }) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const end = parseInt(value, 10);
    if (!end) { setCount(0); return; }
    const step = Math.ceil(duration / end);
    let cur = 0;
    const t = setInterval(() => { cur += 1; setCount(cur); if (cur >= end) clearInterval(t); }, step);
    return () => clearInterval(t);
  }, [value, duration]);
  return <span>{count.toLocaleString()}</span>;
};

const QUIZ_TYPES = [
  { type: 'MCQ',                   icon: CheckSquare, label: 'Multiple Choice',      desc: 'Classic auto-graded choices.' },
  { type: 'FILL_IN_THE_BLANK',     icon: AlignLeft,   label: 'Fill in the Blank',    desc: 'Short, specific answers.' },
  { type: 'PARAGRAPH',             icon: BookOpen,    label: 'Paragraph',            desc: 'Long-form, manual grading.' },
  { type: 'MATCH_THE_FOLLOWING',   icon: GitCompare,  label: 'Match the Following',  desc: 'Connect pairs correctly.' },
  { type: 'CATEGORIZE',            icon: Grid3X3,     label: 'Categorize Items',     desc: 'Sort into groups.' },
  { type: 'REORDER',               icon: ArrowUpDown, label: 'Reorder Sequence',     desc: 'Arrange in correct order.' },
  { type: 'READING_COMPREHENSION', icon: BookMarked,  label: 'Comprehension',        desc: 'Passage with follow-ups.' },
  { type: 'LABELING',              icon: Image,       label: 'Image Labeling',       desc: 'Label parts of an image.' },
  { type: 'MIXED',                 icon: Layers,      label: 'Mixed / Custom',       desc: 'Combine all question types.' },
];

const STAT_COLORS = [
  'from-[#e85a19] to-[#f5af19]',
  'from-[#4776e6] to-[#8b5cf6]',
  'from-[#10b981] to-[#059669]',
  'from-[#f59e0b] to-[#d97706]',
];

const TeacherHome = () => {
  const navigate = useNavigate();
  const { currentUser, displayName, userRole, signOut: ctxSignOut, switchRole } = useAuth();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ activeQuizzes: 0, totalQuizzes: 0, totalStudents: 0, completedSessions: 0 });
  const [recentActivity, setRecentActivity] = useState([]);
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [devLoading, setDevLoading] = useState(null); // 'clear' | 'seed' | null
  const fetched = useRef(false);

  useEffect(() => {
    if (currentUser && !fetched.current) { fetched.current = true; fetchData(); }
    else if (!currentUser) setLoading(false);
  }, [currentUser]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [qSnap, sSnap] = await Promise.all([
        getDocs(query(collection(db, 'quizzes'), where('createdBy', '==', currentUser.uid))),
        getDocs(query(collection(db, 'quiz_results'), where('teacherId', '==', currentUser.uid))),
      ]);
      const quizzes = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const uniqueStudents = new Set(
        sSnap.docs.map(d => d.data().userId).filter(id => !id.startsWith('guest_'))
      );
      setStats({
        activeQuizzes:     quizzes.filter(q => q.active).length,
        totalQuizzes:      quizzes.length,
        totalStudents:     uniqueStudents.size,
        completedSessions: sSnap.size,
      });
      const activity = quizzes
        .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
        .slice(0, 5)
        .map(q => ({ message: `Created "${q.title}"`, timestamp: q.createdAt, active: q.active }));
      setRecentActivity(activity.length ? activity : [{ message: 'Welcome! Create your first quiz.', timestamp: null, active: false }]);
    } catch (err) {
      toast.error('Failed to load dashboard data.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await ctxSignOut();
    navigate('/login');
  };

  const handleSwitchRole = async () => {
    try {
      await switchRole('student');
      toast.success('Switched to Student mode');
      // ProtectedRoute auto-redirects once userRole flips
    } catch {
      toast.error('Failed to switch role.');
    }
  };

  const handleSelectType = (type) => {
    setQuizModalOpen(false);
    navigate('/teacher/create-quiz', { state: { quizType: type } });
  };

  const handleClearInvalid = async () => {
    setDevLoading('clear');
    try {
      const count = await clearInvalidQuizzes(currentUser.uid);
      toast.success(`Deleted ${count} invalid quiz${count !== 1 ? 'zes' : ''}.`);
      if (count > 0) { fetched.current = false; fetchData(); }
    } catch {
      toast.error('Failed to clear invalid quizzes.');
    } finally {
      setDevLoading(null);
    }
  };

  const handleSeedQuiz = async () => {
    setDevLoading('seed');
    try {
      const id = await seedTestQuiz(currentUser.uid);
      toast.success(`Test quiz created! ID: ${id}`);
      fetched.current = false;
      fetchData();
    } catch {
      toast.error('Failed to seed test quiz.');
    } finally {
      setDevLoading(null);
    }
  };

  const formatDate = (ts) => {
    if (!ts) return 'Just now';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const h = (Date.now() - d) / 3600000;
    if (h < 1) return 'Just now';
    if (h < 24) return `${Math.floor(h)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const initials = displayName ? displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'T';

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen w-screen bg-gradient-to-br from-[#f12711] to-[#f5af19]">
      <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
    </div>
  );

  const statCards = [
    { label: 'Active Quizzes',     value: stats.activeQuizzes,     color: STAT_COLORS[0] },
    { label: 'Total Quizzes',      value: stats.totalQuizzes,      color: STAT_COLORS[1] },
    { label: 'Unique Students',    value: stats.totalStudents,     color: STAT_COLORS[2] },
    { label: 'Completed Sessions', value: stats.completedSessions, color: STAT_COLORS[3] },
  ];

  return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-[#f12711] via-[#e85a19] to-[#f5af19] relative overflow-x-hidden">
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 20% 80%,rgba(0,0,0,0.1) 0%,transparent 60%)' }} />

      {/* ── Top nav ── */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center text-white font-black text-sm">Q</div>
          <span className="text-white font-bold text-lg tracking-tight hidden sm:block">Quizlike</span>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant="outline" className="border-white/20 text-white bg-white/10 hidden md:flex">
            🏫 Teacher
          </Badge>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Avatar className="w-9 h-9 border-2 border-white/20 cursor-pointer hover:border-white/50 transition-colors">
                <AvatarFallback className="bg-white/20 text-white font-bold text-sm">{initials}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="font-normal">
                <p className="font-semibold text-[hsl(var(--foreground))]">{displayName || 'Teacher'}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Teacher account</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/profile')} className="gap-2 cursor-pointer">
                <User className="w-4 h-4" />
                My Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSwitchRole} className="gap-2 cursor-pointer">
                <GraduationCap className="w-4 h-4 text-[#4776e6]" />
                Switch to Student
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
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="text-3xl md:text-4xl font-black text-white drop-shadow">
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'},{' '}
            {displayName?.split(' ')[0] || 'Teacher'} 👋
          </h1>
          <p className="text-white/70 mt-1 text-base">Here's what's happening with your quizzes today.</p>
        </motion.div>
      </div>

      {/* ── Main content card ── */}
      <div className="relative z-10 mx-4 md:mx-10 mb-10 rounded-3xl bg-[#f8fafc] shadow-2xl overflow-hidden">
        <div className="p-6 md:p-8 flex flex-col gap-8">

          {/* ── Stat cards ── */}
          <section>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {statCards.map(({ label, value, color }, i) => (
                <motion.div key={label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                  <Card className="border-0 shadow-md overflow-hidden">
                    <div className={`h-1.5 bg-gradient-to-r ${color}`} />
                    <CardContent className="pt-4 pb-5">
                      <p className="text-3xl font-black text-[hsl(var(--foreground))]">
                        <AnimatedCounter value={value} />
                      </p>
                      <p className="text-sm text-[hsl(var(--muted-foreground))] font-medium mt-0.5">{label}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </section>

          {/* ── Quick actions ── */}
          <section>
            <h2 className="text-lg font-bold text-[hsl(var(--foreground))] mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  icon: Plus, label: 'Create Quiz', desc: 'Build a new assessment',
                  onClick: () => setQuizModalOpen(true),
                  cls: 'bg-gradient-to-br from-[#e85a19] to-[#f5af19] text-white border-0 hover:shadow-[0_8px_30px_rgba(232,90,25,0.35)]',
                },
                {
                  icon: LayoutDashboard, label: 'Your Quizzes', desc: 'Manage & grade quizzes',
                  onClick: () => navigate('/teacher/your-quizzes'),
                  cls: 'bg-gradient-to-br from-[#4776e6] to-[#8b5cf6] text-white border-0 hover:shadow-[0_8px_30px_rgba(71,118,230,0.35)]',
                },
                {
                  icon: Upload, label: 'Media Test', desc: 'Test file uploads',
                  onClick: () => navigate('/teacher/media-test'),
                  cls: 'bg-white text-[hsl(var(--foreground))] border border-[hsl(var(--border))] hover:border-[#e85a19]/50 hover:shadow-md',
                },
              ].map(({ icon: Icon, label, desc, onClick, cls }) => (
                <motion.button
                  key={label}
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClick}
                  className={`flex items-center gap-4 p-5 rounded-2xl text-left transition-all duration-200 cursor-pointer ${cls}`}
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${cls.includes('text-white') ? 'bg-white/20' : 'bg-[#e85a19]/10'}`}>
                    <Icon className={`w-5 h-5 ${cls.includes('text-white') ? 'text-white' : 'text-[#e85a19]'}`} />
                  </div>
                  <div>
                    <p className="font-bold">{label}</p>
                    <p className={`text-xs mt-0.5 ${cls.includes('text-white') ? 'opacity-70' : 'text-[hsl(var(--muted-foreground))]'}`}>{desc}</p>
                  </div>
                </motion.button>
              ))}
            </div>
          </section>

          {/* ── Recent activity ── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">Recent Activity</h2>
              <Activity className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            </div>
            <Card className="shadow-sm">
              <CardContent className="p-0">
                {recentActivity.map((a, i) => (
                  <div key={i} className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[hsl(var(--muted))]/50 ${i !== recentActivity.length - 1 ? 'border-b border-[hsl(var(--border))]' : ''}`}>
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#e85a19] to-[#f5af19] flex items-center justify-center flex-shrink-0">
                      <BookOpen className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-[hsl(var(--foreground))] truncate">{a.message}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">{formatDate(a.timestamp)}</p>
                    </div>
                    {a.active !== undefined && (
                      <Badge variant={a.active ? 'success' : 'secondary'}>
                        {a.active ? '● Active' : 'Inactive'}
                      </Badge>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          {/* ── Dev Tools ── */}
          <section className="border border-dashed border-amber-300 rounded-2xl p-5 bg-amber-50/60">
            <div className="flex items-center gap-2 mb-4">
              <Wrench className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-bold text-amber-700 uppercase tracking-wide">Dev Tools</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={devLoading === 'clear'}
                onClick={handleClearInvalid}
                className="gap-2 border-amber-300 text-amber-800 hover:bg-amber-100"
              >
                {devLoading === 'clear'
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5" />
                }
                Clear Invalid Quizzes
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={devLoading === 'seed'}
                onClick={handleSeedQuiz}
                className="gap-2 border-amber-300 text-amber-800 hover:bg-amber-100"
              >
                {devLoading === 'seed'
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Sparkles className="w-3.5 h-3.5" />
                }
                Seed Test Quiz (All Types)
              </Button>
            </div>
            <p className="text-xs text-amber-600/80 mt-3">
              Clear Invalid: removes quizzes using the old schema (text/correctOption fields). Seed: creates a fresh test quiz with all 7 question types.
            </p>
          </section>

        </div>
      </div>

      {/* ── Quiz type modal ── */}
      <Dialog open={quizModalOpen} onOpenChange={setQuizModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">Choose Quiz Type</DialogTitle>
            <DialogDescription>Select the format that best fits your assessment goal.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-6 pt-2">
            {QUIZ_TYPES.map(({ type, icon: Icon, label, desc }) => (
              <motion.button
                key={type}
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleSelectType(type)}
                className="flex flex-col items-center gap-2.5 p-4 rounded-2xl border-2 border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 text-center transition-all hover:border-[#e85a19] hover:bg-[#e85a19]/5 cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-[#e85a19]/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-[#e85a19]" />
                </div>
                <div>
                  <p className="font-bold text-sm text-[hsl(var(--foreground))]">{label}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] leading-snug mt-0.5">{desc}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeacherHome;
