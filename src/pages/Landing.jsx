import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PiArrowRightBold, PiSpinnerGapBold } from 'react-icons/pi';
import PublicNav from '@/components/layout/PublicNav';
import PublicFooter from '@/components/layout/PublicFooter';
import HeroDemo from '@/components/landing/HeroDemo';
import LevelDemo from '@/components/landing/LevelDemo';
import LiveOption from '@/components/live/LiveOption';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { findActiveQuizByCode } from '@/utils/quizLookup';
import { rise, stagger, shake } from '@/lib/motion';

/** A block that eases in the first time it scrolls into view. */
const Reveal = ({ children, className = '' }) => (
  <motion.div
    initial={{ opacity: 0, y: 24 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-12% 0px' }}
    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    className={className}
  >
    {children}
  </motion.div>
);

const FACTS = [
  ['Question types', 'Multiple choice, true or false, fill in the blank, match, reorder, categorize and comprehension.'],
  ['Pictures, audio and video', 'Put media in a question or in an answer. Players see it on their own screen.'],
  ['Live games', 'Share a PIN or a QR code. Choose streak bonuses, power-ups and shuffle in the lobby.'],
  ['Results that explain', 'See which questions missed, who needs help, and export it all to a spreadsheet.'],
];

export default function Landing() {
  const navigate = useNavigate();
  const { currentUser, userRole } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const input = useRef(null);

  const join = async (e) => {
    e.preventDefault();
    if (code.length < 6) {
      setError('A quiz code has six letters or numbers.');
      setShakeKey((k) => k + 1);
      input.current?.focus();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const id = await findActiveQuizByCode(code);
      if (!id) {
        setError('No open quiz has that code. Check it and try again.');
        setShakeKey((k) => k + 1);
        return;
      }
      navigate(currentUser && userRole === 'student' ? `/student/quiz/${id}` : `/quiz/${id}`);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <PublicNav />

      <main id="main-content" tabIndex={-1} className="outline-none">
        {/* Hero: one idea, one field. */}
        <section className="relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute -left-40 -top-48 h-[34rem] w-[34rem] rounded-full bg-[hsl(var(--brand))]/[0.07] blur-3xl" />
          <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-16 px-5 pb-24 pt-16 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:pb-32 lg:pt-24">
            <motion.div variants={stagger(0.07)} initial="hidden" animate="show">
              <motion.p variants={rise} className="eyebrow">Quizzes with a score to beat</motion.p>
              <motion.h1 variants={rise} className="text-hero mt-5 text-[clamp(3.25rem,8vw,6.25rem)] leading-[0.98]">
                Quizzes you actually want to finish.
              </motion.h1>
              <motion.p variants={rise} className="mt-6 max-w-md text-lg text-[hsl(var(--muted-foreground))]">
                Earn XP, keep a streak and climb the board. Join with a code, no account needed.
              </motion.p>

              <motion.form variants={rise} onSubmit={join} className="mt-10 max-w-md" noValidate>
                <label htmlFor="join-code" className="eyebrow">Quiz code</label>
                <motion.div key={shakeKey} animate={shakeKey ? shake : undefined} className="mt-2 flex items-end gap-3">
                  <input
                    id="join-code"
                    ref={input}
                    value={code}
                    onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); setError(''); }}
                    placeholder="AB12CD"
                    maxLength={6}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    aria-invalid={!!error}
                    aria-describedby={error ? 'join-error' : undefined}
                    className="min-w-0 flex-1 border-0 border-b-2 border-[hsl(var(--input))] bg-transparent pb-2 font-mono text-3xl tracking-[0.2em] text-[hsl(var(--foreground))] outline-none transition-colors placeholder:tracking-[0.2em] placeholder:text-[hsl(var(--muted-foreground))]/35 focus:border-[hsl(var(--ink))]"
                  />
                  <Button type="submit" variant="brand" size="lg" disabled={busy}>
                    {busy && <PiSpinnerGapBold className="animate-spin" />}Join<PiArrowRightBold />
                  </Button>
                </motion.div>
                {error && <p id="join-error" role="alert" className="mt-3 text-sm text-[hsl(var(--destructive))]">{error}</p>}
              </motion.form>

              <motion.p variants={rise} className="mt-6 text-sm text-[hsl(var(--muted-foreground))]">
                Got a live PIN? <Link to="/play" className="font-medium text-[hsl(var(--foreground))] underline underline-offset-4">Join the game</Link>
                <span className="mx-2 text-[hsl(var(--border))]">|</span>
                <Link to="/browse" className="font-medium text-[hsl(var(--foreground))] underline underline-offset-4">Browse public quizzes</Link>
              </motion.p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}>
              <HeroDemo />
            </motion.div>
          </div>
        </section>

        {/* Three things that make it feel like a game. Rows, not cards. */}
        <section className="border-t border-[hsl(var(--border))]">
          <div className="mx-auto max-w-6xl divide-y divide-[hsl(var(--border))] px-5 sm:px-8">
            <Reveal className="grid grid-cols-1 items-center gap-10 py-20 md:grid-cols-2 md:gap-20 md:py-28">
              <div>
                <p className="eyebrow">01 &nbsp; Play together</p>
                <h2 className="text-hero mt-4 text-5xl leading-[1.02] sm:text-6xl">Everyone on the same countdown.</h2>
                <p className="mt-5 max-w-md text-[hsl(var(--muted-foreground))]">
                  A shared 3, 2, 1 starts every question on every screen at once. Fast right answers score more, and each answer in a row adds up to 50%.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5" aria-hidden="true">
                {['Faster', 'Streaks', '50/50', 'Double'].map((t, i) => <LiveOption key={t} index={i} state="display">{t}</LiveOption>)}
              </div>
            </Reveal>

            <Reveal className="grid grid-cols-1 items-center gap-10 py-20 md:grid-cols-2 md:gap-20 md:py-28">
              <div className="md:order-2">
                <p className="eyebrow">02 &nbsp; Level up</p>
                <h2 className="text-hero mt-4 text-5xl leading-[1.02] sm:text-6xl">Every quiz moves a bar.</h2>
                <p className="mt-5 max-w-md text-[hsl(var(--muted-foreground))]">
                  Quizzes earn XP, XP becomes levels, and a daily streak keeps you coming back. There are badges to chase too. Nothing to set up: it all comes from your results.
                </p>
              </div>
              <div className="md:order-1"><LevelDemo /></div>
            </Reveal>

            <Reveal className="grid grid-cols-1 items-start gap-10 py-20 md:grid-cols-2 md:gap-20 md:py-28">
              <div>
                <p className="eyebrow">03 &nbsp; Teach</p>
                <h2 className="text-hero mt-4 text-5xl leading-[1.02] sm:text-6xl">Build in minutes, run it anywhere.</h2>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button size="lg" onClick={() => navigate('/login?role=teacher')}>Start teaching<PiArrowRightBold /></Button>
                </div>
              </div>
              <dl className="divide-y divide-[hsl(var(--border))] border-y border-[hsl(var(--border))]">
                {FACTS.map(([term, text]) => (
                  <div key={term} className="py-5">
                    <dt className="text-base font-medium">{term}</dt>
                    <dd className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{text}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </section>

        {/* The close. */}
        <section className="border-t border-[hsl(var(--border))]">
          <Reveal className="mx-auto max-w-6xl px-5 py-24 text-center sm:px-8 md:py-32">
            <h2 className="text-hero mx-auto max-w-3xl text-5xl leading-[1.02] sm:text-7xl">Ready when you are.</h2>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Button size="xl" onClick={() => navigate('/login?tab=signup&role=student')}>Create a free account</Button>
              <Button size="xl" variant="outline" onClick={() => navigate('/browse')}>Try a quiz first</Button>
            </div>
          </Reveal>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
