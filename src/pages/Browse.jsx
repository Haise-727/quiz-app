import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, BookOpen, Clock, PlayCircle, Hash, ChevronRight, Zap, CreditCard } from 'lucide-react';

const Browse = () => {
  const navigate = useNavigate();
  const { currentUser, userRole } = useAuth();

  const [quizzes, setQuizzes]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');

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

  const filtered = quizzes.filter(q =>
    !search ||
    q.title?.toLowerCase().includes(search.toLowerCase()) ||
    q.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen w-screen bg-[#0d0d20] text-white overflow-x-hidden">
      {/* Subtle blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-60 -left-60 w-[500px] h-[500px] rounded-full bg-[#4776e6]/10 blur-[120px]" />
        <div className="absolute top-1/2 -right-60 w-[500px] h-[500px] rounded-full bg-[#8b5cf6]/10 blur-[120px]" />
      </div>

      {/* Nav */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5 border-b border-white/5">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#4776e6] to-[#8b5cf6] flex items-center justify-center font-black text-sm shadow-lg">Q</div>
          <span className="font-bold text-lg tracking-tight">Quizlike</span>
        </Link>

        <div className="flex items-center gap-3">
          {currentUser ? (
            <Button size="sm" onClick={() => navigate(userRole === 'teacher' ? '/teacher/home' : '/student/dashboard')}
              className="bg-white/10 hover:bg-white/20 border border-white/10 text-white gap-1.5">
              Dashboard <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button size="sm" onClick={() => navigate('/login')}
              className="bg-gradient-to-r from-[#4776e6] to-[#8b5cf6] text-white border-0 hover:opacity-90">
              Sign In
            </Button>
          )}
        </div>
      </header>

      <div className="relative z-10 max-w-6xl mx-auto px-6 md:px-12 py-12">

        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-black mb-3">
            Browse <span className="bg-gradient-to-r from-[#4776e6] to-[#8b5cf6] bg-clip-text text-transparent">Live Quizzes</span>
          </h1>
          <p className="text-white/50 text-lg">All active quizzes — jump in and start learning.</p>
        </motion.div>

        {/* Search */}
        <div className="relative mb-8 max-w-xl mx-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <Input
            placeholder="Search quizzes by title or description…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-11 bg-white/5 border-white/10 text-white placeholder-white/30 focus-visible:border-[#4776e6] focus-visible:ring-[#4776e6]/20 h-12 rounded-2xl"
          />
        </div>

        {/* Count */}
        <div className="flex items-center gap-3 mb-6">
          <p className="text-white/40 text-sm">
            {loading ? 'Loading…' : `${filtered.length} active quiz${filtered.length !== 1 ? 'zes' : ''}`}
          </p>
          {search && (
            <button onClick={() => setSearch('')} className="text-white/40 hover:text-white/70 text-xs underline transition-colors">
              Clear
            </button>
          )}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map((quiz, i) => (
              <motion.div
                key={quiz.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Card className="border border-white/10 bg-white/5 backdrop-blur hover:bg-white/8 hover:-translate-y-0.5 hover:border-white/20 transition-all duration-200 cursor-pointer group overflow-hidden"
                  onClick={() => handleJoin(quiz.id)}>
                  <div className="h-1 bg-gradient-to-r from-[#4776e6] to-[#8b5cf6]" />
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <h3 className="font-bold text-white leading-snug group-hover:text-[#a78bfa] transition-colors">
                        {quiz.title}
                      </h3>
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30 shrink-0 text-xs">Active</Badge>
                    </div>

                    {quiz.description && (
                      <p className="text-white/40 text-xs leading-relaxed line-clamp-2 mb-4">{quiz.description}</p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-white/40 mb-4">
                      <span className="flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5" /> {quiz.questions?.length || 0} questions
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> {quiz.totalPoints || 0} pts
                      </span>
                    </div>

                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 bg-white/10 rounded-lg px-2.5 py-1">
                        <Hash className="w-3 h-3 text-white/30" />
                        <span className="font-mono font-bold text-[#a78bfa] tracking-widest text-sm">{quiz.code}</span>
                      </div>
                    </div>
                    <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                      <Button size="sm" onClick={() => handleJoin(quiz.id)}
                        className="flex-1 gap-1.5 bg-gradient-to-r from-[#4776e6] to-[#8b5cf6] text-white border-0 hover:opacity-90 text-xs">
                        <PlayCircle className="w-3.5 h-3.5" /> Play
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/practice/${quiz.id}`)}
                        className="flex-1 gap-1.5 border-white/15 text-white/60 hover:bg-white/10 hover:text-white text-xs">
                        <Zap className="w-3.5 h-3.5" /> Practice
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/flashcards/${quiz.id}`)}
                        className="px-2.5 border-white/15 text-white/60 hover:bg-white/10 hover:text-white" title="Flashcards">
                        <CreditCard className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
              <BookOpen className="w-8 h-8 text-white/20" />
            </div>
            <p className="font-semibold text-white/60">
              {search ? 'No quizzes match your search' : 'No active quizzes right now'}
            </p>
            <p className="text-sm text-white/30 mt-1">
              {search ? 'Try different keywords' : 'Check back later or sign in to create one'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Browse;
