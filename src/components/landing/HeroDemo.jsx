import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PiFlameFill, PiLightningFill } from 'react-icons/pi';
import LiveOption from '@/components/live/LiveOption';
import { ease, springPop } from '@/lib/motion';

const OPTIONS = ['Mercury', 'Venus', 'Mars', 'Neptune'];
const RIGHT = 0;

/**
 * A looping picture of what a live question feels like: the clock drains, an answer is
 * picked, the right one lights up and the points land. It is the real answer tile used in
 * the game, so what visitors see here is what they get. Decoration only, hidden from
 * screen readers, and it holds still for anyone who asks their system for less motion.
 */
export default function HeroDemo() {
  // 0 waiting, 1 picked, 2 revealed. Each lap takes about 5 seconds.
  const [phase, setPhase] = useState(0);
  const [lap, setLap] = useState(0);

  useEffect(() => {
    const steps = [1500, 800, 2600];
    const t = setTimeout(() => {
      if (phase === 2) { setPhase(0); setLap((n) => n + 1); } else setPhase(phase + 1);
    }, steps[phase]);
    return () => clearTimeout(t);
  }, [phase]);

  const stateOf = (i) => {
    if (phase === 0) return 'idle';
    if (phase === 1) return i === RIGHT ? 'locked' : 'unpicked';
    return i === RIGHT ? 'correct' : 'dim';
  };

  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-md select-none">
      <div className="mb-5 flex items-center justify-between">
        <span className="eyebrow">Question 4 of 10</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--tint-yellow))] px-2.5 py-1 text-xs font-medium tabular text-[hsl(var(--tint-yellow-fg))]">
          <PiFlameFill className="h-3.5 w-3.5 text-[hsl(var(--flame))]" /> 3 in a row
        </span>
      </div>

      <p className="text-hero text-3xl leading-tight text-[hsl(var(--foreground))] sm:text-4xl">Which planet has the shortest year?</p>

      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
        <motion.div
          key={lap}
          className="h-full origin-left rounded-full bg-[hsl(var(--brand))]"
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0.35 }}
          transition={{ duration: 1.5, ease: 'linear' }}
        />
      </div>

      <div className="mt-5 grid gap-2.5">
        {OPTIONS.map((text, i) => <LiveOption key={text} index={i} state={stateOf(i)}>{text}</LiveOption>)}
      </div>

      <div className="pointer-events-none absolute -bottom-5 right-3">
        <AnimatePresence>
          {phase === 2 && (
            <motion.div
              key={`pts-${lap}`}
              initial={{ opacity: 0, y: 14, scale: 0.7 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, transition: { duration: 0.25, ease } }}
              transition={springPop}
              className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--ink))] px-3.5 py-1.5 text-sm font-medium tabular text-[hsl(var(--ink-foreground))]"
            >
              <PiLightningFill className="h-4 w-4 text-[hsl(var(--brand))]" /> +112
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
