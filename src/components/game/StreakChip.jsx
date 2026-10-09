import { motion } from 'framer-motion';
import { PiFlameFill } from 'react-icons/pi';
import { TINT } from './icons';

/**
 * Days in a row. Lit and gently flickering once you have quizzed today,
 * muted when the streak is alive but today is still open.
 */
export default function StreakChip({ days, doneToday = false, className = '' }) {
  const alive = days > 0;
  const lit = alive && doneToday;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium tabular ${lit ? TINT.yellow : TINT.neutral} ${className}`}
      title={alive ? (doneToday ? 'You have quizzed today' : 'Quiz today to keep your streak') : 'Finish a quiz to start a streak'}
    >
      <motion.span
        className={`inline-flex ${lit ? 'text-[hsl(var(--flame))]' : 'opacity-60'}`}
        animate={lit ? { scale: [1, 1.18, 1], rotate: [0, -6, 4, 0] } : {}}
        transition={lit ? { duration: 1.6, repeat: Infinity, repeatDelay: 1.2 } : {}}
      >
        <PiFlameFill className="h-3.5 w-3.5" />
      </motion.span>
      {days} {days === 1 ? 'day' : 'days'}
    </span>
  );
}
