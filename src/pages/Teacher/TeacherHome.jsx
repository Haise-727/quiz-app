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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  Plus, LayoutDashboard, BookOpen, Activity, Radio,
  CheckSquare, AlignLeft, GitCompare, Grid3X3, ArrowUpDown, ToggleLeft,
  BookMarked, Image, Layers, GraduationCap, Trash2, Sparkles, Loader2, Wrench,
} from 'lucide-react';
import { clearInvalidQuizzes, seedTestQuiz, clearAllQuizResults } from '../../utils/devTools';

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
  { type: 'MCQ',                    icon: CheckSquare, label: 'Multiple Choice',      desc: 'Classic auto-graded choices.' },
  { type: 'TRUE_FALSE',             icon: ToggleLeft,  label: 'True / False',         desc: 'Quick binary questions.' },
  { type: 'FILL_IN_THE_BLANK',      icon: AlignLeft,   label: 'Fill in the Blank',    desc: 'Short, specific answers.' },
  { type: 'PARAGRAPH',              icon: BookOpen,    label: 'Paragraph',            desc: 'Long-form, manual grading.' },
  { type: 'MATCH_THE_FOLLOWING',    icon: GitCompare,  label: 'Match the Following',  desc: 'Connect pairs correctly.' },
  { type: 'CATEGORIZE',             icon: Grid3X3,     label: 'Categorize Items',     desc: 'Sort into groups.' },
  { type: 'REORDER',                icon: ArrowUpDown, label: 'Reorder Sequence',     desc: 'Arrange in correct order.' },
  { type: 'VISUAL_COMPREHENSION',   icon: Image,       label: 'Visual Comprehension', desc: 'Image/video with follow-ups.' },
  { type: 'LISTENING_COMPREHENSION', icon: BookMarked, label: 'Listening Comprehension', desc: 'Audio with follow-ups.' },
  { type: 'MIXED',                  icon: Layers,      label: 'Mixed / Custom',       desc: 'Combine all question types.' },
];

const STAT_COLORS = [
  'bg-[hsl(var(--primary))]',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
];

