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
    <div className="min-h-screen w-screen bg-gradient-to-br from-[#3a1c71] via-[#2d3a9e] to-[#4776e6] relative overflow-x-hidden">
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 80% 20%,rgba(255,255,255,0.05) 0%,transparent 60%)' }} />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5">
        <button
          onClick={() => navigate('/student/dashboard')}
          className="flex items-center gap-2 text-white/70 hover:text-white text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </button>

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
                <p className="font-semibold">{displayName || currentUser?.email?.split('@')[0] || 'Student'}</p>
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
          <h1 className="text-3xl md:text-4xl font-black text-white drop-shadow">Join a Quiz 🎮</h1>
          <p className="text-white/60 mt-1">Enter a code or pick from the list below.</p>
        </motion.div>
      </div>

      {/* Main */}
      <div className="relative z-10 mx-4 md:mx-10 mb-10 rounded-3xl bg-[#f8fafc] shadow-2xl overflow-hidden">
        <div className="p-6 md:p-8 flex flex-col gap-8">

          {/* Code join */}
          <section>
            <Card className="border-0 shadow-md overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-[#3a1c71] to-[#4776e6]" />
              <CardContent className="pt-6 pb-7">
                <div className="max-w-md mx-auto text-center">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#3a1c71] to-[#4776e6] flex items-center justify-center mx-auto mb-4">
                    <Hash className="w-6 h-6 text-white" />
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
                      className="text-center text-lg font-mono tracking-widest font-bold uppercase"
                    />
                    <Button
                      onClick={handleJoin}
                      disabled={joining}
                      variant="student"
                      className="px-6 gap-2 shrink-0"
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
                <div className="w-8 h-8 border-4 border-[#4776e6]/20 border-t-[#4776e6] rounded-full animate-spin" />
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
                    <Card className="border-0 shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 overflow-hidden">
                      <div className="h-1 bg-gradient-to-r from-[#3a1c71] to-[#4776e6]" />
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
                          <div className="bg-[hsl(var(--muted))] rounded-lg px-3 py-1.5">
                            <span className="font-mono font-black text-[#4776e6] tracking-widest text-sm">{quiz.code}</span>
                          </div>
                          <Button
                            size="sm"
                            variant="student"
                            onClick={() => navigate(`/student/quiz/${quiz.id}`)}
                            className="gap-1.5"
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
      </div>
    </div>
  );
};

export default AttendQuiz;
