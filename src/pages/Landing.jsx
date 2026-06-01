import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

const Landing = () => {
  const [code, setCode] = useState(Array(6).fill(''));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const refs = useRef([]);
  const navigate = useNavigate();
  const { currentUser, userRole } = useAuth();

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
      if (next[i]) { next[i] = ''; setCode(next); }
      else if (i > 0) { next[i - 1] = ''; setCode(next); refs.current[i - 1]?.focus(); }
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

  return (
    <div className="relative min-h-screen w-screen overflow-hidden bg-[#0d0d20] flex flex-col">

      {/* Decorative background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[#4776e6]/20 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-[#8b5cf6]/20 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-[#6c63ff]/5 blur-[100px]" />
      </div>

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#4776e6] to-[#8b5cf6] flex items-center justify-center text-white font-black text-sm">Q</div>
          <span className="text-white font-bold text-xl tracking-tight">Quizlike</span>
        </div>
        <div className="flex items-center gap-3">
          {currentUser ? (
            <button
              onClick={() => navigate(userRole === 'teacher' ? '/teacher/home' : '/student/dashboard')}
              className="bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-4 py-2 rounded-full border border-white/10 transition-all"
            >
              My Dashboard →
            </button>
          ) : (
            <>
              <Link to="/browse" className="text-white/70 hover:text-white text-sm font-medium transition-colors">Browse Quizzes</Link>
              <Link to="/login" className="text-white/70 hover:text-white text-sm font-medium transition-colors">Sign In</Link>
              <Link to="/login?tab=signup" className="bg-white text-[#0d0d20] text-sm font-bold px-4 py-2 rounded-full hover:bg-white/90 transition-all">
                Sign Up Free
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pb-20 gap-10">

        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-sm text-white/60"
        >
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          Live quizzes happening now
        </motion.div>

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center"
        >
          <h1 className="text-5xl md:text-7xl font-black text-white leading-tight tracking-tight">
            Play. Learn.{' '}
            <span className="bg-gradient-to-r from-[#4776e6] via-[#8b5cf6] to-[#ec4899] bg-clip-text text-transparent">
              Repeat.
            </span>
          </h1>
          <p className="mt-4 text-white/50 text-lg md:text-xl max-w-md mx-auto leading-relaxed">
            Enter your game code and join the quiz in seconds — no account needed.
          </p>
        </motion.div>

        {/* Code input section */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col items-center gap-5 w-full max-w-md"
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
                  bg-white/5 border-2 text-white outline-none select-all
                  transition-all duration-200 caret-transparent
                  ${char ? 'border-[#6c63ff] bg-[#6c63ff]/10 scale-105' : 'border-white/20 hover:border-white/40'}
                  focus:border-[#6c63ff] focus:bg-[#6c63ff]/10 focus:scale-105
                `}
              />
            ))}
          </motion.div>

          {/* Progress dots */}
          <div className="flex gap-1.5">
            {code.map((c, i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${c ? 'bg-[#6c63ff]' : 'bg-white/20'}`} />
            ))}
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-red-400 text-sm font-medium text-center"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Join button */}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleJoin}
            disabled={loading}
            className={`
              w-full py-4 rounded-2xl font-black text-lg tracking-wide transition-all duration-300
              ${allFilled
                ? 'bg-gradient-to-r from-[#4776e6] to-[#8b5cf6] text-white shadow-[0_8px_30px_rgba(107,99,255,0.4)] hover:shadow-[0_12px_40px_rgba(107,99,255,0.5)]'
                : 'bg-white/10 text-white/40 cursor-not-allowed'
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
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-white/30 text-xs font-medium">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Auth links */}
          <div className="flex gap-3 w-full">
            <Link
              to="/login?role=teacher"
              className="flex-1 py-3 rounded-xl border border-white/10 bg-white/5 text-white/70 text-sm font-semibold text-center hover:bg-white/10 hover:text-white transition-all hover:border-[#f5af19]/50"
            >
              🏫 Teacher Login
            </Link>
            <Link
              to="/login?role=student"
              className="flex-1 py-3 rounded-xl border border-white/10 bg-white/5 text-white/70 text-sm font-semibold text-center hover:bg-white/10 hover:text-white transition-all hover:border-[#4776e6]/50"
            >
              🎓 Student Login
            </Link>
          </div>
        </motion.div>
      </div>

      {/* Bottom feature strip */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="relative z-10 border-t border-white/5 px-8 py-6"
      >
        <div className="max-w-3xl mx-auto grid grid-cols-3 gap-6 text-center">
          {[
            { icon: '⚡', label: 'Instant Join', desc: 'No sign-up required' },
            { icon: '🏆', label: 'Leaderboards', desc: 'Compete in real time' },
            { icon: '📊', label: 'Analytics', desc: 'Track every answer' },
          ].map(({ icon, label, desc }) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <span className="text-2xl">{icon}</span>
              <span className="text-white/70 text-sm font-semibold">{label}</span>
              <span className="text-white/30 text-xs">{desc}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default Landing;
