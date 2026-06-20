import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowLeft, PlayCircle, Search, Hash, BookOpen, Clock, ChevronRight, LogOut, School, User } from 'lucide-react';

const AttendQuiz = () => {
  const navigate = useNavigate();
  const { currentUser, displayName, signOut: ctxSignOut, switchRole } = useAuth();

  const [quizCode, setQuizCode] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [quizzes, setQuizzes] = useState([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);

  useEffect(() => {
    const fetchActive = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'quizzes'), where('active', '==', true)));
        setQuizzes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch { toast.error('Could not load available quizzes.'); }
      finally { setLoadingQuizzes(false); }
    };
    fetchActive();
  }, []);

  const handleJoin = async () => {
    const code = quizCode.trim().toUpperCase();
    if (!code) { setError('Please enter a quiz code.'); return; }
    setError(''); setJoining(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'quizzes'), where('code', '==', code), where('active', '==', true))
      );
      if (snap.empty) { setError('No active quiz found with that code.'); return; }
      navigate(`/student/quiz/${snap.docs[0].id}`);
    } catch { setError('Failed to join. Please try again.'); }
    finally { setJoining(false); }
  };

  const handleSignOut = async () => { await ctxSignOut(); navigate('/login'); };
  const handleSwitchRole = async () => { try { await switchRole('teacher'); } catch { toast.error('Failed to switch role.'); } };

  const initials = (displayName || currentUser?.email || 'S').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const filtered = quizzes.filter(q =>
    q.title?.toLowerCase().includes(search.toLowerCase()) ||
    q.description?.toLowerCase().includes(search.toLowerCase())
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
        <button
          onClick={() => navigate('/student/dashboard')}
          className="flex items-center gap-2 text-[hsl(var(--foreground))]/70 hover:text-[hsl(var(--foreground))] text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </button>

        <div className="flex items-center gap-3">
          <Badge variant="outline" className="border-[hsl(var(--border))] text-[hsl(var(--foreground))] bg-[hsl(var(--muted))]/50 hidden md:flex">
            Student
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Avatar className="w-9 h-9 border border-[hsl(var(--border))] cursor-pointer hover:border-[hsl(var(--primary))] transition-colors">
                <AvatarFallback className="bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] font-bold text-sm">{initials}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="font-normal">
                <p className="font-semibold text-[hsl(var(--foreground))]">{displayName || currentUser?.email?.split('@')[0] || 'Student'}</p>
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
          <h1 className="text-3xl md:text-4xl font-black text-[hsl(var(--foreground))]">Join a Quiz</h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1">Enter a code or pick from the list below.</p>
        </motion.div>
      </div>

      {/* Main */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.3, delay: 0.05 }}
        className="relative z-10 mx-4 md:mx-10 mb-10 rounded-2xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] shadow-sm overflow-hidden"
      >
        <div className="p-6 md:p-8 flex flex-col gap-8">

          {/* Code join */}
          <section>
            <Card className="border border-[hsl(var(--border))] shadow-sm overflow-hidden bg-[hsl(var(--card))] rounded-2xl">
              <div className="h-1.5 bg-[hsl(var(--primary))]" />
              <CardContent className="pt-6 pb-7">
                <div className="max-w-md mx-auto text-center">
                  <div className="w-12 h-12 rounded-2xl bg-[hsl(var(--primary))]/10 flex items-center justify-center mx-auto mb-4">
                    <Hash className="w-6 h-6 text-[hsl(var(--primary))]" />
                  </div>
                  <h2 className="text-xl font-bold text-[hsl(var(--foreground))] mb-1">Enter Quiz Code</h2>
                  <p className="text-sm text-[hsl(var(--muted-foreground))] mb-5">Ask your teacher for the 6-character code</p>

                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. AB1234"
                      value={quizCode}
                      onChange={e => { setQuizCode(e.target.value.toUpperCase()); setError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleJoin()}
                      maxLength={6}
                      className="text-center text-lg font-mono tracking-widest font-bold uppercase focus-visible:ring-[hsl(var(--primary))]/30 focus-visible:border-[hsl(var(--primary))]"
                    />
                    <Button
                      onClick={handleJoin}
                      disabled={joining}
                      variant="default"
                      className="px-6 gap-2 shrink-0 text-white bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary-hover))]"
                    >
                      <PlayCircle className="w-4 h-4" />
                      {joining ? 'Joining…' : 'Join'}
                    </Button>
                  </div>

                  {error && (
                    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                      className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">
                      {error}
                    </motion.p>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Available quizzes */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">Available Quizzes</h2>
              <Badge variant="secondary">{filtered.length} active</Badge>
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              <Input
                placeholder="Search quizzes…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {loadingQuizzes ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-[hsl(var(--border))] border-t-[hsl(var(--primary))] rounded-full animate-spin" />
              </div>
            ) : filtered.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((quiz, i) => (
                  <motion.div
                    key={quiz.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card className="border border-[hsl(var(--border))] shadow-sm hover:shadow-md bg-[hsl(var(--card))] transition-all hover:-translate-y-0.5 overflow-hidden rounded-2xl">
                      <div className="h-1 bg-[hsl(var(--primary))]" />
                      <CardContent className="pt-4 pb-5">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <h3 className="font-bold text-[hsl(var(--foreground))] leading-snug">{quiz.title}</h3>
                          <Badge variant="success" className="shrink-0 text-xs">Active</Badge>
                        </div>

                        {quiz.description && (
                          <p className="text-xs text-[hsl(var(--muted-foreground))] line-clamp-2 mb-3">{quiz.description}</p>
                        )}

                        <div className="flex items-center gap-4 text-xs text-[hsl(var(--muted-foreground))] mb-4">
                          <span className="flex items-center gap-1">
                            <BookOpen className="w-3.5 h-3.5" /> {quiz.questions?.length || 0} Qs
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> {quiz.totalPoints || 0} pts
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg px-3 py-1.5">
                            <span className="font-mono font-bold text-[hsl(var(--primary))] tracking-widest text-sm">{quiz.code}</span>
                          </div>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => navigate(`/student/quiz/${quiz.id}`)}
                            className="gap-1.5 text-white bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary-hover))]"
                          >
                            Start <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--muted))] flex items-center justify-center mb-4">
                  <BookOpen className="w-8 h-8 text-[hsl(var(--muted-foreground))]" />
                </div>
                <p className="font-semibold text-[hsl(var(--foreground))]">
                  {search ? 'No quizzes match your search' : 'No active quizzes right now'}
                </p>
                <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                  {search ? 'Try a different search term' : 'Check back later or enter a code above'}
                </p>
              </div>
            )}
          </section>
        </div>
      </motion.div>
    </div>
  );
};

export default AttendQuiz;
