import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, query, where, getDocs, getCountFromServer } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers,
  Zap,
  Sparkles,
  Trophy,
  Smartphone,
  GraduationCap,
  BookOpen,
  ArrowRight,
  ChevronRight,
  Sun,
  Moon
} from 'lucide-react';

const Landing = () => {
  const [code, setCode] = useState(Array(6).fill(''));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const refs = useRef([]);
  const navigate = useNavigate();
  const { currentUser, userRole } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [quizCount, setQuizCount] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const coll = collection(db, 'quizzes');
        const snapshot = await getCountFromServer(coll);
        setQuizCount(snapshot.data().count);
      } catch (err) {
        console.error('Error fetching total quiz count:', err);
        setQuizCount(120); // Graceful fallback
      }
    };
    fetchStats();
  }, []);

  const animatedCount = useCountUp(quizCount || 0, 1500);

  const handleChange = (i, val) => {
    const char = val.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(-1);
    const next = [...code];
    next[i] = char;
    setCode(next);
    setError('');
    if (char && i < 5) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = [...code];
      if (next[i]) {
        next[i] = '';
        setCode(next);
      } else if (i > 0) {
        next[i - 1] = '';
        setCode(next);
        refs.current[i - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
    else if (e.key === 'Enter') handleJoin();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    const next = Array(6).fill('');
    text.split('').forEach((c, i) => { next[i] = c; });
    setCode(next);
    refs.current[Math.min(text.length, 5)]?.focus();
  };

  const handleJoin = async () => {
    const fullCode = code.join('');
    if (fullCode.length < 6) {
      setError('Enter the full 6-character code.');
      setShake(true);
      setTimeout(() => setShake(false), 600);
      refs.current[code.findIndex(c => !c)]?.focus();
      return;
    }
    setLoading(true);
    setError('');
    try {
      const snap = await getDocs(
        query(collection(db, 'quizzes'), where('code', '==', fullCode), where('active', '==', true))
      );
      if (snap.empty) {
        setError("No active quiz found with that code. Double-check and try again.");
        setShake(true);
        setTimeout(() => setShake(false), 600);
        setCode(Array(6).fill(''));
        refs.current[0]?.focus();
        return;
      }
      // If authenticated student, use their account
      if (currentUser && userRole === 'student') {
        navigate(`/student/quiz/${snap.docs[0].id}`);
      } else {
        navigate(`/quiz/${snap.docs[0].id}`);
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const filled = code.filter(Boolean).length;
  const allFilled = filled === 6;

  // Features list
  const features = [
    { icon: Layers, label: '7 Question Types', desc: 'From MCQ to Match, Categorize, Reorder & Comprehension' },
    { icon: Zap, label: 'Real-time Results', desc: 'Instant feedback, scoring, and auto-grading' },
    { icon: Sparkles, label: 'Guest Mode', desc: 'Join and play quizzes instantly with a game PIN' },
    { icon: Trophy, label: 'Instant Leaderboards', desc: 'Earn points and compete live with speed bonuses' },
    { icon: Smartphone, label: 'Mobile Friendly', desc: 'Fully responsive UI optimized for student devices' },
    { icon: GraduationCap, label: 'Teacher Analytics', desc: 'Track class performance and customize grading' }
  ];

  // Motion variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.08 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100 } }
  };

  return (
    <div className="relative min-h-screen w-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] flex flex-col overflow-x-hidden">
      {/* Decorative background grid and blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] bg-[linear-gradient(to_right,hsl(var(--foreground))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground))_1px,transparent_1px)] bg-[size:3rem_3rem]" />
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/5 blur-[120px]" />
      </div>

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/80 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[hsl(var(--primary))] flex items-center justify-center text-white font-black text-sm">Q</div>
          <span className="text-[hsl(var(--foreground))] font-bold text-xl tracking-tight">Quizlike</span>
        </div>
        <div className="flex items-center gap-4">
          {currentUser ? (
            <button
              onClick={() => navigate(userRole === 'teacher' ? '/teacher/home' : '/student/dashboard')}
              className="bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary-hover))] text-white text-sm font-semibold px-4 py-2 rounded-full transition-all cursor-pointer shadow-sm"
            >
              My Dashboard →
            </button>
          ) : (
            <>
              <Link to="/browse" className="text-[hsl(var(--foreground))]/70 hover:text-[hsl(var(--foreground))] text-sm font-medium transition-colors">Browse Quizzes</Link>
              <Link to="/login" className="text-[hsl(var(--foreground))]/70 hover:text-[hsl(var(--foreground))] text-sm font-medium transition-colors">Sign In</Link>
              <Link to="/login?tab=signup" className="bg-[hsl(var(--primary))] text-white text-sm font-bold px-4 py-2 rounded-full hover:bg-[hsl(var(--primary-hover))] transition-all shadow-sm">
                Sign Up Free
              </Link>
            </>
          )}
          <button
            onClick={toggleTheme}
            className="w-9 h-9 rounded-xl bg-[hsl(var(--muted))] hover:bg-[hsl(var(--muted))]/80 text-[hsl(var(--foreground))] flex items-center justify-center transition-colors border border-[hsl(var(--border))] cursor-pointer"
            aria-label="Toggle dark mode"
          >
            {theme === 'dark' ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
          </button>
        </div>
      </nav>

      {/* Hero Content Wrapper */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-start px-4 py-16 gap-16">
        
        {/* Hero Entry Section */}
        <div className="flex flex-col items-center gap-8 w-full max-w-2xl">
          {/* Badge & Live Stats */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-center gap-2.5 bg-[hsl(var(--muted))]/50 border border-[hsl(var(--border))] rounded-full px-4.5 py-2 text-sm text-[hsl(var(--foreground))]/75 shadow-sm"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
            <span>Over <strong className="text-[hsl(var(--foreground))] font-extrabold">{animatedCount.toLocaleString()}</strong> quizzes created live!</span>
          </motion.div>

          {/* Headline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center"
          >
            <h1 className="text-5xl md:text-7xl font-black text-[hsl(var(--foreground))] leading-tight tracking-tight">
              Play. Learn.{' '}
              <span className="text-[hsl(var(--primary))]">
                Repeat.
              </span>
            </h1>
            <p className="mt-4 text-[hsl(var(--muted-foreground))] text-lg md:text-xl max-w-md mx-auto leading-relaxed">
              Enter your game code and join the quiz in seconds — no account needed.
            </p>
          </motion.div>

          {/* Code input section */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col items-center gap-5 w-full max-w-md bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl p-6 shadow-sm"
          >
            {/* The 6 boxes */}
            <motion.div
              animate={shake ? { x: [-8, 8, -8, 8, -4, 4, 0] } : {}}
              transition={{ duration: 0.5 }}
              className="flex gap-2 md:gap-3"
            >
              {code.map((char, i) => (
                <input
                  key={i}
                  ref={el => refs.current[i] = el}
                  type="text"
                  inputMode="text"
                  maxLength={2}
                  value={char}
                  onChange={e => handleChange(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  onPaste={handlePaste}
                  onFocus={e => e.target.select()}
                  className={`
                    w-12 h-14 md:w-14 md:h-16 text-center text-2xl md:text-3xl font-black rounded-xl
                    bg-[hsl(var(--muted))]/30 border-2 text-[hsl(var(--foreground))] outline-none select-all
                    transition-all duration-200 caret-transparent
                    ${char ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5 scale-105' : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50'}
                    focus:border-[hsl(var(--primary))] focus:bg-[hsl(var(--primary))]/5 focus:scale-105
                  `}
                />
              ))}
            </motion.div>

            {/* Progress dots */}
            <div className="flex gap-1.5">
              {code.map((c, i) => (
                <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${c ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted-foreground))]/30'}`} />
              ))}
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-red-500 text-sm font-medium text-center bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Join button */}
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={handleJoin}
              disabled={loading}
              className={`
                w-full py-4 rounded-xl font-black text-lg tracking-wide transition-all duration-300 cursor-pointer
                ${allFilled
                  ? 'bg-[hsl(var(--primary))] text-white shadow-sm hover:bg-[hsl(var(--primary-hover))]'
                  : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]/50 cursor-not-allowed border border-[hsl(var(--border))]'
                }
                disabled:opacity-60 disabled:cursor-not-allowed
              `}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Finding quiz...
                </span>
              ) : 'Join Quiz →'}
            </motion.button>

            {/* Divider */}
            <div className="flex items-center gap-4 w-full">
              <div className="flex-1 h-px bg-[hsl(var(--border))]" />
              <span className="text-[hsl(var(--muted-foreground))] text-xs font-medium">or login as</span>
              <div className="flex-1 h-px bg-[hsl(var(--border))]" />
            </div>

            {/* Teacher/Student Sign-In Cards */}
            <div className="flex flex-col sm:flex-row gap-4 w-full mt-1">
              {/* Teacher Card */}
              <motion.div
                whileHover={{ y: -4 }}
                className="flex-1 p-4.5 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10 text-left flex flex-col justify-between gap-4 transition-colors hover:bg-[hsl(var(--muted))]/30"
              >
                <div className="flex flex-col gap-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                    <GraduationCap className="w-4.5 h-4.5 text-amber-500" />
                  </div>
                  <h4 className="text-[hsl(var(--foreground))] font-bold text-sm">Teacher Portal</h4>
                  <p className="text-[hsl(var(--muted-foreground))] text-[11px] leading-relaxed">Create and manage live quizzes, classes, and view real-time analytics.</p>
                </div>
                <Link
                  to="/login?role=teacher"
                  className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold text-center transition-colors shadow-sm"
                >
                  Access Teacher →
                </Link>
              </motion.div>

              {/* Student Card */}
              <motion.div
                whileHover={{ y: -4 }}
                className="flex-1 p-4.5 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10 text-left flex flex-col justify-between gap-4 transition-colors hover:bg-[hsl(var(--muted))]/30"
              >
                <div className="flex flex-col gap-2">
                  <div className="w-9 h-9 rounded-xl bg-[hsl(var(--primary))]/10 flex items-center justify-center border border-[hsl(var(--primary))]/20">
                    <BookOpen className="w-4.5 h-4.5 text-[hsl(var(--primary))]" />
                  </div>
                  <h4 className="text-[hsl(var(--foreground))] font-bold text-sm">Student Portal</h4>
                  <p className="text-[hsl(var(--muted-foreground))] text-[11px] leading-relaxed">Join a class, play practice quizzes, and view results history.</p>
                </div>
                <Link
                  to="/login?role=student"
                  className="w-full py-2 rounded-xl bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary-hover))] text-white text-xs font-bold text-center transition-colors shadow-sm"
                >
                  Access Student →
                </Link>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* Animated Feature Strip */}
        <div className="w-full max-w-5xl px-6 flex flex-col items-center">
          <div className="w-12 h-0.5 bg-[hsl(var(--border))] mb-10" />
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-100px" }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full"
          >
            {features.map((feat, idx) => {
              const Icon = feat.icon;
              return (
                <motion.div
                  key={idx}
                  variants={itemVariants}
                  whileHover={{ y: -5, scale: 1.01, backgroundColor: 'var(--muted)', borderColor: 'hsl(var(--primary))' }}
                  className="p-6 rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] flex flex-col gap-3 transition-all duration-300 shadow-sm hover:shadow-md group"
                >
                  <div className="w-11 h-11 rounded-xl bg-[hsl(var(--primary))]/10 flex items-center justify-center border border-[hsl(var(--border))] group-hover:bg-[hsl(var(--primary))]/20 transition-colors">
                    <Icon className="w-5 h-5 text-[hsl(var(--primary))] group-hover:scale-105 transition-all" />
                  </div>
                  <h3 className="text-[hsl(var(--foreground))] font-bold text-base">{feat.label}</h3>
                  <p className="text-[hsl(var(--muted-foreground))] text-xs leading-relaxed">{feat.desc}</p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>

        {/* How It Works Section */}
        <div className="w-full max-w-5xl px-6 flex flex-col items-center">
          <div className="w-12 h-0.5 bg-[hsl(var(--border))] mb-12" />
          <h2 className="text-3xl font-black text-[hsl(var(--foreground))] mb-2 text-center">How It Works</h2>
          <p className="text-[hsl(var(--muted-foreground))] text-base mb-12 text-center">Getting started is simple, whether you are a teacher or student.</p>

          <div className="flex flex-col md:flex-row items-center justify-between gap-8 md:gap-4 w-full relative">
            {/* Steps */}
            {[
              { step: '01', title: 'Create Quiz', desc: 'Design custom quizzes with 7+ rich question types.', borderColor: 'border-t-amber-500' },
              { step: '02', title: 'Share Code', desc: 'Get a 6-digit game PIN to share with students instantly.', borderColor: 'border-t-blue-500' },
              { step: '03', title: 'Play & Learn', desc: 'Compete in real time, see stats, and track progress.', borderColor: 'border-t-emerald-500' }
            ].map((stepObj, idx) => (
              <React.Fragment key={idx}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.15 }}
                  className={`flex-1 max-w-xs p-6 rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] border-t-4 ${stepObj.borderColor} flex flex-col items-center gap-4 relative overflow-hidden group text-center shadow-sm`}
                >
                  <div className="w-11 h-11 rounded-full bg-[hsl(var(--muted))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] font-black flex items-center justify-center text-sm">
                    {stepObj.step}
                  </div>
                  <h3 className="text-[hsl(var(--foreground))] font-bold text-base">{stepObj.title}</h3>
                  <p className="text-[hsl(var(--muted-foreground))] text-xs leading-relaxed">{stepObj.desc}</p>
                </motion.div>

                {idx < 2 && (
                  <div className="hidden md:flex items-center text-[hsl(var(--muted-foreground))]/45 text-3xl font-black mx-2 select-none">
                    →
                  </div>
                )}
                {idx < 2 && (
                  <div className="flex md:hidden items-center text-[hsl(var(--muted-foreground))]/45 text-3xl font-black my-2 select-none">
                    ↓
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[hsl(var(--border))] py-8 text-center text-[hsl(var(--muted-foreground))]/70 text-xs">
        &copy; {new Date().getFullYear()} Quizlike. All rights reserved.
      </footer>
    </div>
  );
};

// Count up helper hook
const useCountUp = (target, duration = 1500) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!target) return;
    let start = 0;
    const end = parseInt(target, 10);
    if (isNaN(end) || end <= 0) {
      setCount(0);
      return;
    }
    const startTime = performance.now();
    let animationFrame;

    const animate = (currentTime) => {
      const elapsedTime = currentTime - startTime;
      const progress = Math.min(elapsedTime / duration, 1);
      const easedProgress = progress * (2 - progress); // Ease out quad
      const currentCount = Math.floor(easedProgress * end);
      setCount(currentCount);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        setCount(end);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [target, duration]);

  return count;
};

export default Landing;
