import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PageHeader from '@/components/layout/PageHeader';
import AnimatedNumber from '@/components/game/AnimatedNumber';
import Skeleton from '@/components/teacher/Skeleton';
import { pop, rise, spring, stagger } from '@/lib/motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  PiPlusBold, PiBroadcastBold, PiStackBold, PiChalkboardTeacherBold, PiBooksBold, PiArrowRightBold,
  PiCheckSquareBold, PiTextAlignLeftBold, PiArrowsLeftRightBold, PiSquaresFourBold, PiArrowsDownUpBold,
  PiToggleLeftBold, PiImageBold, PiHeadphonesBold, PiShuffleBold, PiTrashBold,
  PiSparkleBold, PiSpinnerGapBold, PiNotePencilBold, PiWrenchBold, PiCalculatorBold, PiCursorClickBold,
} from 'react-icons/pi';
import { listMyQuizzesUnordered } from '../../api/quizzes';
import { listResultsForTeacher } from '../../api/results';
import { clearInvalidQuizzes, seedTestQuiz, clearAllQuizResults } from '../../api/devTools';

const QUIZ_TYPES = [
  { type: 'MCQ',                     icon: PiCheckSquareBold,     label: 'Multiple choice',         desc: 'Auto graded choices.' },
  { type: 'TRUE_FALSE',              icon: PiToggleLeftBold,      label: 'True or false',           desc: 'Quick binary questions.' },
  { type: 'FILL_IN_THE_BLANK',       icon: PiTextAlignLeftBold,   label: 'Fill in the blank',       desc: 'Short, specific answers.' },
  { type: 'NUMERIC',                 icon: PiCalculatorBold,      label: 'Number',                  desc: 'A number, with a tolerance.' },
  { type: 'HOTSPOT',                 icon: PiCursorClickBold,     label: 'Click on the image',      desc: 'Tap the right place.' },
  { type: 'PARAGRAPH',               icon: PiNotePencilBold,      label: 'Paragraph',               desc: 'Long answers, marked by hand.' },
  { type: 'MATCH_THE_FOLLOWING',     icon: PiArrowsLeftRightBold, label: 'Match the following',     desc: 'Connect pairs correctly.' },
  { type: 'CATEGORIZE',              icon: PiSquaresFourBold,     label: 'Categorize items',        desc: 'Sort into groups.' },
  { type: 'REORDER',                 icon: PiArrowsDownUpBold,    label: 'Reorder a sequence',      desc: 'Arrange in the right order.' },
  { type: 'VISUAL_COMPREHENSION',    icon: PiImageBold,           label: 'Visual comprehension',    desc: 'Image or video with follow ups.' },
  { type: 'LISTENING_COMPREHENSION', icon: PiHeadphonesBold,      label: 'Listening comprehension', desc: 'Audio with follow ups.' },
  { type: 'MIXED',                   icon: PiShuffleBold,         label: 'Mixed',                   desc: 'Combine all question types.' },
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
      const [quizzes, results] = await Promise.all([
        listMyQuizzesUnordered(currentUser.uid),
        listResultsForTeacher(currentUser.uid),
      ]);
      const uniqueStudents = new Set(
        results.map(r => r.userId).filter(id => !id.startsWith('guest_'))
      );
      setStats({
        activeQuizzes:     quizzes.filter(q => q.active).length,
        totalQuizzes:      quizzes.length,
        totalStudents:     uniqueStudents.size,
        completedSessions: results.length,
      });
      const activity = quizzes
        .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
        .slice(0, 5)
        .map(q => ({ id: q.id, title: q.title, timestamp: q.createdAt, active: q.active }));
      setRecentActivity(activity);
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
      toast.success(`Test quiz created. ID: ${id}`);
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
    if (!ts) return 'just now';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const h = (Date.now() - d) / 3600000;
    if (h < 1) return 'just now';
    if (h < 24) return `${Math.floor(h)}h ago`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = displayName?.split(' ')[0] || 'Teacher';

  const statCards = [
    { label: 'Active quizzes',     value: stats.activeQuizzes },
    { label: 'Total quizzes',      value: stats.totalQuizzes },
    { label: 'Unique students',    value: stats.totalStudents },
    { label: 'Completed sessions', value: stats.completedSessions },
  ];

  const links = [
    { icon: PiBroadcastBold, label: 'Host a live game', desc: 'Run a session in real time', to: '/teacher/your-quizzes' },
    { icon: PiStackBold, label: 'Your quizzes', desc: 'Edit, preview and grade', to: '/teacher/your-quizzes' },
    { icon: PiChalkboardTeacherBold, label: 'Classes', desc: 'Rosters and assignments', to: '/teacher/classes' },
    { icon: PiBooksBold, label: 'Question bank', desc: 'Questions you can reuse', to: '/teacher/question-bank' },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl pb-16">
      <PageHeader
        eyebrow="Dashboard"
        serif
        title={`${greeting}, ${first}.`}
        actions={<Button size="lg" onClick={() => setQuizModalOpen(true)}><PiPlusBold /> Create quiz</Button>}
      />

      {/* The numbers. */}
      <dl className="mt-10 grid grid-cols-2 border-y border-[hsl(var(--border))] sm:grid-cols-4 sm:divide-x sm:divide-[hsl(var(--border))]">
        {statCards.map(({ label, value }, i) => (
          <div key={label} className={`py-5 ${i === 0 ? 'sm:pr-6' : i === statCards.length - 1 ? 'sm:pl-6' : 'sm:px-6'}`}>
            <dt className="eyebrow">{label}</dt>
            <dd className="mt-2 text-3xl font-medium text-[hsl(var(--foreground))]">
              {loading ? <Skeleton className="h-8 w-14" /> : <AnimatedNumber value={value} duration={0.8} />}
            </dd>
          </div>
        ))}
      </dl>

      {/* Recent quizzes. */}
      <section aria-label="Recent quizzes" className="mt-12">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Recent quizzes</h2>
          {recentActivity.length > 0 && (
            <button type="button" onClick={() => navigate('/teacher/your-quizzes')} className="cursor-pointer text-sm font-medium text-[hsl(var(--foreground))] underline underline-offset-4">View all</button>
          )}
        </div>
        {loading ? (
          <div className="space-y-3 border-t border-[hsl(var(--border))] pt-4">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : recentActivity.length === 0 ? (
          <motion.div variants={pop} initial="hidden" animate="show" className="mt-2 border-t border-[hsl(var(--border))] pt-8">
            <p className="text-lg font-medium">No quizzes yet.</p>
            <p className="mt-1 text-[hsl(var(--muted-foreground))]">Create your first quiz and share the code with your students.</p>
            <Button className="mt-5" variant="brand" size="lg" onClick={() => setQuizModalOpen(true)}>Create quiz <PiArrowRightBold /></Button>
          </motion.div>
        ) : (
          <motion.ul variants={stagger(0.05)} initial="hidden" animate="show" className="divide-y divide-[hsl(var(--border))] border-t border-[hsl(var(--border))]">
            {recentActivity.map((a) => (
              <motion.li key={a.id} variants={rise} className="flex items-center gap-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.title}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Created {formatDate(a.timestamp)}</p>
                </div>
                <Badge variant={a.active ? 'success' : 'secondary'}>{a.active ? 'Active' : 'Draft'}</Badge>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </section>

      {/* Where to go next. */}
      <section aria-label="Shortcuts" className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight">Jump to</h2>
        <motion.ul variants={stagger(0.05)} initial="hidden" animate="show" className="mt-2 grid border-t border-[hsl(var(--border))] sm:grid-cols-2 sm:gap-x-12">
          {links.map(({ icon: Icon, label, desc, to }) => (
            <motion.li key={label} variants={rise} className="border-b border-[hsl(var(--border))]">
              <motion.button
                type="button"
                onClick={() => navigate(to)}
                whileTap={{ scale: 0.985 }}
                transition={spring}
                className="group flex w-full cursor-pointer items-center gap-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              >
                <Icon className="h-5 w-5 shrink-0 text-[hsl(var(--muted-foreground))] transition-colors group-hover:text-[hsl(var(--foreground))]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-[hsl(var(--muted-foreground))]">{desc}</span>
                </span>
                <PiArrowRightBold className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform group-hover:translate-x-0.5 group-hover:text-[hsl(var(--foreground))]" />
              </motion.button>
            </motion.li>
          ))}
        </motion.ul>
      </section>

      {/* Developer tools: kept, but quiet. */}
      <section aria-label="Developer tools" className="mt-14 border-t border-[hsl(var(--border))] pt-6">
        <h2 className="eyebrow flex items-center gap-2"><PiWrenchBold className="h-3.5 w-3.5" /> Developer tools</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={devLoading === 'clear'} onClick={handleClearInvalid}>
            {devLoading === 'clear' ? <PiSpinnerGapBold className="animate-spin" /> : <PiTrashBold />}
            Clear invalid quizzes
          </Button>
          <Button variant="outline" size="sm" disabled={devLoading === 'seed'} onClick={handleSeedQuiz}>
            {devLoading === 'seed' ? <PiSpinnerGapBold className="animate-spin" /> : <PiSparkleBold />}
            Seed test quiz
          </Button>
          <Button variant="destructive" size="sm" disabled={devLoading === 'clearResults'} onClick={() => setConfirmClearResults(true)}>
            {devLoading === 'clearResults' ? <PiSpinnerGapBold className="animate-spin" /> : <PiTrashBold />}
            Clear all quiz results
          </Button>
        </div>
        <p className="mt-3 max-w-prose text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
          Clear invalid removes outdated schemas. Seed creates a test quiz with every question type.
          Clear all quiz results permanently deletes every submission and review for your quizzes.
        </p>
      </section>

      {/* Quiz type modal */}
      <Dialog open={quizModalOpen} onOpenChange={setQuizModalOpen}>
        <DialogContent className="max-w-2xl bg-[hsl(var(--card))] border-[hsl(var(--border))]">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[hsl(var(--foreground))]">Choose a quiz type</DialogTitle>
            <DialogDescription className="text-sm text-[hsl(var(--muted-foreground))]">Pick the format that fits what you want to assess.</DialogDescription>
          </DialogHeader>
          <ul className="grid gap-x-8 px-6 pb-6 sm:grid-cols-2">
            {QUIZ_TYPES.map(({ type, icon: Icon, label, desc }) => (
              <li key={type} className="border-b border-[hsl(var(--border))]">
                <button
                  type="button"
                  onClick={() => handleSelectType(type)}
                  className="group flex w-full cursor-pointer items-center gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                >
                  <Icon className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] transition-colors group-hover:text-[hsl(var(--primary))]" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[hsl(var(--foreground))]">{label}</span>
                    <span className="block text-xs text-[hsl(var(--muted-foreground))]">{desc}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      {/* Confirm: Clear All Quiz Results */}
      <Dialog open={confirmClearResults} onOpenChange={setConfirmClearResults}>
        <DialogContent className="max-w-sm bg-[hsl(var(--card))] border-[hsl(var(--border))]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-[hsl(var(--foreground))]">
              <PiTrashBold className="h-5 w-5 text-[hsl(var(--destructive))]" /> Clear all quiz results?
            </DialogTitle>
            <DialogDescription>
              This permanently deletes every submission and review for all of your quizzes. Students will lose access to their past results. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmClearResults(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleClearResults}>Delete everything</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeacherHome;
