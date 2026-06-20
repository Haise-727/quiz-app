import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, BookOpen, Clock, PlayCircle, Hash, ChevronRight, Zap, CreditCard, Tag } from 'lucide-react';

const Browse = () => {
  const navigate = useNavigate();
  const { currentUser, userRole } = useAuth();

  const [quizzes, setQuizzes]                   = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [search, setSearch]                     = useState('');
  const [selectedSubject, setSelectedSubject]   = useState('All');

  useEffect(() => {
    const fetchActive = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'quizzes'), where('active', '==', true)));
        setQuizzes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch { /* silently fail — guest can still use code entry */ }
      finally { setLoading(false); }
    };
    fetchActive();
  }, []);

  const handleJoin = (quizId) => {
    if (currentUser && userRole === 'student') {
      navigate(`/student/quiz/${quizId}`);
    } else {
      navigate(`/quiz/${quizId}`);
    }
  };

  // Derive sorted unique subjects from all fetched quizzes
  const subjects = useMemo(() => {
    const set = new Set();
    quizzes.forEach(q => { if (q.subject && q.subject.trim()) set.add(q.subject.trim()); });
    return ['All', ...Array.from(set).sort()];
  }, [quizzes]);

  const filtered = quizzes.filter(q => {
    const matchesSearch =
      !search ||
      q.title?.toLowerCase().includes(search.toLowerCase()) ||
      q.description?.toLowerCase().includes(search.toLowerCase()) ||
      q.subject?.toLowerCase().includes(search.toLowerCase()) ||
      (q.tags || []).some(t => t.toLowerCase().includes(search.toLowerCase()));

    const matchesSubject =
      selectedSubject === 'All' ||
      (q.subject && q.subject.trim() === selectedSubject);

    return matchesSearch && matchesSubject;
  });

  return (
    <div className="min-h-screen w-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] relative overflow-x-hidden">
      {/* Decorative background grid and blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] bg-[linear-gradient(to_right,hsl(var(--foreground))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground))_1px,transparent_1px)] bg-[size:3rem_3rem]" />
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/5 blur-[120px]" />
      </div>

      {/* Nav */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]/80 backdrop-blur-md">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[hsl(var(--primary))] flex items-center justify-center font-black text-sm shadow text-white">Q</div>
          <span className="font-bold text-lg tracking-tight text-[hsl(var(--foreground))]">Quizlike</span>
        </Link>

        <div className="flex items-center gap-3">
          {currentUser ? (
            <Button size="sm" onClick={() => navigate(userRole === 'teacher' ? '/teacher/home' : '/student/dashboard')}
              className="bg-[hsl(var(--muted))] hover:bg-[hsl(var(--muted))]/80 border border-[hsl(var(--border))] text-[hsl(var(--foreground))] gap-1.5">
              Dashboard <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button size="sm" onClick={() => navigate('/login')}
              className="bg-[hsl(var(--primary))] text-white border-0 hover:bg-[hsl(var(--primary-hover))]">
              Sign In
            </Button>
          )}
        </div>
      </header>

      <div className="relative z-10 max-w-6xl mx-auto px-6 md:px-12 py-12">

        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-black mb-3">
            Browse <span className="text-[hsl(var(--primary))]">Live Quizzes</span>
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] text-lg">All active quizzes — jump in and start learning.</p>
        </motion.div>

        {/* Search */}
        <div className="relative mb-6 max-w-xl mx-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
          <Input
            placeholder="Search quizzes by title, subject or tag…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-11 bg-[hsl(var(--muted))]/40 border-[hsl(var(--border))] text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))] focus-visible:border-[hsl(var(--primary))] focus-visible:ring-[hsl(var(--primary))]/20 h-12 rounded-2xl"
          />
        </div>

        {subjects.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-wrap gap-2 mb-8 justify-center"
          >
            {subjects.map(subject => (
              <button
                key={subject}
                onClick={() => setSelectedSubject(subject)}
                className={[
                  'px-4 py-1.5 rounded-full text-sm font-semibold border transition-all duration-200 cursor-pointer',
                  selectedSubject === subject
                    ? 'bg-[hsl(var(--primary))] border-transparent text-white shadow shadow-[hsl(var(--primary))]/25'
                    : 'bg-[hsl(var(--muted))] border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]/80 hover:text-[hsl(var(--foreground))]'
                ].join(' ')}
              >
                {subject}
              </button>
            ))}
          </motion.div>
        )}

        {/* Count + clear */}
        <div className="flex items-center gap-3 mb-6">
          <p className="text-[hsl(var(--muted-foreground))] text-sm">
            {loading ? 'Loading…' : `${filtered.length} active quiz${filtered.length !== 1 ? 'zes' : ''}`}
            {selectedSubject !== 'All' && (
              <span className="ml-1">in <span className="text-[hsl(var(--primary))]">{selectedSubject}</span></span>
            )}
          </p>
          {(search || selectedSubject !== 'All') && (
            <button
              onClick={() => { setSearch(''); setSelectedSubject('All'); }}
              className="text-[hsl(var(--primary))] hover:text-[hsl(var(--primary-hover))] text-xs underline transition-colors cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-10 h-10 border-4 border-[hsl(var(--border))] border-t-[hsl(var(--primary))] rounded-full animate-spin" />
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            <AnimatePresence mode="popLayout">
              {filtered.map((quiz, i) => (
                <motion.div
                  key={quiz.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Card
                    className="border border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted))]/20 hover:-translate-y-0.5 hover:border-[hsl(var(--primary))]/50 transition-all duration-200 cursor-pointer group overflow-hidden shadow-sm"
                    onClick={() => handleJoin(quiz.id)}
                  >
                    <div className="h-1 bg-[hsl(var(--primary))]" />
                    <CardContent className="pt-5 pb-5">
                      {/* Title + Active badge */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <h3 className="font-bold text-[hsl(var(--foreground))] leading-snug group-hover:text-[hsl(var(--primary))] transition-colors">
                          {quiz.title}
                        </h3>
                        <Badge className="bg-green-500/20 text-green-600 border-green-500/30 shrink-0 text-xs font-semibold">Active</Badge>
                      </div>

                      {/* Subject pill */}
                      {quiz.subject && (
                        <button
                          onClick={e => { e.stopPropagation(); setSelectedSubject(quiz.subject.trim()); }}
                          className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/20 px-2.5 py-0.5 rounded-full hover:bg-[hsl(var(--primary))]/20 transition-colors cursor-pointer"
                          title={`Filter by ${quiz.subject}`}
                        >
                          <BookOpen className="w-3 h-3" /> {quiz.subject}
                        </button>
                      )}

                      {quiz.description && (
                        <p className="text-[hsl(var(--muted-foreground))] text-xs leading-relaxed line-clamp-2 mb-3">{quiz.description}</p>
                      )}

                      {/* Tags */}
                      {quiz.tags && quiz.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {quiz.tags.slice(0, 4).map((tag, ti) => (
                            <span
                              key={ti}
                              className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/20 px-2 py-0.5 rounded-full"
                            >
                              <Tag className="w-2.5 h-2.5" /> {tag}
                            </span>
                          ))}
                          {quiz.tags.length > 4 && (
                            <span className="text-[10px] text-[hsl(var(--muted-foreground))] self-center">+{quiz.tags.length - 4}</span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-4 text-xs text-[hsl(var(--muted-foreground))] mb-4">
                        <span className="flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5" /> {quiz.questions?.length || 0} questions
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" /> {quiz.totalPoints || 0} pts
                        </span>
                      </div>

                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 bg-[hsl(var(--muted))] rounded-lg px-2.5 py-1 border border-[hsl(var(--border))]">
                          <Hash className="w-3 h-3 text-[hsl(var(--muted-foreground))]" />
                          <span className="font-mono font-bold text-[hsl(var(--primary))] tracking-widest text-sm">{quiz.code}</span>
                        </div>
                      </div>

                      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                        <Button size="sm" onClick={() => handleJoin(quiz.id)}
                          className="flex-1 gap-1.5 bg-[hsl(var(--primary))] text-white border-0 hover:bg-[hsl(var(--primary-hover))] text-xs font-semibold">
                          <PlayCircle className="w-3.5 h-3.5" /> Play
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => navigate(`/practice/${quiz.id}`)}
                          className="flex-1 gap-1.5 border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]/80 hover:text-[hsl(var(--foreground))] text-xs">
                          <Zap className="w-3.5 h-3.5" /> Practice
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => navigate(`/flashcards/${quiz.id}`)}
                          className="px-2.5 border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]/80 hover:text-[hsl(var(--foreground))]" title="Flashcards">
                          <CreditCard className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--muted))]/50 flex items-center justify-center mb-4 border border-[hsl(var(--border))]">
              <BookOpen className="w-8 h-8 text-[hsl(var(--muted-foreground))]" />
            </div>
            <p className="font-semibold text-[hsl(var(--foreground))]">
              {search || selectedSubject !== 'All' ? 'No quizzes match your filters' : 'No active quizzes right now'}
            </p>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              {search || selectedSubject !== 'All'
                ? 'Try different keywords or clear the subject filter'
                : 'Check back later or sign in to create one'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Browse;