const TeacherHome = () => {
  const navigate = useNavigate();
  const { currentUser, displayName } = useAuth();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ activeQuizzes: 0, totalQuizzes: 0, totalStudents: 0, completedSessions: 0 });
  const [recentActivity, setRecentActivity] = useState([]);
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [devLoading, setDevLoading] = useState(null); // 'clear' | 'seed' | 'clearResults' | null
  const [confirmClearResults, setConfirmClearResults] = useState(false);
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

  const handleSelectType = (type) => {
    setQuizModalOpen(false);
    navigate('/teacher/create-quiz', { state: { quizType: type } });
  };

  const handleClearInvalid = async () => {
    setDevLoading('clear');
    try {
      const count = await clearInvalidQuizzes(currentUser.uid);
      toast.success(`Deleted ${count} invalid quizzes.`);
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

  const handleClearResults = async () => {
    setConfirmClearResults(false);
    setDevLoading('clearResults');
    try {
      const count = await clearAllQuizResults(currentUser.uid);
      toast.success(`Deleted ${count} quiz result${count !== 1 ? 's' : ''}.`);
      fetched.current = false;
      fetchData();
    } catch {
      toast.error('Failed to clear quiz results. Make sure firestore.rules has been published with delete permission for quiz_results.');
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

  if (loading) return (
    <div className="w-full min-h-[60vh] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-[hsl(var(--border))] border-t-[hsl(var(--primary))] rounded-full animate-spin" />
    </div>
  );

  const statCards = [
    { label: 'Active Quizzes',     value: stats.activeQuizzes,     color: STAT_COLORS[0] },
    { label: 'Total Quizzes',      value: stats.totalQuizzes,      color: STAT_COLORS[1] },
    { label: 'Unique Students',    value: stats.totalStudents,     color: STAT_COLORS[2] },
    { label: 'Completed Sessions', value: stats.completedSessions, color: STAT_COLORS[3] },
  ];

  return (
    <div className="w-full relative">
      {/* Greeting Header */}
      <div className="pb-4">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="animate-fade-in">
          <p className="text-[11px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}
          </p>
          <h1 className="text-3xl font-bold text-[hsl(var(--foreground))] tracking-tight mt-1">
            {displayName?.split(' ')[0] || 'Teacher'}
          </h1>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">Here is what is happening with your quizzes today.</p>
        </motion.div>
      </div>

      {/* 70/30 Grid Layout */}
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
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              >
                {[
                  { icon: Plus, label: 'Create Quiz', desc: 'Build a new assessment', onClick: () => setQuizModalOpen(true) },
                  { icon: Radio, label: 'Host Live Game', desc: 'Run a real-time session', onClick: () => navigate('/teacher/your-quizzes') },
                  { icon: LayoutDashboard, label: 'Your Quizzes', desc: 'Manage & grade quizzes', onClick: () => navigate('/teacher/your-quizzes') },
                  { icon: GraduationCap, label: 'My Classes', desc: 'Manage classes & rosters', onClick: () => navigate('/teacher/classes') },
                  { icon: BookOpen, label: 'Question Bank', desc: 'Reusable questions list', onClick: () => navigate('/teacher/question-bank') },
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

            {/* Recent Activity */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Recent Activity</h2>
                <Activity className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
              </div>
              <Card className="border border-[hsl(var(--border))] bg-[hsl(var(--card))] rounded-lg overflow-hidden">
                <CardContent className="p-0">
                  {recentActivity.map((a, i) => (
                    <div key={i} className={`flex items-center justify-between px-4 py-3 transition-colors hover:bg-[hsl(var(--muted))]/20 ${i !== recentActivity.length - 1 ? 'border-b border-[hsl(var(--border))]' : ''}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-[hsl(var(--muted))] flex items-center justify-center flex-shrink-0">
                          <BookOpen className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-[hsl(var(--foreground))] font-semibold truncate">{a.message}</p>
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">{formatDate(a.timestamp)}</p>
                        </div>
                      </div>
                      {a.active !== undefined && (
                        <Badge variant="outline" className={`text-xs rounded px-1.5 py-0.5 border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 ${a.active ? 'text-[hsl(var(--primary))] border-[hsl(var(--primary))]/20' : 'text-[hsl(var(--muted-foreground))]'}`}>
                          {a.active ? 'Active' : 'Inactive'}
                        </Badge>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>

          </div>

          {/* RIGHT Column (30%) - Sidebar */}
          <div className="flex flex-col gap-6">
            
            {/* Stats Panel */}
            <section>
              <h2 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">Metrics</h2>
              <div className="grid grid-cols-2 gap-3">
                {statCards.map(({ label, value }) => (
                  <Card key={label} className="border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3.5 flex flex-col justify-between rounded-lg">
                    <div>
                      <p className="text-2xl font-bold text-[hsl(var(--foreground))] tracking-tight">
                        <AnimatedCounter value={value} />
                      </p>
                      <p className="text-[11px] text-[hsl(var(--muted-foreground))] leading-tight mt-1">{label}</p>
                    </div>
                  </Card>
                ))}
              </div>
            </section>

            {/* Dev Tools */}
            <section>
              <h2 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">Developer tools</h2>
              <Card className="border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 rounded-lg">
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={devLoading === 'clear'}
                    onClick={handleClearInvalid}
                    className="w-full gap-2 border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
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
                    className="w-full gap-2 border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
                  >
                    {devLoading === 'seed'
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Sparkles className="w-3.5 h-3.5" />
                    }
                    Seed Test Quiz (All Types)
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={devLoading === 'clearResults'}
                    onClick={() => setConfirmClearResults(true)}
                    className="w-full gap-2 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"
                  >
                    {devLoading === 'clearResults'
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />
                    }
                    Clear All Quiz Results
                  </Button>
                  <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-2 leading-relaxed">
                    Clear Invalid removes outdated schemas. Seed creates a test quiz with all 7 question types.
                    Clear All Quiz Results permanently deletes every submission/review for your quizzes.
                  </p>
                </div>
              </Card>
            </section>

          </div>

        </div>

      {/* Quiz type modal */}
      <Dialog open={quizModalOpen} onOpenChange={setQuizModalOpen}>
        <DialogContent className="max-w-2xl bg-[hsl(var(--card))] border-[hsl(var(--border))]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[hsl(var(--foreground))]">Choose Quiz Type</DialogTitle>
            <DialogDescription className="text-xs text-[hsl(var(--muted-foreground))]">Select the format that best fits your assessment goal.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 pt-1">
            {QUIZ_TYPES.map(({ type, icon: Icon, label, desc }) => (
              <button
                key={type}
                onClick={() => handleSelectType(type)}
                className="flex flex-col items-center gap-2 p-3.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 text-center transition-all hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/5 cursor-pointer text-left"
              >
                <Icon className="w-4 h-4 text-[hsl(var(--muted-foreground))] mb-1" />
                <div>
                  <p className="font-semibold text-xs text-[hsl(var(--foreground))]">{label}</p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] leading-snug mt-0.5">{desc}</p>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm: Clear All Quiz Results */}
      <Dialog open={confirmClearResults} onOpenChange={setConfirmClearResults}>
        <DialogContent className="max-w-sm bg-[hsl(var(--card))] border-[hsl(var(--border))]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-[hsl(var(--foreground))]">
              <Trash2 className="w-5 h-5 text-red-500" /> Clear All Quiz Results?
            </DialogTitle>
            <DialogDescription>
              This permanently deletes every submission and review for all of your quizzes - students will lose access to their past results. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmClearResults(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleClearResults}>Delete Everything</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeacherHome;
