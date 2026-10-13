import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { serverNow } from '@/api/live';
import { playTick } from '@/utils/sounds';

/**
 * The "3, 2, 1" before every question. It counts to a moment in SERVER time that every
 * screen was given, so the host's projector and every phone hit zero together even if their
 * own clocks disagree. Each number lands with a springy pop.
 *
 * @param startsAt  server time in ms when the question opens
 * @param label     a line above, such as "Question 3 of 10"
 * @param hint      a line below, such as "Multiple choice, 20 seconds"
 * @param pausedAt  server time the host paused at: the number holds still until the host resumes
 */
export default function Countdown({ startsAt, label, hint, size = 'md', pausedAt = null }) {
  const [n, setN] = useState(() => Math.max(0, Math.ceil((startsAt - (pausedAt || serverNow())) / 1000)));

  useEffect(() => {
    if (pausedAt) { setN(Math.max(0, Math.ceil((startsAt - pausedAt) / 1000))); return undefined; }
    let last = null;
    const id = setInterval(() => {
      const next = Math.max(0, Math.ceil((startsAt - serverNow()) / 1000));
      if (next !== last) { last = next; setN(next); if (next > 0) playTick(); }
    }, 80);
    return () => clearInterval(id);
  }, [startsAt, pausedAt]);

  return (
    <div className="flex flex-col items-center text-center" role="timer" aria-live="polite" aria-label={`Starts in ${n}`}>
      {label && <p className="eyebrow">{label}</p>}
      <div className={`relative grid place-items-center ${size === 'xl' ? 'h-72 w-72' : 'h-52 w-52'}`}>
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full border-2 border-[hsl(var(--brand))]/30"
          key={n}
          initial={{ scale: 0.7, opacity: 0.9 }}
          animate={{ scale: 1.25, opacity: 0 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
        <AnimatePresence mode="popLayout">
          <motion.span
            key={n}
            initial={{ scale: 0.4, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 1.5, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 16 }}
            className={`text-hero tabular leading-none text-[hsl(var(--foreground))] ${size === 'xl' ? 'text-[11rem]' : 'text-[8rem]'}`}
          >
            {n > 0 ? n : 'Go'}
          </motion.span>
        </AnimatePresence>
      </div>
      {hint && <p className="mt-2 text-[hsl(var(--muted-foreground))]">{hint}</p>}
    </div>
  );
}
