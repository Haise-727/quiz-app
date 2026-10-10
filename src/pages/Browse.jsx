import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { AnimatePresence, motion } from 'framer-motion';
import { PiCardsBold, PiLightningBold, PiMagnifyingGlassBold, PiPlayFill } from 'react-icons/pi';
import { db } from '@/firebase';
import { useAuth } from '@/contexts/AuthContext';
import PublicNav from '@/components/layout/PublicNav';
import PublicFooter from '@/components/layout/PublicFooter';
import PageHeader from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { ease, rise, spring, stagger } from '@/lib/motion';

const Skeleton = ({ className = '' }) => <div className={`animate-pulse rounded-md bg-[hsl(var(--muted))] ${className}`} />;

export default function Browse() {
  const navigate = useNavigate();
  const { currentUser, userRole } = useAuth();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('All');

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'quizzes'), where('active', '==', true)));
        setQuizzes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch {
        setFailed(true);   // a visitor can still join with a code, so this is not fatal
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const play = (id) => navigate(currentUser && userRole === 'student' ? `/student/quiz/${id}` : `/quiz/${id}`);

  // "All" means no filter, so a quiz whose subject is literally "All" must not add a second chip.
  const subjects = useMemo(() => {
    const set = new Set();
    quizzes.forEach((q) => { const s = q.subject?.trim(); if (s && s.toLowerCase() !== 'all') set.add(s); });
    return ['All', ...[...set].sort()];
  }, [quizzes]);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return quizzes.filter((q) => {
      const hit = !term || [q.title, q.description, q.subject].some((v) => v?.toLowerCase().includes(term)) || (q.tags || []).some((t) => t.toLowerCase().includes(term));
      return hit && (subject === 'All' || q.subject?.trim() === subject);
    });
  }, [quizzes, search, subject]);

  const filtering = !!search || subject !== 'All';

  return (
    <div className="min-h-dvh bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <PublicNav />
      <main className="mx-auto max-w-4xl px-5 pb-24 pt-14 sm:px-8 sm:pt-20">
        <PageHeader serif eyebrow="Open to everyone" title="Pick a quiz." description="Every quiz here is open right now. No account needed to play." />

        <div className="mt-12">
          <label htmlFor="browse-search" className="sr-only">Search quizzes</label>
          <div className="flex items-center gap-3 border-b-2 border-[hsl(var(--input))] pb-2 transition-colors focus-within:border-[hsl(var(--ink))]">
            <PiMagnifyingGlassBold className="h-5 w-5 shrink-0 text-[hsl(var(--muted-foreground))]" />
            <input
              id="browse-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, subject or tag"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-[hsl(var(--muted-foreground))]/60"
            />
          </div>

          {subjects.length > 1 && (
            <div role="group" aria-label="Subject" className="-mx-1 mt-5 flex flex-wrap gap-x-1 gap-y-1">
              {subjects.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSubject(s)}
                  aria-pressed={subject === s}
                  className={`relative isolate cursor-pointer rounded-md px-3 py-1.5 text-sm transition-colors ${subject === s ? 'font-medium text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
                >
                  {subject === s && <motion.span layoutId="subject-pill" transition={spring} className="absolute inset-0 -z-10 rounded-md bg-[hsl(var(--muted))]" />}
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="eyebrow tabular mt-10" aria-live="polite">
          {loading ? 'Loading' : `${shown.length} ${shown.length === 1 ? 'quiz' : 'quizzes'}`}
          {filtering && !loading && (
            <button type="button" onClick={() => { setSearch(''); setSubject('All'); }} className="ml-4 cursor-pointer normal-case tracking-normal text-[hsl(var(--foreground))] underline underline-offset-4">Clear filters</button>
          )}
        </p>

        {loading ? (
          <div className="mt-4 divide-y divide-[hsl(var(--border))] border-t border-[hsl(var(--border))]">
            {[0, 1, 2, 3].map((i) => <div key={i} className="py-6"><Skeleton className="h-6 w-1/2" /><Skeleton className="mt-3 h-4 w-1/3" /></div>)}
          </div>
        ) : shown.length > 0 ? (
          <motion.ul variants={stagger(0.04)} initial="hidden" animate="show" className="mt-4 divide-y divide-[hsl(var(--border))] border-y border-[hsl(var(--border))]">
            <AnimatePresence initial={false} mode="popLayout">
              {shown.map((q) => (
                <motion.li key={q.id} layout variants={rise} exit={{ opacity: 0, transition: { duration: 0.15, ease } }} className="group flex flex-wrap items-center justify-between gap-x-6 gap-y-4 py-6">
                  <div className="min-w-0 flex-1 basis-64">
                    <h2 className="text-xl font-medium tracking-tight">
                      <button type="button" onClick={() => play(q.id)} className="cursor-pointer text-left outline-none transition-colors hover:text-[hsl(var(--primary))] focus-visible:underline">{q.title}</button>
                    </h2>
                    {q.description && <p className="mt-1 line-clamp-2 max-w-xl text-sm text-[hsl(var(--muted-foreground))]">{q.description}</p>}
                    <p className="tabular mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                      <span>{q.questions?.length || 0} questions</span>
                      <span>{q.totalPoints || 0} pts</span>
                      {q.subject && <button type="button" onClick={() => setSubject(q.subject.trim())} className="cursor-pointer uppercase underline-offset-4 hover:text-[hsl(var(--foreground))] hover:underline">{q.subject}</button>}
                      <span>Code {q.code}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/flashcards/${q.id}`)}><PiCardsBold /> Flashcards</Button>
                    <Button variant="outline" size="sm" onClick={() => navigate(`/practice/${q.id}`)}><PiLightningBold /> Practice</Button>
                    <Button variant="brand" size="sm" onClick={() => play(q.id)}><PiPlayFill /> Play</Button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        ) : (
          <div className="border-y border-[hsl(var(--border))] py-20 text-center">
            <p className="text-hero text-4xl">{failed ? 'Could not load quizzes.' : filtering ? 'Nothing matches.' : 'No quizzes are open right now.'}</p>
            <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
              {failed ? 'Check your connection and reload. If you have a code, you can still join from the home page.' : filtering ? 'Try other words, or clear the filters.' : 'Check back later, or sign in to make one.'}
            </p>
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
