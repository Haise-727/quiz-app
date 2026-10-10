import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { serverNow } from '@/utils/liveSession';
import { playTick } from '@/utils/sounds';

/**
 * The question clock: the seconds left and a bar that drains. It runs on its own state, so
 * the ticking never re-renders the answer board around it (which made dragging stutter).
 * The bar is one linear animation to zero rather than something redrawn every tick, and it
 * starts over if the host pushes the deadline later, because `endsAt` is its key.
 *
 * @param endsAt   server time in ms when the clock reaches zero
 * @param limitMs  the question's full time limit, which is what a full bar means
 * @param onZero   called once when it hits zero
 * @param tick     play the soft tick in the last ten seconds
 */
export default function LiveClock({ endsAt, limitMs, running = true, onZero, tick = true, big = false }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((endsAt - serverNow()) / 1000)));
  const zero = useRef(onZero);
  zero.current = onZero;

  useEffect(() => {
    if (!running) return undefined;
    let fired = false;
    let shown = null;
    const step = () => {
      const ms = endsAt - serverNow();
      const secs = Math.max(0, Math.ceil(ms / 1000));
      if (secs !== shown) {
        shown = secs;
        setLeft(secs);
        if (tick && secs > 0 && secs <= 10) playTick();
      }
      if (ms <= 0 && !fired) { fired = true; zero.current?.(); }
    };
    step();
    const id = setInterval(step, 200);
    return () => clearInterval(id);
  }, [endsAt, running, tick]);

  const remainingMs = Math.max(0, endsAt - serverNow());
  const fraction = Math.max(0, Math.min(1, remainingMs / limitMs));
  const urgent = left <= 5;

  return (
    <div role="timer" aria-label={`${left} seconds left`} className="w-full">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="eyebrow">Time</span>
        <span className={`tabular font-mono font-medium ${big ? 'text-3xl' : 'text-lg'} ${urgent ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--foreground))]'}`}>{left}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
        <motion.div
          key={endsAt}
          initial={{ scaleX: fraction }}
          animate={{ scaleX: running ? 0 : fraction }}
          transition={{ duration: running ? remainingMs / 1000 : 0, ease: 'linear' }}
          style={{ originX: 0 }}
          className={`h-full w-full rounded-full ${urgent ? 'bg-[hsl(var(--destructive))]' : 'bg-[hsl(var(--brand))]'}`}
        />
      </div>
    </div>
  );
}
