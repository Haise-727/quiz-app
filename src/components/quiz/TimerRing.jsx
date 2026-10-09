import { motion } from 'framer-motion';

/**
 * A ring that drains as the question's time runs out, with the seconds in the middle.
 * It turns red and the number gives a small beat in the last ten seconds.
 * The ring moves once a second with a linear transition, so it looks continuous.
 */
export default function TimerRing({ timeLeft, total, size = 44 }) {
  const r = 18;
  const circumference = 2 * Math.PI * r;
  const fraction = total > 0 ? Math.max(0, Math.min(1, timeLeft / total)) : 0;
  const urgent = timeLeft != null && timeLeft <= 10;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role="timer" aria-label={`${timeLeft} seconds left`}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="3" className="stroke-[hsl(var(--border))]" />
        <circle
          cx="22" cy="22" r={r} fill="none" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - fraction)}
          className={urgent ? 'stroke-[hsl(var(--destructive))]' : 'stroke-[hsl(var(--brand))]'}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
        />
      </svg>
      <motion.span
        key={urgent ? timeLeft : 'steady'}
        initial={urgent ? { scale: 1.25 } : false}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 600, damping: 22 }}
        className={`tabular font-mono text-xs font-medium ${urgent ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--foreground))]'}`}
      >
        {timeLeft}
      </motion.span>
    </div>
  );
}
